import React from 'react';
import Link from 'next/link';
import { Star, MapPin, ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';

export function ProductCard({ product, className }: { product: any, className?: string }) {
  return (
    <div className={cn(
      "group relative flex flex-col h-full bg-surface rounded-2xl border border-border/60 transition-all duration-300",
      "hover:-translate-y-1 hover:shadow-xl hover:border-primary/20",
      className
    )}>
      {/* Image Block */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted-bg rounded-t-2xl shrink-0">
        <img
          src={product.images?.[0]?.url || product.images?.[0]?.imageUrl || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=400&q=80'}
          alt={product.name}
          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
          onError={(e) => {
            e.currentTarget.src = 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=400&q=80';
            e.currentTarget.onerror = null;
          }}
        />
        
        {/* Soft Gradient Overlay for text readability if needed */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Layered Badges */}
        <div className="absolute top-0 left-0 w-full p-3 flex justify-between items-start pointer-events-none z-10">
          {product.ocopLevel && (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface/95 backdrop-blur rounded-full border border-border/50 shadow-sm transition-transform duration-300 group-hover:scale-105">
              <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
              <span className="text-[11px] font-bold text-foreground">
                {product.ocopLevel.level} Sao
              </span>
            </div>
          )}
          
          {product.category?.name && (
            <div className="inline-flex items-center px-2.5 py-1 bg-primary/95 backdrop-blur text-surface rounded-full shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {product.category.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content Block */}
      <div className="flex flex-col flex-1 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <Link href={`/products/${product.id}`} className="block flex-1 group/link">
            <h3 className="font-heading font-semibold text-base md:text-lg text-foreground leading-tight line-clamp-2 group-hover/link:text-primary transition-colors">
              {product.name}
            </h3>
          </Link>
          <div className="shrink-0 h-8 w-8 rounded-full bg-surface-hover text-muted flex items-center justify-center group-hover:bg-primary group-hover:text-surface transition-colors">
            <ArrowRight className="h-4 w-4 -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
          </div>
        </div>

        <div className="flex items-end justify-between mt-auto pt-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">
              Đơn giá ({product.unit || 'Sản phẩm'})
            </span>
            <span className="font-bold text-lg text-primary">
              {Number(product.price).toLocaleString('vi-VN')}đ
            </span>
          </div>
          
          {product.province?.name && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Địa phương
              </span>
              <span className="text-xs font-semibold text-foreground text-right max-w-[100px] truncate" title={product.province.name}>
                {product.province.name.replace('Tỉnh ', '').replace('Thành phố ', '')}
              </span>
            </div>
          )}
        </div>
        
        {product.business && (
          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted">Sản xuất bởi</span>
            <Link 
              href={`/shops/${product.business.id}`} 
              className="text-xs font-semibold text-foreground truncate max-w-[140px] hover:text-primary hover:underline underline-offset-4"
              title={product.business.name}
            >
              {product.business.name}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
