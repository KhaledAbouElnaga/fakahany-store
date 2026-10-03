import type { Category, DeliveryArea, Order, Product, ProductOption, SellingUnit, ShopSettings, StoreSnapshot } from '../types';
import { supabase, supabaseConfigured } from './supabase';
import { getDemoOrders, getDemoSnapshot, setDemoOrders, setDemoSnapshot } from './demoData';
import { fileToDataUrl, uid } from './utils';

const demoWait = () => new Promise(r => setTimeout(r, 80));

export async function loadStore(): Promise<StoreSnapshot> {
  if (!supabaseConfigured || !supabase) {
    await demoWait();
    return getDemoSnapshot();
  }
  const [{ data: categories, error: e1 }, { data: units, error: e2 }, { data: products, error: e3 }, { data: options, error: e4 }, { data: settings, error: e5 }, { data: areas, error: e6 }] = await Promise.all([
    supabase.from('categories').select('*').order('display_order'),
    supabase.from('selling_units').select('*').order('display_order'),
    supabase.from('products').select('*').order('display_order'),
    supabase.from('product_options').select('*').order('display_order'),
    supabase.from('shop_settings').select('*').eq('id', 'main').single(),
    supabase.from('delivery_areas').select('*').order('display_order'),
  ]);
  const err = e1 || e2 || e3 || e4 || e5 || e6;
  if (err) throw err;
  const grouped = new Map<string, ProductOption[]>();
  (options || []).forEach((o: ProductOption) => grouped.set(o.product_id, [...(grouped.get(o.product_id) || []), o]));
  return {
    categories: (categories || []) as Category[],
    units: (units || []) as SellingUnit[],
    products: (products || []).map((p: Omit<Product, 'options'>) => ({ ...p, options: grouped.get(p.id) || [] })) as Product[],
    settings: settings as ShopSettings,
    deliveryAreas: (areas || []) as DeliveryArea[],
  };
}

export async function saveSettings(settings: ShopSettings) {
  if (!supabaseConfigured || !supabase) {
    const s = getDemoSnapshot(); s.settings = settings; setDemoSnapshot(s); return;
  }
  const { error } = await supabase.from('shop_settings').upsert(settings);
  if (error) throw error;
}

export async function saveCategory(category: Category) {
  if (!supabaseConfigured || !supabase) {
    const s = getDemoSnapshot();
    const i = s.categories.findIndex(x => x.id === category.id);
    if (i >= 0) s.categories[i] = category; else s.categories.push(category);
    setDemoSnapshot(s); return category;
  }
  const { data, error } = await supabase.from('categories').upsert(category).select().single();
  if (error) throw error; return data as Category;
}

export async function deleteCategory(id: string) {
  if (!supabaseConfigured || !supabase) {
    const s = getDemoSnapshot(); s.categories = s.categories.filter(x => x.id !== id); s.products = s.products.map(p => p.category_id === id ? { ...p, category_id: null } : p); setDemoSnapshot(s); return;
  }
  const { error } = await supabase.from('categories').delete().eq('id', id); if (error) throw error;
}

export async function saveUnit(unit: SellingUnit) {
  if (!supabaseConfigured || !supabase) {
    const s = getDemoSnapshot(); const i = s.units.findIndex(x => x.id === unit.id); if (i >= 0) s.units[i] = unit; else s.units.push(unit); setDemoSnapshot(s); return unit;
  }
  const { data, error } = await supabase.from('selling_units').upsert(unit).select().single(); if (error) throw error; return data as SellingUnit;
}

export async function deleteUnit(id: string) {
  if (!supabaseConfigured || !supabase) { const s = getDemoSnapshot(); s.units = s.units.filter(x => x.id !== id); setDemoSnapshot(s); return; }
  const { error } = await supabase.from('selling_units').delete().eq('id', id); if (error) throw error;
}

export async function saveDeliveryArea(area: DeliveryArea) {
  if (!supabaseConfigured || !supabase) {
    const s = getDemoSnapshot(); const i = s.deliveryAreas.findIndex(x => x.id === area.id); if (i >= 0) s.deliveryAreas[i] = area; else s.deliveryAreas.push(area); setDemoSnapshot(s); return area;
  }
  const { data, error } = await supabase.from('delivery_areas').upsert(area).select().single(); if (error) throw error; return data as DeliveryArea;
}

export async function deleteDeliveryArea(id: string) {
  if (!supabaseConfigured || !supabase) { const s = getDemoSnapshot(); s.deliveryAreas = s.deliveryAreas.filter(x => x.id !== id); setDemoSnapshot(s); return; }
  const { error } = await supabase.from('delivery_areas').delete().eq('id', id); if (error) throw error;
}

export async function saveProduct(product: Product) {
  if (!supabaseConfigured || !supabase) {
    const s = getDemoSnapshot(); const i = s.products.findIndex(x => x.id === product.id); if (i >= 0) s.products[i] = product; else s.products.push(product); setDemoSnapshot(s); return product;
  }
  const { options, ...row } = product;
  const { error } = await supabase.from('products').upsert(row); if (error) throw error;
  const existing = await supabase.from('product_options').select('id').eq('product_id', product.id);
  if (existing.error) throw existing.error;
  const incomingIds = new Set(options.map(o => o.id));
  const toDelete = (existing.data || []).filter(x => !incomingIds.has(x.id)).map(x => x.id);
  if (toDelete.length) {
    const del = await supabase.from('product_options').delete().in('id', toDelete); if (del.error) throw del.error;
  }
  if (options.length) {
    const up = await supabase.from('product_options').upsert(options); if (up.error) throw up.error;
  }
  return product;
}

export async function deleteProduct(id: string) {
  if (!supabaseConfigured || !supabase) { const s = getDemoSnapshot(); s.products = s.products.filter(x => x.id !== id); setDemoSnapshot(s); return; }
  const { error } = await supabase.from('products').delete().eq('id', id); if (error) throw error;
}

export async function uploadImage(file: File, folder = 'products'): Promise<string> {
  if (!supabaseConfigured || !supabase) return fileToDataUrl(file);
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${folder}/${uid()}.${ext}`;
  const { error } = await supabase.storage.from('store-images').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return supabase.storage.from('store-images').getPublicUrl(path).data.publicUrl;
}

export async function saveOrder(order: Order) {
  if (!supabaseConfigured || !supabase) {
    const orders = getDemoOrders(); orders.unshift(order); setDemoOrders(orders); return order;
  }
  const { items, ...row } = order;
  const { error } = await supabase.from('orders').insert(row); if (error) throw error;
  if (items.length) { const r = await supabase.from('order_items').insert(items); if (r.error) throw r.error; }
  return order;
}

export async function loadOrders(): Promise<Order[]> {
  if (!supabaseConfigured || !supabase) return getDemoOrders();
  const { data: orders, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }); if (error) throw error;
  const { data: items, error: e2 } = await supabase.from('order_items').select('*'); if (e2) throw e2;
  return (orders || []).map((o: Omit<Order, 'items'>) => ({ ...o, items: (items || []).filter((i: any) => i.order_id === o.id) })) as Order[];
}

export async function updateOrderStatus(id: string, status: Order['status']) {
  if (!supabaseConfigured || !supabase) { const orders = getDemoOrders(); const i = orders.findIndex(o => o.id === id); if (i >= 0) orders[i].status = status; setDemoOrders(orders); return; }
  const { error } = await supabase.from('orders').update({ status }).eq('id', id); if (error) throw error;
}

export function newCategory(order = 999): Category { return { id: uid(), name_ar: '', display_order: order, visible: true }; }
export function newUnit(order = 999): SellingUnit { return { id: uid(), name_ar: '', display_order: order, active: true }; }
export function newArea(order = 999): DeliveryArea { return { id: uid(), name_ar: '', fee: 0, display_order: order, enabled: true }; }
export function newProduct(order = 999): Product {
  const productId = uid();
  return { id: productId, name_ar: '', description_ar: '', image_url: '', category_id: null, featured: false, available: true, hidden: false, track_stock: false, stock_qty: null, display_order: order, options: [{ id: uid(), product_id: productId, name_ar: 'كيلو', price: 0, old_price: null, available: true, track_stock: false, stock_qty: null, display_order: 1 }] };
}
