import React from 'react';
import { PackageSearch } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Không tìm thấy dữ liệu',
  description = 'Vui lòng thử lại với từ khóa khác hoặc điều kiện lọc khác.',
  icon,
  className,
  action,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-8 text-center',
        'border border-dashed border-slate-200 dark:border-slate-700/60',
        'rounded-2xl bg-slate-50/40 dark:bg-slate-900/30',
        className
      )}
    >
      <div className="p-4 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl mb-4">
        {icon || <PackageSearch className="h-8 w-8" />}
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed max-w-xs">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
export default EmptyState;
