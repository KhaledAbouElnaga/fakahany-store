import type { StoreSnapshot, Order } from '../types';
import { uid } from './utils';

const placeholder = (label: string, bg = 'eaf4e7') =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="620"><rect width="100%" height="100%" fill="#${bg}"/><circle cx="400" cy="240" r="120" fill="#d6ead2"/><text x="50%" y="70%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="54" fill="#245b35">${label}</text></svg>`)}`;

export const defaultSnapshot: StoreSnapshot = {
  categories: [
    { id: 'cat-fruit', name_ar: 'فواكه', display_order: 1, visible: true },
    { id: 'cat-veg', name_ar: 'خضروات', display_order: 2, visible: true },
    { id: 'cat-leaf', name_ar: 'ورقيات', display_order: 3, visible: true },
    { id: 'cat-offer', name_ar: 'عروض', display_order: 4, visible: true },
  ],
  units: [
    { id: 'u-kg', name_ar: 'كيلو', active: true, display_order: 1 },
    { id: 'u-half', name_ar: 'نصف كيلو', active: true, display_order: 2 },
    { id: 'u-quarter', name_ar: 'ربع كيلو', active: true, display_order: 3 },
    { id: 'u-piece', name_ar: 'قطعة', active: true, display_order: 4 },
    { id: 'u-pack', name_ar: 'عبوة', active: true, display_order: 5 },
    { id: 'u-bunch', name_ar: 'ربطة', active: true, display_order: 6 },
  ],
  products: [
    {
      id: 'p-mango', name_ar: 'مانجو عويس', description_ar: 'مانجو طازجة مختارة بعناية.', image_url: placeholder('مانجو', 'fff4ce'), category_id: 'cat-fruit', featured: true, available: true, hidden: false, track_stock: false, stock_qty: null, display_order: 1,
      options: [
        { id: 'o-mango-q', product_id: 'p-mango', name_ar: 'ربع كيلو', price: 20, old_price: null, available: true, track_stock: false, stock_qty: null, display_order: 1 },
        { id: 'o-mango-h', product_id: 'p-mango', name_ar: 'نصف كيلو', price: 38, old_price: 42, available: true, track_stock: false, stock_qty: null, display_order: 2 },
        { id: 'o-mango-k', product_id: 'p-mango', name_ar: 'كيلو', price: 70, old_price: 80, available: true, track_stock: false, stock_qty: null, display_order: 3 },
      ]
    },
    {
      id: 'p-banana', name_ar: 'موز بلدي', description_ar: 'موز بلدي طازج.', image_url: placeholder('موز', 'fff7cf'), category_id: 'cat-fruit', featured: true, available: true, hidden: false, track_stock: false, stock_qty: null, display_order: 2,
      options: [{ id: 'o-banana', product_id: 'p-banana', name_ar: 'كيلو', price: 28, old_price: null, available: true, track_stock: false, stock_qty: null, display_order: 1 }]
    },
    {
      id: 'p-strawberry', name_ar: 'فراولة فريش', description_ar: 'فراولة يومية.', image_url: placeholder('فراولة', 'ffe5e7'), category_id: 'cat-fruit', featured: true, available: true, hidden: false, track_stock: false, stock_qty: null, display_order: 3,
      options: [{ id: 'o-strawberry', product_id: 'p-strawberry', name_ar: 'نصف كيلو', price: 35, old_price: 45, available: true, track_stock: false, stock_qty: null, display_order: 1 }]
    },
    {
      id: 'p-potato', name_ar: 'بطاطس', description_ar: 'بطاطس مناسبة للطبخ والقلي.', image_url: placeholder('بطاطس', 'f4ead8'), category_id: 'cat-veg', featured: true, available: true, hidden: false, track_stock: false, stock_qty: null, display_order: 4,
      options: [{ id: 'o-potato', product_id: 'p-potato', name_ar: 'كيلو', price: 18, old_price: 22, available: true, track_stock: false, stock_qty: null, display_order: 1 }]
    },
    {
      id: 'p-spinach', name_ar: 'سبانخ', description_ar: 'سبانخ خضراء طازجة.', image_url: placeholder('سبانخ', 'e1f4df'), category_id: 'cat-leaf', featured: false, available: true, hidden: false, track_stock: false, stock_qty: null, display_order: 5,
      options: [{ id: 'o-spinach', product_id: 'p-spinach', name_ar: 'ربطة', price: 7, old_price: null, available: true, track_stock: false, stock_qty: null, display_order: 1 }]
    }
  ],
  settings: {
    id: 'main', store_name: 'سوق الطازج', site_name: 'سوق الطازج', logo_url: '', banner_url: '', share_image_url: '', site_description: 'أفضل الفواكه والخضروات الطازجة', hero_title: 'الطازج لحد باب بيتك', hero_subtitle: 'أفضل الفواكه والخضروات الطازجة وتوصيل سريع للبيت', hero_title_font_size: 27, hero_subtitle_font_size: 15, hero_glass_tint_percent: 25, phone: '', whatsapp_number: '', address: 'المنصورة - الدقهلية', welcome_message: 'أهلاً بك في سوق الطازج', announcement_enabled: false, announcement_text: '', maintenance_mode: false, maintenance_message: 'المتجر تحت الصيانة مؤقتًا. نعود قريبًا.', setup_completed: false, theme_preset: 'green', public_site_url: '', order_alert_minutes: 15, audit_retention_days: 180, inventory_retention_days: 365, visit_retention_days: 180, feature_flags:{tracking:true,reports:true,staff:true,scheduled_prices:true,scheduled_orders:true,inventory:true,favorites:true,reorder:true}, dashboard_widgets:['orders_today','new_orders','overdue','sales_today','sales_week','avg_order','repeat_customers','cancel_rate','top_product','peak_hour','low_stock'], min_order: 50, delivery_enabled: true, default_delivery_fee: 15, opening_time: '09:00', closing_time: '23:00', working_days: ['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'], manual_open: true, store_status_mode: 'auto', low_stock_threshold: 5, scheduled_orders_enabled: false, delivery_capacity_enabled: false, delivery_slot_minutes: 60, delivery_slot_capacity: 0, show_search: true, show_categories: true, show_featured: true, show_offers: true, require_name: true, require_phone: true, require_address: true, require_area: true, require_notes: false, whatsapp_order_template: 'طلب جديد\nرقم الطلب: #{{order_number}}\n\nالاسم: {{name}}\nرقم الهاتف: {{phone}}\nالعنوان: {{address}}\nالمنطقة: {{area}}\nموعد الطلب: {{requested_time}}\n\nالطلب:\n{{items}}\n\nإجمالي المنتجات: {{subtotal}}\nرسوم التوصيل: {{delivery_fee}}\nالإجمالي النهائي: {{total}}\n\nملاحظات: {{notes}}', whatsapp_received_template: 'مرحبًا {{name}}، تم استلام طلبك رقم #{{order_number}} من {{store_name}} وسيتم مراجعته الآن.', whatsapp_preparing_template: 'مرحبًا {{name}}، طلبك رقم #{{order_number}} جاري التجهيز الآن.', whatsapp_delivery_template: 'مرحبًا {{name}}، طلبك رقم #{{order_number}} خرج للتوصيل.',
  },
  deliveryAreas: [
    { id: 'area-1', name_ar: 'المنصورة', fee: 15, enabled: true, display_order: 1 },
    { id: 'area-2', name_ar: 'طلخا', fee: 20, enabled: true, display_order: 2 },
  ]
};

const SNAP_KEY = 'fakahany-demo-snapshot-v1';
const ORDERS_KEY = 'fakahany-demo-orders-v1';

export function getDemoSnapshot(): StoreSnapshot {
  const raw = localStorage.getItem(SNAP_KEY);
  if (!raw) {
    localStorage.setItem(SNAP_KEY, JSON.stringify(defaultSnapshot));
    return structuredClone(defaultSnapshot);
  }
  try { return JSON.parse(raw); } catch { return structuredClone(defaultSnapshot); }
}

export function setDemoSnapshot(snapshot: StoreSnapshot) {
  localStorage.setItem(SNAP_KEY, JSON.stringify(snapshot));
}

export function getDemoOrders(): Order[] {
  const raw = localStorage.getItem(ORDERS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function setDemoOrders(orders: Order[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function resetDemoData() {
  localStorage.setItem(SNAP_KEY, JSON.stringify(defaultSnapshot));
  localStorage.setItem(ORDERS_KEY, JSON.stringify([]));
}

export function duplicateId(prefix: string) { return `${prefix}-${uid()}`; }
