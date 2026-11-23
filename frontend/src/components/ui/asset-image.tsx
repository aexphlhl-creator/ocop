import Image from 'next/image';
import type { ComponentProps } from 'react';

type AssetImageProps = Omit<ComponentProps<typeof Image>, 'width' | 'height'> & {
  width?: number;
  height?: number;
};

/** User-uploaded media may come from signed or private storage URLs. */
export function AssetImage({ width = 1200, height = 800, alt, ...props }: AssetImageProps) {
  return <Image width={width} height={height} alt={alt} unoptimized {...props} />;
}
