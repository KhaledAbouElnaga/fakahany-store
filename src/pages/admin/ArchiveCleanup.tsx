import { useEffect, useMemo, useState } from 'react';
import {
  executeOrderCleanup,
  loadOrderCleanupLogs,
  loadOrders,
  orderCleanupPasswordIsSet,
  previewOrderCleanup,
  restoreArchivedOrder,
  setOrderCleanupPassword
} from '../../lib/storeApi';
import { money } from '../../lib/utils';
import type { Order, OrderCleanupLog } from '../../types';

type RangeMode='day'|'month'|'range'|'before';

function actionName(a:OrderCleanupLog['action']){
  if(a==='archive')return 'أرشفة';
  if(a==='delete')return 'حذف نهائي';
  if(a==='restore')return 'استرجاع';
  return 'تغيير كلمة مرور الحذف';
}

export default function ArchiveCleanup(){
  const [orders,setOrders]=useState<Order[]|null>(null);
  const [logs,setLogs]=useState<OrderCleanupLog[]>([]);
  const [passwordSet,setPasswordSet]=useState<boolean|null>(null);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const [mode,setMode]=useState<RangeMode>('month');
  const [day,setDay]=useState('');
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [before,setBefore]=useState('');
  const [operation,setOperation]=useState<'archive'|'delete'>('archive');
  const [preview,setPreview]=useState<{count:number;active_count:number;archived_count:number}|null>(null);
  const [deletePassword,setDeletePassword]=useState('');

  const [showPasswordForm,setShowPasswordForm]=useState(false);
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');

  const reload=async()=>{
    const [all,history,hasPassword]=await Promise.all([
      loadOrders(true),
      loadOrderCleanupLogs().catch(()=>[] as OrderCleanupLog[]),
      orderCleanupPasswordIsSet().catch(()=>false)
    ]);
    setOrders(all);setLogs(history);setPasswordSet(hasPassword);
  };

  useEffect(()=>{void reload()},[]);

  const archived=useMemo(()=>orders?.filter(o=>Boolean(o.archived_at))||[],[orders]);

  const range=()=>{
    if(mode==='day'){
      if(!day)throw new Error('اختر اليوم أولًا.');
      return {from:day,to:day,type:'day',label:`طلبات يوم ${new Date(day+'T12:00:00').toLocaleDateString('ar-EG')}`};
    }
    if(mode==='month'){
      if(!month)throw new Error('اختر الشهر أولًا.');
      const [y,m]=month.split('-').map(Number);
      const last=new Date(y,m,0).getDate();
      return {from:`${month}-01`,to:`${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`,type:'month',label:`طلبات شهر ${month}`};
    }
    if(mode==='range'){
      if(!from||!to)throw new Error('حدد تاريخ البداية والنهاية.');
      if(from>to)throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
      return {from,to,type:'range',label:`الطلبات من ${from} إلى ${to}`};
    }
    if(!before)throw new Error('حدد التاريخ أولًا.');
    const dates=(orders||[]).map(o=>o.created_at.slice(0,10)).sort();
    return {from:dates[0]||before,to:before,type:'before',label:`كل الطلبات حتى ${before}`};
  };

  const runPreview=async()=>{
    setMsg('');
    try{const r=range();setPreview(await previewOrderCleanup(r.from,r.to))}
    catch(e:any){setPreview(null);setMsg(e?.message||'تعذر معاينة الطلبات.')}
  };

  const run=async()=>{
    setMsg('');
    let r:{from:string;to:string;type:string;label:string};
    try{r=range()}catch(e:any){return setMsg(e?.message||'الفترة غير صحيحة.')}
    if(operation==='delete'&&!passwordSet)return setMsg('يجب تعيين كلمة مرور الحذف أولًا.');
    if(operation==='delete'&&!deletePassword)return setMsg('اكتب كلمة مرور الحذف.');

    setBusy(true);
    try{
      const p=await previewOrderCleanup(r.from,r.to);setPreview(p);
      const count=operation==='archive'?p.active_count:p.archived_count;
      if(!count)return setMsg(operation==='archive'?'لا توجد طلبات حالية مطابقة لهذه الفترة.':'لا توجد طلبات مؤرشفة مطابقة لهذه الفترة.');
      const warning=operation==='archive'
        ?`سيتم نقل ${count} طلب إلى الأرشيف. يمكن استرجاعها لاحقًا. هل تريد المتابعة؟`
        :`سيتم حذف ${count} طلب من الأرشيف نهائيًا. لا يمكن استرجاعها بعد ذلك، لكن سجل عملية الحذف سيبقى محفوظًا. هل تريد المتابعة؟`;
      if(!window.confirm(warning))return;
      const result=await executeOrderCleanup({action:operation,dateFrom:r.from,dateTo:r.to,filterType:r.type,filterLabel:r.label,password:deletePassword});
      setDeletePassword('');setPreview(null);
      await reload();
      setMsg(operation==='archive'?`تمت أرشفة ${result.count} طلب وتسجيل العملية.`:`تم حذف ${result.count} طلب مؤرشف نهائيًا وتسجيل العملية.`);
    }catch(e:any){setMsg(e?.message||'تعذر تنفيذ العملية.')}finally{setBusy(false)}
  };

  const restore=async(o:Order)=>{
    if(!window.confirm(`استرجاع الطلب #${o.order_number} إلى الطلبات الحالية؟`))return;
    setBusy(true);
    try{await restoreArchivedOrder(o.id);await reload();setMsg('تم استرجاع الطلب وتسجيل العملية.')}catch(e:any){setMsg(e?.message||'تعذر استرجاع الطلب.')}finally{setBusy(false)}
  };

  const savePassword=async()=>{
    if(newPassword.length<8)return setMsg('كلمة مرور الحذف الجديدة يجب أن تكون 8 أحرف على الأقل.');
    if(newPassword!==confirmPassword)return setMsg('كلمتا المرور الجديدتان غير متطابقتين.');
    if(passwordSet&&!currentPassword)return setMsg('اكتب كلمة مرور الحذف الحالية أولًا.');
    setBusy(true);setMsg('');
    try{
      await setOrderCleanupPassword(newPassword,currentPassword);
      setPasswordSet(true);setShowPasswordForm(false);setCurrentPassword('');setNewPassword('');setConfirmPassword('');
      await reload();
      setMsg(passwordSet?'تم تغيير كلمة مرور الحذف وتسجيل العملية.':'تم تعيين كلمة مرور الحذف وتسجيل العملية.');
    }catch(e:any){setMsg(e?.message||'تعذر حفظ كلمة مرور الحذف.')}finally{setBusy(false)}
  };

  if(!orders)return <div className="panel">جاري تحميل الأرشيف...</div>;

  return <>
    <div className="page-title"><h1>الأرشيف والتنظيف</h1></div>
    {msg&&<p className={msg.includes('تم ')||msg.includes('تمت')?'success-text':'error-text'}>{msg}</p>}

    <section className="panel order-cleanup-panel">
      <div className="cleanup-head"><div><h3>أرشفة أو حذف الطلبات القديمة</h3><p className="muted">الأرشفة تنقل الطلبات من قائمة العمل اليومية ويمكن استرجاعها. الحذف النهائي يعمل على الطلبات الموجودة في الأرشيف فقط.</p></div><span className="security-pill">{passwordSet?'كلمة مرور الحذف مفعلة':'كلمة مرور الحذف غير معينة'}</span></div>

      <div className="cleanup-grid">
        <label>العملية<select value={operation} onChange={e=>{setOperation(e.target.value as 'archive'|'delete');setPreview(null)}}>
          <option value="archive">أرشفة الطلبات الحالية</option>
          <option value="delete">حذف نهائي من الأرشيف</option>
        </select></label>
        <label>اختيار الفترة<select value={mode} onChange={e=>{setMode(e.target.value as RangeMode);setPreview(null)}}>
          <option value="day">يوم محدد</option><option value="month">شهر محدد</option><option value="range">فترة من تاريخ إلى تاريخ</option><option value="before">كل الطلبات حتى تاريخ</option>
        </select></label>
        {mode==='day'&&<label>اليوم<input type="date" value={day} onChange={e=>{setDay(e.target.value);setPreview(null)}}/></label>}
        {mode==='month'&&<label>الشهر<input type="month" value={month} onChange={e=>{setMonth(e.target.value);setPreview(null)}}/></label>}
        {mode==='range'&&<><label>من<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPreview(null)}}/></label><label>إلى<input type="date" value={to} onChange={e=>{setTo(e.target.value);setPreview(null)}}/></label></>}
        {mode==='before'&&<label>حتى تاريخ<input type="date" value={before} onChange={e=>{setBefore(e.target.value);setPreview(null)}}/></label>}
      </div>

      <div className="cleanup-actions">
        <button className="btn secondary" disabled={busy} onClick={()=>void runPreview()}>معاينة العدد</button>
        {preview&&<div className="cleanup-preview"><b>{operation==='archive'?preview.active_count:preview.archived_count} طلب سيشمله الإجراء</b><span>{preview.active_count} حالي · {preview.archived_count} مؤرشف</span></div>}
      </div>

      {operation==='delete'&&<div className="danger-zone"><b>حذف نهائي من الأرشيف</b><p>لا يمكن استرجاع الطلبات بعد الحذف. سجل عملية الحذف نفسه سيظل موجودًا.</p><label>كلمة مرور الحذف<input type="password" autoComplete="off" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} placeholder="كلمة المرور المستقلة للحذف"/></label></div>}

      <button className={operation==='delete'?'btn delete-action':'btn'} disabled={busy} onClick={()=>void run()}>{busy?'جاري التنفيذ...':operation==='archive'?'نقل الطلبات إلى الأرشيف':'حذف الطلبات المؤرشفة نهائيًا'}</button>
    </section>

    <section className="panel">
      <div className="cleanup-head"><div><h3>الطلبات المؤرشفة</h3><p className="muted">عدد الطلبات الموجودة حاليًا في الأرشيف: {archived.length}</p></div></div>
      {!archived.length?<p className="muted">الأرشيف فارغ.</p>:<div className="table-wrap"><table className="mobile-card-table"><thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>الإجراء</th></tr></thead><tbody>{archived.map(o=><tr key={o.id}><td data-label="رقم الطلب">#{o.order_number}</td><td data-label="التاريخ">{new Date(o.created_at).toLocaleString('ar-EG')}</td><td data-label="العميل">{o.customer_name||'—'}</td><td data-label="الإجمالي">{money(o.total)}</td><td data-label="الإجراء"><button className="btn secondary small-admin-btn" disabled={busy} onClick={()=>void restore(o)}>استرجاع</button></td></tr>)}</tbody></table></div>}
    </section>

    <section className="panel cleanup-password-box standalone">
      <div><b>كلمة مرور الحذف المستقلة</b><p className="muted">{passwordSet?'لتغييرها يجب إدخال كلمة المرور الحالية. لا يوجد زر لاسترجاعها أو إعادة تعيينها من لوحة الإدارة.':'عيّن كلمة مرور مستقلة للحذف النهائي. يجب أن تكون 8 أحرف على الأقل.'}</p></div>
      {!showPasswordForm&&passwordSet?<button className="btn secondary" onClick={()=>setShowPasswordForm(true)}>تغيير كلمة مرور الحذف</button>:<div className="cleanup-password-fields">
        {passwordSet&&<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} placeholder="كلمة المرور الحالية"/>}
        <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="كلمة المرور الجديدة"/>
        <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="تأكيد كلمة المرور الجديدة"/>
        <button className="btn secondary" disabled={busy||!newPassword} onClick={()=>void savePassword()}>{passwordSet?'تأكيد التغيير':'تعيين كلمة مرور الحذف'}</button>
        {passwordSet&&<button className="text-btn" onClick={()=>{setShowPasswordForm(false);setCurrentPassword('');setNewPassword('');setConfirmPassword('')}}>إلغاء</button>}
      </div>}
    </section>

    <section className="panel cleanup-log-panel">
      <h3>سجل العمليات</h3>
      <p className="muted">يسجل الأرشفة والحذف والاسترجاع وتغيير كلمة مرور الحذف. هذا السجل لا يُحذف عند حذف الطلبات.</p>
      {!logs.length?<p className="muted">لا توجد عمليات مسجلة بعد.</p>:<div className="table-wrap"><table className="mobile-card-table"><thead><tr><th>التاريخ والوقت</th><th>العملية</th><th>التفاصيل</th><th>العدد</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td data-label="التاريخ">{new Date(log.created_at).toLocaleString('ar-EG')}</td><td data-label="العملية">{actionName(log.action)}</td><td data-label="التفاصيل">{log.filter_label||'—'}{log.date_from&&<small className="block muted">{log.date_from} ← {log.date_to||log.date_from}</small>}</td><td data-label="العدد">{log.orders_count}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
