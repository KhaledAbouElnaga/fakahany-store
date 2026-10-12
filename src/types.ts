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

export interface BannerDisplaySettings {
  fit: 'full'|'contain'|'cover';
  ratio: '5/1'|'4/1'|'3/1'|'16/9';
  position_x: number;
  position_y: number;
}

export interface HeroCopyStyle {
  background_mode: 'solid'|'translucent'|'glass'|'none';
  background_color: string;
  background_opacity: number;
  glass_blur: number;
  title_color: string;
  subtitle_color: string;
  font_family: 'system'|'cairo'|'tajawal'|'almarai'|'tahoma';
  text_align: 'center'|'right'|'left';
  radius: number;
  shadow: boolean;
}

export interface ShopSettings {
  id: string;
  store_name: string;
  site_name: string;
  logo_url: string;
  banner_url: string;
  banner_display: BannerDisplaySettings;
  share_image_url: string;
  site_description: string;
  hero_title: string;
  hero_subtitle: string;
  hero_title_font_size: number;
  hero_subtitle_font_size: number;
  hero_glass_tint_percent: number; // legacy setting retained for backwards compatibility
  hero_copy_style: HeroCopyStyle;
  phone: string;
  whatsapp_number: string;
  address: string;
  welcome_message: string;
  announcement_enabled: boolean;
  announcement_text: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  setup_completed: boolean;
  theme_preset: 'green'|'orange'|'navy'|'plum';
  public_site_url: string;
  order_alert_minutes: number;
  audit_retention_days: number;
  inventory_retention_days: number;
  visit_retention_days: number;
  feature_flags: {
    tracking: boolean;
    reports: boolean;
    staff: boolean;
    scheduled_prices: boolean;
    scheduled_orders: boolean;
    inventory: boolean;
    favorites: boolean;
    reorder: boolean;
  };
  dashboard_widgets: string[];
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
  delivery_capacity_enabled: boolean;
  delivery_slot_minutes: number;
  delivery_slot_capacity: number;
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

export type OrderStatus = string;

export interface OrderStatusDefinition {
  id: ID;
  name: string;
  note: string;
  display_order: number;
  active: boolean;
  is_new: boolean;
  is_completed: boolean;
  is_cancelled: boolean;
}

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
  requested_for?: string | null;
  internal_note?: string;
  client_token?: string;
  tracking_token?: string;
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

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: 'active' | 'suspended';
  plan: string;
}

export interface PlatformStore extends TenantInfo {
  created_at: string;
  owner_email: string;
  owner_last_login_at: string | null;
  products_count: number;
  orders_count: number;
  orders_30d: number;
  staff_count: number;
  last_order_at: string | null;
  last_visit_at: string | null;
  errors_24h: number;
  setup_completed: boolean;
  storage_bytes: number;
  subscription_status: 'trial'|'active'|'past_due'|'paused';
  trial_ends_at: string | null;
  paid_until: string | null;
  billing_note: string;
}

export interface PlatformPlan {
  id: string;
  name_ar: string;
  max_products: number | null;
  max_staff: number | null;
  price_egp: number | null;
  features: Record<string,boolean>;
  active: boolean;
  display_order: number;
}

export interface PlatformOverview {
  total_stores: number;
  active_stores: number;
  suspended_stores: number;
  stores_active_7d: number;
  stores_inactive_30d: number;
  orders_30d: number;
  revenue_30d: number;
  products_total: number;
  staff_total: number;
  errors_24h: number;
  visits_30d: number;
  storage_bytes: number;
}

export interface PlatformSettings {
  base_domain: string;
  default_trial_days: number;
  support_session_minutes: number;
}

export interface PlatformSupportStatus {
  active: boolean;
  store_id?: string;
  store_name?: string;
  expires_at?: string;
}

export interface StorePlanStatus {
  plan: string;
  plan_name: string;
  subscription_status: 'trial'|'active'|'past_due'|'paused';
  trial_ends_at: string | null;
  paid_until: string | null;
  products_count: number;
  max_products: number | null;
  staff_count: number;
  max_staff: number | null;
  features: Record<string,boolean>;
}

export interface PlatformBackup {
  id: string;
  store_id: string | null;
  store_slug: string;
  store_name: string;
  kind: 'manual'|'scheduled'|'pre_restore'|'pre_delete';
  label: string;
  created_at: string;
  size_bytes: number;
}

export interface PlatformNotification {
  id: string;
  notification_key: string;
  store_id: string | null;
  store_name: string;
  store_slug: string;
  severity: 'info'|'warning'|'critical';
  kind: string;
  title: string;
  message: string;
  created_at: string;
  refreshed_at: string;
}

export interface PlatformAuditEntry {
  id: string;
  actor_user_id: string | null;
  store_id: string | null;
  store_slug: string;
  action: string;
  label: string;
  details: Record<string,unknown>;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  store_id?: string;
  store_name?: string;
  store_slug?: string;
  created_by?: string | null;
  subject: string;
  message: string;
  priority: 'normal'|'high';
  status: 'open'|'in_progress'|'resolved';
  admin_reply: string;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
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
  visits?: number;
}


export interface OrderCleanupLog {
  id: string;
  created_at: string;
  admin_user_id: string | null;
  action: 'archive' | 'delete' | 'restore' | 'password_change';
  filter_type: string;
  filter_label: string;
  date_from: string | null;
  date_to: string | null;
  orders_count: number;
  min_order_created_at: string | null;
  max_order_created_at: string | null;
}


export type StaffRole = 'owner' | 'manager' | 'orders' | 'inventory' | 'viewer';

export interface StaffProfile {
  store_id: string;
  user_id: string;
  email: string;
  display_name: string;
  job_title: string;
  role: StaffRole;
  active: boolean;
  permissions: string[];
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  created_at: string;
  actor_user_id: string | null;
  event_type: string;
  summary: string;
}

export interface InventoryAdjustment {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  product_id: string | null;
  product_name: string;
  option_id: string | null;
  option_name: string;
  quantity_before: number | null;
  quantity_after: number | null;
  delta: number;
  reason: string;
}

export interface ScheduledPrice {
  id: string;
  product_option_id: string;
  product_name: string;
  option_name: string;
  price: number;
  old_price: number | null;
  starts_at: string;
  created_at: string;
}

export interface DailyReport {
  date: string;
  orders: number;
  completed: number;
  cancelled: number;
  sales: number;
  delivery_fees: number;
  average_order: number;
  top_products: Array<{name:string;quantity:number;value:number}>;
}


export interface AdminAuditLog {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  label: string;
}

export interface AdminSearchResult {
  kind: 'order'|'product'|'staff';
  id: string;
  title: string;
  subtitle: string;
}


export interface ClientErrorLog {
  id: string;
  created_at: string;
  message: string;
  path: string;
  source: string;
}
