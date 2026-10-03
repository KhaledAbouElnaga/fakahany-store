import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import InstallPwaButton from '../components/InstallPwaButton';
import Loading from '../components/Loading';
import ProductCard from '../components/ProductCard';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { isOutOfStock, isStoreOpenNow, storeStatusText, updatePageMeta } from '../lib/utils';

export default function Storefront() {
  const { data, loading, error, refresh } = useStore();
  const { count } = useCart();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [availableOnly,setAvailableOnly]=useState(false);
  const [offersOnly,setOffersOnly]=useState(false);
  const [featuredOnly,setFeaturedOnly]=useState(false);
  const [sort,setSort]=useState<'display'|'priceAsc'|'priceDesc'|'name'>('display');

  useEffect(()=>{ if(data) updatePageMeta(data.settings); },[data]);
  if (loading) return <Loading/>;
  if (error || !data) return <div className="center-state error-state"><p>{error || 'تعذر تحميل المتجر'}</p><button className="btn" onClick={()=>void refresh()}>إعادة المحاولة</button></div>;
  const { settings } = data;
  const visible = data.products.filter(p => !p.hidden);
  const priceOf=(p:typeof visible[number])=>Math.min(...p.options.filter(o=>o.available).map(o=>Number(o.price)),Number.MAX_SAFE_INTEGER);
  const filtered = visible.filter(p => {
    const matchesSearch = !search.trim() || `${p.name_ar} ${p.description_ar}`.includes(search.trim());
    const matchesCat = category === 'all' || p.category_id === category;
    const available = p.available && !isOutOfStock(p) && p.options.some(o=>o.available&&(!o.track_stock||Number(o.stock_qty??0)>0));
    const offer=p.options.some(o=>o.old_price&&o.old_price>o.price);
    return matchesSearch && matchesCat && (!availableOnly||available) && (!offersOnly||offer) && (!featuredOnly||p.featured);
  }).sort((a,b)=>sort==='priceAsc'?priceOf(a)-priceOf(b):sort==='priceDesc'?priceOf(b)-priceOf(a):sort==='name'?a.name_ar.localeCompare(b.name_ar,'ar'):a.display_order-b.display_order);
  const featured = visible.filter(p => p.featured).sort((a,b) => a.display_order - b.display_order);
  const offers = visible.filter(p => p.options.some(o => o.old_price && o.old_price > o.price)).sort((a,b) => a.display_order - b.display_order);
  const storeOpen = isStoreOpenNow(settings);
  return <>
    <Header settings={settings}/>
    <div className={`store-status-strip ${storeOpen?'open':'closed'}`}><span className="status-dot"/>{storeStatusText(settings)}{!settings.delivery_enabled&&<span> · الطلبات للاستلام من المحل</span>}</div>
    <main className="container storefront">
      <section className="hero" style={settings.banner_url ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.08),rgba(0,0,0,.6)),url(${settings.banner_url})` } : undefined}>
        <div><h1>{settings.hero_title}</h1><p>{settings.hero_subtitle}</p>{settings.welcome_message&&<small className="hero-welcome">{settings.welcome_message}</small>}</div>
      </section>
      {settings.show_search && <div className="search-wrap"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن منتج"/><span>⌕</span></div>}
      {settings.show_categories && <div className="category-chips"><button className={category==='all'?'active':''} onClick={()=>setCategory('all')}>الكل</button>{data.categories.filter(c=>c.visible).sort((a,b)=>a.display_order-b.display_order).map(c=><button key={c.id} className={category===c.id?'active':''} onClick={()=>setCategory(c.id)}>{c.name_ar}</button>)}</div>}
      <div className="store-filters">
        <label><input type="checkbox" checked={availableOnly} onChange={e=>setAvailableOnly(e.target.checked)}/> المتاح فقط</label>
        <label><input type="checkbox" checked={offersOnly} onChange={e=>setOffersOnly(e.target.checked)}/> العروض</label>
        <label><input type="checkbox" checked={featuredOnly} onChange={e=>setFeaturedOnly(e.target.checked)}/> المميزة</label>
        <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="display">ترتيب المتجر</option><option value="priceAsc">السعر: الأقل أولًا</option><option value="priceDesc">السعر: الأعلى أولًا</option><option value="name">الاسم</option></select>
      </div>
      {!search && category==='all' && !offersOnly && !featuredOnly && settings.show_featured && featured.length>0 && <section><div className="section-title"><h2>منتجات مميزة</h2></div><div className="product-grid">{featured.map(p=><ProductCard key={p.id} product={p}/>)}</div></section>}
      {!search && category==='all' && !offersOnly && !featuredOnly && settings.show_offers && offers.length>0 && <section><div className="section-title"><h2>عروض خاصة</h2></div><div className="product-grid">{offers.map(p=><ProductCard key={p.id} product={p}/>)}</div></section>}
      <section><div className="section-title"><h2>{search ? 'نتائج البحث' : category==='all' ? 'كل المنتجات' : 'المنتجات'}</h2><small>{filtered.length} منتج</small></div>{filtered.length ? <div className="product-grid">{filtered.map(p=><ProductCard key={p.id} product={p}/>)}</div> : <div className="empty-state">لم يتم العثور على نتائج</div>}</section>
    </main>
    <footer className="store-footer"><div className="container footer-inner"><div><strong>{settings.store_name}</strong>{settings.address&&<span>{settings.address}</span>}{settings.phone&&<a href={`tel:${settings.phone}`}>{settings.phone}</a>}</div><InstallPwaButton/></div></footer>
    {count>0&&<Link to="/cart" className="mobile-cart-fab">السلة <b>{count}</b></Link>}
  </>;
}
