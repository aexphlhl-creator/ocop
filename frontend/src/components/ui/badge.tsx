import * as React from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

export const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold select-none transition-all duration-150',
        {
          'bg-slate-100 text-slate-800': variant === 'default',
          'bg-emerald-50 text-emerald-700 border border-emerald-200/50': variant === 'success',
          'bg-amber-50 text-amber-700 border border-amber-200/50': variant === 'warning',
          'bg-red-50 text-red-700 border border-red-200/50': variant === 'error',
          'bg-blue-50 text-blue-700 border border-blue-200/50': variant === 'info',
        },
        className
      )}
      {...props}
    />
  );
};
