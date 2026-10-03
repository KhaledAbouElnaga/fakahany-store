import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AdminLogin from './AdminLogin';
import ProductBulkTools from './ProductBulkTools';
import Reports from './Reports';
import ArchiveCleanup from './ArchiveCleanup';
import OrderStatuses from './OrderStatuses';
import OrdersManager from './OrdersManager';
import StoreSettings from './StoreSettings';
import StaffManager from './StaffManager';
import InventoryPanel from './InventoryPanel';
import ScheduledPrices from './ScheduledPrices';
import { changeAdminPassword, currentAdminEmail, currentStaffProfile, hasStaffPermission, isAdmin, signOutAdmin } from '../../lib/auth';
import { useStore } from '../../contexts/StoreContext';
import Loading from '../../components/Loading';
import type { Category, DeliveryArea, Order, OrderCleanupLog, OrderStatusDefinition, Product, ProductOption, SellingUnit, ShopSettings, StaffProfile } from '../../types';
import { DEFAULT_DELIVERY_TEMPLATE, DEFAULT_ORDER_TEMPLATE, DEFAULT_PREPARING_TEMPLATE, DEFAULT_RECEIVED_TEMPLATE, deleteCategory, deleteDeliveryArea, deleteImage, deleteProduct, deleteUnit, executeOrderCleanup, loadOrderCleanupLogs, loadOrders, loadOrderStatuses, newArea, newCategory, newProduct, newUnit, orderCleanupPasswordIsSet, previewOrderCleanup, restoreArchivedOrder, saveCategory, saveDeliveryArea, saveProduct, saveSettings, saveUnit, setOrderCleanupPassword, updateOrderStatus, updateProductFields, uploadImage } from '../../lib/storeApi';
import { downloadCsv, downloadText, isLowStock, money, normalizeWhatsAppNumber, orderTemplateValues, printOrder, productStockValue, renderTemplate, uid } from '../../lib/utils';
import { supabase, supabaseConfigured } from '../../lib/supabase';

type Tab='home'|'products'|'categories'|'units'|'areas'|'orders'|'statuses'|'archive'|'inventory'|'prices'|'reports'|'staff'|'settings';

export default function AdminPage(){
  const [authorized,setAuthorized]=useState<boolean|null>(null);
  const [profile,setProfile]=useState<StaffProfile|null>(null);
  const [tab,setTab]=useState<Tab>('home');
  const {data,loading,error,refresh}=useStore();
  const [newOrderCount,setNewOrderCount]=useState(0);
  const [alertsEnabled,setAlertsEnabled]=useState(()=>sessionStorage.getItem('fakahany-admin-alerts')==='1');
  const audioRef=useRef<AudioContext|null>(null);

  const can=(permission:string)=>hasStaffPermission(profile,permission);

  useEffect(()=>{isAdmin().then(setAuthorized);},[]);
  useEffect(()=>{if(authorized)void currentStaffProfile().then(setProfile)},[authorized]);
  useEffect(()=>{if(authorized&&profile&&can('orders.view'))Promise.all([loadOrders(),loadOrderStatuses()]).then(([o,s])=>{const names=new Set(s.filter(x=>x.is_new).map(x=>x.name));setNewOrderCount(o.filter(x=>names.has(x.status)).length)}).catch(()=>{});},[authorized,profile,tab]);

  useEffect(()=>{
    if(!authorized||!profile||!supabaseConfigured||!supabase||!can('orders.view'))return;
    const channel=supabase.channel('admin-new-order-alerts').on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},payload=>{
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
    return ()=>{void supabase.removeChannel(channel)};
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
  return <div className="admin-shell"><aside className="admin-side"><div className="admin-brand"><b>{data.settings.store_name}</b><small>{profile?.display_name||profile?.email||'لوحة الإدارة'}</small></div><nav>
    <Nav t="home" active={tab} set={setTab}>الرئيسية</Nav>
    {can('products.manage')&&<><Nav t="products" active={tab} set={setTab}>المنتجات</Nav><Nav t="categories" active={tab} set={setTab}>الأقسام</Nav><Nav t="units" active={tab} set={setTab}>وحدات البيع</Nav></>}
    {can('settings.manage')&&<Nav t="areas" active={tab} set={setTab}>مناطق التوصيل</Nav>}
    {can('orders.view')&&<Nav t="orders" active={tab} set={setTab} badge={newOrderCount}>الطلبات</Nav>}
    {can('orders.manage')&&<Nav t="statuses" active={tab} set={setTab}>حالات الطلبات</Nav>}
    {profile?.role==='owner'&&<Nav t="archive" active={tab} set={setTab}>الأرشيف والتنظيف</Nav>}
    {can('inventory.manage')&&<Nav t="inventory" active={tab} set={setTab}>المخزون</Nav>}
    {can('prices.manage')&&<Nav t="prices" active={tab} set={setTab}>الأسعار المجدولة</Nav>}
    {can('reports.view')&&<Nav t="reports" active={tab} set={setTab}>التقارير</Nav>}
    {profile?.role==='owner'&&<Nav t="staff" active={tab} set={setTab}>الموظفون والصلاحيات</Nav>}
    {can('settings.manage')&&<Nav t="settings" active={tab} set={setTab}>إعدادات المتجر</Nav>}
  </nav><div className="side-bottom"><Link to="/">عرض المتجر</Link><button onClick={logout}>تسجيل الخروج</button></div></aside><main className="admin-main">
    {!supabaseConfigured&&<div className="demo-banner">أنت الآن في وضع التجربة المحلي. كل تعديلاتك محفوظة على هذا المتصفح فقط حتى نربط قاعدة البيانات.</div>}
    {tab==='home'&&<Dashboard/>}
    {tab==='products'&&can('products.manage')&&<Products/>}
    {tab==='categories'&&can('products.manage')&&<SimpleManager kind="categories"/>}
    {tab==='units'&&can('products.manage')&&<SimpleManager kind="units"/>}
    {tab==='areas'&&can('settings.manage')&&<SimpleManager kind="areas"/>}
    {tab==='orders'&&can('orders.view')&&<OrdersManager settings={data.settings} onNewCount={setNewOrderCount} onOpenStatuses={()=>setTab('statuses')} canManage={can('orders.manage')}/>}
    {tab==='statuses'&&can('orders.manage')&&<OrderStatuses/>}
    {tab==='archive'&&profile?.role==='owner'&&<ArchiveCleanup/>}
    {tab==='inventory'&&can('inventory.manage')&&<InventoryPanel/>}
    {tab==='prices'&&can('prices.manage')&&<ScheduledPrices/>}
    {tab==='reports'&&can('reports.view')&&<Reports/>}
    {tab==='staff'&&profile?.role==='owner'&&<StaffManager/>}
    {tab==='settings'&&can('settings.manage')&&<StoreSettings data={data} refresh={refresh}/>}
  </main></div>;

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

    return <><PageTitle actions={<div className="page-actions">
      {!alertsEnabled&&can('orders.view')&&<button className="btn secondary" onClick={()=>void enableAlerts()}>تفعيل تنبيهات الطلبات</button>}
      {can('products.manage')&&<button className="btn secondary" onClick={()=>setTab('products')}>إضافة منتج</button>}
      {can('orders.view')&&<button className="btn" onClick={()=>setTab('orders')}>عرض الطلبات</button>}
    </div>}>الرئيسية</PageTitle>

    <div className="stats-grid">
      <Stat label="طلبات اليوم" value={todayOrdersList.length}/>
      <Stat label="طلبات جديدة" value={orders.filter(o=>newNames.has(o.status)).length}/>
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
    const save=async(p:Product)=>{const v=validate(p);if(v)return setMsg(v);setBusy(true);setMsg('');try{await saveProduct(p);await refresh();setEditing(null);setMsg('تم حفظ المنتج بنجاح.');}catch(e:any){setMsg(e?.message||'تعذر حفظ المنتج.')}finally{setBusy(false)}};
    const duplicate=(p:Product)=>{const id=uid();setEditing({...structuredClone(p),id,name_ar:`${p.name_ar} - نسخة`,display_order:data!.products.length+1,options:p.options.map(o=>({...o,id:uid(),product_id:id}))})};
    const quick=async(p:Product,field:'available'|'hidden'|'featured',value:boolean)=>{await updateProductFields(p.id,{[field]:value});await refresh()};
    const move=async(p:Product,dir:-1|1)=>{const sorted=[...data!.products].sort((a,b)=>a.display_order-b.display_order);const i=sorted.findIndex(x=>x.id===p.id);const j=i+dir;if(j<0||j>=sorted.length)return;const other=sorted[j];const a=p.display_order,b=other.display_order;await Promise.all([updateProductFields(p.id,{display_order:b}),updateProductFields(other.id,{display_order:a})]);await refresh();};
    const exportProducts=()=>downloadCsv('products.csv',[['المنتج','القسم','متاح','مخفي','مميز','الترتيب','الخيارات'],...data!.products.map(p=>[p.name_ar,data!.categories.find(c=>c.id===p.category_id)?.name_ar||'',p.available?'نعم':'لا',p.hidden?'نعم':'لا',p.featured?'نعم':'لا',p.display_order,p.options.map(o=>`${o.name_ar}:${o.price}`).join(' | ')])]);
    return <><PageTitle actions={<div className="page-actions"><button className="btn secondary" onClick={exportProducts}>تصدير CSV</button><button className="btn" onClick={()=>setEditing(newProduct(data!.products.length+1))}>+ إضافة منتج</button></div>}>المنتجات</PageTitle><ProductBulkTools products={data!.products} categories={data!.categories} onDone={refresh}/>{msg&&<p className={msg.includes('بنجاح')?'success-text':'error-text'}>{msg}</p>}<input className="admin-search" placeholder="ابحث عن منتج" value={q} onChange={e=>setQ(e.target.value)}/><div className="table-wrap"><table><thead><tr><th>المنتج</th><th>الحالة السريعة</th><th>السعر</th><th>المخزون</th><th>الترتيب</th><th>إجراءات</th></tr></thead><tbody>{list.map(p=>{const stock=productStockValue(p);const low=isLowStock(p,data!.settings.low_stock_threshold);return <tr key={p.id}><td><div className="table-product">{p.image_url?<img src={p.image_url} alt=""/>:<span className="mini-placeholder">صورة</span>}<div><b>{p.name_ar}</b>{low&&<small className="stock-warning">مخزون منخفض</small>}</div></div></td><td><div className="quick-toggles"><button className={p.available?'on':''} onClick={()=>quick(p,'available',!p.available)}>{p.available?'متاح':'غير متاح'}</button><button className={p.hidden?'warn':''} onClick={()=>quick(p,'hidden',!p.hidden)}>{p.hidden?'مخفي':'ظاهر'}</button><button className={p.featured?'on':''} onClick={()=>quick(p,'featured',!p.featured)}>{p.featured?'مميز':'عادي'}</button></div></td><td>{p.options.length?money(Math.min(...p.options.map(o=>Number(o.price)))):'—'}</td><td>{stock===null?'غير متتبع':stock}</td><td><div className="order-buttons"><button onClick={()=>move(p,-1)}>↑</button><b>{p.display_order}</b><button onClick={()=>move(p,1)}>↓</button></div></td><td className="table-actions"><button onClick={()=>setEditing(structuredClone(p))}>تعديل</button><button onClick={()=>duplicate(p)}>نسخ</button><button className="danger" onClick={async()=>{if(confirm('هل أنت متأكد من حذف هذا المنتج؟')){try{await deleteProduct(p.id);if(p.image_url)await deleteImage(p.image_url).catch(()=>{});await refresh();}catch(e:any){setMsg(e?.message||'تعذر الحذف')}}}}>حذف</button></td></tr>})}</tbody></table></div>{editing&&<ProductEditor product={editing} onChange={setEditing} onCancel={()=>setEditing(null)} onSave={()=>save(editing)} busy={busy}/>}</>;
  }

  function ProductEditor({product,onChange,onCancel,onSave,busy}:{product:Product,onChange:(p:Product)=>void,onCancel:()=>void,onSave:()=>void,busy:boolean}){
    const [imageBusy,setImageBusy]=useState(false); const set=(k:keyof Product,v:any)=>onChange({...product,[k]:v}); const setOpt=(id:string,k:keyof ProductOption,v:any)=>set('options',product.options.map(o=>o.id===id?{...o,[k]:v}:o));
    const upload=async(file?:File)=>{if(!file)return;setImageBusy(true);try{const url=await uploadImage(file);set('image_url',url);}catch(e:any){alert(e?.message||'تعذر رفع الصورة')}finally{setImageBusy(false)}};
    return <div className="modal-backdrop"><div className="modal-card large"><div className="modal-head"><h2>{product.name_ar||'منتج جديد'}</h2><button onClick={onCancel}>✕</button></div><div className="form-grid"><label>اسم المنتج<input value={product.name_ar} onChange={e=>set('name_ar',e.target.value)}/></label><label>القسم<select value={product.category_id||''} onChange={e=>set('category_id',e.target.value||null)}><option value="">بدون قسم</option>{data!.categories.map(c=><option value={c.id} key={c.id}>{c.name_ar}</option>)}</select></label><label className="full">الوصف<textarea value={product.description_ar} onChange={e=>set('description_ar',e.target.value)}/></label><label>ترتيب الظهور<input type="number" min="0" value={product.display_order} onChange={e=>set('display_order',Number(e.target.value))}/></label><label>صورة المنتج<input disabled={imageBusy} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0])}/><small>يتم ضغط الصورة تلقائيًا لتسريع الموقع.</small></label></div>{product.image_url&&<div className="image-admin-row"><img className="edit-preview" src={product.image_url}/><button className="btn secondary danger" onClick={async()=>{if(confirm('حذف صورة المنتج؟')){await deleteImage(product.image_url);set('image_url','')}}}>حذف الصورة</button></div>}<div className="toggle-row"><label><input type="checkbox" checked={product.available} onChange={e=>set('available',e.target.checked)}/> متاح</label><label><input type="checkbox" checked={product.featured} onChange={e=>set('featured',e.target.checked)}/> مميز</label><label><input type="checkbox" checked={product.hidden} onChange={e=>set('hidden',e.target.checked)}/> مخفي</label><label><input type="checkbox" checked={product.track_stock} onChange={e=>set('track_stock',e.target.checked)}/> تتبع مخزون المنتج</label>{product.track_stock&&<label>الكمية<input className="stock-input" type="number" min="0" value={product.stock_qty??0} onChange={e=>set('stock_qty',Number(e.target.value))}/></label>}</div><h3>الأوزان / الأحجام / الخيارات</h3><datalist id="selling-units-list">{data!.units.filter(u=>u.active).map(u=><option key={u.id} value={u.name_ar}/>)}</datalist><div className="option-list">{[...product.options].sort((a,b)=>a.display_order-b.display_order).map(o=><div className="option-row final-option-row" key={o.id}><input list="selling-units-list" placeholder="مثال: نصف كيلو" value={o.name_ar} onChange={e=>setOpt(o.id,'name_ar',e.target.value)}/><input type="number" min="0" placeholder="السعر" value={o.price} onChange={e=>setOpt(o.id,'price',Number(e.target.value))}/><input type="number" min="0" placeholder="السعر القديم" value={o.old_price??''} onChange={e=>setOpt(o.id,'old_price',e.target.value===''?null:Number(e.target.value))}/><input type="number" min="0" title="الترتيب" value={o.display_order} onChange={e=>setOpt(o.id,'display_order',Number(e.target.value))}/><label><input type="checkbox" checked={o.available} onChange={e=>setOpt(o.id,'available',e.target.checked)}/> متاح</label><label><input type="checkbox" checked={o.track_stock} onChange={e=>setOpt(o.id,'track_stock',e.target.checked)}/> مخزون</label>{o.track_stock&&<input type="number" min="0" title="الكمية" value={o.stock_qty??0} onChange={e=>setOpt(o.id,'stock_qty',Number(e.target.value))}/>}<button className="danger" onClick={()=>set('options',product.options.filter(x=>x.id!==o.id))}>حذف</button></div>)}</div><button className="btn secondary" onClick={()=>set('options',[...product.options,{id:uid(),product_id:product.id,name_ar:'',price:0,old_price:null,available:true,track_stock:false,stock_qty:null,display_order:product.options.length+1}])}>+ إضافة خيار</button><div className="modal-actions"><button className="btn secondary" onClick={onCancel}>إلغاء</button><button className="btn" disabled={busy||imageBusy} onClick={onSave}>{busy?'جاري الحفظ...':'حفظ المنتج'}</button></div></div></div>;
  }

  function SimpleManager({kind}:{kind:'categories'|'units'|'areas'}){
    const config=kind==='categories'?{title:'الأقسام',items:data!.categories,newItem:()=>newCategory(data!.categories.length+1),save:saveCategory,del:deleteCategory}:kind==='units'?{title:'وحدات البيع',items:data!.units,newItem:()=>newUnit(data!.units.length+1),save:saveUnit,del:deleteUnit}:{title:'مناطق التوصيل',items:data!.deliveryAreas,newItem:()=>newArea(data!.deliveryAreas.length+1),save:saveDeliveryArea,del:deleteDeliveryArea};
    const [items,setItems]=useState<any[]>(structuredClone(config.items)); const [msg,setMsg]=useState(''); useEffect(()=>setItems(structuredClone(config.items)),[config.items.length]);
    const commit=async(item:any)=>{if(!item.name_ar?.trim())return setMsg('اكتب الاسم أولًا.');if(kind==='areas'&&Number(item.fee)<0)return setMsg('رسوم التوصيل لا يمكن أن تكون سالبة.');try{await config.save(item as any);await refresh();setMsg('تم الحفظ بنجاح.')}catch(e:any){setMsg(e?.message||'تعذر الحفظ')}};
    const remove=async(x:any)=>{let warning='تأكيد الحذف؟';if(kind==='categories'){const used=data!.products.filter(p=>p.category_id===x.id).length;if(used)warning=`هذا القسم مستخدم في ${used} منتج. حذف القسم سيجعل هذه المنتجات بدون قسم. هل تريد المتابعة؟`;}if(kind==='units'){const used=data!.products.flatMap(p=>p.options).filter(o=>o.name_ar===x.name_ar).length;if(used)warning=`هذه الوحدة مستخدمة في ${used} خيار بيع. المنتجات الحالية لن تتعطل لأن اسم الوحدة محفوظ داخل الخيار، لكن لن تظهر الوحدة للاختيار مستقبلًا. هل تريد المتابعة؟`;}if(confirm(warning)){try{await config.del(x.id);await refresh();setMsg('تم الحذف.')}catch(e:any){setMsg(e?.message||'تعذر الحذف')}}};
    return <><PageTitle actions={<button className="btn" onClick={()=>setItems(x=>[...x,config.newItem()])}>+ إضافة</button>}>{config.title}</PageTitle>{kind==='areas'&&!data!.settings.delivery_enabled&&<div className="info-box">التوصيل غير مفعل حاليًا. يمكنك تجهيز المناطق الآن ولن تظهر للعملاء إلا بعد تفعيل التوصيل.</div>}{msg&&<p className={msg.includes('بنجاح')?'success-text':'info-text'}>{msg}</p>}<div className="list-editor">{items.sort((a,b)=>a.display_order-b.display_order).map(x=><div className="list-edit-row" key={x.id}><input value={x.name_ar} placeholder="الاسم" onChange={e=>setItems(v=>v.map(y=>y.id===x.id?{...y,name_ar:e.target.value}:y))}/>{kind==='areas'&&<input type="number" min="0" value={x.fee} placeholder="رسوم التوصيل" onChange={e=>setItems(v=>v.map(y=>y.id===x.id?{...y,fee:Number(e.target.value)}:y))}/>}<input className="small-input" type="number" value={x.display_order} onChange={e=>setItems(v=>v.map(y=>y.id===x.id?{...y,display_order:Number(e.target.value)}:y))}/><label><input type="checkbox" checked={kind==='categories'?x.visible:kind==='units'?x.active:x.enabled} onChange={e=>setItems(v=>v.map(y=>y.id===x.id?{...y,[kind==='categories'?'visible':kind==='units'?'active':'enabled']:e.target.checked}:y))}/> ظاهر/فعال</label><button onClick={()=>commit(x)}>حفظ</button><button className="danger" onClick={()=>void remove(x)}>حذف</button></div>)}</div></>;
  }

  function Orders(){
    const [orders,setOrders]=useState<Order[]|null>(null);
    const [logs,setLogs]=useState<OrderCleanupLog[]>([]);
    const [q,setQ]=useState('');
    const [status,setStatus]=useState('all');
    const [from,setFrom]=useState('');
    const [to,setTo]=useState('');
    const [view,setView]=useState<'active'|'archived'>('active');
    const [msg,setMsg]=useState('');
    const [cleanupMode,setCleanupMode]=useState<'day'|'month'|'range'|'before'>('month');
    const [cleanupDay,setCleanupDay]=useState('');
    const [cleanupMonth,setCleanupMonth]=useState(new Date().toISOString().slice(0,7));
    const [cleanupFrom,setCleanupFrom]=useState('');
    const [cleanupTo,setCleanupTo]=useState('');
    const [cleanupBefore,setCleanupBefore]=useState('');
    const [cleanupAction,setCleanupAction]=useState<'archive'|'delete'>('archive');
    const [cleanupPassword,setCleanupPasswordValue]=useState('');
    const [cleanupPreview,setCleanupPreview]=useState<{count:number;active_count:number;archived_count:number}|null>(null);
    const [cleanupBusy,setCleanupBusy]=useState(false);
    const [passwordSet,setPasswordSet]=useState<boolean|null>(null);
    const [showPasswordChange,setShowPasswordChange]=useState(false);
    const [newDeletePassword,setNewDeletePassword]=useState('');
    const [newDeletePassword2,setNewDeletePassword2]=useState('');

    const reload=async()=>{
      const [all,newLogs,passwordReady]=await Promise.all([
        loadOrders(true),
        loadOrderCleanupLogs().catch(()=>[] as OrderCleanupLog[]),
        orderCleanupPasswordIsSet().catch(()=>false)
      ]);
      setOrders(all);setLogs(newLogs);setPasswordSet(passwordReady);
      setNewOrderCount(all.filter(o=>!o.archived_at&&o.status==='جديد').length);
    };

    useEffect(()=>{void reload()},[]);
    if(!orders)return <Loading/>;

    const base=orders.filter(o=>view==='archived'?Boolean(o.archived_at):!o.archived_at);
    const filtered=base.filter(o=>{
      const text=`${o.order_number} ${o.customer_name} ${o.customer_phone}`;
      const d=new Date(o.created_at);
      const fromOk=!from||d>=new Date(`${from}T00:00:00`);
      const toOk=!to||d<=new Date(`${to}T23:59:59`);
      return (!q||text.includes(q))&&(status==='all'||o.status===status)&&fromOk&&toOk;
    });

    const setOrderStatus=async(o:Order,s:Order['status'])=>{
      try{
        await updateOrderStatus(o.id,s);
        setOrders(v=>v!.map(x=>x.id===o.id?{...x,status:s}:x));
        setNewOrderCount(v=>o.status==='جديد'&&s!=='جديد'?Math.max(0,v-1):o.status!=='جديد'&&s==='جديد'?v+1:v);
        setMsg('تم تحديث حالة الطلب.');
      }catch(e:any){setMsg(e?.message||'تعذر تحديث الحالة')}
    };

    const waStatus=(o:Order,template:string)=>{
      const phone=normalizeWhatsAppNumber(o.customer_phone);
      if(!phone)return alert('رقم هاتف العميل غير صالح لواتساب.');
      const message=renderTemplate(template,orderTemplateValues(o,data!.settings));
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank');
    };

    const downloadOrder=(o:Order)=>{
      const v=orderTemplateValues(o,data!.settings);
      downloadText(`order-${o.order_number}.txt`,renderTemplate(data!.settings.whatsapp_order_template,v));
    };

    const exportOrders=()=>downloadCsv(
      view==='archived'?'archived-orders.csv':'orders.csv',
      [['رقم الطلب','التاريخ','العميل','الهاتف','العنوان','المنطقة','إجمالي المنتجات','التوصيل','الإجمالي','الحالة'],...filtered.map(o=>[o.order_number,new Date(o.created_at).toLocaleString('ar-EG'),o.customer_name,o.customer_phone,o.address,o.area_name,o.product_subtotal,o.delivery_fee,o.total,o.status])]
    );

    const cleanupRange=()=>{
      if(cleanupMode==='day'){
        if(!cleanupDay)throw new Error('اختر اليوم أولًا.');
        return {from:cleanupDay,to:cleanupDay,type:'day',label:`طلبات يوم ${new Date(cleanupDay+'T12:00:00').toLocaleDateString('ar-EG')}`};
      }
      if(cleanupMode==='month'){
        if(!cleanupMonth)throw new Error('اختر الشهر أولًا.');
        const [y,m]=cleanupMonth.split('-').map(Number);
        const last=new Date(y,m,0).getDate();
        const endDate=`${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
        return {from:`${cleanupMonth}-01`,to:endDate,type:'month',label:`طلبات شهر ${cleanupMonth}`};
      }
      if(cleanupMode==='range'){
        if(!cleanupFrom||!cleanupTo)throw new Error('حدد تاريخ البداية والنهاية.');
        if(cleanupFrom>cleanupTo)throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
        return {from:cleanupFrom,to:cleanupTo,type:'range',label:`الطلبات من ${cleanupFrom} إلى ${cleanupTo}`};
      }
      if(!cleanupBefore)throw new Error('حدد آخر تاريخ للحذف أو الأرشفة.');
      const dates=orders.map(o=>o.created_at.slice(0,10)).sort();
      const earliest=dates[0]||cleanupBefore;
      return {from:earliest,to:cleanupBefore,type:'before',label:`كل الطلبات حتى ${cleanupBefore}`};
    };

    const previewCleanup=async()=>{
      setMsg('');
      try{
        const range=cleanupRange();
        const preview=await previewOrderCleanup(range.from,range.to);
        setCleanupPreview(preview);
      }catch(e:any){setCleanupPreview(null);setMsg(e?.message||'تعذر معاينة الطلبات.')}
    };

    const saveDeletePassword=async()=>{
      if(newDeletePassword!==newDeletePassword2)return setMsg('كلمتا مرور الحذف غير متطابقتين.');
      if(newDeletePassword.length<8)return setMsg('كلمة مرور الحذف يجب أن تكون 8 أحرف على الأقل.');
      setCleanupBusy(true);
      try{
        await setOrderCleanupPassword(newDeletePassword);
        setPasswordSet(true);setShowPasswordChange(false);setNewDeletePassword('');setNewDeletePassword2('');
        setMsg('تم حفظ كلمة مرور الحذف المستقلة بنجاح.');
      }catch(e:any){setMsg(e?.message||'تعذر حفظ كلمة مرور الحذف.')}finally{setCleanupBusy(false)}
    };

    const runCleanup=async()=>{
      setMsg('');
      let range:{from:string;to:string;type:string;label:string};
      try{range=cleanupRange()}catch(e:any){return setMsg(e?.message||'الفترة غير صحيحة.')}
      if(cleanupAction==='delete'&&!passwordSet)return setMsg('عيّن كلمة مرور الحذف المستقلة أولًا.');
      if(cleanupAction==='delete'&&!cleanupPassword)return setMsg('اكتب كلمة مرور الحذف قبل الحذف النهائي.');

      setCleanupBusy(true);
      try{
        const preview=await previewOrderCleanup(range.from,range.to);
        setCleanupPreview(preview);
        const affected=cleanupAction==='archive'?preview.active_count:preview.count;
        if(!affected){setMsg('لا توجد طلبات مطابقة لهذه الفترة.');return}
        const verb=cleanupAction==='archive'?'أرشفة':'حذف نهائي';
        const warning=cleanupAction==='delete'
          ? `سيتم حذف ${affected} طلب نهائيًا. لن يمكن استرجاع الطلبات بعد الحذف، لكن سجل عملية الحذف سيظل محفوظًا. هل تريد المتابعة؟`
          : `سيتم نقل ${affected} طلب إلى الأرشيف. يمكن استرجاعها لاحقًا. هل تريد المتابعة؟`;
        if(!window.confirm(warning))return;
        const result=await executeOrderCleanup({action:cleanupAction,dateFrom:range.from,dateTo:range.to,filterType:range.type,filterLabel:range.label,password:cleanupPassword});
        setCleanupPasswordValue('');setCleanupPreview(null);
        await reload();
        setMsg(`تم ${verb} ${result.count} طلب وتسجيل العملية في سجل العمليات.`);
      }catch(e:any){setMsg(e?.message||'تعذر تنفيذ العملية.')}finally{setCleanupBusy(false)}
    };

    const restoreOrder=async(o:Order)=>{
      if(!window.confirm(`استرجاع الطلب #${o.order_number} إلى قائمة الطلبات؟`))return;
      try{await restoreArchivedOrder(o.id);await reload();setMsg('تم استرجاع الطلب وتسجيل العملية.')}catch(e:any){setMsg(e?.message||'تعذر استرجاع الطلب.')}
    };

    const actionName=(a:OrderCleanupLog['action'])=>a==='delete'?'حذف نهائي':a==='archive'?'أرشفة':'استرجاع';

    return <><PageTitle actions={<button className="btn secondary" onClick={exportOrders}>تصدير النتائج CSV</button>}>الطلبات</PageTitle>
      {msg&&<p className={msg.includes('تعذر')||msg.includes('غير ')||msg.includes('يجب')||msg.includes('عيّن')||msg.includes('اكتب')?'error-text':'success-text'}>{msg}</p>}

      <div className="orders-view-tabs">
        <button className={view==='active'?'active':''} onClick={()=>setView('active')}>الطلبات الحالية <b>{orders.filter(o=>!o.archived_at).length}</b></button>
        <button className={view==='archived'?'active':''} onClick={()=>setView('archived')}>الأرشيف <b>{orders.filter(o=>Boolean(o.archived_at)).length}</b></button>
      </div>

      <div className="order-filters">
        <input placeholder="ابحث بالاسم أو الهاتف أو رقم الطلب" value={q} onChange={e=>setQ(e.target.value)}/>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">كل الحالات</option><option>جديد</option><option>جاري التجهيز</option><option>خرج للتوصيل</option><option>مكتمل</option><option>ملغي</option></select>
        <label>من<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>إلى<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      </div>

      {!filtered.length?<div className="empty-state">لا توجد طلبات مطابقة.</div>:<div className="table-wrap"><table><thead><tr><th>رقم الطلب</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة والإجراءات</th></tr></thead><tbody>{filtered.map(o=><tr key={o.id}><td>#{o.order_number}{o.archived_at&&<small className="block muted">مؤرشف</small>}</td><td>{o.customer_name||'—'}<small className="block">{o.customer_phone||'—'}</small></td><td>{new Date(o.created_at).toLocaleString('ar-EG')}</td><td>{money(o.total)}</td><td>
        {o.archived_at?<button className="btn secondary small-admin-btn" onClick={()=>void restoreOrder(o)}>استرجاع من الأرشيف</button>:<>
          <select value={o.status} onChange={e=>void setOrderStatus(o,e.target.value as Order['status'])}><option>جديد</option><option>جاري التجهيز</option><option>خرج للتوصيل</option><option>مكتمل</option><option>ملغي</option></select>
          <div className="order-action-row"><button onClick={()=>waStatus(o,data!.settings.whatsapp_received_template)}>واتساب: استلام</button><button onClick={()=>waStatus(o,data!.settings.whatsapp_preparing_template)}>جاري التجهيز</button><button onClick={()=>waStatus(o,data!.settings.whatsapp_delivery_template)}>خرج للتوصيل</button><button onClick={()=>printOrder(o,data!.settings)}>طباعة</button><button onClick={()=>downloadOrder(o)}>تنزيل</button></div>
        </>}
        <details><summary>التفاصيل</summary><div className="order-details">{o.items.map(i=><p key={i.id}>{i.product_name} — {i.option_name} × {i.quantity} = {money(i.line_total)}</p>)}<p><b>العنوان:</b> {o.address||'—'}</p>{data!.settings.delivery_enabled&&<p><b>المنطقة:</b> {o.area_name||'—'} · <b>التوصيل:</b> {money(o.delivery_fee)}</p>}{o.requested_time&&<p><b>الموعد المطلوب:</b> {o.requested_time}</p>}<p><b>ملاحظات:</b> {o.notes||'لا يوجد'}</p></div></details>
      </td></tr>)}</tbody></table></div>}

      <section className="panel order-cleanup-panel">
        <div className="cleanup-head"><div><h3>تنظيف وأرشفة الطلبات</h3><p className="muted">يمكنك أرشفة الطلبات القديمة أو حذفها نهائيًا حسب يوم أو شهر أو فترة. كل عملية يتم تسجيلها في السجل بالوقت والفترة وعدد الطلبات.</p></div><span className="security-pill">{passwordSet?'كلمة مرور الحذف مفعلة':'كلمة مرور الحذف غير معينة'}</span></div>

        <div className="cleanup-grid">
          <label>اختيار الفترة<select value={cleanupMode} onChange={e=>{setCleanupMode(e.target.value as typeof cleanupMode);setCleanupPreview(null)}}><option value="day">يوم محدد</option><option value="month">شهر محدد</option><option value="range">فترة من تاريخ إلى تاريخ</option><option value="before">كل الطلبات حتى تاريخ</option></select></label>
          {cleanupMode==='day'&&<label>اليوم<input type="date" value={cleanupDay} onChange={e=>{setCleanupDay(e.target.value);setCleanupPreview(null)}}/></label>}
          {cleanupMode==='month'&&<label>الشهر<input type="month" value={cleanupMonth} onChange={e=>{setCleanupMonth(e.target.value);setCleanupPreview(null)}}/></label>}
          {cleanupMode==='range'&&<><label>من<input type="date" value={cleanupFrom} onChange={e=>{setCleanupFrom(e.target.value);setCleanupPreview(null)}}/></label><label>إلى<input type="date" value={cleanupTo} onChange={e=>{setCleanupTo(e.target.value);setCleanupPreview(null)}}/></label></>}
          {cleanupMode==='before'&&<label>حتى تاريخ<input type="date" value={cleanupBefore} onChange={e=>{setCleanupBefore(e.target.value);setCleanupPreview(null)}}/></label>}
          <label>الإجراء<select value={cleanupAction} onChange={e=>{setCleanupAction(e.target.value as 'archive'|'delete');setCleanupPreview(null)}}><option value="archive">أرشفة — يمكن الاسترجاع</option><option value="delete">حذف نهائي — لا يمكن الاسترجاع</option></select></label>
        </div>

        <div className="cleanup-actions">
          <button className="btn secondary" disabled={cleanupBusy} onClick={()=>void previewCleanup()}>معاينة العدد</button>
          {cleanupPreview&&<div className="cleanup-preview"><b>{cleanupPreview.count} طلب في الفترة</b><span>{cleanupPreview.active_count} حالي · {cleanupPreview.archived_count} مؤرشف</span></div>}
        </div>

        {cleanupAction==='delete'&&<div className="danger-zone">
          <b>الحذف النهائي</b>
          <p>الحذف النهائي لا يمكن التراجع عنه. سجل الحذف نفسه لن يتم حذفه. الحذف لا يغيّر المخزون الحالي.</p>
          <label>كلمة مرور الحذف<input type="password" autoComplete="off" value={cleanupPassword} onChange={e=>setCleanupPasswordValue(e.target.value)} placeholder="كلمة المرور المستقلة للحذف"/></label>
        </div>}

        <button className={cleanupAction==='delete'?'btn delete-action':'btn'} disabled={cleanupBusy} onClick={()=>void runCleanup()}>{cleanupBusy?'جاري التنفيذ...':cleanupAction==='delete'?'حذف الطلبات المحددة نهائيًا':'نقل الطلبات المحددة إلى الأرشيف'}</button>

        <div className="cleanup-password-box">
          <div><b>كلمة مرور الحذف المستقلة</b><p className="muted">مختلفة عن كلمة مرور تسجيل دخول المدير، ولا يتم حفظها كنص قابل للقراءة.</p></div>
          {passwordSet&&!showPasswordChange?<button className="btn secondary" onClick={()=>setShowPasswordChange(true)}>تغيير كلمة مرور الحذف</button>:<div className="cleanup-password-fields"><input type="password" value={newDeletePassword} onChange={e=>setNewDeletePassword(e.target.value)} placeholder="كلمة مرور جديدة — 8 أحرف على الأقل"/><input type="password" value={newDeletePassword2} onChange={e=>setNewDeletePassword2(e.target.value)} placeholder="تأكيد كلمة المرور"/><button className="btn secondary" disabled={cleanupBusy||!newDeletePassword} onClick={()=>void saveDeletePassword()}>{passwordSet?'حفظ كلمة المرور الجديدة':'تعيين كلمة مرور الحذف'}</button>{passwordSet&&<button className="text-btn" onClick={()=>{setShowPasswordChange(false);setNewDeletePassword('');setNewDeletePassword2('')}}>إلغاء</button>}</div>}
        </div>
      </section>

      <section className="panel cleanup-log-panel">
        <h3>سجل عمليات الطلبات</h3>
        <p className="muted">هذا السجل يبقى موجودًا حتى بعد الحذف النهائي للطلبات.</p>
        {!logs.length?<p className="muted">لا توجد عمليات أرشفة أو حذف مسجلة بعد.</p>:<div className="table-wrap"><table><thead><tr><th>وقت العملية</th><th>العملية</th><th>الفترة</th><th>عدد الطلبات</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td>{new Date(log.created_at).toLocaleString('ar-EG')}</td><td>{actionName(log.action)}</td><td>{log.filter_label||'—'}<small className="block muted">{log.date_from||'—'} ← {log.date_to||'—'}</small></td><td>{log.orders_count}</td></tr>)}</tbody></table></div>}
      </section>
    </>;
  }

  function Settings(){
    const [s,setS]=useState<ShopSettings>(structuredClone(data!.settings)); const [busy,setBusy]=useState(false); const [ok,setOk]=useState(''); const [password,setPassword]=useState(''); const [password2,setPassword2]=useState(''); const [email,setEmail]=useState(''); useEffect(()=>{void currentAdminEmail().then(setEmail)},[]); const set=(k:keyof ShopSettings,v:any)=>setS(x=>({...x,[k]:v}));
    const upload=async(file:File|undefined,field:'logo_url'|'banner_url'|'share_image_url')=>{if(!file)return;try{const url=await uploadImage(file,field==='logo_url'?'branding':field==='banner_url'?'banners':'sharing');set(field,url);}catch(e:any){alert(e?.message||'تعذر رفع الصورة')}};
    const save=async()=>{if(Number(s.min_order)<0||Number(s.default_delivery_fee)<0||Number(s.low_stock_threshold)<0)return setOk('القيم الرقمية لا يمكن أن تكون سالبة.');setBusy(true);setOk('');try{await saveSettings(s);document.title=s.site_name||s.store_name;await refresh();setOk('تم حفظ التعديلات بنجاح');}catch(e:any){setOk(e?.message||'تعذر الحفظ')}finally{setBusy(false)}};
    const backup=async()=>{const orders=await loadOrders();downloadText(`fakahany-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({exported_at:new Date().toISOString(),store:data,orders},null,2),'application/json;charset=utf-8')};
    const changePassword=async()=>{if(password!==password2)return setOk('كلمتا المرور غير متطابقتين.');try{await changeAdminPassword(password);setPassword('');setPassword2('');setOk('تم تغيير كلمة المرور بنجاح.')}catch(e:any){setOk(e?.message||'تعذر تغيير كلمة المرور')}};
    return <><PageTitle actions={<button className="btn secondary" onClick={()=>void backup()}>تنزيل نسخة احتياطية</button>}>إعدادات المتجر</PageTitle><div className="settings-sections"><section className="panel"><h3>هوية المتجر</h3><div className="form-grid"><label>اسم المتجر<input value={s.store_name} onChange={e=>set('store_name',e.target.value)}/></label><label>اسم الموقع في المتصفح<input value={s.site_name} onChange={e=>set('site_name',e.target.value)}/></label><label className="full">وصف الموقع للمشاركة ومحركات البحث<input value={s.site_description} onChange={e=>set('site_description',e.target.value)}/></label><label>رقم الهاتف<input value={s.phone} onChange={e=>set('phone',e.target.value)}/></label><label>رقم واتساب<input value={s.whatsapp_number} placeholder="مثال: 01012345678" onChange={e=>set('whatsapp_number',e.target.value)}/></label><label className="full">عنوان المتجر<input value={s.address} onChange={e=>set('address',e.target.value)}/></label><label>الشعار<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0],'logo_url')}/></label><label>صورة مشاركة الرابط<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0],'share_image_url')}/></label></div></section><section className="panel"><h3>الصفحة الرئيسية</h3><div className="form-grid"><label>عنوان الغلاف<input value={s.hero_title} onChange={e=>set('hero_title',e.target.value)}/></label><label>النص أسفل العنوان<input value={s.hero_subtitle} onChange={e=>set('hero_subtitle',e.target.value)}/></label><label>صورة الغلاف<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0],'banner_url')}/></label><label>رسالة الترحيب<input value={s.welcome_message} onChange={e=>set('welcome_message',e.target.value)}/></label></div></section><section className="panel"><h3>الطلب والتوصيل</h3><div className="toggle-row"><label><input type="checkbox" checked={s.delivery_enabled} onChange={e=>set('delivery_enabled',e.target.checked)}/> تفعيل التوصيل</label><label><input type="checkbox" checked={s.scheduled_orders_enabled} onChange={e=>set('scheduled_orders_enabled',e.target.checked)}/> السماح باختيار موعد للطلب</label></div><div className="form-grid"><label>الحد الأدنى للطلب<input type="number" min="0" value={s.min_order} onChange={e=>set('min_order',Number(e.target.value))}/></label>{s.delivery_enabled&&<label>رسوم التوصيل الافتراضية<input type="number" min="0" value={s.default_delivery_fee} onChange={e=>set('default_delivery_fee',Number(e.target.value))}/></label>}<label>حد تنبيه المخزون المنخفض<input type="number" min="0" value={s.low_stock_threshold} onChange={e=>set('low_stock_threshold',Number(e.target.value))}/></label><label>حالة المتجر<select value={s.store_status_mode} onChange={e=>set('store_status_mode',e.target.value)}><option value="auto">تلقائي حسب الأيام والمواعيد</option><option value="open">مفتوح يدويًا الآن</option><option value="closed">مغلق يدويًا الآن</option></select></label><label>وقت الفتح<input type="time" value={s.opening_time} onChange={e=>set('opening_time',e.target.value)}/></label><label>وقت الإغلاق<input type="time" value={s.closing_time} onChange={e=>set('closing_time',e.target.value)}/></label></div><div className="days-grid">{['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'].map(day=><label key={day}><input type="checkbox" checked={s.working_days.includes(day)} onChange={e=>set('working_days',e.target.checked?[...s.working_days,day]:s.working_days.filter(d=>d!==day))}/> {day}</label>)}</div><small className="muted">الوضع اليدوي «مفتوح» أو «مغلق» يتجاوز المواعيد مؤقتًا. اختر «تلقائي» للعودة للجدول.</small></section><section className="panel"><h3>البيانات المطلوبة عند إتمام الطلب</h3><p className="muted settings-help">الحقل الذي تحدده كمطلوب سيظهر للعميل بعلامة «مطلوب» حمراء ولن يتم إرسال الطلب بدونه.</p><div className="toggle-row required-settings"><label><input type="checkbox" checked={s.require_name} onChange={e=>set('require_name',e.target.checked)}/> الاسم</label><label><input type="checkbox" checked={s.require_phone} onChange={e=>set('require_phone',e.target.checked)}/> رقم الهاتف</label><label><input type="checkbox" checked={s.require_address} onChange={e=>set('require_address',e.target.checked)}/> العنوان</label>{s.delivery_enabled&&<label><input type="checkbox" checked={s.require_area} onChange={e=>set('require_area',e.target.checked)}/> المنطقة</label>}<label><input type="checkbox" checked={s.require_notes} onChange={e=>set('require_notes',e.target.checked)}/> الملاحظات</label></div></section><section className="panel"><h3>رسائل واتساب</h3><p className="muted">يمكنك استخدام: {'{{order_number}}'}، {'{{name}}'}، {'{{phone}}'}، {'{{address}}'}، {'{{area}}'}، {'{{items}}'}، {'{{subtotal}}'}، {'{{delivery_fee}}'}، {'{{total}}'}، {'{{notes}}'}، {'{{requested_time}}'}، {'{{store_name}}'}.</p><label>قالب الطلب<textarea className="template-textarea" value={s.whatsapp_order_template} onChange={e=>set('whatsapp_order_template',e.target.value)}/></label><button className="text-btn" onClick={()=>set('whatsapp_order_template',DEFAULT_ORDER_TEMPLATE)}>استرجاع القالب الافتراضي</button><div className="form-grid template-grid"><label>رسالة استلام الطلب<textarea value={s.whatsapp_received_template} onChange={e=>set('whatsapp_received_template',e.target.value)}/></label><label>رسالة جاري التجهيز<textarea value={s.whatsapp_preparing_template} onChange={e=>set('whatsapp_preparing_template',e.target.value)}/></label><label>رسالة خرج للتوصيل<textarea value={s.whatsapp_delivery_template} onChange={e=>set('whatsapp_delivery_template',e.target.value)}/></label></div><button className="text-btn" onClick={()=>{set('whatsapp_received_template',DEFAULT_RECEIVED_TEMPLATE);set('whatsapp_preparing_template',DEFAULT_PREPARING_TEMPLATE);set('whatsapp_delivery_template',DEFAULT_DELIVERY_TEMPLATE)}}>استرجاع رسائل الحالات الافتراضية</button></section><section className="panel"><h3>إظهار أجزاء المتجر</h3><div className="toggle-row"><label><input type="checkbox" checked={s.show_search} onChange={e=>set('show_search',e.target.checked)}/> البحث</label><label><input type="checkbox" checked={s.show_categories} onChange={e=>set('show_categories',e.target.checked)}/> الأقسام</label><label><input type="checkbox" checked={s.show_featured} onChange={e=>set('show_featured',e.target.checked)}/> المنتجات المميزة</label><label><input type="checkbox" checked={s.show_offers} onChange={e=>set('show_offers',e.target.checked)}/> العروض</label></div></section><section className="panel"><h3>حساب المدير</h3><p className="muted">الحساب الحالي: {email||'—'}</p><div className="form-grid"><label>كلمة مرور جديدة<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="8 أحرف على الأقل"/></label><label>تأكيد كلمة المرور<input type="password" value={password2} onChange={e=>setPassword2(e.target.value)}/></label></div><button className="btn secondary" disabled={!password} onClick={()=>void changePassword()}>تغيير كلمة المرور</button></section>{ok&&<p className={ok.includes('بنجاح')?'success-text':'error-text'}>{ok}</p>}<button className="btn save-all" disabled={busy} onClick={save}>{busy?'جاري الحفظ...':'حفظ كل الإعدادات'}</button></div></>;
  }
}

function Nav({t,active,set,children,badge}:{t:Tab,active:Tab,set:(t:Tab)=>void,children:ReactNode,badge?:number}){return <button className={active===t?'active':''} onClick={()=>set(t)}><span>{children}</span>{Boolean(badge)&&<b className="nav-badge">{badge}</b>}</button>}
function PageTitle({children,actions}:{children:ReactNode,actions?:ReactNode}){return <div className="page-title"><h1>{children}</h1>{actions}</div>}
function Stat({label,value}:{label:string,value:string|number}){return <div className="stat-card"><small>{label}</small><strong>{value}</strong></div>}
