import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import InstallPwaButton from '../components/InstallPwaButton';
import Loading from '../components/Loading';
import ProductCard from '../components/ProductCard';
import ProductQuickView from '../components/ProductQuickView';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { getPublicBaseUrl, isOutOfStock, normalizeWhatsAppNumber, smartArabicMatch, storeStatusText, updatePageMeta } from '../lib/utils';
import { recordVisit } from '../lib/storeApi';
import type { Order, Product } from '../types';

export default function Storefront() {
  const { data, loading, error, refresh } = useStore();
  const { count, subtotal, add } = useCart();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [availableOnly,setAvailableOnly]=useState(false);
  const [offersOnly,setOffersOnly]=useState(false);
  const [featuredOnly,setFeaturedOnly]=useState(false);
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const [favorites,setFavorites]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('fakahany-favorites')||'[]')}catch{return []}});
  const [sort,setSort]=useState<'display'|'priceAsc'|'priceDesc'|'name'>('display');
  const [quickProduct,setQuickProduct]=useState<Product|null>(null);
  const [qrOpen,setQrOpen]=useState(false);
  const [shareMsg,setShareMsg]=useState('');
  const [lastOrder,setLastOrder]=useState<Order|null>(null);

  useEffect(()=>{ if(data) updatePageMeta(data.settings); },[data]);
  useEffect(()=>{ void recordVisit(); try{const x=JSON.parse(localStorage.getItem('fakahany-last-order')||'null');setLastOrder(x)}catch{} },[]);
  useEffect(()=>{localStorage.setItem('fakahany-favorites',JSON.stringify(favorites))},[favorites]);

  if (loading) return <Loading/>;
  if (error || !data) return <div className="center-state error-state"><p>{error || 'تعذر تحميل المتجر'}</p><button className="btn" onClick={()=>void refresh()}>إعادة المحاولة</button></div>;
  const { settings } = data;
  const visible = data.products.filter(p => !p.hidden);
  const priceOf=(p:typeof visible[number])=>Math.min(...p.options.filter(o=>o.available).map(o=>Number(o.price)),Number.MAX_SAFE_INTEGER);
  const filtered = visible.filter(p => {
    const matchesSearch = !search.trim() || smartArabicMatch(`${p.name_ar} ${p.description_ar}`,search);
    const matchesCat = category === 'all' || p.category_id === category;
    const available = p.available && !isOutOfStock(p) && p.options.some(o=>o.available&&(!o.track_stock||Number(o.stock_qty??0)>0));
    const offer=p.options.some(o=>o.old_price&&o.old_price>o.price);
    return matchesSearch && matchesCat && (!availableOnly||available) && (!offersOnly||offer) && (!featuredOnly||p.featured) && (!favoritesOnly||favorites.includes(p.id));
  }).sort((a,b)=>sort==='priceAsc'?priceOf(a)-priceOf(b):sort==='priceDesc'?priceOf(b)-priceOf(a):sort==='name'?a.name_ar.localeCompare(b.name_ar,'ar'):a.display_order-b.display_order);
  const featured = visible.filter(p => p.featured).sort((a,b) => a.display_order - b.display_order);
  const offers = visible.filter(p => p.options.some(o => o.old_price && o.old_price > o.price)).sort((a,b) => a.display_order - b.display_order);
  const storeOpen = settings.store_status_mode==='open' || settings.store_status_mode==='auto' && storeStatusText(settings).startsWith('مفتوح');
  const wa=normalizeWhatsAppNumber(settings.whatsapp_number);

  const toggleFavorite=(p:Product)=>setFavorites(v=>v.includes(p.id)?v.filter(x=>x!==p.id):[...v,p.id]);
  const card=(p:Product)=><ProductCard key={p.id} product={p} lowStockThreshold={settings.low_stock_threshold} onQuickView={setQuickProduct} favorite={favorites.includes(p.id)} onToggleFavorite={settings.feature_flags.favorites?toggleFavorite:undefined}/>;

  const shareStore=async()=>{
    const url=getPublicBaseUrl(settings);
    const payload={title:settings.store_name,text:`تسوق من ${settings.store_name}`,url};
    try{
      if(navigator.share){await navigator.share(payload)}
      else{await navigator.clipboard.writeText(url);setShareMsg('تم نسخ رابط المتجر');setTimeout(()=>setShareMsg(''),1800)}
    }catch{}
  };

  const reorder=()=>{
    if(!lastOrder)return;
    let added=0,skipped=0;
    for(const item of lastOrder.items){
      const product=data.products.find(p=>p.id===item.product_id&&!p.hidden&&p.available);
      const option=product?.options.find(o=>o.id===item.option_id&&o.available&&(!o.track_stock||Number(o.stock_qty??0)>0));
      if(!product||!option){skipped++;continue}
      const max=Math.min(product.track_stock?Number(product.stock_qty??0):Infinity,option.track_stock?Number(option.stock_qty??0):Infinity);
      const qty=Math.max(0,Math.min(Number(item.quantity)||1,max));
      if(qty>0){add(product,option,qty);added+=qty}else skipped++;
    }
    setShareMsg(added?skipped?'تمت إضافة المتاح من طلبك السابق':'تمت إضافة طلبك السابق للسلة':'لا توجد منتجات متاحة من طلبك السابق');
    setTimeout(()=>setShareMsg(''),2200);
  };

  return <>
    <Header settings={settings} showCart={false}/>
    <div className={`store-status-strip ${storeOpen?'open':'closed'}`}><span className="status-dot"/>{storeStatusText(settings)}{!settings.delivery_enabled&&<span> · الطلبات للاستلام من المحل</span>}</div>
    <a className="skip-link" href="#store-main">تخطي إلى المحتوى</a>
    <main className="container storefront" id="store-main" tabIndex={-1}>
      <section className="hero" style={settings.banner_url ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.08),rgba(0,0,0,.6)),url(${settings.banner_url})` } : undefined}>
        <div><h1>{settings.hero_title}</h1><p>{settings.hero_subtitle}</p>{settings.welcome_message&&<small className="hero-welcome">{settings.welcome_message}</small>}</div>
      </section>

      <div className="store-action-row">
        <button className="soft-action" onClick={shareStore}>مشاركة المتجر</button>
        <button className="soft-action" onClick={()=>setQrOpen(true)}>رمز المتجر</button>
        {settings.feature_flags.reorder&&lastOrder&&<button className="soft-action" onClick={reorder}>إعادة آخر طلب</button>}
        {shareMsg&&<span className="inline-feedback">{shareMsg}</span>}
      </div>

      {settings.show_search && <div className="search-wrap"><label className="sr-only" htmlFor="store-search">ابحث عن منتج</label><input id="store-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن منتج"/><span aria-hidden="true">⌕</span></div>}
      {settings.show_categories && <div className="category-chips"><button aria-pressed={category==='all'} className={category==='all'?'active':''} onClick={()=>setCategory('all')}>الكل</button>{data.categories.filter(c=>c.visible).sort((a,b)=>a.display_order-b.display_order).map(c=><button key={c.id} aria-pressed={category===c.id} className={category===c.id?'active':''} onClick={()=>setCategory(c.id)}>{c.name_ar}</button>)}</div>}
      <div className="store-filters">
        <button type="button" className={`filter-chip ${availableOnly?'active':''}`} aria-pressed={availableOnly} onClick={()=>setAvailableOnly(v=>!v)}>المتاح فقط</button>
        <button type="button" className={`filter-chip ${offersOnly?'active':''}`} aria-pressed={offersOnly} onClick={()=>setOffersOnly(v=>!v)}>العروض</button>
        <button type="button" className={`filter-chip ${featuredOnly?'active':''}`} aria-pressed={featuredOnly} onClick={()=>setFeaturedOnly(v=>!v)}>المميزة</button>
        {settings.feature_flags.favorites&&<button type="button" className={`filter-chip ${favoritesOnly?'active':''}`} aria-pressed={favoritesOnly} onClick={()=>setFavoritesOnly(v=>!v)}>المفضلة {favorites.length?`(${favorites.length})`:''}</button>}
        <select aria-label="ترتيب المنتجات" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="display">ترتيب المتجر</option><option value="priceAsc">السعر: الأقل أولًا</option><option value="priceDesc">السعر: الأعلى أولًا</option><option value="name">الاسم</option></select>
      </div>

      {!search && category==='all' && !offersOnly && !featuredOnly && settings.show_featured && featured.length>0 && <section><div className="section-title"><h2>منتجات مميزة</h2></div><div className="product-grid">{featured.map(card)}</div></section>}
      {!search && category==='all' && !offersOnly && !featuredOnly && settings.show_offers && offers.length>0 && <section><div className="section-title"><h2>عروض خاصة</h2></div><div className="product-grid">{offers.map(card)}</div></section>}
      <section><div className="section-title"><h2>{search ? 'نتائج البحث' : category==='all' ? 'كل المنتجات' : 'المنتجات'}</h2><small>{filtered.length} منتج</small></div>{filtered.length ? <div className="product-grid">{filtered.map(card)}</div> : <div className="empty-state">لم يتم العثور على نتائج</div>}</section>
    </main>

    <footer className="store-footer"><div className="container footer-inner"><div><strong>{settings.store_name}</strong>{settings.address&&<span>{settings.address}</span>}{settings.phone&&<a href={`tel:${settings.phone}`}>{settings.phone}</a>}</div><InstallPwaButton/></div></footer>

    <Link to="/cart" className="floating-cart-circle" aria-label={`السلة: ${count} منتج، الإجمالي ${subtotal.toLocaleString('ar-EG')} جنيه`} title="السلة">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L20.5 8H7.1M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>
      <b>{count}</b>
    </Link>
    <div className="floating-contact-stack">
      {settings.phone&&<a className="floating-round-action phone" href={`tel:${settings.phone}`} aria-label="اتصال بالمتجر" title="اتصال">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.36 2.3.55 3.6.55a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.6 21 3 13.4 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.56 3.6a1 1 0 0 1-.25 1Z"/></svg>
      </a>}
      {wa&&<a className="floating-round-action whatsapp" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="واتساب" title="واتساب">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.8A8.5 8.5 0 0 1 8 19.2L3.5 20.5l1.3-4.3A8.5 8.5 0 1 1 20.5 11.8Zm-4.1 2.1c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-1.5-.7-2.5-1.5-3.5-3-.2-.3 0-.4.1-.6l.6-.7c.1-.2.2-.4.1-.6l-.7-1.7c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.4-.8.8-1.2 1.7-.9 2.9.6 2.5 2.3 4.7 4.5 6 2 .9 3.7 1.2 4.9.7.7-.3 1.3-1.2 1.5-1.9.1-.5.1-.9-.1-1-.2-.2-.6-.3-1.2-.5Z"/></svg>
      </a>}
    </div>

    {quickProduct&&<ProductQuickView product={quickProduct} threshold={settings.low_stock_threshold} onClose={()=>setQuickProduct(null)}/>}
    {qrOpen&&<div className="modal-backdrop" onClick={()=>setQrOpen(false)}><div className="modal-card qr-card" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>رمز المتجر</h2><button onClick={()=>setQrOpen(false)}>✕</button></div><p>امسح الرمز بالكاميرا لفتح المتجر مباشرة.</p><img src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(getPublicBaseUrl(settings))}`} alt="رمز المتجر"/><button className="btn secondary" onClick={shareStore}>مشاركة الرابط</button></div></div>}
  </>;
}
