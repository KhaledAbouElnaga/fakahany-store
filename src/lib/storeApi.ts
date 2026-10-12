import type { AdminAuditLog, AdminSearchResult, Category, ClientErrorLog, DeliveryArea, InventoryAdjustment, Order, OrderCleanupLog, OrderEvent, OrderStatusDefinition, Product, ProductOption, ScheduledPrice, SellingUnit, ShopSettings, StoreSnapshot, SiteVisit } from '../types';
import { supabase, supabaseConfigured } from './supabase';
import { getDemoOrders, getDemoSnapshot, setDemoOrders, setDemoSnapshot } from './demoData';
import { compressImage, fileToDataUrl, uid } from './utils';
import { requireTenantId } from './tenant';
import { DEFAULT_HERO_COPY_STYLE, normalizeHeroCopyStyle } from './heroCopyStyle';

const demoWait = () => new Promise(r => setTimeout(r, 80));

export const DEFAULT_ORDER_TEMPLATE = `طلب جديد\nرقم الطلب: #{{order_number}}\n\nالاسم: {{name}}\nرقم الهاتف: {{phone}}\nالعنوان: {{address}}\nالمنطقة: {{area}}\nموعد الطلب: {{requested_time}}\n\nالطلب:\n{{items}}\n\nإجمالي المنتجات: {{subtotal}}\nرسوم التوصيل: {{delivery_fee}}\nالإجمالي النهائي: {{total}}\n\nملاحظات: {{notes}}`;
export const DEFAULT_RECEIVED_TEMPLATE = `مرحبًا {{name}}، تم استلام طلبك رقم #{{order_number}} من {{store_name}} وسيتم مراجعته الآن.`;
export const DEFAULT_PREPARING_TEMPLATE = `مرحبًا {{name}}، طلبك رقم #{{order_number}} جاري التجهيز الآن.`;
export const DEFAULT_DELIVERY_TEMPLATE = `مرحبًا {{name}}، طلبك رقم #{{order_number}} خرج للتوصيل.`;


export const DEFAULT_ORDER_STATUSES: OrderStatusDefinition[] = [
  {id:'00000000-0000-0000-0000-000000000101',name:'جديد',note:'طلب جديد لم يبدأ التعامل معه بعد.',display_order:1,active:true,is_new:true,is_completed:false,is_cancelled:false},
  {id:'00000000-0000-0000-0000-000000000102',name:'جاري التجهيز',note:'الطلب قيد التجهيز.',display_order:2,active:true,is_new:false,is_completed:false,is_cancelled:false},
  {id:'00000000-0000-0000-0000-000000000103',name:'خرج للتوصيل',note:'تم تجهيز الطلب وخرج للتوصيل.',display_order:3,active:true,is_new:false,is_completed:false,is_cancelled:false},
  {id:'00000000-0000-0000-0000-000000000104',name:'مكتمل',note:'تم إنهاء الطلب بنجاح.',display_order:4,active:true,is_new:false,is_completed:true,is_cancelled:false},
  {id:'00000000-0000-0000-0000-000000000105',name:'ملغي',note:'تم إلغاء الطلب.',display_order:5,active:true,is_new:false,is_completed:false,is_cancelled:true},
];

function normalizeSettings(settings: Partial<ShopSettings> | null | undefined): ShopSettings {
  const defaults: ShopSettings = {
    id:'main', store_name:'سوق الطازج', site_name:'سوق الطازج', logo_url:'', banner_url:'', share_image_url:'', site_description:'', hero_title:'الطازج لحد باب بيتك', hero_subtitle:'أفضل الفواكه والخضروات الطازجة', hero_title_font_size:27, hero_subtitle_font_size:15, hero_glass_tint_percent:25, hero_copy_style:{...DEFAULT_HERO_COPY_STYLE}, phone:'', whatsapp_number:'', address:'', welcome_message:'أهلاً بك', announcement_enabled:false, announcement_text:'', maintenance_mode:false, maintenance_message:'المتجر تحت الصيانة مؤقتًا. نعود قريبًا.', setup_completed:false, theme_preset:'green', public_site_url:'', order_alert_minutes:15, audit_retention_days:180, inventory_retention_days:365, visit_retention_days:180, feature_flags:{tracking:true,reports:true,staff:true,scheduled_prices:true,scheduled_orders:true,inventory:true,favorites:true,reorder:true}, dashboard_widgets:['orders_today','new_orders','overdue','sales_today','sales_week','avg_order','repeat_customers','cancel_rate','top_product','peak_hour','low_stock'], min_order:0, delivery_enabled:true, default_delivery_fee:0, opening_time:'09:00', closing_time:'23:00', working_days:['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'], manual_open:true, store_status_mode:'auto', low_stock_threshold:5, scheduled_orders_enabled:false, delivery_capacity_enabled:false, delivery_slot_minutes:60, delivery_slot_capacity:0, show_search:true, show_categories:true, show_featured:true, show_offers:true, require_name:true, require_phone:true, require_address:true, require_area:true, require_notes:false, whatsapp_order_template:DEFAULT_ORDER_TEMPLATE, whatsapp_received_template:DEFAULT_RECEIVED_TEMPLATE, whatsapp_preparing_template:DEFAULT_PREPARING_TEMPLATE, whatsapp_delivery_template:DEFAULT_DELIVERY_TEMPLATE,
  };
  const s = settings || {};
  const merged = { ...defaults, ...s } as ShopSettings;
  merged.announcement_enabled = s.announcement_enabled ?? false;
  merged.announcement_text = s.announcement_text ?? '';
  merged.maintenance_mode = s.maintenance_mode ?? false;
  merged.maintenance_message = s.maintenance_message ?? 'المتجر تحت الصيانة مؤقتًا. نعود قريبًا.';
  merged.setup_completed = s.setup_completed ?? false;
  merged.theme_preset = (s.theme_preset as ShopSettings['theme_preset']) || 'green';
  merged.public_site_url = s.public_site_url ?? '';
  merged.order_alert_minutes = Number(s.order_alert_minutes ?? 15);
  merged.audit_retention_days = Number(s.audit_retention_days ?? 180);
  merged.inventory_retention_days = Number(s.inventory_retention_days ?? 365);
  merged.visit_retention_days = Number(s.visit_retention_days ?? 180);
  merged.feature_flags = {
    tracking: s.feature_flags?.tracking ?? true,
    reports: s.feature_flags?.reports ?? true,
    staff: s.feature_flags?.staff ?? true,
    scheduled_prices: s.feature_flags?.scheduled_prices ?? true,
    scheduled_orders: s.feature_flags?.scheduled_orders ?? true,
    inventory: s.feature_flags?.inventory ?? true,
    favorites: s.feature_flags?.favorites ?? true,
    reorder: s.feature_flags?.reorder ?? true,
  };
  merged.dashboard_widgets = Array.isArray(s.dashboard_widgets) && s.dashboard_widgets.length ? s.dashboard_widgets : ['orders_today','new_orders','overdue','sales_today','sales_week','avg_order','repeat_customers','cancel_rate','top_product','peak_hour','low_stock'];
  merged.delivery_enabled = s.delivery_enabled ?? true;
  merged.store_status_mode = s.store_status_mode ?? (s.manual_open === false ? 'closed' : 'auto');
  merged.low_stock_threshold = Number(s.low_stock_threshold ?? 5);
  merged.scheduled_orders_enabled = s.scheduled_orders_enabled ?? false;
  merged.delivery_capacity_enabled = s.delivery_capacity_enabled ?? false;
  merged.delivery_slot_minutes = Number(s.delivery_slot_minutes ?? 60);
  merged.delivery_slot_capacity = Number(s.delivery_slot_capacity ?? 0);
  merged.require_name = s.require_name ?? true;
  merged.require_phone = s.require_phone ?? true;
  merged.require_address = s.require_address ?? true;
  merged.require_area = s.require_area ?? true;
  merged.require_notes = s.require_notes ?? false;
  merged.share_image_url = s.share_image_url ?? '';
  merged.site_description = s.site_description ?? '';
  // Normalize old snapshots and user-controlled font sizes before rendering.
  const safeSize=(raw:unknown,fallback:number,min:number,max:number)=>{
    const n=Number(raw);
    return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback;
  };
  merged.hero_title_font_size=safeSize(s.hero_title_font_size,27,18,42);
  merged.hero_subtitle_font_size=safeSize(s.hero_subtitle_font_size,15,12,22);
  merged.hero_glass_tint_percent=safeSize(s.hero_glass_tint_percent,25,8,50);
  merged.hero_copy_style=normalizeHeroCopyStyle(s.hero_copy_style);
  merged.whatsapp_order_template = s.whatsapp_order_template || DEFAULT_ORDER_TEMPLATE;
  merged.whatsapp_received_template = s.whatsapp_received_template || DEFAULT_RECEIVED_TEMPLATE;
  merged.whatsapp_preparing_template = s.whatsapp_preparing_template || DEFAULT_PREPARING_TEMPLATE;
  merged.whatsapp_delivery_template = s.whatsapp_delivery_template || DEFAULT_DELIVERY_TEMPLATE;
  return merged;
}

export async function loadStore(): Promise<StoreSnapshot> {
  if (!supabaseConfigured || !supabase) { await demoWait(); const snap=getDemoSnapshot(); return {...snap,settings:normalizeSettings(snap.settings)}; }
  const storeId=await requireTenantId();
  try { await supabase.rpc('apply_due_scheduled_prices',{store_id_input:storeId}); } catch {}
  const [{ data: categories, error: e1 }, { data: units, error: e2 }, { data: products, error: e3 }, { data: options, error: e4 }, { data: settings, error: e5 }, { data: areas, error: e6 }] = await Promise.all([
    supabase.from('categories').select('*').eq('store_id',storeId).order('display_order'),
    supabase.from('selling_units').select('*').eq('store_id',storeId).order('display_order'),
    supabase.from('products').select('*').eq('store_id',storeId).order('display_order'),
    supabase.from('product_options').select('*').eq('store_id',storeId).order('display_order'),
    supabase.from('shop_settings').select('*').eq('store_id',storeId).single(),
    supabase.from('delivery_areas').select('*').eq('store_id',storeId).order('display_order'),
  ]);
  const err = e1 || e2 || e3 || e4 || e5 || e6; if (err) throw err;
  const grouped = new Map<string, ProductOption[]>();
  (options || []).forEach((o: ProductOption) => grouped.set(o.product_id, [...(grouped.get(o.product_id) || []), o]));
  return { categories:(categories||[]) as Category[], units:(units||[]) as SellingUnit[], products:(products||[]).map((p:any)=>({...p,options:grouped.get(p.id)||[]})) as Product[], settings:normalizeSettings(settings as ShopSettings), deliveryAreas:(areas||[]) as DeliveryArea[] };
}

export async function saveSettings(settings: ShopSettings) {
  if (!supabaseConfigured || !supabase) { const s=getDemoSnapshot(); s.settings=settings; setDemoSnapshot(s); return; }
  const storeId=await requireTenantId(); const { error }=await supabase.from('shop_settings').upsert({...settings,store_id:storeId}); if(error) throw error;
}

export async function saveCategory(category: Category) {
  if (!supabaseConfigured || !supabase) { const s=getDemoSnapshot(); const i=s.categories.findIndex(x=>x.id===category.id); if(i>=0)s.categories[i]=category;else s.categories.push(category);setDemoSnapshot(s);return category; }
  const storeId=await requireTenantId(); const {data,error}=await supabase.from('categories').upsert({...category,store_id:storeId}).select().single(); if(error)throw error; return data as Category;
}
export async function deleteCategory(id:string){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.categories=s.categories.filter(x=>x.id!==id);s.products=s.products.map(p=>p.category_id===id?{...p,category_id:null}:p);setDemoSnapshot(s);return;} const {error}=await supabase.from('categories').delete().eq('id',id);if(error)throw error; }
export async function saveUnit(unit:SellingUnit){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();const i=s.units.findIndex(x=>x.id===unit.id);if(i>=0)s.units[i]=unit;else s.units.push(unit);setDemoSnapshot(s);return unit;} const storeId=await requireTenantId(); const {data,error}=await supabase.from('selling_units').upsert({...unit,store_id:storeId}).select().single();if(error)throw error;return data as SellingUnit; }
export async function deleteUnit(id:string){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.units=s.units.filter(x=>x.id!==id);setDemoSnapshot(s);return;} const {error}=await supabase.from('selling_units').delete().eq('id',id);if(error)throw error; }
export async function saveDeliveryArea(area:DeliveryArea){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();const i=s.deliveryAreas.findIndex(x=>x.id===area.id);if(i>=0)s.deliveryAreas[i]=area;else s.deliveryAreas.push(area);setDemoSnapshot(s);return area;} const storeId=await requireTenantId(); const {data,error}=await supabase.from('delivery_areas').upsert({...area,store_id:storeId}).select().single();if(error)throw error;return data as DeliveryArea; }
export async function deleteDeliveryArea(id:string){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.deliveryAreas=s.deliveryAreas.filter(x=>x.id!==id);setDemoSnapshot(s);return;} const {error}=await supabase.from('delivery_areas').delete().eq('id',id);if(error)throw error; }

export async function saveProduct(product: Product) {
  if (!supabaseConfigured || !supabase) { const s=getDemoSnapshot(); const i=s.products.findIndex(x=>x.id===product.id); if(i>=0)s.products[i]=product;else s.products.push(product);setDemoSnapshot(s);return product; }
  const storeId=await requireTenantId();

  const [oldProductResult,oldOptionsResult]=await Promise.all([
    supabase.from('products').select('id,name_ar,track_stock,stock_qty').eq('store_id',storeId).eq('id',product.id).maybeSingle(),
    supabase.from('product_options').select('id,name_ar,track_stock,stock_qty').eq('store_id',storeId).eq('product_id',product.id)
  ]);

  const oldProduct=oldProductResult.data as any;
  const oldOptions=(oldOptionsResult.data||[]) as any[];

  const {options,...row}=product;
  const {error}=await supabase.from('products').upsert({...row,store_id:storeId});if(error)throw error;
  const existing=await supabase.from('product_options').select('id').eq('store_id',storeId).eq('product_id',product.id);if(existing.error)throw existing.error;
  const incoming=new Set(options.map(o=>o.id));
  const toDelete=(existing.data||[]).filter(x=>!incoming.has(x.id)).map(x=>x.id);
  if(toDelete.length){const d=await supabase.from('product_options').delete().eq('store_id',storeId).in('id',toDelete);if(d.error)throw d.error;}
  if(options.length){const up=await supabase.from('product_options').upsert(options.map(o=>({...o,store_id:storeId})));if(up.error)throw up.error;}

  const logChange=async(optionId:string|null,before:number|null,after:number|null)=>{
    if(before===after)return;
    try{await supabase!.rpc('record_inventory_adjustment',{product_id_input:product.id,option_id_input:optionId,before_input:before,after_input:after,reason_input:'تعديل يدوي من لوحة الإدارة'});}catch{}
  };
  if(oldProduct && (oldProduct.track_stock||product.track_stock)){
    await logChange(null,oldProduct.stock_qty===null?null:Number(oldProduct.stock_qty),product.stock_qty===null?null:Number(product.stock_qty));
  }
  for(const option of options){
    const old=oldOptions.find(x=>x.id===option.id);
    if(old && (old.track_stock||option.track_stock)){
      await logChange(option.id,old.stock_qty===null?null:Number(old.stock_qty),option.stock_qty===null?null:Number(option.stock_qty));
    }
  }
  return product;
}
export async function updateProductFields(id:string, fields:Partial<Pick<Product,'available'|'hidden'|'featured'|'display_order'|'stock_qty'|'track_stock'|'category_id'>>){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.products=s.products.map(p=>p.id===id?{...p,...fields}:p);setDemoSnapshot(s);return;} const {error}=await supabase.from('products').update(fields).eq('id',id);if(error)throw error; }
export async function bulkUpdateProductFields(ids:string[], fields:Partial<Pick<Product,'available'|'hidden'|'featured'|'category_id'>>){
  if(!ids.length)return;
  if(!supabaseConfigured||!supabase){
    const s=getDemoSnapshot();
    s.products=s.products.map(p=>ids.includes(p.id)?{...p,...fields}:p);
    setDemoSnapshot(s);return;
  }
  const {error}=await supabase.from('products').update(fields).in('id',ids);
  if(error)throw error;
}

export async function deleteProduct(id:string){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.products=s.products.filter(x=>x.id!==id);setDemoSnapshot(s);return;} const {error}=await supabase.from('products').delete().eq('id',id);if(error)throw error; }

export async function uploadImage(file: File, folder='products'):Promise<string>{ const optimized=await compressImage(file); if(!supabaseConfigured||!supabase)return fileToDataUrl(optimized); const storeId=await requireTenantId(); const ext=optimized.name.split('.').pop()?.toLowerCase()||'webp'; const path=storeId+'/'+folder+'/'+uid()+'.'+ext; const {error}=await supabase.storage.from('store-images').upload(path,optimized,{cacheControl:'3600',upsert:false,contentType:optimized.type});if(error)throw error;return supabase.storage.from('store-images').getPublicUrl(path).data.publicUrl; }
export async function deleteImage(publicUrl:string){ if(!publicUrl||!supabaseConfigured||!supabase)return; const marker='/storage/v1/object/public/store-images/'; const idx=publicUrl.indexOf(marker); if(idx<0)return; const path=decodeURIComponent(publicUrl.slice(idx+marker.length)); const {error}=await supabase.storage.from('store-images').remove([path]);if(error)throw error; }

export async function saveOrder(order: Order):Promise<Order>{
  if(!supabaseConfigured||!supabase){const orders=getDemoOrders();orders.unshift(order);setDemoOrders(orders);return order;}
  const payload={id:order.id,order_number:order.order_number,customer_name:order.customer_name,customer_phone:order.customer_phone,address:order.address,area_id:order.area_id,notes:order.notes,requested_time:order.requested_time||'',requested_for:order.requested_for||'',client_token:order.client_token||''};
  const itemPayload=order.items.map(i=>({id:i.id,product_id:i.product_id,option_id:i.option_id,quantity:i.quantity}));
  const storeId=await requireTenantId(); const {data,error}=await supabase.rpc('create_store_order',{store_id_input:storeId,order_payload:payload,items_payload:itemPayload}); if(error)throw error;
  const result=(data||{}) as any;
  let trackingToken='';
  try{
    const track=await supabase.rpc('claim_order_tracking',{order_id_input:String(result.order_id??order.id),client_token_input:order.client_token||''});
    if(!track.error)trackingToken=String(track.data||'');
  }catch{}
  return {...order,id:String(result.order_id??order.id),order_number:String(result.order_number??order.order_number),tracking_token:trackingToken||order.tracking_token||'',product_subtotal:Number(result.product_subtotal??order.product_subtotal),delivery_fee:Number(result.delivery_fee??order.delivery_fee),total:Number(result.total??order.total),area_name:String(result.area_name??order.area_name),items:order.items.map(i=>({...i,unit_price:Number(result.items?.find?.((x:any)=>x.id===i.id)?.unit_price??i.unit_price),line_total:Number(result.items?.find?.((x:any)=>x.id===i.id)?.line_total??i.line_total)}))};
}


export async function globalAdminSearch(query:string):Promise<AdminSearchResult[]>{
  const q=query.trim();
  if(q.length<2)return [];
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('admin_global_search',{query_input:q});
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as AdminSearchResult[];
}

export async function loadAdminAuditLogs(limit=250):Promise<AdminAuditLog[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.from('admin_audit_log').select('*').order('created_at',{ascending:false}).limit(limit);
  if(error)throw error;
  const logs=(data||[]) as AdminAuditLog[];
  const ids=[...new Set(logs.map(x=>x.actor_user_id).filter(Boolean))] as string[];
  if(!ids.length)return logs;
  const staff=await supabase.from('staff_profiles').select('user_id,email,display_name').in('user_id',ids);
  if(staff.error)return logs;
  const map=new Map((staff.data||[]).map((x:any)=>[String(x.user_id),String(x.display_name||x.email||'')]));
  return logs.map(x=>({...x,actor_email:x.actor_user_id?(map.get(x.actor_user_id)||'حساب سابق'):'النظام'}));
}

export async function loadClientErrors(limit=50):Promise<ClientErrorLog[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.from('client_error_log').select('*').order('created_at',{ascending:false}).limit(limit);
  if(error)throw error;
  return (data||[]) as ClientErrorLog[];
}

export async function runDataRetentionCleanup():Promise<{audit_deleted:number;inventory_deleted:number;visits_deleted:number}>{
  if(!supabaseConfigured||!supabase)return {audit_deleted:0,inventory_deleted:0,visits_deleted:0};
  const {data,error}=await supabase.rpc('run_data_retention_cleanup');
  if(error)throw error;
  const x=(data||{}) as any;
  return {audit_deleted:Number(x.audit_deleted||0),inventory_deleted:Number(x.inventory_deleted||0),visits_deleted:Number(x.visits_deleted||0)};
}

export async function removeStaffMember(userId:string):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.functions.invoke('delete-staff-user',{body:{user_id:userId}});
  if(error)throw error;
}

export async function loadOrders(includeArchived=false):Promise<Order[]>{
  if(!supabaseConfigured||!supabase){
    const orders=getDemoOrders();
    return includeArchived?orders:orders.filter(o=>!o.archived_at);
  }
  const {data:orders,error}=await supabase.from('orders').select('*').order('created_at',{ascending:false});if(error)throw error;
  const {data:items,error:e2}=await supabase.from('order_items').select('*');if(e2)throw e2;
  const mapped=(orders||[]).map((o:any)=>({...o,requested_time:o.requested_time||'',requested_for:o.requested_for||null,internal_note:o.internal_note||'',client_token:o.client_token||'',tracking_token:o.tracking_token||'',archived_at:o.archived_at||null,archived_by:o.archived_by||null,items:(items||[]).filter((i:any)=>i.order_id===o.id)})) as Order[];
  return includeArchived?mapped:mapped.filter(o=>!o.archived_at);
}

export async function loadPublicOrderTracking(token:string):Promise<{order_number:string;created_at:string;status:string;requested_time:string;total:number;events:Array<{created_at:string;summary:string}>}>{
  if(!token.trim())throw new Error('رابط التتبع غير صحيح.');
  if(!supabaseConfigured||!supabase){
    const order=getDemoOrders().find(o=>o.tracking_token===token);
    if(!order)throw new Error('تعذر العثور على الطلب.');
    return {order_number:order.order_number,created_at:order.created_at,status:order.status,requested_time:order.requested_time,total:order.total,events:[]};
  }
  const {data,error}=await supabase.rpc('get_public_order_tracking',{tracking_token_input:token.trim()});
  if(error)throw error;
  const x=(data||{}) as any;
  if(!x.order_number)throw new Error('تعذر العثور على الطلب.');
  return {order_number:String(x.order_number),created_at:String(x.created_at),status:String(x.status),requested_time:String(x.requested_time||''),total:Number(x.total||0),events:Array.isArray(x.events)?x.events:[]};
}

export async function loadOrderStatuses():Promise<OrderStatusDefinition[]>{
  if(!supabaseConfigured||!supabase){
    try{
      const raw=localStorage.getItem('fakahany-demo-order-statuses');
      if(raw)return JSON.parse(raw) as OrderStatusDefinition[];
    }catch{}
    return structuredClone(DEFAULT_ORDER_STATUSES);
  }
  const {data,error}=await supabase.from('order_statuses').select('*').order('display_order');
  if(error){
    if((error as any).code==='42P01')return structuredClone(DEFAULT_ORDER_STATUSES);
    throw error;
  }
  return (data||[]) as OrderStatusDefinition[];
}

export async function saveOrderStatus(status:OrderStatusDefinition):Promise<OrderStatusDefinition>{
  if(!status.name.trim())throw new Error('اكتب اسم الحالة.');
  if(!supabaseConfigured||!supabase){
    const list=await loadOrderStatuses();
    const i=list.findIndex(x=>x.id===status.id);
    if(i>=0)list[i]=status;else list.push(status);
    localStorage.setItem('fakahany-demo-order-statuses',JSON.stringify(list));
    return status;
  }
  const {data,error}=await supabase.rpc('save_order_status_definition',{
    status_id_input:status.id,
    name_input:status.name,
    note_input:status.note,
    display_order_input:status.display_order,
    active_input:status.active,
    is_new_input:status.is_new,
    is_completed_input:status.is_completed,
    is_cancelled_input:status.is_cancelled
  });
  if(error)throw error;
  return data as OrderStatusDefinition;
}

export async function updateOrderStatus(id:string,status:Order['status']){
  if(!supabaseConfigured||!supabase){
    const orders=getDemoOrders();const i=orders.findIndex(o=>o.id===id);if(i>=0)orders[i].status=status;setDemoOrders(orders);return;
  }
  const {error}=await supabase.rpc('set_order_status',{order_id_input:id,new_status:status});if(error)throw error;
}

export function newCategory(order=999):Category{return{id:uid(),name_ar:'',display_order:order,visible:true};}
export function newUnit(order=999):SellingUnit{return{id:uid(),name_ar:'',display_order:order,active:true};}
export function newArea(order=999):DeliveryArea{return{id:uid(),name_ar:'',fee:0,display_order:order,enabled:true};}
export function newProduct(order=999):Product{const id=uid();return{id,name_ar:'',description_ar:'',image_url:'',category_id:null,featured:false,available:true,hidden:false,track_stock:false,stock_qty:null,display_order:order,options:[{id:uid(),product_id:id,name_ar:'كيلو',price:0,old_price:null,available:true,track_stock:false,stock_qty:null,display_order:1}]};}


export async function recordVisit():Promise<void>{
  if(sessionStorage.getItem('fakahany-visit-recorded')==='1') return;
  sessionStorage.setItem('fakahany-visit-recorded','1');
  if(!supabaseConfigured||!supabase) return;
  try{
    let country='غير معروف';
    try{
      const response=await fetch('/cdn-cgi/trace',{cache:'no-store'});
      if(response.ok){
        const trace=await response.text();
        const loc=trace.split('\n').find(line=>line.startsWith('loc='));
        if(loc) country=loc.slice(4).trim()||country;
      }
    }catch{}
    const ua=navigator.userAgent.toLowerCase();
    const device:SiteVisit['device_type']=/ipad|tablet/.test(ua)?'جهاز لوحي':/mobile|iphone|android/.test(ua)?'هاتف':'كمبيوتر';
    const referrer=document.referrer ? (()=>{try{return new URL(document.referrer).hostname}catch{return ''}})() : '';
    const storeId=await requireTenantId(); await supabase.rpc('record_store_visit',{store_id_input:storeId,country_input:country,device_input:device,referrer_input:referrer});
  }catch{
    sessionStorage.removeItem('fakahany-visit-recorded');
  }
}

export async function loadVisits(limit=5000):Promise<SiteVisit[]>{
  if(!supabaseConfigured||!supabase) return [];
  const daily=await supabase.from('site_visit_daily').select('*').order('day',{ascending:false}).limit(limit);
  if(!daily.error){
    return (daily.data||[]).map((x:any)=>({
      id:String(x.day)+'-'+String(x.country_code)+'-'+String(x.device_type),
      created_at:String(x.day)+'T00:00:00',
      country_code:String(x.country_code),
      device_type:x.device_type,
      referrer:'',
      visits:Number(x.visits||0)
    })) as SiteVisit[];
  }
  const legacy=await supabase.from('site_visits').select('*').order('created_at',{ascending:false}).limit(limit);
  if(legacy.error) throw legacy.error;
  return (legacy.data||[]) as SiteVisit[];
}


export async function orderCleanupPasswordIsSet():Promise<boolean>{
  if(!supabaseConfigured||!supabase) return Boolean(localStorage.getItem('fakahany-demo-cleanup-password'));
  const {data,error}=await supabase.rpc('order_cleanup_password_set');
  if(error) throw error;
  return Boolean(data);
}

export async function setOrderCleanupPassword(password:string,currentPassword=''):Promise<void>{
  if(password.length<8) throw new Error('كلمة مرور الحذف يجب أن تكون 8 أحرف على الأقل.');
  if(!supabaseConfigured||!supabase){
    const existing=localStorage.getItem('fakahany-demo-cleanup-password')||'';
    if(existing&&existing!==currentPassword)throw new Error('كلمة مرور الحذف الحالية غير صحيحة.');
    localStorage.setItem('fakahany-demo-cleanup-password',password);return;
  }
  const {data,error}=await supabase.rpc('set_order_cleanup_password',{password_input:password,current_password_input:currentPassword});
  if(error) throw error;
  const result=(data||{}) as any;
  if(result.ok===false)throw new Error(result.error||'تعذر تغيير كلمة مرور الحذف.');
}

export async function previewOrderCleanup(dateFrom:string,dateTo:string):Promise<{count:number;active_count:number;archived_count:number}>{
  if(!supabaseConfigured||!supabase){
    const from=new Date(dateFrom+'T00:00:00').getTime(),to=new Date(dateTo+'T23:59:59').getTime();
    const rows=getDemoOrders().filter(o=>{const t=new Date(o.created_at).getTime();return t>=from&&t<=to});
    return {count:rows.length,active_count:rows.filter(o=>!o.archived_at).length,archived_count:rows.filter(o=>Boolean(o.archived_at)).length};
  }
  const {data,error}=await supabase.rpc('preview_order_cleanup',{date_from_input:dateFrom,date_to_input:dateTo});
  if(error) throw error;
  const x=(data||{}) as any;
  return {count:Number(x.count||0),active_count:Number(x.active_count||0),archived_count:Number(x.archived_count||0)};
}

export async function executeOrderCleanup(input:{action:'archive'|'delete';dateFrom:string;dateTo:string;filterType:string;filterLabel:string;password?:string}):Promise<{count:number}>{
  if(!supabaseConfigured||!supabase){
    const from=new Date(input.dateFrom+'T00:00:00').getTime(),to=new Date(input.dateTo+'T23:59:59').getTime();
    const all=getDemoOrders();
    const matched=all.filter(o=>{const t=new Date(o.created_at).getTime();return t>=from&&t<=to&&(input.action==='archive'?!o.archived_at:Boolean(o.archived_at))});
    if(input.action==='delete'){
      const saved=localStorage.getItem('fakahany-demo-cleanup-password')||'';
      if(!saved||saved!==input.password) throw new Error('كلمة مرور الحذف غير صحيحة.');
      setDemoOrders(all.filter(o=>!matched.some(m=>m.id===o.id)));
    }else{
      const now=new Date().toISOString(); setDemoOrders(all.map(o=>matched.some(m=>m.id===o.id)?{...o,archived_at:now}:o));
    }
    return {count:matched.length};
  }
  const {data,error}=await supabase.rpc('cleanup_orders',{
    action_input:input.action,
    date_from_input:input.dateFrom,
    date_to_input:input.dateTo,
    filter_type_input:input.filterType,
    filter_label_input:input.filterLabel,
    password_input:input.password||''
  });
  if(error) throw error;
  const x=(data||{}) as any;
  if(x.ok===false)throw new Error(x.error||'تعذر تنفيذ العملية.');
  return {count:Number(x.count||0)};
}

export async function restoreArchivedOrder(id:string):Promise<void>{
  if(!supabaseConfigured||!supabase){
    const orders=getDemoOrders();setDemoOrders(orders.map(o=>o.id===id?{...o,archived_at:null,archived_by:null}:o));return;
  }
  const {error}=await supabase.rpc('restore_archived_order',{order_id_input:id});
  if(error) throw error;
}

export async function loadOrderCleanupLogs():Promise<OrderCleanupLog[]>{
  if(!supabaseConfigured||!supabase) return [];
  const {data,error}=await supabase.from('order_cleanup_logs').select('*').order('created_at',{ascending:false}).limit(200);
  if(error) throw error;
  return (data||[]) as OrderCleanupLog[];
}


export async function loadOrderEvents(orderId:string):Promise<OrderEvent[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.from('order_events').select('*').eq('order_id',orderId).order('created_at',{ascending:false}).limit(100);
  if(error)throw error;
  return (data||[]) as OrderEvent[];
}

export async function setOrderInternalNote(orderId:string,note:string):Promise<void>{
  if(!supabaseConfigured||!supabase){
    const orders=getDemoOrders();setDemoOrders(orders.map(o=>o.id===orderId?{...o,internal_note:note}:o));return;
  }
  const {error}=await supabase.rpc('set_order_internal_note',{order_id_input:orderId,note_input:note});
  if(error)throw error;
}

export async function loadInventoryAdjustments(limit=300):Promise<InventoryAdjustment[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.from('inventory_adjustments').select('*').order('created_at',{ascending:false}).limit(limit);
  if(error)throw error;
  return (data||[]).map((x:any)=>({...x,quantity_before:x.quantity_before===null?null:Number(x.quantity_before),quantity_after:x.quantity_after===null?null:Number(x.quantity_after),delta:Number(x.delta)})) as InventoryAdjustment[];
}

export async function loadScheduledPrices():Promise<ScheduledPrice[]>{
  if(!supabaseConfigured||!supabase)return [];
  const [{data:rows,error},{data:opts,error:e2},{data:products,error:e3}]=await Promise.all([
    supabase.from('scheduled_prices').select('*').order('starts_at'),
    supabase.from('product_options').select('id,product_id,name_ar'),
    supabase.from('products').select('id,name_ar')
  ]);
  if(error||e2||e3)throw error||e2||e3;
  return (rows||[]).map((r:any)=>{
    const option=(opts||[]).find((o:any)=>o.id===r.product_option_id) as any;
    const product=(products||[]).find((p:any)=>p.id===option?.product_id) as any;
    return {...r,price:Number(r.price),old_price:r.old_price===null?null:Number(r.old_price),product_name:product?.name_ar||'منتج',option_name:option?.name_ar||'خيار'};
  }) as ScheduledPrice[];
}

export async function scheduleOptionPrice(optionId:string,price:number,oldPrice:number|null,startsAt:string):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('schedule_option_price',{option_id_input:optionId,price_input:price,old_price_input:oldPrice,starts_at_input:startsAt});
  if(error)throw error;
}

export async function cancelScheduledPrice(id:string):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('cancel_scheduled_price',{id_input:id});
  if(error)throw error;
}

export async function editStoreOrder(order:Order):Promise<Order>{
  if(!supabaseConfigured||!supabase){
    const orders=getDemoOrders();const i=orders.findIndex(o=>o.id===order.id);if(i>=0)orders[i]=order;setDemoOrders(orders);return order;
  }
  const payload={customer_name:order.customer_name,customer_phone:order.customer_phone,address:order.address,area_id:order.area_id,notes:order.notes,requested_time:order.requested_time||'',requested_for:order.requested_for||''};
  const items=order.items.map(i=>({id:i.id||uid(),product_id:i.product_id,option_id:i.option_id,quantity:i.quantity}));
  const {data,error}=await supabase.rpc('edit_store_order',{order_id_input:order.id,order_payload:payload,items_payload:items});
  if(error)throw error;
  const x=(data||{}) as any;
  return {...order,product_subtotal:Number(x.product_subtotal??order.product_subtotal),delivery_fee:Number(x.delivery_fee??order.delivery_fee),total:Number(x.total??order.total),area_name:String(x.area_name??order.area_name)};
}
