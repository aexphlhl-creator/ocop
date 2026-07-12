import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, ShoppingBag, Plus, Minus, ArrowRight } from 'lucide-react';
import { useCart } from '../../hooks/use-cart';
import { Button } from '../ui/button';
import Link from 'next/link';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ open, onClose }) => {
  const { items, updateQuantity, removeItem, getTotalPrice } = useCart();
  const totalPrice = getTotalPrice();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-slate-950 shadow-2xl flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" /> Giỏ hàng
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                  <ShoppingBag className="h-16 w-16 opacity-20" />
                  <p>Giỏ hàng của bạn đang trống</p>
                  <Button variant="outline" onClick={onClose} className="mt-2">
                    Tiếp tục mua sắm
                  </Button>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="flex gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 relative group">
                    <div className="h-20 w-20 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col flex-1 justify-between">
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-snug">
                          {item.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Cung cấp bởi: {item.businessName}</p>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {item.price.toLocaleString('vi-VN')} đ
                        </span>
                        
                        {/* Quantity Controls */}
                        <div className="flex items-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden h-7">
                          <button 
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            className="w-7 h-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-7 h-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 dark:hover:bg-red-900/30 shadow-sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-500 font-medium">Tổng cộng</span>
                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                    {totalPrice.toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <Link href="/checkout" onClick={onClose} className="block w-full">
                  <Button className="w-full h-12 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-base shadow-lg shadow-emerald-500/20 group">
                    Tiến hành thanh toán <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
