import { scopedStoreHref, pathStoreSlug } from './storeLinks';
import type { Order, Product, ShopSettings } from '../types';

export const money = (value: number) => `${Number(value || 0).toLocaleString('ar-EG')} جنيه`;
export const moneyEn = (value: number) => `${Number(value || 0).toLocaleString('en-US')} جنيه`;

export const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;


export function normalizeArabicText(value:string){
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g,'')
    .replace(/[إأآٱ]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ؤ/g,'و')
    .replace(/ئ/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/ـ/g,'')
    .replace(/[^\p{L}\p{N}\s]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function editDistanceAtMostOne(a:string,b:string){
  if(a===b)return true;
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,diffs=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue}
    if(++diffs>1)return false;
    if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}
  }
  return diffs+(i<a.length||j<b.length?1:0)<=1;
}

const ARABIC_SEARCH_SYNONYM_GROUPS = [
  ['طماطم','بندوره'],
  ['باذنجان','بتنجان'],
  ['كوسا','كوسه'],
  ['بازلاء','بسله','بزلا'],
  ['فاصوليا','فاصوليه'],
  ['ذره','دره'],
] as const;

function arabicSearchAlternatives(word:string){
  const group=ARABIC_SEARCH_SYNONYM_GROUPS.find(words=>(words as readonly string[]).includes(word));
  return group ? [...group] : [word];
}

export function smartArabicMatch(text:string,query:string){
  const t=normalizeArabicText(text),q=normalizeArabicText(query);
  if(!q)return true;
  if(t.includes(q))return true;
  const textWords=t.split(' ').filter(Boolean);
  return q.split(' ').filter(Boolean).every(word=>arabicSearchAlternatives(word).some(alternative=>{
    if(textWords.some(x=>x.includes(alternative)||alternative.includes(x)))return true;
    return alternative.length>=4&&textWords.some(x=>Math.abs(x.length-alternative.length)<=1&&editDistanceAtMostOne(x,alternative));
  }));
}


export function applyTheme(settings: Pick<ShopSettings,'theme_preset'>) {
  document.documentElement.dataset.theme = settings.theme_preset || 'green';
}

export function getPublicBaseUrl(settings?: Pick<ShopSettings,'public_site_url'>) {
  const configured=(settings?.public_site_url||'').trim().replace(/\/$/,'');
  if(!configured)return window.location.origin;
  return /^https?:\/\//i.test(configured)?configured:'https://'+configured;
}

function previewTenantHref(path:string){return scopedStoreHref(path,window.location);}

export function getPublicPageUrl(settings:Pick<ShopSettings,'public_site_url'>|undefined,path='/'){
  const configured=(settings?.public_site_url||'').trim().replace(/\/$/,'');
  const slug=pathStoreSlug(window.location.pathname);
  const prefix=slug?'/s/'+encodeURIComponent(slug):'';
  const unscoped=prefix&&(path===prefix||path.startsWith(prefix+'/'))?path.slice(prefix.length)||'/':path;
  const normalized=unscoped.startsWith('/')?unscoped:'/'+unscoped;
  if(configured){
    const base=/^https?:\/\//i.test(configured)?configured:'https://'+configured;
    return base+normalized;
  }
  return window.location.origin+previewTenantHref(normalized);
}

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

export function updateNeutralPageMeta(title='Matgark — متجرك',description='منصة لإدارة وتشغيل المتاجر الإلكترونية') {
  document.title=title;
  const setMeta=(selector:string,attr:'name'|'property',key:string,content:string)=>{
    let el=document.head.querySelector<HTMLMetaElement>(selector);
    if(!el){el=document.createElement('meta');el.setAttribute(attr,key);document.head.appendChild(el);}
    el.content=content;
  };
  setMeta('meta[name="description"]','name','description',description);
  setMeta('meta[name="application-name"]','name','application-name','Matgark — متجرك');
  setMeta('meta[name="apple-mobile-web-app-title"]','name','apple-mobile-web-app-title','Matgark — متجرك');
  setMeta('meta[property="og:title"]','property','og:title',title);
  setMeta('meta[property="og:description"]','property','og:description',description);
  setMeta('meta[property="og:type"]','property','og:type','website');
  setMeta('meta[property="og:url"]','property','og:url',window.location.origin+window.location.pathname);
  document.head.querySelector('meta[property="og:image"]')?.remove();
  document.head.querySelector('script[data-store-schema]')?.remove();
  document.head.querySelector('link[rel="canonical"]')?.remove();
  const icon=document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if(icon)icon.href='/icon-192.png';
  document.documentElement.dataset.theme='green';
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
  const publicBase=getPublicBaseUrl(settings);
  const publicPage=getPublicPageUrl(settings,window.location.pathname);
  setMeta('meta[property="og:url"]','property','og:url',publicPage);
  let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
  canonical.href=publicPage;
  if (settings.logo_url) { let icon=document.head.querySelector<HTMLLinkElement>('link[rel="icon"]'); if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon);} icon.href=settings.logo_url; }

  let structured=document.head.querySelector<HTMLScriptElement>('script[data-store-schema]');
  if(!structured){structured=document.createElement('script');structured.type='application/ld+json';structured.dataset.storeSchema='1';document.head.appendChild(structured);}
  structured.text=JSON.stringify({
    '@context':'https://schema.org',
    '@type':'GroceryStore',
    name:settings.store_name,
    url:publicBase,
    description,
    ...(settings.logo_url?{logo:settings.logo_url,image:settings.share_image_url||settings.banner_url||settings.logo_url}:{}),
    ...(settings.phone?{telephone:settings.phone}:{}),
    ...(settings.address?{address:{'@type':'PostalAddress',streetAddress:settings.address}}:{})
  });
}

export async function compressImage(file: File, maxDimension = 1400, quality = 0.78): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('الملف المختار ليس صورة صالحة.');
  if (file.size > 8 * 1024 * 1024) throw new Error('حجم الصورة كبير جدًا. الحد الأقصى قبل الضغط 8 ميجابايت.');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve,reject)=>{
      const x=new Image();
      x.onload=()=>resolve(x);
      x.onerror=()=>reject(new Error('تعذر قراءة الصورة.'));
      x.src=url;
    });
    if (img.width > 9000 || img.height > 9000) throw new Error('أبعاد الصورة كبيرة جدًا.');

    const scale = Math.min(1, maxDimension / Math.max(img.width,img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(img.width*scale));
    canvas.height = Math.max(1,Math.round(img.height*scale));
    const ctx = canvas.getContext('2d');
    if(!ctx) throw new Error('تعذر تجهيز الصورة.');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);

    const encode = (q:number) => new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',q));
    let q=Math.min(.86,Math.max(.55,quality));
    let blob=await encode(q);
    while(blob && blob.size>900*1024 && q>.58){
      q-=.06;
      blob=await encode(q);
    }
    if(!blob) throw new Error('تعذر ضغط الصورة.');
    if(blob.size>1.5*1024*1024) throw new Error('الصورة ما زالت كبيرة بعد الضغط. اختر صورة أبسط أو أصغر.');

    const base=file.name.replace(/\.[^.]+$/,'')||'image';
    return new File([blob],`${base}.webp`,{type:'image/webp'});
  } finally {
    URL.revokeObjectURL(url);
  }
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

export function printThermalReceipt(order: Order, settings: ShopSettings) {
  const w=window.open('','_blank','width=420,height=800'); if(!w)return;
  const items=order.items.map(i=>`<tr><td>${escapeHtml(i.product_name)}<small>${escapeHtml(i.option_name)}</small></td><td>${escapeHtml(i.quantity)}</td><td>${escapeHtml(moneyEn(i.line_total))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${escapeHtml(order.order_number)}</title><style>
  @page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{width:74mm;margin:0 auto;font-family:Arial,sans-serif;color:#000;font-size:12px}h1{font-size:18px;text-align:center;margin:0 0 4px}h2{font-size:14px;text-align:center;margin:0 0 8px}.center{text-align:center}.line{border-top:1px dashed #000;margin:7px 0}.meta{line-height:1.7}.meta b{display:inline-block;min-width:48px}table{width:100%;border-collapse:collapse}th,td{padding:5px 2px;border-bottom:1px dashed #bbb;text-align:right;vertical-align:top}th:nth-child(2),td:nth-child(2){width:28px;text-align:center}th:last-child,td:last-child{text-align:left;white-space:nowrap}td small{display:block;font-size:10px}.total{font-size:15px;font-weight:bold;display:flex;justify-content:space-between;margin-top:7px}.footer{text-align:center;margin-top:12px;font-size:10px}</style></head><body>
  <h1>${escapeHtml(settings.store_name)}</h1><h2>طلب #${escapeHtml(order.order_number)}</h2><div class="center">${escapeHtml(new Date(order.created_at).toLocaleString('ar-EG'))}</div>
  <div class="line"></div><div class="meta"><div><b>العميل:</b> ${escapeHtml(order.customer_name||'—')}</div><div><b>الهاتف:</b> ${escapeHtml(order.customer_phone||'—')}</div><div><b>العنوان:</b> ${escapeHtml(order.address||'—')}</div></div>
  <div class="line"></div><table><thead><tr><th>الصنف</th><th>ع</th><th>الإجمالي</th></tr></thead><tbody>${items}</tbody></table>
  <div class="line"></div><div class="meta"><div>المنتجات: ${escapeHtml(moneyEn(order.product_subtotal))}</div>${settings.delivery_enabled?`<div>التوصيل: ${escapeHtml(moneyEn(order.delivery_fee))}</div>`:''}</div><div class="total"><span>الإجمالي</span><span>${escapeHtml(moneyEn(order.total))}</span></div>
  ${order.notes?`<div class="line"></div><div><b>ملاحظات:</b> ${escapeHtml(order.notes)}</div>`:''}<div class="footer">شكرًا لتعاملكم معنا</div><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

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

  if(mobile){
    if(preopenedWindow && !preopenedWindow.closed) preopenedWindow.close();
    window.location.href=direct;
    return;
  }

  const target=preopenedWindow || window.open(web,'_blank');
  if(target) target.location.href=web;
  else window.location.href=web;
}

export function countryName(code:string){
  if(!code||code==='غير معروف') return 'غير معروف';
  try{
    return new Intl.DisplayNames(['ar'],{type:'region'}).of(code.toUpperCase()) || code.toUpperCase();
  }catch{return code.toUpperCase()}
}
