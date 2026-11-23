'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '../../utils/cn';

export interface OcopLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'badge';
  withMarkOnly?: boolean;
  priority?: boolean;
}

const SIZES = {
  xs: { h: 'h-6', w: 'w-20', pxH: 24, pxW: 78, markW: 'w-26', markPxW: 104 },
  sm: { h: 'h-7', w: 'w-24', pxH: 28, pxW: 91, markW: 'w-30', markPxW: 121 },
  md: { h: 'h-9', w: 'w-32', pxH: 36, pxW: 117, markW: 'w-40', markPxW: 156 },
  lg: { h: 'h-11', w: 'w-40', pxH: 44, pxW: 143, markW: 'w-48', markPxW: 190 },
  xl: { h: 'h-14', w: 'w-48', pxH: 56, pxW: 182, markW: 'w-60', markPxW: 242 },
};

export function OcopLogo({
  size = 'md',
  variant = 'default',
  withMarkOnly = false,
  priority = false,
  className,
  ...props
}: OcopLogoProps) {
  const currentSize = SIZES[size] || SIZES.md;
  const src = withMarkOnly ? '/images/ocop-mark.png' : '/images/ocop-logo.png';
  const widthClass = withMarkOnly ? currentSize.markW : currentSize.w;
  const pixelWidth = withMarkOnly ? currentSize.markPxW : currentSize.pxW;

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 select-none',
        currentSize.h,
        widthClass,
        variant === 'badge' && 'bg-white/95 dark:bg-white/90 shadow-sm rounded-lg px-2.5 py-1',
        className
      )}
      {...props}
    >
      <Image
        src={src}
        alt="Logo OCOP Việt Nam chính thức"
        width={pixelWidth}
        height={currentSize.pxH}
        className="w-full h-full object-contain object-left"
        priority={priority}
      />
    </div>
  );
}

export default OcopLogo;
