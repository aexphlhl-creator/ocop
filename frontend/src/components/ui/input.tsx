import * as React from 'react';
import { cn } from '../../utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            'flex h-11 w-full rounded-xl border bg-white px-4 py-2.5',
            'text-sm text-slate-900 placeholder:text-slate-400',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            // Normal state
            'border-slate-200 focus:border-[#16A34A] focus:ring-[#16A34A]/15',
            // Dark mode
            'dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100',
            'dark:placeholder:text-slate-500',
            'dark:focus:border-[#16A34A] dark:focus:ring-[#16A34A]/20',
            {
              'border-red-400 focus:border-red-500 focus:ring-red-500/15': !!error,
              'dark:border-red-600 dark:focus:border-red-500': !!error,
            },
            className
          )}
          {...props}
        />
        {error && (
          <span className="text-xs text-red-500 dark:text-red-400 font-medium flex items-center gap-1 mt-0.5">
            {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
