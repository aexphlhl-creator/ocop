import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from './button';

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

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(
          <Button
            key={i}
            variant={currentPage === i ? 'primary' : 'outline'}
            size="sm"
            className="w-9 h-9 p-0"
            onClick={() => onPageChange(i)}
          >
            {i}
          </Button>
        );
      }
    } else {
      // Logic rút gọn dấu ba chấm (...)
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, currentPage + 2);

      if (currentPage <= 3) {
        end = 4;
      }
      if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
      }

      if (start > 1) {
        pages.push(
          <Button key={1} variant={currentPage === 1 ? 'primary' : 'outline'} size="sm" className="w-9 h-9 p-0" onClick={() => onPageChange(1)}>
            1
          </Button>
        );
        if (start > 2) {
          pages.push(<span key="left-dots" className="px-1 text-slate-400"><MoreHorizontal className="h-4 w-4" /></span>);
        }
      }

      for (let i = start; i <= end; i++) {
        pages.push(
          <Button key={i} variant={currentPage === i ? 'primary' : 'outline'} size="sm" className="w-9 h-9 p-0" onClick={() => onPageChange(i)}>
            {i}
          </Button>
        );
      }

      if (end < totalPages) {
        if (end < totalPages - 1) {
          pages.push(<span key="right-dots" className="px-1 text-slate-400"><MoreHorizontal className="h-4 w-4" /></span>);
        }
        pages.push(
          <Button key={totalPages} variant={currentPage === totalPages ? 'primary' : 'outline'} size="sm" className="w-9 h-9 p-0" onClick={() => onPageChange(totalPages)}>
            {totalPages}
          </Button>
        );
      }
    }

    return pages;
  };

  return (
    <div className="flex items-center gap-1.5 justify-center py-4">
      <Button variant="outline" size="sm" className="w-9 h-9 p-0" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {renderPageNumbers()}
      <Button variant="outline" size="sm" className="w-9 h-9 p-0" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
