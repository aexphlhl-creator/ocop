import React, { useState, useRef, useEffect } from 'react';
import { Search, Package, Check, X } from 'lucide-react';
import type { BatchSummary } from '@/types/supply-chain';

interface BatchAutocompleteProps {
  batches: BatchSummary[];
  selectedBatchId: string;
  onSelect: (batchId: string) => void;
}

export function BatchAutocomplete({ batches, selectedBatchId, onSelect }: BatchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredBatches = batches.filter(batch => {
    const term = query.toLowerCase();
    const batchNumber = (batch.batchNumber || '').toLowerCase();
    const productName = (batch.inventory?.product?.name || '').toLowerCase();
    const sellerName = (batch.inventory?.product?.seller?.sellerProfile?.displayName || batch.inventory?.product?.seller?.fullName || '').toLowerCase();
    return batchNumber.includes(term) || productName.includes(term) || sellerName.includes(term);
  }).slice(0, 10); // Limit results to 10 for performance

  const selectedBatch = batches.find(b => b.id === selectedBatchId);
  
  const displayValue = selectedBatch ? `${selectedBatch.batchNumber} - ${selectedBatch.inventory?.product?.name ?? ''}` : query;

  return (
    <div className="relative w-full max-w-2xl" ref={wrapperRef}>
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          role="combobox"
          aria-controls="batch-autocomplete-options"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (selectedBatchId) {
              onSelect('');
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Tìm kiếm theo Batch Code, tên sản phẩm hoặc người bán..."
          className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm placeholder:text-slate-400"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        />
        {selectedBatchId && (
          <button
            onClick={() => {
              onSelect('');
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
            aria-label="Xóa lô hàng đã chọn"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && query && !selectedBatchId && (
        <ul 
          id="batch-autocomplete-options"
          className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-xl max-h-80 overflow-y-auto py-1"
          role="listbox"
        >
          {filteredBatches.length > 0 ? (
            filteredBatches.map(batch => (
              <li
                key={batch.id}
                onClick={() => {
                  onSelect(batch.id);
                  setQuery('');
                  setIsOpen(false);
                }}
                className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer flex items-center justify-between group transition-colors"
                role="option"
                aria-selected={selectedBatchId === batch.id}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-emerald-50 dark:bg-emerald-900/30 p-1.5 rounded-lg shrink-0">
                    <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">{batch.batchNumber}</span>
                      <span>—</span>
                      <span className="truncate">{batch.inventory?.product?.name}</span>
                    </div>
                    {batch.inventory?.product?.seller && (
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {batch.inventory.product.seller.sellerProfile?.displayName ?? batch.inventory.product.seller.fullName} • {batch.inventory?.warehouse?.name}
                      </div>
                    )}
                  </div>
                </div>
                {selectedBatchId === batch.id && (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-3" />
                )}
              </li>
            ))
          ) : (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              Không tìm thấy lô hàng nào phù hợp với &quot;{query}&quot;
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
