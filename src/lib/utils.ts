import type { Order, Product, ShopSettings } from '../types';

export const money = (value: number) => `${Number(value || 0).toLocaleString('ar-EG')} جنيه`;
export const moneyEn = (value: number) => `${Number(value || 0).toLocaleString('en-US')} جنيه`;

export const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const normalizeWhatsAppNumber = (input: string) => {
  let digits = (input || '').replace(/\D/g, '');
  if (digits.startsWith('0020')) digits = digits.slice(2);
  if (digits.startsWith('01')) digits = `20${digits.slice(1)}`;
  return digits;
};

export const isPlausiblePhone = (input: string) => {
  const digits = (input || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
};

export const makeOrderNumber = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
};

export const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export const arabicDayName = (date = new Date()) => ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][date.getDay()];

const minutes = (t: string) => {
  const [h,m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function isStoreOpenNow(settings: Pick<ShopSettings,'store_status_mode'|'manual_open'|'working_days'|'opening_time'|'closing_time'>, date = new Date()) {
  const mode = settings.store_status_mode || (settings.manual_open ? 'auto' : 'closed');
  if (mode === 'open') return true;
  if (mode === 'closed') return false;
  if (settings.working_days?.length && !settings.working_days.includes(arabicDayName(date))) return false;
  const open = minutes(settings.opening_time);
  const close = minutes(settings.closing_time);
  const now = date.getHours() * 60 + date.getMinutes();
  if (open === close) return true;
  return open < close ? now >= open && now < close : now >= open || now < close;
}

const formatClock = (t:string) => {
  const [h,m]=(t||'00:00').split(':').map(Number);
  const d=new Date(); d.setHours(h||0,m||0,0,0);
  return d.toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'});
};

export function storeStatusText(settings: ShopSettings) {
  if (settings.store_status_mode === 'open') return 'مفتوح الآن';
  if (settings.store_status_mode === 'closed') return 'مغلق الآن';
  if (isStoreOpenNow(settings)) return `مفتوح الآن — يغلق ${formatClock(settings.closing_time)}`;
  const days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const now=new Date();
  for(let offset=0;offset<8;offset++){
    const d=new Date(now); d.setDate(now.getDate()+offset);
    const day=days[d.getDay()];
    if(settings.working_days.includes(day)){
      const label=offset===0?'اليوم':offset===1?'غدًا':day;
      return `مغلق الآن — يفتح ${label} ${formatClock(settings.opening_time)}`;
    }
  }
  return 'مغلق الآن';
}

export function productStockValue(product: Product): number | null {
  if (product.track_stock) return Number(product.stock_qty ?? 0);
  const tracked = product.options.filter(o => o.track_stock).map(o => Number(o.stock_qty ?? 0));
  return tracked.length ? Math.min(...tracked) : null;
}

export function isLowStock(product: Product, threshold: number) {
  const value = productStockValue(product);
  return value !== null && value > 0 && value <= Math.max(0, threshold || 0);
}

export function isOutOfStock(product: Product) {
  if (product.track_stock && Number(product.stock_qty ?? 0) <= 0) return true;
  const enabledOptions = product.options.filter(o => o.available);
  return enabledOptions.length > 0 && enabledOptions.every(o => o.track_stock && Number(o.stock_qty ?? 0) <= 0);
}

export function renderTemplate(template: string, values: Record<string,string|number>) {
  return Object.entries(values).reduce((text,[key,value]) => text.replaceAll(`{{${key}}}`, String(value ?? '')), template || '');
}

export function orderTemplateValues(order: Order, settings: ShopSettings) {
  const items = order.items.map((x,idx)=>`${idx+1}- ${x.product_name} - ${x.option_name} × ${x.quantity} = ${moneyEn(x.line_total)}`).join('\n');
  const delivery = settings.delivery_enabled ? moneyEn(order.delivery_fee) : 'لا يوجد';
  return {
    store_name: settings.store_name,
    order_number: order.order_number,
    name: order.customer_name || 'غير مذكور',
    phone: order.customer_phone || 'غير مذكور',
    address: order.address || 'غير مذكور',
    area: order.area_name || 'غير محددة',
    items,
    subtotal: moneyEn(order.product_subtotal),
    delivery_fee: delivery,
    total: moneyEn(order.total),
    notes: order.notes || 'لا يوجد',
    requested_time: order.requested_time || 'في أقرب وقت',
    status: order.status,
  };
}

export function updatePageMeta(settings: ShopSettings) {
  document.title = settings.site_name || settings.store_name;
  const setMeta = (selector: string, attr: 'name'|'property', key: string, content: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(selector);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr,key); document.head.appendChild(el); }
    el.content = content;
  };
  const description = settings.site_description || settings.hero_subtitle || settings.store_name;
  setMeta('meta[name="description"]','name','description',description);
  setMeta('meta[name="application-name"]','name','application-name',settings.site_name || settings.store_name);
  setMeta('meta[name="apple-mobile-web-app-title"]','name','apple-mobile-web-app-title',settings.site_name || settings.store_name);
  setMeta('meta[property="og:title"]','property','og:title',settings.site_name || settings.store_name);
  setMeta('meta[property="og:description"]','property','og:description',description);
  if (settings.share_image_url || settings.banner_url || settings.logo_url) setMeta('meta[property="og:image"]','property','og:image',settings.share_image_url || settings.banner_url || settings.logo_url);
  setMeta('meta[property="og:type"]','property','og:type','website');
  if (settings.logo_url) { let icon=document.head.querySelector<HTMLLinkElement>('link[rel="icon"]'); if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon);} icon.href=settings.logo_url; }
}

export async function compressImage(file: File, maxDimension = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('الملف المختار ليس صورة صالحة.');
  if (file.size > 12 * 1024 * 1024) throw new Error('حجم الصورة كبير جدًا. الحد الأقصى قبل الضغط 12 ميجابايت.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve,reject)=>{ const x=new Image(); x.onload=()=>resolve(x); x.onerror=()=>reject(new Error('تعذر قراءة الصورة.')); x.src=url; });
    const scale = Math.min(1, maxDimension / Math.max(img.width,img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(img.width*scale));
    canvas.height = Math.max(1,Math.round(img.height*scale));
    const ctx = canvas.getContext('2d'); if(!ctx) return file;
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality));
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/,'') || 'image';
    return new File([blob],`${base}.webp`,{type:'image/webp'});
  } finally { URL.revokeObjectURL(url); }
}

export function downloadText(filename: string, content: string, type='text/plain;charset=utf-8') {
  const blob = new Blob(['\uFEFF',content],{type});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const csvEscape = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"','""')}"`;
};
export function downloadCsv(filename: string, rows: unknown[][]) {
  downloadText(filename, rows.map(r=>r.map(csvEscape).join(',')).join('\n'),'text/csv;charset=utf-8');
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'","&#039;");

export function printOrder(order: Order, settings: ShopSettings) {
  const w = window.open('','_blank','width=760,height=800'); if(!w) return;
  const items = order.items.map(i=>`<tr><td>${escapeHtml(i.product_name)}</td><td>${escapeHtml(i.option_name)}</td><td>${escapeHtml(i.quantity)}</td><td>${escapeHtml(moneyEn(i.line_total))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طلب ${escapeHtml(order.order_number)}</title><style>body{font-family:Arial;padding:24px;color:#163523}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #ddd;padding:8px;text-align:right}h1{margin-top:0}.total{font-size:20px;font-weight:bold}</style></head><body><h1>${escapeHtml(settings.store_name)}</h1><h2>طلب #${escapeHtml(order.order_number)}</h2><p>${escapeHtml(new Date(order.created_at).toLocaleString('ar-EG'))}</p><p><b>العميل:</b> ${escapeHtml(order.customer_name || '—')}<br><b>الهاتف:</b> ${escapeHtml(order.customer_phone || '—')}<br><b>العنوان:</b> ${escapeHtml(order.address || '—')}<br><b>المنطقة:</b> ${escapeHtml(order.area_name || '—')}</p><table><thead><tr><th>المنتج</th><th>الخيار</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>${items}</tbody></table><p>إجمالي المنتجات: ${escapeHtml(moneyEn(order.product_subtotal))}</p>${settings.delivery_enabled?`<p>التوصيل: ${escapeHtml(moneyEn(order.delivery_fee))}</p>`:''}<p class="total">الإجمالي: ${escapeHtml(moneyEn(order.total))}</p>${order.requested_time?`<p><b>الموعد المطلوب:</b> ${escapeHtml(order.requested_time)}</p>`:''}<p><b>ملاحظات:</b> ${escapeHtml(order.notes || 'لا يوجد')}</p><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}


export function openWhatsApp(number:string,message:string,preopenedWindow?:Window|null){
  const encoded=encodeURIComponent(message);
  const mobile=/android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const direct=`whatsapp://send?phone=${number}&text=${encoded}`;
  const web=`https://wa.me/${number}?text=${encoded}`;
  const target=preopenedWindow || window.open('about:blank','_blank');
  if(mobile){
    if(target) target.location.href=direct;
    else window.location.href=direct;
  }else{
    if(target) target.location.href=web;
    else window.location.href=web;
  }
}

export function countryName(code:string){
  if(!code||code==='غير معروف') return 'غير معروف';
  try{
    return new Intl.DisplayNames(['ar'],{type:'region'}).of(code.toUpperCase()) || code.toUpperCase();
  }catch{return code.toUpperCase()}
}
