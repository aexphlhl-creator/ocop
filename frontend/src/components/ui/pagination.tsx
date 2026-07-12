import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const renderPageNumbers = () => {
    const pages: React.ReactNode[] = [];
    const maxVisiblePages = 5;

    const pageBtn = (i: number) => (
      <button
        key={i}
        onClick={() => onPageChange(i)}
        aria-current={currentPage === i ? 'page' : undefined}
        className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-all duration-150 select-none',
          currentPage === i
            ? 'bg-[#16A34A] text-white shadow-sm shadow-emerald-500/20'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700'
        )}
      >
        {i}
      </button>
    );

    const dots = (key: string) => (
      <span key={key} className="flex items-center justify-center w-9 h-9 text-slate-400">
        <MoreHorizontal className="h-4 w-4" />
      </span>
    );

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(pageBtn(i));
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, currentPage + 2);

      if (currentPage <= 3) end = 4;
      if (currentPage >= totalPages - 2) start = totalPages - 3;

      if (start > 1) {
        pages.push(pageBtn(1));
        if (start > 2) pages.push(dots('left-dots'));
      }
      for (let i = start; i <= end; i++) pages.push(pageBtn(i));
      if (end < totalPages) {
        if (end < totalPages - 1) pages.push(dots('right-dots'));
        pages.push(pageBtn(totalPages));
      }
    }

    return pages;
  };

  const navBtn = (dir: 'prev' | 'next') => {
    const isPrev = dir === 'prev';
    const disabled = isPrev ? currentPage === 1 : currentPage === totalPages;
    return (
      <button
        onClick={() => onPageChange(isPrev ? currentPage - 1 : currentPage + 1)}
        disabled={disabled}
        aria-label={isPrev ? 'Trang trước' : 'Trang sau'}
        className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700',
          'text-slate-600 dark:text-slate-300 transition-all duration-150',
          'hover:bg-slate-100 dark:hover:bg-slate-800',
          'disabled:opacity-40 disabled:cursor-not-allowed'
        )}
      >
        {isPrev ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    );
  };

  return (
    <nav aria-label="Phân trang" className="flex items-center gap-1 justify-center py-4">
      {navBtn('prev')}
      {renderPageNumbers()}
      {navBtn('next')}
    </nav>
  );
};
