import { useEffect, useRef, useState } from 'react';
import { globalAdminSearch } from '../../lib/storeApi';
import type { AdminSearchResult } from '../../types';

export default function AdminGlobalSearch({onNavigate}:{onNavigate:(tab:'orders'|'products'|'staff')=>void}){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState('');
  const [results,setResults]=useState<AdminSearchResult[]>([]);
  const [busy,setBusy]=useState(false);
  const timer=useRef<number|undefined>(undefined);

  useEffect(()=>{
    if(timer.current)window.clearTimeout(timer.current);
    if(q.trim().length<2){setResults([]);setBusy(false);return}
    setBusy(true);
    timer.current=window.setTimeout(()=>void globalAdminSearch(q).then(setResults).catch(()=>setResults([])).finally(()=>setBusy(false)),250);
    return()=>{if(timer.current)window.clearTimeout(timer.current)};
  },[q]);

  const go=(r:AdminSearchResult)=>{onNavigate(r.kind==='order'?'orders':r.kind==='product'?'products':'staff');setOpen(false);setQ('')};
  return <div className="admin-global-search">
    <button className="admin-search-trigger" type="button" onClick={()=>setOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><span>بحث شامل</span></button>
    {open&&<div className="modal-backdrop" onClick={()=>setOpen(false)}><div className="modal-card global-search-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><h2>بحث في لوحة الإدارة</h2><button onClick={()=>setOpen(false)}>✕</button></div>
      <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="رقم طلب، هاتف، منتج أو موظف"/>
      <div className="global-search-results">{busy?<p className="muted">جاري البحث...</p>:q.trim().length<2?<p className="muted">اكتب حرفين على الأقل.</p>:!results.length?<p className="muted">لا توجد نتائج.</p>:results.map(r=><button key={r.kind+r.id} onClick={()=>go(r)}><span className={'search-kind '+r.kind}>{r.kind==='order'?'طلب':r.kind==='product'?'منتج':'موظف'}</span><div><b>{r.title}</b><small>{r.subtitle}</small></div></button>)}</div>
    </div></div>}
  </div>;
}
