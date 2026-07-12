import * as React from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          // Base
          'inline-flex items-center justify-center font-bold rounded-full transition-all duration-300 ease-out border',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
          'active:scale-[0.98] select-none',
          {
            // Primary
            'bg-primary border-primary text-white shadow-md hover:bg-primary-hover hover:border-primary-hover hover:shadow-lg focus-visible:ring-primary':
              variant === 'primary',
            // Secondary
            'bg-surface border-border text-foreground shadow-sm hover:bg-surface-hover hover:shadow-md focus-visible:ring-muted':
              variant === 'secondary',
            // Outline
            'border-border bg-transparent text-foreground hover:bg-surface hover:text-primary hover:border-primary/30 hover:shadow-sm focus-visible:ring-primary':
              variant === 'outline',
            // Destructive
            'bg-error border-error text-white shadow-md hover:bg-[#7D1D20] hover:shadow-lg focus-visible:ring-error':
              variant === 'destructive',
            // Ghost
            'border-transparent hover:bg-surface-hover hover:text-primary text-foreground focus-visible:ring-primary':
              variant === 'ghost',
            // Sizes
            'h-9 px-4 text-xs tracking-wide gap-1.5': size === 'sm',
            'h-12 px-6 text-sm tracking-wide gap-2': size === 'md',
            'h-14 px-8 text-base tracking-wider gap-2.5': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-4 w-4 text-current shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {children}
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';
