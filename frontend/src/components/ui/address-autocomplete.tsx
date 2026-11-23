'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Input } from './input';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface AddressSuggestion { display_name: string; name?: string }

export function AddressAutocomplete({ value, onChange, placeholder, className }: AddressAutocompleteProps) {
  const query = value;
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!query || query.length < 3) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=vn&addressdetails=1&limit=5`);
        const data = await res.json();
        setSuggestions(data);
      } catch (error) {
        console.error('Lỗi khi lấy gợi ý địa chỉ:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 500);
    return () => clearTimeout(debounceTimer);
  }, [query, value]);

  const handleSelect = (suggestion: AddressSuggestion) => {
    const addressName = suggestion.display_name;
    onChange(addressName);
    setShowDropdown(false);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          value={query}
          onChange={(e) => {
            onChange(e.target.value); // Sync out directly so they can just type
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder || 'Nhập địa chỉ giao hàng...'}
          className={`pl-9 pr-10 ${className}`}
          required
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-slate-200 dark:border-slate-700">
          {suggestions.map((item, index) => (
            <li
              key={index}
              onClick={() => handleSelect(item)}
              className="relative cursor-pointer select-none py-2 pl-3 pr-9 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <div className="flex flex-col">
                <span className="truncate font-medium">{item.name || item.display_name.split(',')[0]}</span>
                <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {item.display_name}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
