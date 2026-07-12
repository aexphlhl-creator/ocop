import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string; // product id
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  businessId: string;
  businessName: string;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  // Giỏ hàng có thể chứa sản phẩm từ nhiều doanh nghiệp, khi thanh toán thường nên tách đơn theo doanh nghiệp
  // Hàm trợ giúp nhóm sản phẩm theo business
  getItemsByBusiness: () => Record<string, CartItem[]>;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const currentItems = get().items;
        const existingItem = currentItems.find((i) => i.id === item.id);
        
        if (existingItem) {
          set({
            items: currentItems.map((i) =>
              i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i
            ),
          });
        } else {
          set({ items: [...currentItems, item] });
        }
      },
      removeItem: (id) => {
        set({ items: get().items.filter((i) => i.id !== id) });
      },
      updateQuantity: (id, quantity) => {
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, quantity } : i
          ),
        });
      },
      clearCart: () => set({ items: [] }),
      getTotalItems: () => get().items.reduce((total, item) => total + item.quantity, 0),
      getTotalPrice: () => get().items.reduce((total, item) => total + item.price * item.quantity, 0),
      getItemsByBusiness: () => {
        const items = get().items;
        return items.reduce((acc, item) => {
          if (!acc[item.businessId]) {
            acc[item.businessId] = [];
          }
          acc[item.businessId].push(item);
          return acc;
        }, {} as Record<string, CartItem[]>);
      }
    }),
    {
      name: 'ocop-cart-storage',
    }
  )
);
