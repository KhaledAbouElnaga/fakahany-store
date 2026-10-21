import { storeStorageKey } from '../lib/storeLinks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItem, Product, ProductOption } from '../types';



interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (product: Product, option: ProductOption, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const KEY=storeStorageKey('fakahany-cart-v1');
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const add = (product: Product, option: ProductOption, quantity = 1) => {
    const key = `${product.id}:${option.id}`;
    setItems(prev => {
      const found = prev.find(x => x.key === key);
      if (found) return prev.map(x => x.key === key ? { ...x, quantity: x.quantity + quantity } : x);
      return [...prev, { key, product_id: product.id, product_name: product.name_ar, image_url: product.image_url, option_id: option.id, option_name: option.name_ar, unit_price: option.price, quantity }];
    });
  };
  const setQuantity = (key: string, quantity: number) => setItems(prev => quantity <= 0 ? prev.filter(x => x.key !== key) : prev.map(x => x.key === key ? { ...x, quantity } : x));
  const remove = (key: string) => setItems(prev => prev.filter(x => x.key !== key));
  const clear = () => setItems([]);
  const count = items.reduce((s, x) => s + x.quantity, 0);
  const subtotal = items.reduce((s, x) => s + x.quantity * x.unit_price, 0);
  const value = useMemo(() => ({ items, count, subtotal, add, setQuantity, remove, clear }), [items, count, subtotal]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('CartProvider missing');
  return ctx;
}
