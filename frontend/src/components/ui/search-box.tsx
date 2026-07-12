import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

export const SearchBox: React.FC<SearchBoxProps> = ({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  className,
  debounceMs = 400,
}) => {
  const [innerValue, setInnerValue] = useState(value);

  useEffect(() => {
    setInnerValue(value);
  }, [value]);

  useEffect(() => {
    if (innerValue === value) return;
    const handler = setTimeout(() => {
      onChange(innerValue);
    }, debounceMs);
    return () => clearTimeout(handler);
  }, [innerValue, value, onChange, debounceMs]);

  const handleClear = () => {
    setInnerValue('');
    onChange('');
  };

  return (
    <div className={cn('relative w-full max-w-sm', className)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={innerValue}
        onChange={(e) => setInnerValue(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full h-10 pl-10 pr-9 rounded-xl border text-sm',
          'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400',
          'focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15 focus:border-[#16A34A]',
          'transition-all duration-150',
          'dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500',
          'dark:focus:border-[#16A34A] dark:focus:ring-[#16A34A]/20'
        )}
      />
      {innerValue && (
        <button
          onClick={handleClear}
          aria-label="Xóa tìm kiếm"
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
export default SearchBox;
