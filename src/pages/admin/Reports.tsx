import { useEffect, useMemo, useState } from 'react';
import Loading from '../../components/Loading';
import { loadOrderStatuses, loadOrders, loadVisits } from '../../lib/storeApi';
import { countryName, downloadText, money } from '../../lib/utils';
import type { Order, OrderStatusDefinition, SiteVisit } from '../../types';

export default function Reports(){
  const [orders,setOrders]=useState<Order[]|null>(null);
  const [visits,setVisits]=useState<SiteVisit[]|null>(null);
  const [statuses,setStatuses]=useState<OrderStatusDefinition[]|null>(null);
  const [reportDate,setReportDate]=useState(new Date().toISOString().slice(0,10));

  useEffect(()=>{void Promise.all([loadOrders(),loadVisits(),loadOrderStatuses()]).then(([o,v,s])=>{setOrders(o);setVisits(v);setStatuses(s)}).catch(()=>{setOrders([]);setVisits([]);setStatuses([])})},[]);

  const stats=useMemo(()=>{
    if(!orders||!visits||!statuses)return null;
    const now=Date.now();
    const since=(days:number)=>new Date(now-days*86400000);
    const completedNames=new Set(statuses.filter(s=>s.is_completed).map(s=>s.name));
    const cancelledNames=new Set(statuses.filter(s=>s.is_cancelled).map(s=>s.name));
    const completed=orders.filter(o=>completedNames.has(o.status));
    const totalSince=(days:number)=>completed.filter(o=>new Date(o.created_at)>=since(days)).reduce((s,o)=>s+Number(o.total),0);
    const countSince=(days:number)=>orders.filter(o=>new Date(o.created_at)>=since(days)).length;
    const itemMap=new Map<string,{name:string,qty:number,value:number}>();
    for(const o of orders.filter(x=>!cancelledNames.has(x.status)))for(const i of o.items){
      const key=i.product_id||i.product_name;
      const x=itemMap.get(key)||{name:i.product_name,qty:0,value:0};
      x.qty+=Number(i.quantity);x.value+=Number(i.line_total);itemMap.set(key,x);
    }
    const top=[...itemMap.values()].sort((a,b)=>b.qty-a.qty).slice(0,8);
    const countries=new Map<string,number>(); const devices=new Map<string,number>();
    for(const v of visits){countries.set(v.country_code,(countries.get(v.country_code)||0)+1);devices.set(v.device_type,(devices.get(v.device_type)||0)+1)}
    return {
      todayOrders:countSince(1),weekOrders:countSince(7),monthOrders:countSince(30),
      todaySales:totalSince(1),weekSales:totalSince(7),monthSales:totalSince(30),
      top,
      countries:[...countries.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10),
      devices:[...devices.entries()].sort((a,b)=>b[1]-a[1]),
      visitCount:visits.length,
      completedNames,cancelledNames
    };
  },[orders,visits,statuses]);

  if(!stats||!orders)return <Loading/>;

  const daily=(()=>{
    const start=new Date(reportDate+'T00:00:00');
    const end=new Date(reportDate+'T23:59:59.999');
    const dayOrders=orders.filter(o=>{const d=new Date(o.created_at);return d>=start&&d<=end});
    const completed=dayOrders.filter(o=>stats.completedNames.has(o.status));
    const cancelled=dayOrders.filter(o=>stats.cancelledNames.has(o.status));
    const sales=completed.reduce((s,o)=>s+Number(o.total),0);
    const delivery=completed.reduce((s,o)=>s+Number(o.delivery_fee),0);
    const itemMap=new Map<string,{name:string,qty:number,value:number}>();
    for(const o of dayOrders.filter(x=>!stats.cancelledNames.has(x.status)))for(const i of o.items){
      const k=i.product_id||i.product_name;const x=itemMap.get(k)||{name:i.product_name,qty:0,value:0};x.qty+=Number(i.quantity);x.value+=Number(i.line_total);itemMap.set(k,x);
    }
    return {orders:dayOrders.length,completed:completed.length,cancelled:cancelled.length,sales,delivery,avg:dayOrders.length?dayOrders.reduce((s,o)=>s+Number(o.total),0)/dayOrders.length:0,top:[...itemMap.values()].sort((a,b)=>b.qty-a.qty).slice(0,5)};
  })();

  const downloadDaily=()=>{
    const lines=[
      'تقرير إغلاق يوم '+reportDate,
      'عدد الطلبات: '+daily.orders,
      'الطلبات المكتملة: '+daily.completed,
      'الطلبات الملغية: '+daily.cancelled,
      'إجمالي المبيعات المكتملة: '+money(daily.sales),
      'رسوم التوصيل: '+money(daily.delivery),
      'متوسط قيمة الطلب: '+money(daily.avg),
      '',
      'أكثر المنتجات:',
      ...daily.top.map((x,i)=>(i+1)+'- '+x.name+' — '+x.qty+' وحدة — '+money(x.value))
    ];
    downloadText('daily-report-'+reportDate+'.txt',lines.join('\n'));
  };

  const maxTop=Math.max(1,...stats.top.map(x=>x.qty));
  const maxCountry=Math.max(1,...stats.countries.map(x=>x[1]));

  return <>
    <div className="page-title"><h1>التقارير</h1></div>
    <div className="stats-grid">
      <div className="stat-card"><small>طلبات اليوم</small><strong>{stats.todayOrders}</strong></div>
      <div className="stat-card"><small>طلبات آخر 7 أيام</small><strong>{stats.weekOrders}</strong></div>
      <div className="stat-card"><small>طلبات آخر 30 يومًا</small><strong>{stats.monthOrders}</strong></div>
      <div className="stat-card"><small>مبيعات اليوم المكتملة</small><strong>{money(stats.todaySales)}</strong></div>
      <div className="stat-card"><small>مبيعات آخر 7 أيام</small><strong>{money(stats.weekSales)}</strong></div>
      <div className="stat-card"><small>مبيعات آخر 30 يومًا</small><strong>{money(stats.monthSales)}</strong></div>
      <div className="stat-card"><small>زيارات مسجلة</small><strong>{stats.visitCount}</strong></div>
    </div>

    <section className="panel daily-report-panel">
      <div className="cleanup-head"><div><h3>تقرير إغلاق اليوم</h3><p className="muted">يتم توليده من الطلبات الموجودة وقت الطلب ولا يتم تخزين نسخة جديدة في السيرفر.</p></div><label>التاريخ<input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label></div>
      <div className="stats-grid compact-stats">
        <div className="stat-card"><small>الطلبات</small><strong>{daily.orders}</strong></div>
        <div className="stat-card"><small>المكتمل</small><strong>{daily.completed}</strong></div>
        <div className="stat-card"><small>الملغي</small><strong>{daily.cancelled}</strong></div>
        <div className="stat-card"><small>المبيعات</small><strong>{money(daily.sales)}</strong></div>
        <div className="stat-card"><small>التوصيل</small><strong>{money(daily.delivery)}</strong></div>
        <div className="stat-card"><small>متوسط الطلب</small><strong>{money(daily.avg)}</strong></div>
      </div>
      <button className="btn secondary" onClick={downloadDaily}>تنزيل تقرير اليوم</button>
    </section>

    <div className="reports-grid">
      <section className="panel"><h3>أكثر المنتجات طلبًا</h3>{stats.top.length?stats.top.map(x=><div className="report-bar-row" key={x.name}><div><b>{x.name}</b><small>{x.qty.toLocaleString('ar-EG')} وحدة · {money(x.value)}</small></div><span><i style={{width:String(Math.max(8,x.qty/maxTop*100))+'%'}}/></span></div>):<p className="muted">لا توجد بيانات كافية بعد.</p>}</section>
      <section className="panel"><h3>الدول</h3>{stats.countries.length?stats.countries.map(([code,n])=><div className="report-bar-row" key={code}><div><b>{countryName(code)}</b><small>{n.toLocaleString('ar-EG')} زيارة</small></div><span><i style={{width:String(Math.max(8,n/maxCountry*100))+'%'}}/></span></div>):<p className="muted">ستبدأ البيانات في الظهور مع الزيارات الجديدة.</p>}</section>
      <section className="panel"><h3>الأجهزة</h3>{stats.devices.length?stats.devices.map(([device,n])=><div className="report-simple" key={device}><span>{device}</span><b>{n.toLocaleString('ar-EG')}</b></div>):<p className="muted">لا توجد بيانات زيارات بعد.</p>}</section>
    </div>
  </>;
}
