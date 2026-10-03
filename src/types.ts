export type ID = string;

export interface Category {
  id: ID;
  name_ar: string;
  display_order: number;
  visible: boolean;
}

export interface SellingUnit {
  id: ID;
  name_ar: string;
  active: boolean;
  display_order: number;
}

export interface ProductOption {
  id: ID;
  product_id: ID;
  name_ar: string;
  price: number;
  old_price: number | null;
  available: boolean;
  track_stock: boolean;
  stock_qty: number | null;
  display_order: number;
}

export interface Product {
  id: ID;
  name_ar: string;
  description_ar: string;
  image_url: string;
  category_id: ID | null;
  featured: boolean;
  available: boolean;
  hidden: boolean;
  track_stock: boolean;
  stock_qty: number | null;
  display_order: number;
  created_at?: string;
  updated_at?: string;
  options: ProductOption[];
}

export type StoreStatusMode = 'auto' | 'open' | 'closed';

export interface ShopSettings {
  id: string;
  store_name: string;
  site_name: string;
  logo_url: string;
  banner_url: string;
  share_image_url: string;
  site_description: string;
  hero_title: string;
  hero_subtitle: string;
  phone: string;
  whatsapp_number: string;
  address: string;
  welcome_message: string;
  min_order: number;
  delivery_enabled: boolean;
  default_delivery_fee: number;
  opening_time: string;
  closing_time: string;
  working_days: string[];
  manual_open: boolean; // backwards compatibility with older database
  store_status_mode: StoreStatusMode;
  low_stock_threshold: number;
  scheduled_orders_enabled: boolean;
  show_search: boolean;
  show_categories: boolean;
  show_featured: boolean;
  show_offers: boolean;
  require_name: boolean;
  require_phone: boolean;
  require_address: boolean;
  require_area: boolean;
  require_notes: boolean;
  whatsapp_order_template: string;
  whatsapp_received_template: string;
  whatsapp_preparing_template: string;
  whatsapp_delivery_template: string;
}

export interface DeliveryArea {
  id: ID;
  name_ar: string;
  fee: number;
  enabled: boolean;
  display_order: number;
}

export interface CartItem {
  key: string;
  product_id: ID;
  product_name: string;
  image_url: string;
  option_id: ID;
  option_name: string;
  unit_price: number;
  quantity: number;
}

export type OrderStatus = 'جديد' | 'جاري التجهيز' | 'خرج للتوصيل' | 'مكتمل' | 'ملغي';

export interface Order {
  id: ID;
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  area_id: ID | null;
  area_name: string;
  product_subtotal: number;
  delivery_fee: number;
  total: number;
  notes: string;
  requested_time: string;
  archived_at?: string | null;
  archived_by?: string | null;
  status: OrderStatus;
  items: OrderItem[];
}

export interface OrderItem {
  id: ID;
  order_id: ID;
  product_id: ID | null;
  product_name: string;
  option_id: ID | null;
  option_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface StoreSnapshot {
  categories: Category[];
  units: SellingUnit[];
  products: Product[];
  settings: ShopSettings;
  deliveryAreas: DeliveryArea[];
}


export interface SiteVisit {
  id: string;
  created_at: string;
  country_code: string;
  device_type: 'هاتف' | 'جهاز لوحي' | 'كمبيوتر';
  referrer: string;
}


export interface OrderCleanupLog {
  id: string;
  created_at: string;
  admin_user_id: string | null;
  action: 'archive' | 'delete';
  filter_type: string;
  filter_label: string;
  date_from: string | null;
  date_to: string | null;
  orders_count: number;
  min_order_created_at: string | null;
  max_order_created_at: string | null;
}
