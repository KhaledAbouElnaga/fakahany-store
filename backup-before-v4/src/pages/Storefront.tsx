import { useState } from 'react';
import Header from '../components/Header';
import Loading from '../components/Loading';
import ProductCard from '../components/ProductCard';
import { useStore } from '../contexts/StoreContext';
import { isStoreOpenNow } from '../lib/utils';

export default function Storefront() {
  const { data, loading, error } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  if (loading) return <Loading/>;
  if (error || !data) return <div className="center-state error">{error || 'تعذر تحميل المتجر'}</div>;
  const { settings } = data;
  const visible = data.products.filter(p => !p.hidden);
  const filtered = visible.filter(p => {
    const matchesSearch = !search.trim() || p.name_ar.includes(search.trim());
    const matchesCat = category === 'all' || p.category_id === category;
    return matchesSearch && matchesCat;
  }).sort((a,b) => a.display_order - b.display_order);
  const featured = visible.filter(p => p.featured).sort((a,b) => a.display_order - b.display_order);
  const offers = visible.filter(p => p.options.some(o => o.old_price && o.old_price > o.price)).sort((a,b) => a.display_order - b.display_order);
  const storeOpen = isStoreOpenNow(settings);
  document.title = settings.site_name || settings.store_name;
  return <>
    <Header settings={settings}/>
    <main className="container storefront">
      <section className="hero" style={settings.banner_url ? { backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.05),rgba(0,0,0,.56)),url(${settings.banner_url})` } : undefined}>
        <div><h1>{settings.hero_title}</h1><p>{settings.hero_subtitle}</p>{!storeOpen && <span className="closed-pill">المحل مغلق حاليًا</span>}</div>
      </section>
      {settings.show_search && <div className="search-wrap"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن منتج"/><span>🔎</span></div>}
      {settings.show_categories && <div className="category-chips"><button className={category==='all'?'active':''} onClick={()=>setCategory('all')}>الكل</button>{data.categories.filter(c=>c.visible).sort((a,b)=>a.display_order-b.display_order).map(c=><button key={c.id} className={category===c.id?'active':''} onClick={()=>setCategory(c.id)}>{c.name_ar}</button>)}</div>}
      {!search && category==='all' && settings.show_featured && featured.length>0 && <section><div className="section-title"><h2>منتجات مميزة ✨</h2></div><div className="product-grid">{featured.map(p=><ProductCard key={p.id} product={p}/>)}</div></section>}
      {!search && category==='all' && settings.show_offers && offers.length>0 && <section><div className="section-title"><h2>عروض خاصة 🏷️</h2></div><div className="product-grid">{offers.map(p=><ProductCard key={p.id} product={p}/>)}</div></section>}
      <section><div className="section-title"><h2>{search ? 'نتائج البحث' : category==='all' ? 'كل المنتجات' : 'المنتجات'}</h2></div>{filtered.length ? <div className="product-grid">{filtered.map(p=><ProductCard key={p.id} product={p}/>)}</div> : <div className="empty-state">لم يتم العثور على نتائج</div>}</section>
    </main>
  </>;
}
