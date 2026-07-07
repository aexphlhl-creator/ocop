import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Không tìm thấy dữ liệu',
  description = 'Vui lòng thử lại với từ khóa khác hoặc điều kiện lọc khác.',
  icon,
  className,
}) => {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/20 max-w-md mx-auto my-6', className)}>
      <div className="p-3 bg-slate-50 text-slate-400 rounded-full mb-3">
        {icon || <Package className="h-6 w-6" />}
      </div>
      <h3 className="text-sm font-bold text-slate-700 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 leading-relaxed max-w-xs">{description}</p>
    </div>
  );
};
export default EmptyState;
