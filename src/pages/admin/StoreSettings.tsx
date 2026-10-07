import { useEffect, useState } from 'react';
import { changeAdminPassword, currentAdminEmail, signOutOtherSessions } from '../../lib/auth';
import { DEFAULT_ORDER_TEMPLATE, loadOrders, saveSettings, uploadImage } from '../../lib/storeApi';
import { downloadText } from '../../lib/utils';
import type { ShopSettings, StoreSnapshot } from '../../types';

export default function StoreSettings({data,refresh}:{data:StoreSnapshot,refresh:()=>Promise<void>}){
  const [s,setS]=useState<ShopSettings>(structuredClone(data.settings));
  const [busy,setBusy]=useState(false);
  const [ok,setOk]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [password,setPassword]=useState('');
  const [password2,setPassword2]=useState('');
  const [email,setEmail]=useState('');
  useEffect(()=>{void currentAdminEmail().then(setEmail)},[]);
  useEffect(()=>{setS(structuredClone(data.settings))},[data.settings]);

  const set=(k:keyof ShopSettings,v:any)=>setS(x=>({...x,[k]:v}));
  const upload=async(file:File|undefined,field:'logo_url'|'banner_url'|'share_image_url')=>{
    if(!file)return;
    try{
      const url=await uploadImage(file,field==='logo_url'?'branding':field==='banner_url'?'banners':'sharing');
      set(field,url);
    }catch(e:any){alert(e?.message||'تعذر رفع الصورة')}
  };
  const save=async()=>{
    if(Number(s.min_order)<0||Number(s.default_delivery_fee)<0||Number(s.low_stock_threshold)<0||Number(s.delivery_slot_capacity)<0)return setOk('القيم الرقمية لا يمكن أن تكون سالبة.');if(s.delivery_capacity_enabled&&(Number(s.delivery_slot_minutes)<15||Number(s.delivery_slot_minutes)>240))return setOk('مدة فترة التوصيل يجب أن تكون بين 15 و240 دقيقة.');
    setBusy(true);setOk('');
    try{await saveSettings(s);document.title=s.site_name||s.store_name;await refresh();setOk('تم حفظ التعديلات بنجاح');}
    catch(e:any){setOk(e?.message||'تعذر الحفظ')}finally{setBusy(false)}
  };
  const backup=async()=>{
    const orders=await loadOrders(true);
    downloadText(`fakahany-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({exported_at:new Date().toISOString(),store:data,orders},null,2),'application/json;charset=utf-8');
  };
  const endOtherSessions=async()=>{
    setOk('');
    try{await signOutOtherSessions();setOk('تم إنهاء الجلسات الأخرى للحساب الحالي.');}
    catch(e:any){setOk(e?.message||'تعذر إنهاء الجلسات الأخرى.')}
  };

  const changePassword=async()=>{
    if(!currentPassword)return setOk('اكتب كلمة المرور الحالية أولًا.');
    if(password!==password2)return setOk('كلمتا المرور غير متطابقتين.');
    try{await changeAdminPassword(currentPassword,password);setCurrentPassword('');setPassword('');setPassword2('');setOk('تم تغيير كلمة المرور بنجاح.')}
    catch(e:any){setOk(e?.message||'تعذر تغيير كلمة المرور')}
  };

  return <><div className="page-title"><h1>إعدادات المتجر</h1><button className="btn secondary" onClick={()=>void backup()}>تنزيل نسخة احتياطية</button></div><div className="settings-sections">
    <section className="panel"><h3>هوية المتجر</h3><div className="form-grid">
      <label>اسم المتجر<input value={s.store_name} onChange={e=>set('store_name',e.target.value)}/></label>
      <label>اسم الموقع في المتصفح<input value={s.site_name} onChange={e=>set('site_name',e.target.value)}/></label>
      <label className="full">وصف الموقع للمشاركة ومحركات البحث<input value={s.site_description} onChange={e=>set('site_description',e.target.value)}/></label>
      <label>رقم الهاتف<input value={s.phone} onChange={e=>set('phone',e.target.value)}/></label>
      <label>رقم واتساب<input value={s.whatsapp_number} placeholder="مثال: 01012345678" onChange={e=>set('whatsapp_number',e.target.value)}/></label>
      <label className="full">عنوان المتجر<input value={s.address} onChange={e=>set('address',e.target.value)}/></label>
      <label>الشعار<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0],'logo_url')}/></label>
      <label>صورة مشاركة الرابط<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0],'share_image_url')}/></label>
    </div></section>

    <section className="panel"><h3>الصفحة الرئيسية</h3><div className="form-grid">
      <label>عنوان الغلاف<input value={s.hero_title} onChange={e=>set('hero_title',e.target.value)}/></label>
      <label>النص أسفل العنوان<input value={s.hero_subtitle} onChange={e=>set('hero_subtitle',e.target.value)}/></label>
      <label>صورة الغلاف<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0],'banner_url')}/></label>
      <label>رسالة الترحيب<input value={s.welcome_message} onChange={e=>set('welcome_message',e.target.value)}/></label>
    </div>
    <div className="settings-subsection"><label className="toggle-setting"><input type="checkbox" checked={s.announcement_enabled} onChange={e=>set('announcement_enabled',e.target.checked)}/> تفعيل إعلان أعلى المتجر</label>{s.announcement_enabled&&<label>نص الإعلان<input value={s.announcement_text} maxLength={180} onChange={e=>set('announcement_text',e.target.value)} placeholder="مثال: التوصيل متوقف اليوم من 3 إلى 5"/></label>}</div>
    <div className="settings-subsection danger-zone-soft"><label className="toggle-setting"><input type="checkbox" checked={s.maintenance_mode} onChange={e=>set('maintenance_mode',e.target.checked)}/> وضع الصيانة</label><p className="muted">عند تفعيله لن يتمكن العملاء من التسوق أو إرسال طلبات جديدة، بينما تظل لوحة الإدارة وتتبّع الطلبات متاحين.</p>{s.maintenance_mode&&<label>رسالة الصيانة<input value={s.maintenance_message} maxLength={220} onChange={e=>set('maintenance_message',e.target.value)}/></label>}</div>
    </section>

    <section className="panel"><h3>الطلب والتوصيل</h3><div className="toggle-row">
      <label><input type="checkbox" checked={s.delivery_enabled} onChange={e=>set('delivery_enabled',e.target.checked)}/> تفعيل التوصيل</label>
      <label><input type="checkbox" checked={s.scheduled_orders_enabled} onChange={e=>set('scheduled_orders_enabled',e.target.checked)}/> السماح باختيار موعد للطلب</label>
      {s.scheduled_orders_enabled&&<label><input type="checkbox" checked={s.delivery_capacity_enabled} onChange={e=>set('delivery_capacity_enabled',e.target.checked)}/> تحديد سعة لكل فترة توصيل</label>}
    </div><div className="form-grid">
      <label>الحد الأدنى للطلب<input type="number" min="0" value={s.min_order} onChange={e=>set('min_order',Number(e.target.value))}/></label>
      {s.delivery_enabled&&<label>رسوم التوصيل الافتراضية<input type="number" min="0" value={s.default_delivery_fee} onChange={e=>set('default_delivery_fee',Number(e.target.value))}/></label>}
      <label>حد تنبيه المخزون المنخفض<input type="number" min="0" value={s.low_stock_threshold} onChange={e=>set('low_stock_threshold',Number(e.target.value))}/></label>
      {s.scheduled_orders_enabled&&s.delivery_capacity_enabled&&<><label>مدة فترة التوصيل بالدقائق<input type="number" min="15" max="240" step="15" value={s.delivery_slot_minutes} onChange={e=>set('delivery_slot_minutes',Number(e.target.value))}/></label><label>أقصى عدد طلبات في الفترة<input type="number" min="1" value={s.delivery_slot_capacity} onChange={e=>set('delivery_slot_capacity',Number(e.target.value))}/></label></>}
      <label>حالة المتجر<select value={s.store_status_mode} onChange={e=>set('store_status_mode',e.target.value)}><option value="auto">تلقائي حسب الأيام والمواعيد</option><option value="open">مفتوح يدويًا الآن</option><option value="closed">مغلق يدويًا الآن</option></select></label>
      <label>وقت الفتح<input type="time" value={s.opening_time} onChange={e=>set('opening_time',e.target.value)}/></label>
      <label>وقت الإغلاق<input type="time" value={s.closing_time} onChange={e=>set('closing_time',e.target.value)}/></label>
    </div><div className="days-grid">{['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'].map(day=><label key={day}><input type="checkbox" checked={s.working_days.includes(day)} onChange={e=>set('working_days',e.target.checked?[...s.working_days,day]:s.working_days.filter(d=>d!==day))}/> {day}</label>)}</div></section>

    <section className="panel"><h3>البيانات المطلوبة عند إتمام الطلب</h3><div className="toggle-row required-settings">
      <label><input type="checkbox" checked={s.require_name} onChange={e=>set('require_name',e.target.checked)}/> الاسم</label>
      <label><input type="checkbox" checked={s.require_phone} onChange={e=>set('require_phone',e.target.checked)}/> رقم الهاتف</label>
      <label><input type="checkbox" checked={s.require_address} onChange={e=>set('require_address',e.target.checked)}/> العنوان</label>
      {s.delivery_enabled&&<label><input type="checkbox" checked={s.require_area} onChange={e=>set('require_area',e.target.checked)}/> المنطقة</label>}
      <label><input type="checkbox" checked={s.require_notes} onChange={e=>set('require_notes',e.target.checked)}/> الملاحظات</label>
    </div></section>

    <section className="panel"><h3>رسالة الطلب على واتساب</h3><p className="muted">دي رسالة الطلب الأساسية فقط. تم إزالة رسائل الحالات الجاهزة.</p>
      <label>قالب الطلب<textarea className="template-textarea" value={s.whatsapp_order_template} onChange={e=>set('whatsapp_order_template',e.target.value)}/></label>
      <button className="text-btn" onClick={()=>set('whatsapp_order_template',DEFAULT_ORDER_TEMPLATE)}>استرجاع القالب الافتراضي</button>
    </section>

    <section className="panel"><h3>إظهار أجزاء المتجر</h3><div className="toggle-row">
      <label><input type="checkbox" checked={s.show_search} onChange={e=>set('show_search',e.target.checked)}/> البحث</label>
      <label><input type="checkbox" checked={s.show_categories} onChange={e=>set('show_categories',e.target.checked)}/> الأقسام</label>
      <label><input type="checkbox" checked={s.show_featured} onChange={e=>set('show_featured',e.target.checked)}/> المنتجات المميزة</label>
      <label><input type="checkbox" checked={s.show_offers} onChange={e=>set('show_offers',e.target.checked)}/> العروض</label>
    </div></section>

    <section className="panel"><h3>حساب المدير</h3><p className="muted">الحساب الحالي: {email||'—'}</p><p className="muted">كلمة المرور الجديدة يجب أن تكون 12 حرفًا على الأقل وتحتوي على حرف كبير وصغير ورقم ورمز.</p><div className="form-grid">
      <label>كلمة المرور الحالية<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>
      <label>كلمة مرور جديدة<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="12 حرفًا على الأقل"/></label>
      <label>تأكيد كلمة المرور<input type="password" autoComplete="new-password" value={password2} onChange={e=>setPassword2(e.target.value)}/></label>
    </div><div className="account-security-actions"><button className="btn secondary" disabled={!currentPassword||!password} onClick={()=>void changePassword()}>تغيير كلمة المرور</button><button className="btn secondary" onClick={()=>void endOtherSessions()}>إنهاء الجلسات الأخرى</button></div><p className="muted">لو الحساب مفتوح على جهاز قديم أو غير معروف، استخدم «إنهاء الجلسات الأخرى» بدون التأثير على جلستك الحالية.</p></section>

    {ok&&<p className={ok.includes('بنجاح')?'success-text':'error-text'}>{ok}</p>}
    <button className="btn save-all" disabled={busy} onClick={()=>void save()}>{busy?'جاري الحفظ...':'حفظ كل الإعدادات'}</button>
  </div></>;
}
