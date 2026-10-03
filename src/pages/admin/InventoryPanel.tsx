import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { loadInventoryAdjustments } from '../../lib/storeApi';
import { isLowStock } from '../../lib/utils';
import type { InventoryAdjustment } from '../../types';

export default function InventoryPanel(){
  const {data}=useStore();
  const [logs,setLogs]=useState<InventoryAdjustment[]|null>(null);
  useEffect(()=>{void loadInventoryAdjustments().then(setLogs).catch(()=>setLogs([]))},[]);

  const low=useMemo(()=>data?.products.filter(p=>isLowStock(p,data.settings.low_stock_threshold))||[],[data]);
  if(!data||!logs)return <div className="panel">جاري تحميل المخزون...</div>;

  return <>
    <div className="page-title"><h1>المخزون</h1></div>
    <div className="stats-grid">
      <div className="stat-card"><small>منتجات بمخزون منخفض</small><strong>{low.length}</strong></div>
      <div className="stat-card"><small>حركات يدوية مسجلة</small><strong>{logs.length}</strong></div>
    </div>
    <section className="panel">
      <h3>المخزون المنخفض</h3>
      {!low.length?<p className="muted">لا توجد تنبيهات مخزون حاليًا.</p>:<div className="table-wrap"><table><thead><tr><th>المنتج</th><th>المخزون الحالي</th></tr></thead><tbody>{low.map(p=><tr key={p.id}><td>{p.name_ar}</td><td>{p.track_stock?String(p.stock_qty??0):'راجع خيارات البيع'}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel">
      <h3>سجل التعديلات اليدوية</h3>
      <p className="muted">يسجل فقط التعديلات اليدوية المهمة على المخزون، وليس كل عملية بيع، لتقليل حجم قاعدة البيانات.</p>
      {!logs.length?<p className="muted">لا توجد حركات يدوية مسجلة بعد.</p>:<div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>المنتج</th><th>قبل</th><th>بعد</th><th>الفرق</th><th>السبب</th></tr></thead><tbody>{logs.map(x=><tr key={x.id}>
        <td>{new Date(x.created_at).toLocaleString('ar-EG')}</td>
        <td>{x.product_name}{x.option_name&&<small className="block muted">{x.option_name}</small>}</td>
        <td>{x.quantity_before??'—'}</td><td>{x.quantity_after??'—'}</td>
        <td>{x.delta>0?'+':''}{x.delta}</td><td>{x.reason||'—'}</td>
      </tr>)}</tbody></table></div>}
    </section>
  </>;
}
