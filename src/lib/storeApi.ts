import type { Category, DeliveryArea, Order, Product, ProductOption, SellingUnit, ShopSettings, StoreSnapshot, SiteVisit } from '../types';
import { supabase, supabaseConfigured } from './supabase';
import { getDemoOrders, getDemoSnapshot, setDemoOrders, setDemoSnapshot } from './demoData';
import { compressImage, fileToDataUrl, uid } from './utils';

const demoWait = () => new Promise(r => setTimeout(r, 80));

export const DEFAULT_ORDER_TEMPLATE = `طلب جديد\nرقم الطلب: #{{order_number}}\n\nالاسم: {{name}}\nرقم الهاتف: {{phone}}\nالعنوان: {{address}}\nالمنطقة: {{area}}\n\nالطلب:\n{{items}}\n\nإجمالي المنتجات: {{subtotal}}\nرسوم التوصيل: {{delivery_fee}}\nالإجمالي النهائي: {{total}}\n\nملاحظات: {{notes}}`;
export const DEFAULT_RECEIVED_TEMPLATE = `مرحبًا {{name}}، تم استلام طلبك رقم #{{order_number}} من {{store_name}} وسيتم مراجعته الآن.`;
export const DEFAULT_PREPARING_TEMPLATE = `مرحبًا {{name}}، طلبك رقم #{{order_number}} جاري التجهيز الآن.`;
export const DEFAULT_DELIVERY_TEMPLATE = `مرحبًا {{name}}، طلبك رقم #{{order_number}} خرج للتوصيل.`;

function normalizeSettings(settings: Partial<ShopSettings> | null | undefined): ShopSettings {
  const defaults: ShopSettings = {
    id:'main', store_name:'سوق الطازج', site_name:'سوق الطازج', logo_url:'', banner_url:'', share_image_url:'', site_description:'', hero_title:'الطازج لحد باب بيتك', hero_subtitle:'أفضل الفواكه والخضروات الطازجة', phone:'', whatsapp_number:'', address:'', welcome_message:'أهلاً بك', min_order:0, delivery_enabled:true, default_delivery_fee:0, opening_time:'09:00', closing_time:'23:00', working_days:['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'], manual_open:true, store_status_mode:'auto', low_stock_threshold:5, scheduled_orders_enabled:false, show_search:true, show_categories:true, show_featured:true, show_offers:true, require_name:true, require_phone:true, require_address:true, require_area:true, require_notes:false, whatsapp_order_template:DEFAULT_ORDER_TEMPLATE, whatsapp_received_template:DEFAULT_RECEIVED_TEMPLATE, whatsapp_preparing_template:DEFAULT_PREPARING_TEMPLATE, whatsapp_delivery_template:DEFAULT_DELIVERY_TEMPLATE,
  };
  const s = settings || {};
  const merged = { ...defaults, ...s } as ShopSettings;
  merged.delivery_enabled = s.delivery_enabled ?? true;
  merged.store_status_mode = s.store_status_mode ?? (s.manual_open === false ? 'closed' : 'auto');
  merged.low_stock_threshold = Number(s.low_stock_threshold ?? 5);
  merged.scheduled_orders_enabled = s.scheduled_orders_enabled ?? false;
  merged.require_name = s.require_name ?? true;
  merged.require_phone = s.require_phone ?? true;
  merged.require_address = s.require_address ?? true;
  merged.require_area = s.require_area ?? true;
  merged.require_notes = s.require_notes ?? false;
  merged.share_image_url = s.share_image_url ?? '';
  merged.site_description = s.site_description ?? '';
  merged.whatsapp_order_template = s.whatsapp_order_template || DEFAULT_ORDER_TEMPLATE;
  merged.whatsapp_received_template = s.whatsapp_received_template || DEFAULT_RECEIVED_TEMPLATE;
  merged.whatsapp_preparing_template = s.whatsapp_preparing_template || DEFAULT_PREPARING_TEMPLATE;
  merged.whatsapp_delivery_template = s.whatsapp_delivery_template || DEFAULT_DELIVERY_TEMPLATE;
  return merged;
}

export async function loadStore(): Promise<StoreSnapshot> {
  if (!supabaseConfigured || !supabase) { await demoWait(); const snap=getDemoSnapshot(); return {...snap,settings:normalizeSettings(snap.settings)}; }
  const [{ data: categories, error: e1 }, { data: units, error: e2 }, { data: products, error: e3 }, { data: options, error: e4 }, { data: settings, error: e5 }, { data: areas, error: e6 }] = await Promise.all([
    supabase.from('categories').select('*').order('display_order'), supabase.from('selling_units').select('*').order('display_order'), supabase.from('products').select('*').order('display_order'), supabase.from('product_options').select('*').order('display_order'), supabase.from('shop_settings').select('*').eq('id', 'main').single(), supabase.from('delivery_areas').select('*').order('display_order'),
  ]);
  const err = e1 || e2 || e3 || e4 || e5 || e6; if (err) throw err;
  const grouped = new Map<string, ProductOption[]>();
  (options || []).forEach((o: ProductOption) => grouped.set(o.product_id, [...(grouped.get(o.product_id) || []), o]));
  return { categories:(categories||[]) as Category[], units:(units||[]) as SellingUnit[], products:(products||[]).map((p:any)=>({...p,options:grouped.get(p.id)||[]})) as Product[], settings:normalizeSettings(settings as ShopSettings), deliveryAreas:(areas||[]) as DeliveryArea[] };
}

export async function saveSettings(settings: ShopSettings) {
  if (!supabaseConfigured || !supabase) { const s=getDemoSnapshot(); s.settings=settings; setDemoSnapshot(s); return; }
  const { error }=await supabase.from('shop_settings').upsert(settings); if(error) throw error;
}

export async function saveCategory(category: Category) {
  if (!supabaseConfigured || !supabase) { const s=getDemoSnapshot(); const i=s.categories.findIndex(x=>x.id===category.id); if(i>=0)s.categories[i]=category;else s.categories.push(category);setDemoSnapshot(s);return category; }
  const {data,error}=await supabase.from('categories').upsert(category).select().single(); if(error)throw error; return data as Category;
}
export async function deleteCategory(id:string){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.categories=s.categories.filter(x=>x.id!==id);s.products=s.products.map(p=>p.category_id===id?{...p,category_id:null}:p);setDemoSnapshot(s);return;} const {error}=await supabase.from('categories').delete().eq('id',id);if(error)throw error; }
export async function saveUnit(unit:SellingUnit){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();const i=s.units.findIndex(x=>x.id===unit.id);if(i>=0)s.units[i]=unit;else s.units.push(unit);setDemoSnapshot(s);return unit;} const {data,error}=await supabase.from('selling_units').upsert(unit).select().single();if(error)throw error;return data as SellingUnit; }
export async function deleteUnit(id:string){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.units=s.units.filter(x=>x.id!==id);setDemoSnapshot(s);return;} const {error}=await supabase.from('selling_units').delete().eq('id',id);if(error)throw error; }
export async function saveDeliveryArea(area:DeliveryArea){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();const i=s.deliveryAreas.findIndex(x=>x.id===area.id);if(i>=0)s.deliveryAreas[i]=area;else s.deliveryAreas.push(area);setDemoSnapshot(s);return area;} const {data,error}=await supabase.from('delivery_areas').upsert(area).select().single();if(error)throw error;return data as DeliveryArea; }
export async function deleteDeliveryArea(id:string){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.deliveryAreas=s.deliveryAreas.filter(x=>x.id!==id);setDemoSnapshot(s);return;} const {error}=await supabase.from('delivery_areas').delete().eq('id',id);if(error)throw error; }

export async function saveProduct(product: Product) {
  if (!supabaseConfigured || !supabase) { const s=getDemoSnapshot(); const i=s.products.findIndex(x=>x.id===product.id); if(i>=0)s.products[i]=product;else s.products.push(product);setDemoSnapshot(s);return product; }
  const {options,...row}=product; const {error}=await supabase.from('products').upsert(row);if(error)throw error;
  const existing=await supabase.from('product_options').select('id').eq('product_id',product.id);if(existing.error)throw existing.error;
  const incoming=new Set(options.map(o=>o.id)); const toDelete=(existing.data||[]).filter(x=>!incoming.has(x.id)).map(x=>x.id); if(toDelete.length){const d=await supabase.from('product_options').delete().in('id',toDelete);if(d.error)throw d.error;}
  if(options.length){const up=await supabase.from('product_options').upsert(options);if(up.error)throw up.error;} return product;
}
export async function updateProductFields(id:string, fields:Partial<Pick<Product,'available'|'hidden'|'featured'|'display_order'|'stock_qty'|'track_stock'>>){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.products=s.products.map(p=>p.id===id?{...p,...fields}:p);setDemoSnapshot(s);return;} const {error}=await supabase.from('products').update(fields).eq('id',id);if(error)throw error; }
export async function deleteProduct(id:string){ if(!supabaseConfigured||!supabase){const s=getDemoSnapshot();s.products=s.products.filter(x=>x.id!==id);setDemoSnapshot(s);return;} const {error}=await supabase.from('products').delete().eq('id',id);if(error)throw error; }

export async function uploadImage(file: File, folder='products'):Promise<string>{ const optimized=await compressImage(file); if(!supabaseConfigured||!supabase)return fileToDataUrl(optimized); const ext=optimized.name.split('.').pop()?.toLowerCase()||'webp'; const path=`${folder}/${uid()}.${ext}`; const {error}=await supabase.storage.from('store-images').upload(path,optimized,{cacheControl:'3600',upsert:false,contentType:optimized.type});if(error)throw error;return supabase.storage.from('store-images').getPublicUrl(path).data.publicUrl; }
export async function deleteImage(publicUrl:string){ if(!publicUrl||!supabaseConfigured||!supabase)return; const marker='/storage/v1/object/public/store-images/'; const idx=publicUrl.indexOf(marker); if(idx<0)return; const path=decodeURIComponent(publicUrl.slice(idx+marker.length)); const {error}=await supabase.storage.from('store-images').remove([path]);if(error)throw error; }

export async function saveOrder(order: Order):Promise<Order>{
  if(!supabaseConfigured||!supabase){const orders=getDemoOrders();orders.unshift(order);setDemoOrders(orders);return order;}
  const payload={id:order.id,order_number:order.order_number,customer_name:order.customer_name,customer_phone:order.customer_phone,address:order.address,area_id:order.area_id,notes:order.notes,requested_time:order.requested_time||''};
  const itemPayload=order.items.map(i=>({id:i.id,product_id:i.product_id,option_id:i.option_id,quantity:i.quantity}));
  const {data,error}=await supabase.rpc('create_store_order',{order_payload:payload,items_payload:itemPayload}); if(error)throw error;
  const result=(data||{}) as any;
  return {...order,product_subtotal:Number(result.product_subtotal??order.product_subtotal),delivery_fee:Number(result.delivery_fee??order.delivery_fee),total:Number(result.total??order.total),area_name:String(result.area_name??order.area_name),items:order.items.map(i=>({...i,unit_price:Number(result.items?.find?.((x:any)=>x.id===i.id)?.unit_price??i.unit_price),line_total:Number(result.items?.find?.((x:any)=>x.id===i.id)?.line_total??i.line_total)}))};
}

export async function loadOrders():Promise<Order[]>{ if(!supabaseConfigured||!supabase)return getDemoOrders(); const {data:orders,error}=await supabase.from('orders').select('*').order('created_at',{ascending:false});if(error)throw error; const {data:items,error:e2}=await supabase.from('order_items').select('*');if(e2)throw e2; return (orders||[]).map((o:any)=>({...o,requested_time:o.requested_time||'',items:(items||[]).filter((i:any)=>i.order_id===o.id)})) as Order[]; }
export async function updateOrderStatus(id:string,status:Order['status']){ if(!supabaseConfigured||!supabase){const orders=getDemoOrders();const i=orders.findIndex(o=>o.id===id);if(i>=0)orders[i].status=status;setDemoOrders(orders);return;} const {error}=await supabase.rpc('set_order_status',{order_id_input:id,new_status:status});if(error)throw error; }

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
    await supabase.rpc('record_store_visit',{country_input:country,device_input:device,referrer_input:referrer});
  }catch{
    sessionStorage.removeItem('fakahany-visit-recorded');
  }
}

export async function loadVisits(limit=5000):Promise<SiteVisit[]>{
  if(!supabaseConfigured||!supabase) return [];
  const {data,error}=await supabase.from('site_visits').select('*').order('created_at',{ascending:false}).limit(limit);
  if(error) throw error;
  return (data||[]) as SiteVisit[];
}
