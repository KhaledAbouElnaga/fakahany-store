import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AdminLogin from './AdminLogin';
import ProductBulkTools from './ProductBulkTools';
import AdminGlobalSearch from './AdminGlobalSearch';
import { confirmUnsavedNavigation, useUnsavedChanges } from '../../lib/unsaved';
import { changeAdminPassword, currentAdminEmail, currentStaffProfile, hasStaffPermission, isAdmin, signOutAdmin } from '../../lib/auth';
import { useStore } from '../../contexts/StoreContext';
import Loading from '../../components/Loading';
import type { Category, DeliveryArea, Order, OrderCleanupLog, OrderStatusDefinition, Product, ProductOption, SellingUnit, ShopSettings, StaffProfile } from '../../types';
import { DEFAULT_DELIVERY_TEMPLATE, DEFAULT_ORDER_TEMPLATE, DEFAULT_PREPARING_TEMPLATE, DEFAULT_RECEIVED_TEMPLATE, deleteCategory, deleteDeliveryArea, deleteImage, deleteProduct, deleteUnit, executeOrderCleanup, loadOrderCleanupLogs, loadOrders, loadOrderStatuses, newArea, newCategory, newProduct, newUnit, orderCleanupPasswordIsSet, previewOrderCleanup, restoreArchivedOrder, saveCategory, saveDeliveryArea, saveProduct, saveSettings, saveUnit, setOrderCleanupPassword, updateOrderStatus, updateProductFields, uploadImage } from '../../lib/storeApi';
import { downloadCsv, downloadText, isLowStock, money, normalizeWhatsAppNumber, orderTemplateValues, printOrder, productStockValue, renderTemplate, uid } from '../../lib/utils';
import { supabase, supabaseConfigured } from '../../lib/supabase';

const Reports=lazy(()=>import('./Reports'));
const ArchiveCleanup=lazy(()=>import('./ArchiveCleanup'));
const OrderStatuses=lazy(()=>import('./OrderStatuses'));
const OrdersManager=lazy(()=>import('./OrdersManager'));
const StoreSettings=lazy(()=>import('./StoreSettings'));
const StaffManager=lazy(()=>import('./StaffManager'));
const InventoryPanel=lazy(()=>import('./InventoryPanel'));
const ScheduledPrices=lazy(()=>import('./ScheduledPrices'));
const SetupWizard=lazy(()=>import('./SetupWizard'));
const SystemHealth=lazy(()=>import('./SystemHealth'));
const AuditLog=lazy(()=>import('./AuditLog'));
const ReleaseNotes=lazy(()=>import('./ReleaseNotes'));

type Tab='home'|'products'|'categories'|'units'|'areas'|'orders'|'statuses'|'archive'|'inventory'|'prices'|'reports'|'staff'|'audit'|'health'|'release'|'settings';

export default function AdminPage(){
  const [authorized,setAuthorized]=useState<boolean|null>(null);
  const [profile,setProfile]=useState<StaffProfile|null>(null);
  const [tab,setTab]=useState<Tab>('home');
  const {data,loading,error,refresh}=useStore();
  const [newOrderCount,setNewOrderCount]=useState(0);
  const [alertsEnabled,setAlertsEnabled]=useState(()=>sessionStorage.getItem('fakahany-admin-alerts')==='1');
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const audioRef=useRef<AudioContext|null>(null);

  const can=(permission:string)=>hasStaffPermission(profile,permission);
  const chooseTab=(next:Tab)=>{if(next!==tab&&!confirmUnsavedNavigation())return;setTab(next);setMobileNavOpen(false)};

  useEffect(()=>{isAdmin().then(setAuthorized);},[]);
  useEffect(()=>{if(authorized)void currentStaffProfile().then(setProfile)},[authorized]);

  useEffect(()=>{
    if(!authorized)return;
    const IDLE_MS=45*60*1000;
    let timer:number|undefined;
    const expire=()=>{void signOutAdmin().finally(()=>{setAuthorized(false);setProfile(null);sessionStorage.setItem('fakahany-idle-logout','1')})};
    const reset=()=>{if(timer)window.clearTimeout(timer);timer=window.setTimeout(expire,IDLE_MS)};
    const events=['pointerdown','keydown','touchstart','scroll'] as const;
    events.forEach(name=>window.addEventListener(name,reset,{passive:true}));
    reset();
    return()=>{if(timer)window.clearTimeout(timer);events.forEach(name=>window.removeEventListener(name,reset))};
  },[authorized]);
  useEffect(()=>{if(authorized&&profile&&can('orders.view'))Promise.all([loadOrders(),loadOrderStatuses()]).then(([o,s])=>{const names=new Set(s.filter(x=>x.is_new).map(x=>x.name));setNewOrderCount(o.filter(x=>names.has(x.status)).length)}).catch(()=>{});},[authorized,profile,tab]);

  useEffect(()=>{
    if(!authorized||!profile||!supabaseConfigured||!supabase||!can('orders.view'))return;
    const channel=supabase!.channel('admin-new-order-alerts').on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},payload=>{
      setNewOrderCount(v=>v+1);
      if(alertsEnabled){
        try{
          const ctx=audioRef.current;
          if(ctx){
            const osc=ctx.createOscillator();const gain=ctx.createGain();
            osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.value=.08;
            osc.start();osc.stop(ctx.currentTime+.18);
          }
        }catch{}
        if('Notification' in window&&Notification.permission==='granted'){
          new Notification('طلب جديد',{body:'تم استلام طلب جديد في المتجر.'});
        }
      }
    }).subscribe();
    return ()=>{void supabase!.removeChannel(channel)};
  },[authorized,profile,alertsEnabled]);

  useEffect(()=>{
    if(!authorized||!profile||profile.role!=='owner'||!data)return;
    const today=new Date().toISOString().slice(0,10);
    if(localStorage.getItem('fakahany-auto-backup-date')===today)return;
    void loadOrders(true).then(orders=>{
      const payload=JSON.stringify({exported_at:new Date().toISOString(),store:data,orders},null,2);
      downloadText('fakahany-auto-backup-'+today+'.json',payload,'application/json;charset=utf-8');
      localStorage.setItem('fakahany-auto-backup-date',today);
    }).catch(()=>{});
  },[authorized,profile,data]);

  const enableAlerts=async()=>{
    try{
      if(!audioRef.current)audioRef.current=new AudioContext();
      await audioRef.current.resume();
      if('Notification' in window&&Notification.permission==='default')await Notification.requestPermission();
      sessionStorage.setItem('fakahany-admin-alerts','1');setAlertsEnabled(true);
    }catch{setAlertsEnabled(true)}
  };

  if(authorized===null||loading||(authorized&&profile===null))return <Loading text="جاري فتح لوحة الإدارة..."/>;
  if(!authorized)return <AdminLogin onDone={()=>setAuthorized(true)}/>;
  if(error||!data)return <div className="center-state error-state"><p>{error||'تعذر تحميل البيانات'}</p><button className="btn" onClick={()=>void refresh()}>إعادة المحاولة</button></div>;
  const logout=async()=>{await signOutAdmin();setAuthorized(false);setProfile(null)};
  return <div className="admin-shell">
    <div className="admin-mobile-bar">
      <button className="admin-menu-button" type="button" aria-label="فتح قائمة الإدارة" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(v=>!v)}>
        <span/><span/><span/>
      </button>
      <div><b>{data.settings.store_name}</b><small>{profile?.job_title||profile?.display_name||'لوحة الإدارة'}</small></div>
      {newOrderCount>0&&can('orders.view')?<button className="admin-mobile-orders" onClick={()=>chooseTab('orders')}>طلبات <b>{newOrderCount}</b></button>:<span className="admin-mobile-spacer"/>}
    </div>
    {mobileNavOpen&&<button className="admin-drawer-backdrop" aria-label="إغلاق القائمة" onClick={()=>setMobileNavOpen(false)}/>}
    <aside className={`admin-side ${mobileNavOpen?'open':''}`}><div className="admin-brand"><b>{data.settings.store_name}</b><small>{profile?.display_name||profile?.email||'لوحة الإدارة'}</small></div><nav>
    <Nav t="home" active={tab} set={chooseTab}>الرئيسية</Nav>
    {can('products.manage')&&<><Nav t="products" active={tab} set={chooseTab}>المنتجات</Nav><Nav t="categories" active={tab} set={chooseTab}>الأقسام</Nav><Nav t="units" active={tab} set={chooseTab}>وحدات البيع</Nav></>}
    {can('settings.manage')&&<Nav t="areas" active={tab} set={chooseTab}>مناطق التوصيل</Nav>}
    {can('orders.view')&&<Nav t="orders" active={tab} set={chooseTab} badge={newOrderCount}>الطلبات</Nav>}
    {can('settings.manage')&&<Nav t="statuses" active={tab} set={chooseTab}>حالات الطلبات</Nav>}
    {profile?.role==='owner'&&<Nav t="archive" active={tab} set={chooseTab}>الأرشيف والتنظيف</Nav>}
    {data.settings.feature_flags.inventory&&can('inventory.manage')&&<Nav t="inventory" active={tab} set={chooseTab}>المخزون</Nav>}
    {data.settings.feature_flags.scheduled_prices&&can('prices.manage')&&<Nav t="prices" active={tab} set={chooseTab}>الأسعار المجدولة</Nav>}
    {data.settings.feature_flags.reports&&can('reports.view')&&<Nav t="reports" active={tab} set={chooseTab}>التقارير</Nav>}
    {data.settings.feature_flags.staff&&profile?.role==='owner'&&<Nav t="staff" active={tab} set={chooseTab}>الموظفون والصلاحيات</Nav>}
    {profile?.role==='owner'&&<Nav t="audit" active={tab} set={chooseTab}>سجل النشاط</Nav>}
    {profile?.role==='owner'&&<Nav t="health" active={tab} set={chooseTab}>صحة النظام</Nav>}
    <Nav t="release" active={tab} set={chooseTab}>ما الجديد</Nav>
    {can('settings.manage')&&<Nav t="settings" active={tab} set={chooseTab}>إعدادات المتجر</Nav>}
  </nav><div className="side-bottom"><Link to="/" onClick={()=>setMobileNavOpen(false)}>عرض المتجر</Link><button onClick={logout}>تسجيل الخروج</button></div></aside><main className="admin-main">
    <div className="admin-utility-bar"><AdminGlobalSearch onNavigate={chooseTab}/></div>
    {!supabaseConfigured&&<div className="demo-banner">أنت الآن في وضع التجربة المحلي. كل تعديلاتك محفوظة على هذا المتصفح فقط حتى نربط قاعدة البيانات.</div>}
    {data.settings.maintenance_mode&&<div className="demo-banner maintenance-admin-banner">وضع الصيانة مفعل حاليًا — العملاء لا يمكنهم إنشاء طلبات جديدة.</div>}
    <Suspense fallback={<Loading text="جاري تحميل القسم..."/>}>
      {tab==='home'&&<Dashboard/>}
      {tab==='products'&&can('products.manage')&&<Products/>}
      {tab==='categories'&&can('products.manage')&&<SimpleManager kind="categories"/>}
      {tab==='units'&&can('products.manage')&&<SimpleManager kind="units"/>}
      {tab==='areas'&&can('settings.manage')&&<SimpleManager kind="areas"/>}
      {tab==='orders'&&can('orders.view')&&<OrdersManager settings={data.settings} onNewCount={setNewOrderCount} onOpenStatuses={()=>chooseTab('statuses')} canManage={can('orders.manage')} canConfigureStatuses={can('settings.manage')}/>}
      {tab==='statuses'&&can('settings.manage')&&<OrderStatuses/>}
      {tab==='archive'&&profile?.role==='owner'&&<ArchiveCleanup/>}
      {tab==='inventory'&&data.settings.feature_flags.inventory&&can('inventory.manage')&&<InventoryPanel/>}
      {tab==='prices'&&data.settings.feature_flags.scheduled_prices&&can('prices.manage')&&<ScheduledPrices/>}
      {tab==='reports'&&data.settings.feature_flags.reports&&can('reports.view')&&<Reports/>}
      {tab==='staff'&&data.settings.feature_flags.staff&&profile?.role==='owner'&&<StaffManager/>}
      {tab==='audit'&&profile?.role==='owner'&&<AuditLog/>}
      {tab==='health'&&profile?.role==='owner'&&<SystemHealth data={data}/>}
      {tab==='release'&&<ReleaseNotes/>}
      {tab==='settings'&&can('settings.manage')&&<StoreSettings data={data} refresh={refresh} owner={profile?.role==='owner'}/>}
    </Suspense>
  </main>{profile?.role==='owner'&&!data.settings.setup_completed&&<Suspense fallback={null}><SetupWizard data={data} refresh={refresh}/></Suspense>}</div>;

  function Dashboard(){
    const [orders,setOrders]=useState<Order[]|null>(null);
    const [statuses,setStatuses]=useState<OrderStatusDefinition[]|null>(null);
    useEffect(()=>{void Promise.all([loadOrders(),loadOrderStatuses()]).then(([o,s])=>{setOrders(o);setStatuses(s)}).catch(()=>{setOrders([]);setStatuses([])})},[]);
    if(!orders||!statuses)return <Loading/>;

    const newNames=new Set(statuses.filter(s=>s.is_new).map(s=>s.name));
    const completedNames=new Set(statuses.filter(s=>s.is_completed).map(s=>s.name));
    const cancelledNames=new Set(statuses.filter(s=>s.is_cancelled).map(s=>s.name));
    const now=new Date();
    const startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const startYesterday=new Date(startToday);startYesterday.setDate(startYesterday.getDate()-1);
    const startWeek=new Date(startToday);startWeek.setDate(startWeek.getDate()-6);
    const prevWeekStart=new Date(startWeek);prevWeekStart.setDate(prevWeekStart.getDate()-7);

    const inRange=(o:Order,a:Date,b:Date)=>{const t=new Date(o.created_at);return t>=a&&t<b};
    const todayOrdersList=orders.filter(o=>inRange(o,startToday,new Date(startToday.getTime()+86400000)));
    const yesterdayOrders=orders.filter(o=>inRange(o,startYesterday,startToday));
    const weekOrders=orders.filter(o=>new Date(o.created_at)>=startWeek);
    const prevWeekOrders=orders.filter(o=>inRange(o,prevWeekStart,startWeek));
    const completed=orders.filter(o=>completedNames.has(o.status));
    const revenue=completed.reduce((s,o)=>s+Number(o.total),0);
    const avg=orders.length?orders.reduce((s,o)=>s+Number(o.total),0)/orders.length:0;
    const low=data!.products.filter(p=>isLowStock(p,data!.settings.low_stock_threshold)).length;

    const salesOf=(list:Order[])=>list.filter(o=>completedNames.has(o.status)).reduce((s,o)=>s+Number(o.total),0);
    const todaySales=salesOf(todayOrdersList),yesterdaySales=salesOf(yesterdayOrders),weekSales=salesOf(weekOrders),prevWeekSales=salesOf(prevWeekOrders);
    const percent=(a:number,b:number)=>b===0?(a>0?100:0):Math.round((a-b)/b*100);

    const itemMap=new Map<string,{name:string,qty:number}>();
    for(const o of orders.filter(x=>!cancelledNames.has(x.status)))for(const item of o.items){
      const key=item.product_id||item.product_name;const x=itemMap.get(key)||{name:item.product_name,qty:0};x.qty+=Number(item.quantity);itemMap.set(key,x);
    }
    const topProduct=[...itemMap.values()].sort((a,b)=>b.qty-a.qty)[0];

    const hours=new Map<number,number>();
    for(const o of orders){const h=new Date(o.created_at).getHours();hours.set(h,(hours.get(h)||0)+1)}
    const peak=[...hours.entries()].sort((a,b)=>b[1]-a[1])[0];

    const customers=new Map<string,number>();
    for(const o of orders){const p=(o.customer_phone||'').replace(/\D/g,'');if(p)customers.set(p,(customers.get(p)||0)+1)}
    const repeat=[...customers.values()].filter(n=>n>1).length;
    const cancelRate=orders.length?Math.round(orders.filter(o=>cancelledNames.has(o.status)).length/orders.length*100):0;
    const overdueNew=orders.filter(o=>newNames.has(o.status)&&(Date.now()-new Date(o.created_at).getTime())>=Math.max(1,data!.settings.order_alert_minutes||15)*60000).length;

    return <><PageTitle actions={<div className="page-actions">
      {!alertsEnabled&&can('orders.view')&&<button className="btn secondary" onClick={()=>void enableAlerts()}>تفعيل تنبيهات الطلبات</button>}
      {can('products.manage')&&<button className="btn secondary" onClick={()=>setTab('products')}>إضافة منتج</button>}
      {can('orders.view')&&<button className="btn" onClick={()=>setTab('orders')}>عرض الطلبات</button>}
    </div>}>الرئيسية</PageTitle>

    <div className="stats-grid">
      <Stat label="طلبات اليوم" value={todayOrdersList.length}/>
      <Stat label="طلبات جديدة" value={orders.filter(o=>newNames.has(o.status)).length}/>
      <Stat label="طلبات منتظرة أكثر من الحد" value={overdueNew}/>
      <Stat label="مبيعات اليوم" value={money(todaySales)}/>
      <Stat label="مقارنة مبيعات اليوم بالأمس" value={(percent(todaySales,yesterdaySales)>=0?'+':'')+percent(todaySales,yesterdaySales)+'٪'}/>
      <Stat label="مبيعات آخر 7 أيام" value={money(weekSales)}/>
      <Stat label="مقارنة بالأسبوع السابق" value={(percent(weekSales,prevWeekSales)>=0?'+':'')+percent(weekSales,prevWeekSales)+'٪'}/>
      <Stat label="متوسط قيمة الطلب" value={money(avg)}/>
      <Stat label="العملاء المتكررون" value={repeat}/>
      <Stat label="معدل الإلغاء" value={cancelRate+'٪'}/>
      <Stat label="أكثر منتج طلبًا" value={topProduct?topProduct.name:'—'}/>
      <Stat label="وقت الذروة" value={peak?(peak[0].toLocaleString('ar-EG')+':00'):'—'}/>
      <Stat label="مخزون منخفض" value={low}/>
    </div>

    {low>0&&can('inventory.manage')&&<div className="panel warning-panel"><h3>تنبيه مخزون</h3><p>يوجد {low} منتج أو خيار وصل إلى حد المخزون المنخفض.</p><button className="btn secondary" onClick={()=>setTab('inventory')}>فتح المخزون</button></div>}
    <div className="panel"><h3>حالة المتجر</h3><p>وضع الفتح الحالي: <b>{data!.settings.store_status_mode==='open'?'مفتوح يدويًا':data!.settings.store_status_mode==='closed'?'مغلق يدويًا':'تلقائي حسب المواعيد'}</b> · التوصيل: <b>{data!.settings.delivery_enabled?'مفعل':'غير مفعل'}</b> · تنبيهات الطلبات: <b>{alertsEnabled?'مفعلة':'غير مفعلة'}</b></p></div>
    </>;
  }

  function Products(){
    const [editing,setEditing]=useState<Product|null>(null); const [q,setQ]=useState(''); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState(''); const list=data!.products.filter(p=>`${p.name_ar} ${p.description_ar}`.includes(q)).sort((a,b)=>a.display_order-b.display_order);
    const validate=(p:Product)=>{if(!p.name_ar.trim())return 'اكتب اسم المنتج.';if(!p.options.length)return 'أضف خيار بيع واحدًا على الأقل.';for(const o of p.options){if(!o.name_ar.trim())return 'كل خيار بيع يجب أن يكون له اسم.';if(Number(o.price)<0)return 'السعر لا يمكن أن يكون سالبًا.';if(o.old_price!==null&&Number(o.old_price)<0)return 'السعر القديم لا يمكن أن يكون سالبًا.';if(o.track_stock&&Number(o.stock_qty??0)<0)return 'المخزون لا يمكن أن يكون سالبًا.';}if(p.track_stock&&Number(p.stock_qty??0)<0)return 'المخزون لا يمكن أن يكون سالبًا.';return '';};
    const save=async(p:Product)=>{const v=validate(p);if(v)return setMsg(v);setBusy(true);setMsg('');const oldImage=data!.products.find(x=>x.id===p.id)?.image_url||'';try{await saveProduct(p);if(oldImage&&oldImage!==p.image_url)await deleteImage(oldImage).catch(()=>{});await refresh();setEditing(null);setMsg('تم حفظ المنتج بنجاح.');}catch(e:any){setMsg(e?.message||'تعذر حفظ المنتج.')}finally{setBusy(false)}};
    const duplicate=(p:Product)=>{const id=uid();setEditing({...structuredClone(p),id,name_ar:`${p.name_ar} - نسخة`,display_order:data!.products.length+1,options:p.options.map(o=>({...o,id:uid(),product_id:id}))})};
    const quick=async(p:Product,field:'available'|'hidden'|'featured',value:boolean)=>{await updateProductFields(p.id,{[field]:value});await refresh()};
    const move=async(p:Product,dir:-1|1)=>{const sorted=[...data!.products].sort((a,b)=>a.display_order-b.display_order);const i=sorted.findIndex(x=>x.id===p.id);const j=i+dir;if(j<0||j>=sorted.length)return;const other=sorted[j];const a=p.display_order,b=other.display_order;await Promise.all([updateProductFields(p.id,{display_order:b}),updateProductFields(other.id,{display_order:a})]);await refresh();};
    const exportProducts=()=>downloadCsv('products.csv',[['المنتج','القسم','متاح','مخفي','مميز','الترتيب','الخيارات'],...data!.products.map(p=>[p.name_ar,data!.categories.find(c=>c.id===p.category_id)?.name_ar||'',p.available?'نعم':'لا',p.hidden?'نعم':'لا',p.featured?'نعم':'لا',p.display_order,p.options.map(o=>`${o.name_ar}:${o.price}`).join(' | ')])]);
    return <><PageTitle actions={<div className="page-actions"><button className="btn secondary" onClick={exportProducts}>تصدير CSV</button><button className="btn" onClick={()=>setEditing(newProduct(data!.products.length+1))}>+ إضافة منتج</button></div>}>المنتجات</PageTitle><ProductBulkTools products={data!.products} categories={data!.categories} onDone={refresh}/>{msg&&<p className={msg.includes('بنجاح')?'success-text':'error-text'}>{msg}</p>}<input className="admin-search" placeholder="ابحث عن منتج" value={q} onChange={e=>setQ(e.target.value)}/><div className="table-wrap"><table className="mobile-card-table product-admin-table"><thead><tr><th>المنتج</th><th>الحالة السريعة</th><th>السعر</th><th>المخزون</th><th>الترتيب</th><th>إجراءات</th></tr></thead><tbody>{list.map(p=>{const stock=productStockValue(p);const low=isLowStock(p,data!.settings.low_stock_threshold);return <tr key={p.id}><td data-label="المنتج"><div className="table-product">{p.image_url?<img src={p.image_url} alt=""/>:<span className="mini-placeholder">صورة</span>}<div><b>{p.name_ar}</b>{low&&<small className="stock-warning">مخزون منخفض</small>}</div></div></td><td data-label="الحالة"><div className="quick-toggles"><button className={p.available?'on':''} onClick={()=>quick(p,'available',!p.available)}>{p.available?'متاح':'غير متاح'}</button><button className={p.hidden?'warn':''} onClick={()=>quick(p,'hidden',!p.hidden)}>{p.hidden?'مخفي':'ظاهر'}</button><button className={p.featured?'on':''} onClick={()=>quick(p,'featured',!p.featured)}>{p.featured?'مميز':'عادي'}</button></div></td><td data-label="السعر">{p.options.length?money(Math.min(...p.options.map(o=>Number(o.price)))):'—'}</td><td data-label="المخزون">{stock===null?'غير متتبع':stock}</td><td data-label="الترتيب"><div className="order-buttons"><button onClick={()=>move(p,-1)}>↑</button><b>{p.display_order}</b><button onClick={()=>move(p,1)}>↓</button></div></td><td data-label="الإجراءات" className="table-actions"><button onClick={()=>setEditing(structuredClone(p))}>تعديل</button><button onClick={()=>duplicate(p)}>نسخ</button><button className="danger" onClick={async()=>{if(confirm('هل أنت متأكد من حذف هذا المنتج؟')){try{await deleteProduct(p.id);if(p.image_url)await deleteImage(p.image_url).catch(()=>{});await refresh();}catch(e:any){setMsg(e?.message||'تعذر الحذف')}}}}>حذف</button></td></tr>})}</tbody></table></div>{editing&&<ProductEditor product={editing} onChange={setEditing} onCancel={()=>setEditing(null)} onSave={()=>save(editing)} busy={busy}/>}</>;
  }

  function ProductEditor({product,onChange,onCancel,onSave,busy}:{product:Product,onChange:(p:Product)=>void,onCancel:()=>void,onSave:()=>void,busy:boolean}){
    const [imageBusy,setImageBusy]=useState(false); const originalImage=data!.products.find(x=>x.id===product.id)?.image_url||''; const set=(k:keyof Product,v:any)=>onChange({...product,[k]:v}); const setOpt=(id:string,k:keyof ProductOption,v:any)=>set('options',product.options.map(o=>o.id===id?{...o,[k]:v}:o));
    const upload=async(file?:File)=>{if(!file)return;setImageBusy(true);try{const previous=product.image_url;const url=await uploadImage(file);set('image_url',url);if(previous&&previous!==originalImage)await deleteImage(previous).catch(()=>{});}catch(e:any){alert(e?.message||'تعذر رفع الصورة')}finally{setImageBusy(false)}};
    const cancel=async()=>{if(product.image_url&&product.image_url!==originalImage)await deleteImage(product.image_url).catch(()=>{});onCancel();};
    const removeImage=async()=>{if(!confirm('حذف صورة المنتج؟'))return;if(product.image_url&&product.image_url!==originalImage)await deleteImage(product.image_url).catch(()=>{});set('image_url','');};
    return <div className="modal-backdrop"><div className="modal-card large"><div className="modal-head"><h2>{product.name_ar||'منتج جديد'}</h2><button disabled={imageBusy||busy} onClick={()=>void cancel()}>✕</button></div><div className="form-grid"><label>اسم المنتج<input value={product.name_ar} onChange={e=>set('name_ar',e.target.value)}/></label><label>القسم<select value={product.category_id||''} onChange={e=>set('category_id',e.target.value||null)}><option value="">بدون قسم</option>{data!.categories.map(c=><option value={c.id} key={c.id}>{c.name_ar}</option>)}</select></label><label className="full">الوصف<textarea value={product.description_ar} onChange={e=>set('description_ar',e.target.value)}/></label><label>ترتيب الظهور<input type="number" min="0" value={product.display_order} onChange={e=>set('display_order',Number(e.target.value))}/></label><label>صورة المنتج<input disabled={imageBusy} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0])}/><small>يتم ضغط الصورة تلقائيًا لتسريع الموقع.</small></label></div>{product.image_url&&<div className="image-admin-row"><img className="edit-preview" src={product.image_url}/><button className="btn secondary danger" onClick={()=>void removeImage()}>حذف الصورة</button></div>}<div className="toggle-row"><label><input type="checkbox" checked={product.available} onChange={e=>set('available',e.target.checked)}/> متاح</label><label><input type="checkbox" checked={product.featured} onChange={e=>set('featured',e.target.checked)}/> مميز</label><label><input type="checkbox" checked={product.hidden} onChange={e=>set('hidden',e.target.checked)}/> مخفي</label><label><input type="checkbox" checked={product.track_stock} onChange={e=>set('track_stock',e.target.checked)}/> تتبع مخزون المنتج</label>{product.track_stock&&<label>الكمية<input className="stock-input" type="number" min="0" value={product.stock_qty??0} onChange={e=>set('stock_qty',Number(e.target.value))}/></label>}</div><h3>الأوزان / الأحجام / الخيارات</h3><datalist id="selling-units-list">{data!.units.filter(u=>u.active).map(u=><option key={u.id} value={u.name_ar}/>)}</datalist><div className="option-list">{[...product.options].sort((a,b)=>a.display_order-b.display_order).map(o=><div className="option-row final-option-row" key={o.id}><input list="selling-units-list" placeholder="مثال: نصف كيلو" value={o.name_ar} onChange={e=>setOpt(o.id,'name_ar',e.target.value)}/><input type="number" min="0" placeholder="السعر" value={o.price} onChange={e=>setOpt(o.id,'price',Number(e.target.value))}/><input type="number" min="0" placeholder="السعر القديم" value={o.old_price??''} onChange={e=>setOpt(o.id,'old_price',e.target.value===''?null:Number(e.target.value))}/><input type="number" min="0" title="الترتيب" value={o.display_order} onChange={e=>setOpt(o.id,'display_order',Number(e.target.value))}/><label><input type="checkbox" checked={o.available} onChange={e=>setOpt(o.id,'available',e.target.checked)}/> متاح</label><label><input type="checkbox" checked={o.track_stock} onChange={e=>setOpt(o.id,'track_stock',e.target.checked)}/> مخزون</label>{o.track_stock&&<input type="number" min="0" title="الكمية" value={o.stock_qty??0} onChange={e=>setOpt(o.id,'stock_qty',Number(e.target.value))}/>}<button className="danger" onClick={()=>set('options',product.options.filter(x=>x.id!==o.id))}>حذف</button></div>)}</div><button className="btn secondary" onClick={()=>set('options',[...product.options,{id:uid(),product_id:product.id,name_ar:'',price:0,old_price:null,available:true,track_stock:false,stock_qty:null,display_order:product.options.length+1}])}>+ إضافة خيار</button><div className="modal-actions"><button className="btn secondary" disabled={imageBusy||busy} onClick={()=>void cancel()}>إلغاء</button><button className="btn" disabled={busy||imageBusy} onClick={onSave}>{busy?'جاري الحفظ...':'حفظ المنتج'}</button></div></div></div>;
  }

  function SimpleManager({kind}:{kind:'categories'|'units'|'areas'}){
    const config=kind==='categories'?{title:'الأقسام',items:data!.categories,newItem:()=>newCategory(data!.categories.length+1),save:saveCategory,del:deleteCategory}:kind==='units'?{title:'وحدات البيع',items:data!.units,newItem:()=>newUnit(data!.units.length+1),save:saveUnit,del:deleteUnit}:{title:'مناطق التوصيل',items:data!.deliveryAreas,newItem:()=>newArea(data!.deliveryAreas.length+1),save:saveDeliveryArea,del:deleteDeliveryArea};
    const [items,setItems]=useState<any[]>(structuredClone(config.items)); const [msg,setMsg]=useState(''); useEffect(()=>setItems(structuredClone(config.items)),[config.items.length]);
    const commit=async(item:any)=>{if(!item.name_ar?.trim())return setMsg('اكتب الاسم أولًا.');if(kind==='areas'&&Number(item.fee)<0)return setMsg('رسوم التوصيل لا يمكن أن تكون سالبة.');try{await config.save(item as any);await refresh();setMsg('تم الحفظ بنجاح.')}catch(e:any){setMsg(e?.message||'تعذر الحفظ')}};
    const remove=async(x:any)=>{let warning='تأكيد الحذف؟';if(kind==='categories'){const used=data!.products.filter(p=>p.category_id===x.id).length;if(used)warning=`هذا القسم مستخدم في ${used} منتج. حذف القسم سيجعل هذه المنتجات بدون قسم. هل تريد المتابعة؟`;}if(kind==='units'){const used=data!.products.flatMap(p=>p.options).filter(o=>o.name_ar===x.name_ar).length;if(used)warning=`هذه الوحدة مستخدمة في ${used} خيار بيع. المنتجات الحالية لن تتعطل لأن اسم الوحدة محفوظ داخل الخيار، لكن لن تظهر الوحدة للاختيار مستقبلًا. هل تريد المتابعة؟`;}if(confirm(warning)){try{await config.del(x.id);await refresh();setMsg('تم الحذف.')}catch(e:any){setMsg(e?.message||'تعذر الحذف')}}};
    return <><PageTitle actions={<button className="btn" onClick={()=>setItems(x=>[...x,config.newItem()])}>+ إضافة</button>}>{config.title}</PageTitle>{kind==='areas'&&!data!.settings.delivery_enabled&&<div className="info-box">التوصيل غير مفعل حاليًا. يمكنك تجهيز المناطق الآن ولن تظهر للعملاء إلا بعد تفعيل التوصيل.</div>}{msg&&<p className={msg.includes('بنجاح')?'success-text':'info-text'}>{msg}</p>}<div className="list-editor">{items.sort((a,b)=>a.display_order-b.display_order).map(x=><div className="list-edit-row" key={x.id}><input value={x.name_ar} placeholder="الاسم" onChange={e=>setItems(v=>v.map(y=>y.id===x.id?{...y,name_ar:e.target.value}:y))}/>{kind==='areas'&&<input type="number" min="0" value={x.fee} placeholder="رسوم التوصيل" onChange={e=>setItems(v=>v.map(y=>y.id===x.id?{...y,fee:Number(e.target.value)}:y))}/>}<input className="small-input" type="number" value={x.display_order} onChange={e=>setItems(v=>v.map(y=>y.id===x.id?{...y,display_order:Number(e.target.value)}:y))}/><label><input type="checkbox" checked={kind==='categories'?x.visible:kind==='units'?x.active:x.enabled} onChange={e=>setItems(v=>v.map(y=>y.id===x.id?{...y,[kind==='categories'?'visible':kind==='units'?'active':'enabled']:e.target.checked}:y))}/> ظاهر/فعال</label><button onClick={()=>commit(x)}>حفظ</button><button className="danger" onClick={()=>void remove(x)}>حذف</button></div>)}</div></>;
  }


}

function Nav({t,active,set,children,badge}:{t:Tab,active:Tab,set:(t:Tab)=>void,children:ReactNode,badge?:number}){return <button className={active===t?'active':''} onClick={()=>set(t)}><span>{children}</span>{Boolean(badge)&&<b className="nav-badge">{badge}</b>}</button>}
function PageTitle({children,actions}:{children:ReactNode,actions?:ReactNode}){return <div className="page-title"><h1>{children}</h1>{actions}</div>}
function Stat({label,value}:{label:string,value:string|number}){return <div className="stat-card"><small>{label}</small><strong>{value}</strong></div>}
