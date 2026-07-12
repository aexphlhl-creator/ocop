import * as React from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

export const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest select-none transition-all duration-300',
        {
          // Default
          'bg-surface text-foreground shadow-sm border border-border/50': variant === 'default',
          // Success (Forest Green)
          'bg-success-bg/80 text-success border border-success/20': variant === 'success',
          // Warning (Burnt Orange)
          'bg-warning-bg/80 text-warning border border-warning/20': variant === 'warning',
          // Error
          'bg-error-bg/80 text-error border border-error/20': variant === 'error',
          // Info
          'bg-info-bg/80 text-info border border-info/20': variant === 'info',
        },
        className
      )}
      {...props}
    />
  );
};
