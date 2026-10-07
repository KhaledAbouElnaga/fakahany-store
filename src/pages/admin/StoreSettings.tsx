import { useEffect, useRef, useState } from 'react';
import { changeAdminPassword, currentAdminEmail, getMfaState, removeMfaFactor, signOutOtherSessions, startMfaEnrollment, verifyMfaEnrollment } from '../../lib/auth';
import { DEFAULT_ORDER_TEMPLATE, deleteImage, loadOrders, saveSettings, uploadImage } from '../../lib/storeApi';
import { downloadText } from '../../lib/utils';
import type { ShopSettings, StoreSnapshot } from '../../types';
import { useUnsavedChanges } from '../../lib/unsaved';
import StoreTransferPanel from './StoreTransferPanel';

export default function StoreSettings({data,refresh,owner=false}:{data:StoreSnapshot,refresh:()=>Promise<void>,owner?:boolean}){
  const [s,setS]=useState<ShopSettings>(structuredClone(data.settings));
  const [busy,setBusy]=useState(false);
  const [ok,setOk]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [password,setPassword]=useState('');
  const [password2,setPassword2]=useState('');
  const [email,setEmail]=useState('');
  const [mfaFactors,setMfaFactors]=useState<Array<{id:string;status:string;friendly_name?:string}>>([]);
  const [mfaEnroll,setMfaEnroll]=useState<{factorId:string;qrCode:string;secret:string}|null>(null);
  const [mfaCode,setMfaCode]=useState('');
  const pendingUploads=useRef<Partial<Record<'logo_url'|'banner_url'|'share_image_url',string>>>({});
  const dirty=JSON.stringify(s)!==JSON.stringify(data.settings);
  useUnsavedChanges(dirty);
  useEffect(()=>{void currentAdminEmail().then(setEmail);if(owner)void getMfaState().then(x=>setMfaFactors(x.factors)).catch(()=>{})},[owner]);
  useEffect(()=>{setS(structuredClone(data.settings))},[data.settings]);
  useEffect(()=>()=>{for(const url of Object.values(pendingUploads.current)){if(url)void deleteImage(url).catch(()=>{})}},[]);

  const set=(k:keyof ShopSettings,v:any)=>setS(x=>({...x,[k]:v}));
  const upload=async(file:File|undefined,field:'logo_url'|'banner_url'|'share_image_url')=>{
    if(!file)return;
    try{
      const url=await uploadImage(file,field==='logo_url'?'branding':field==='banner_url'?'banners':'sharing');
      const previous=pendingUploads.current[field];
      pendingUploads.current[field]=url;
      set(field,url);
      if(previous&&previous!==url)await deleteImage(previous).catch(()=>{});
    }catch(e:any){alert(e?.message||'تعذر رفع الصورة')}
  };
  const save=async()=>{
    if(Number(s.min_order)<0||Number(s.default_delivery_fee)<0||Number(s.low_stock_threshold)<0||Number(s.delivery_slot_capacity)<0)return setOk('القيم الرقمية لا يمكن أن تكون سالبة.');
    if(s.delivery_capacity_enabled&&(Number(s.delivery_slot_minutes)<15||Number(s.delivery_slot_minutes)>240))return setOk('مدة فترة التوصيل يجب أن تكون بين 15 و240 دقيقة.');
    if(Number(s.order_alert_minutes)<1||Number(s.order_alert_minutes)>240)return setOk('تنبيه الطلب المنتظر يجب أن يكون بين دقيقة و240 دقيقة.');
    for(const n of [s.audit_retention_days,s.inventory_retention_days,s.visit_retention_days])if(Number(n)<30||Number(n)>3650)return setOk('مدة الاحتفاظ بالبيانات يجب أن تكون بين 30 و3650 يومًا.');
    if(s.public_site_url.trim()){try{const u=new URL(s.public_site_url.trim());if(!['http:','https:'].includes(u.protocol))throw new Error()}catch{return setOk('رابط الموقع العام غير صحيح. اكتب رابطًا كاملًا يبدأ بـ https://');}}
    setBusy(true);setOk('');
    const originals={logo_url:data.settings.logo_url,banner_url:data.settings.banner_url,share_image_url:data.settings.share_image_url};
    try{
      await saveSettings(s);
      for(const field of ['logo_url','banner_url','share_image_url'] as const){
        const pending=pendingUploads.current[field];
        if(pending&&pending===s[field]){
          const old=originals[field];
          if(old&&old!==pending)await deleteImage(old).catch(()=>{});
          delete pendingUploads.current[field];
        }
      }
      document.title=s.site_name||s.store_name;await refresh();setOk('تم حفظ التعديلات بنجاح');
    }
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

  const restartWizard=async()=>{
    if(!confirm('تشغيل معالج الإعداد من جديد؟ لن يتم حذف أي بيانات موجودة.'))return;
    setBusy(true);setOk('');
    try{await saveSettings({...s,setup_completed:false});await refresh();}
    catch(e:any){setOk(e?.message||'تعذر تشغيل معالج الإعداد.')}finally{setBusy(false)}
  };

  const startMfa=async()=>{
    setOk('');setBusy(true);
    try{const x=await startMfaEnrollment();setMfaEnroll(x);setMfaCode('');}
    catch(e:any){setOk(e?.message||'تعذر بدء تفعيل التحقق بخطوتين.')}finally{setBusy(false)}
  };

  const confirmMfa=async()=>{
    if(!mfaEnroll||mfaCode.length!==6)return;
    setBusy(true);setOk('');
    try{
      await verifyMfaEnrollment(mfaEnroll.factorId,mfaCode);
      const state=await getMfaState();setMfaFactors(state.factors);setMfaEnroll(null);setMfaCode('');setOk('تم تفعيل التحقق بخطوتين بنجاح.');
    }catch(e:any){setOk(e?.message||'رمز التحقق غير صحيح.')}finally{setBusy(false)}
  };

  const disableMfa=async(id:string)=>{
    if(!confirm('إلغاء التحقق بخطوتين لهذا الحساب؟'))return;
    setBusy(true);setOk('');
    try{await removeMfaFactor(id);const state=await getMfaState();setMfaFactors(state.factors);setOk('تم إلغاء وسيلة التحقق بخطوتين.');}
    catch(e:any){setOk(e?.message||'تعذر إلغاء التحقق بخطوتين. قد تحتاج لتسجيل الدخول بالرمز أولًا.')}finally{setBusy(false)}
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

    <section className="panel"><h3>المظهر والدومين</h3><div className="form-grid">
      <label>قالب الألوان<select value={s.theme_preset} onChange={e=>set('theme_preset',e.target.value as ShopSettings['theme_preset'])}><option value="green">أخضر كلاسيك</option><option value="orange">برتقالي دافئ</option><option value="navy">كحلي احترافي</option><option value="plum">بنفسجي فاخر</option></select></label>
      <label>رابط الموقع العام<input dir="ltr" value={s.public_site_url} onChange={e=>set('public_site_url',e.target.value)} placeholder="https://example.com"/></label>
    </div><div className="domain-readiness"><b>{location.hostname.endsWith('.pages.dev')?'الموقع يعمل حاليًا على Cloudflare Pages':'تم اكتشاف Custom Domain'}</b><p className="muted">لو ربطت دومين مخصص من Cloudflare Pages، اكتب رابطه هنا ليستخدمه النظام في الروابط وSEO. ربط الدومين نفسه يتم مرة واحدة من Cloudflare.</p></div><div className="theme-preview-row"><span data-preview-theme="green"/><span data-preview-theme="orange"/><span data-preview-theme="navy"/><span data-preview-theme="plum"/></div></section>

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
      {s.feature_flags.scheduled_orders&&<label><input type="checkbox" checked={s.scheduled_orders_enabled} onChange={e=>set('scheduled_orders_enabled',e.target.checked)}/> السماح باختيار موعد للطلب</label>}
      {s.feature_flags.scheduled_orders&&s.scheduled_orders_enabled&&<label><input type="checkbox" checked={s.delivery_capacity_enabled} onChange={e=>set('delivery_capacity_enabled',e.target.checked)}/> تحديد سعة لكل فترة توصيل</label>}
    </div><div className="form-grid">
      <label>الحد الأدنى للطلب<input type="number" min="0" value={s.min_order} onChange={e=>set('min_order',Number(e.target.value))}/></label>
      {s.delivery_enabled&&<label>رسوم التوصيل الافتراضية<input type="number" min="0" value={s.default_delivery_fee} onChange={e=>set('default_delivery_fee',Number(e.target.value))}/></label>}
      <label>حد تنبيه المخزون المنخفض<input type="number" min="0" value={s.low_stock_threshold} onChange={e=>set('low_stock_threshold',Number(e.target.value))}/></label>
      <label>تنبيه الطلب المنتظر بعد (دقيقة)<input type="number" min="1" max="240" value={s.order_alert_minutes} onChange={e=>set('order_alert_minutes',Number(e.target.value))}/></label>
      {s.feature_flags.scheduled_orders&&s.scheduled_orders_enabled&&s.delivery_capacity_enabled&&<><label>مدة فترة التوصيل بالدقائق<input type="number" min="15" max="240" step="15" value={s.delivery_slot_minutes} onChange={e=>set('delivery_slot_minutes',Number(e.target.value))}/></label><label>أقصى عدد طلبات في الفترة<input type="number" min="1" value={s.delivery_slot_capacity} onChange={e=>set('delivery_slot_capacity',Number(e.target.value))}/></label></>}
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

    <section className="panel"><h3>الاحتفاظ بالبيانات</h3><p className="muted">الطلبات لا تُحذف تلقائيًا. الإعدادات دي تخص السجلات المساعدة فقط لتقليل نمو قاعدة البيانات.</p><div className="form-grid">
      <label>سجل النشاط (يوم)<input type="number" min="30" max="3650" value={s.audit_retention_days} onChange={e=>set('audit_retention_days',Number(e.target.value))}/></label>
      <label>حركات المخزون (يوم)<input type="number" min="30" max="3650" value={s.inventory_retention_days} onChange={e=>set('inventory_retention_days',Number(e.target.value))}/></label>
      <label>إحصاءات الزيارات (يوم)<input type="number" min="30" max="3650" value={s.visit_retention_days} onChange={e=>set('visit_retention_days',Number(e.target.value))}/></label>
    </div></section>

    <StoreTransferPanel data={data} refresh={refresh}/>

    <section className="panel"><h3>إعداد أول تشغيل</h3><p className="muted">يمكنك تشغيل المعالج مرة أخرى لعرض خطوات الإعداد للعميل بدون حذف المنتجات أو الطلبات الحالية.</p><button className="btn secondary" disabled={busy} onClick={()=>void restartWizard()}>تشغيل معالج الإعداد من جديد</button></section>

    <section className="panel"><h3>Features المتاحة</h3><p className="muted">استخدمها لو هتبيع نفس النظام لعملاء مختلفين وتريد إخفاء أجزاء غير مطلوبة بدون تعديل الكود.</p><div className="feature-flag-grid">
      {[
        ['tracking','تتبع الطلبات'],
        ['reports','التقارير'],
        ['staff','الموظفون والصلاحيات'],
        ['scheduled_prices','الأسعار المجدولة'],
        ['scheduled_orders','الطلبات المجدولة'],
        ['inventory','المخزون'],
        ['favorites','المفضلة للعملاء'],
        ['reorder','إعادة آخر طلب'],
      ].map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean((s.feature_flags as any)[key])} onChange={e=>set('feature_flags',{...s.feature_flags,[key]:e.target.checked})}/> {label}</label>)}
    </div></section>

    <section className="panel"><h3>تخصيص Dashboard</h3><p className="muted">حدد مؤشرات الأداء التي تريد ظهورها للمالك في الصفحة الرئيسية.</p><div className="feature-flag-grid">
      {[
        ['orders_today','طلبات اليوم'],
        ['new_orders','الطلبات الجديدة'],
        ['overdue','الطلبات المتأخرة'],
        ['sales_today','مبيعات اليوم'],
        ['sales_week','مبيعات آخر 7 أيام'],
        ['avg_order','متوسط الطلب'],
        ['repeat_customers','العملاء المتكررون'],
        ['cancel_rate','معدل الإلغاء'],
        ['top_product','أكثر منتج طلبًا'],
        ['peak_hour','وقت الذروة'],
        ['low_stock','المخزون المنخفض'],
      ].map(([key,label])=><label key={key}><input type="checkbox" checked={s.dashboard_widgets.includes(key)} onChange={e=>set('dashboard_widgets',e.target.checked?[...s.dashboard_widgets,key]:s.dashboard_widgets.filter(x=>x!==key))}/> {label}</label>)}
    </div></section>

    {owner&&<section className="panel"><h3>التحقق بخطوتين (MFA)</h3><p className="muted">يحمي صلاحيات المالك حتى لو تم تسريب كلمة المرور. بعد التفعيل سيُطلب رمز من تطبيق Authenticator عند تسجيل الدخول.</p>
      {mfaFactors.filter(x=>x.status==='verified').length?<div className="mfa-factor-list">{mfaFactors.filter(x=>x.status==='verified').map(x=><div key={x.id}><span><b>{x.friendly_name||'Authenticator'}</b><small>مفعّل</small></span><button className="btn secondary danger" disabled={busy} onClick={()=>void disableMfa(x.id)}>إلغاء</button></div>)}</div>:!mfaEnroll&&<button className="btn secondary" disabled={busy} onClick={()=>void startMfa()}>تفعيل MFA للمالك</button>}
      {mfaEnroll&&<div className="mfa-enroll-box"><p><b>1.</b> امسح QR Code بتطبيق Google Authenticator أو Microsoft Authenticator.</p><img src={mfaEnroll.qrCode} alt="QR Code لتفعيل التحقق بخطوتين"/><details><summary>إدخال المفتاح يدويًا</summary><code dir="ltr">{mfaEnroll.secret}</code></details><label>رمز التحقق<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}/></label><div className="page-actions"><button className="btn secondary" onClick={()=>{setMfaEnroll(null);setMfaCode('')}}>إلغاء</button><button className="btn" disabled={busy||mfaCode.length!==6} onClick={()=>void confirmMfa()}>تأكيد التفعيل</button></div></div>}
    </section>}

    <section className="panel"><h3>حساب المدير</h3><p className="muted">الحساب الحالي: {email||'—'}</p><p className="muted">كلمة المرور الجديدة يجب أن تكون 12 حرفًا على الأقل وتحتوي على حرف كبير وصغير ورقم ورمز.</p><div className="form-grid">
      <label>كلمة المرور الحالية<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>
      <label>كلمة مرور جديدة<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="12 حرفًا على الأقل"/></label>
      <label>تأكيد كلمة المرور<input type="password" autoComplete="new-password" value={password2} onChange={e=>setPassword2(e.target.value)}/></label>
    </div><div className="account-security-actions"><button className="btn secondary" disabled={!currentPassword||!password} onClick={()=>void changePassword()}>تغيير كلمة المرور</button><button className="btn secondary" onClick={()=>void endOtherSessions()}>إنهاء الجلسات الأخرى</button></div><p className="muted">لو الحساب مفتوح على جهاز قديم أو غير معروف، استخدم «إنهاء الجلسات الأخرى» بدون التأثير على جلستك الحالية.</p></section>

    {ok&&<p className={ok.includes('بنجاح')?'success-text':'error-text'}>{ok}</p>}
    <button className="btn save-all" disabled={busy} onClick={()=>void save()}>{busy?'جاري الحفظ...':'حفظ كل الإعدادات'}</button>
  </div></>;
}
