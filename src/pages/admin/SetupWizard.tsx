import { useState } from 'react';
import { newArea, newProduct, saveDeliveryArea, saveProduct, saveSettings, uploadImage } from '../../lib/storeApi';
import type { DeliveryArea, ShopSettings, StoreSnapshot } from '../../types';

const THEMES=[
  {id:'green',name:'أخضر كلاسيك'},
  {id:'orange',name:'برتقالي دافئ'},
  {id:'navy',name:'كحلي احترافي'},
  {id:'plum',name:'بنفسجي فاخر'},
] as const;

export default function SetupWizard({data,refresh}:{data:StoreSnapshot,refresh:()=>Promise<void>}){
  const [step,setStep]=useState(1);
  const [settings,setSettings]=useState<ShopSettings>(structuredClone(data.settings));
  const [areas,setAreas]=useState<DeliveryArea[]>(data.deliveryAreas.length?structuredClone(data.deliveryAreas):[]);
  const [productName,setProductName]=useState('');
  const [productPrice,setProductPrice]=useState(0);
  const [productCategory,setProductCategory]=useState(data.categories[0]?.id||'');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  const set=(k:keyof ShopSettings,v:any)=>setSettings(s=>({...s,[k]:v}));
  const upload=async(file:File|undefined,field:'logo_url'|'banner_url')=>{
    if(!file)return;
    setBusy(true);setMsg('');
    try{const url=await uploadImage(file,field==='logo_url'?'branding':'banners');set(field,url)}
    catch(e:any){setMsg(e?.message||'تعذر رفع الصورة.')}finally{setBusy(false)}
  };

  const addArea=()=>setAreas(v=>[...v,{...newArea(v.length+1),name_ar:'',fee:0}]);
  const patchArea=(id:string,patch:Partial<DeliveryArea>)=>setAreas(v=>v.map(a=>a.id===id?{...a,...patch}:a));

  const next=()=>{
    setMsg('');
    if(step===1){
      if(!settings.store_name.trim())return setMsg('اكتب اسم المتجر.');
      if(!settings.whatsapp_number.trim())return setMsg('اكتب رقم واتساب لاستقبال الطلبات.');
    }
    if(step===4&&settings.delivery_enabled&&settings.require_area&&areas.some(a=>!a.name_ar.trim()))return setMsg('اكتب اسم كل منطقة توصيل أو احذف الصف الفارغ.');
    if(step===5&&!data.products.length&&productName.trim()&&productPrice<=0)return setMsg('اكتب سعرًا صحيحًا لأول منتج.');
    setStep(s=>Math.min(6,s+1));
  };

  const finish=async()=>{
    if(!settings.store_name.trim())return setMsg('اكتب اسم المتجر.');
    if(!settings.whatsapp_number.trim())return setMsg('اكتب رقم واتساب لاستقبال الطلبات.');
    setBusy(true);setMsg('');
    try{
      await saveSettings({...settings,setup_completed:true});
      for(const [i,area] of areas.entries()){
        if(!area.name_ar.trim())continue;
        await saveDeliveryArea({...area,name_ar:area.name_ar.trim(),display_order:i+1});
      }
      if(!data.products.length&&productName.trim()){
        const p=newProduct(1);
        p.name_ar=productName.trim();
        p.category_id=productCategory||null;
        p.options[0].price=productPrice;
        await saveProduct(p);
      }
      await refresh();
    }catch(e:any){setMsg(e?.message||'تعذر إنهاء الإعداد.')}finally{setBusy(false)}
  };

  return <div className="setup-wizard-backdrop"><div className="setup-wizard-card onboarding-wizard">
    <div className="wizard-progress six-steps">{[1,2,3,4,5,6].map(n=><span key={n} className={step>=n?'done':''}/>)}</div>
    <small className="muted">تجهيز متجرك · خطوة {step} من 6</small>

    {step===1&&<section><h1>بيانات المتجر الأساسية</h1><p className="muted">ابدأ بالبيانات التي يراها العميل ويتواصل بها معك.</p><div className="form-grid">
      <label>اسم المتجر<input value={settings.store_name} onChange={e=>set('store_name',e.target.value)}/></label>
      <label>اسم الموقع<input value={settings.site_name} onChange={e=>set('site_name',e.target.value)}/></label>
      <label>رقم واتساب<input value={settings.whatsapp_number} onChange={e=>set('whatsapp_number',e.target.value)} placeholder="01012345678"/></label>
      <label>رقم الهاتف<input value={settings.phone} onChange={e=>set('phone',e.target.value)}/></label>
      <label className="full">العنوان<input value={settings.address} onChange={e=>set('address',e.target.value)}/></label>
    </div></section>}

    {step===2&&<section><h1>الهوية والشكل</h1><p className="muted">اختار الشكل الأقرب للبراند وارفع الشعار والغلاف. تقدر تعدلهم في أي وقت.</p>
      <div className="theme-picker">{THEMES.map(t=><button type="button" key={t.id} className={settings.theme_preset===t.id?'theme-option active':'theme-option'} data-preview-theme={t.id} onClick={()=>set('theme_preset',t.id)}><i/><b>{t.name}</b></button>)}</div>
      <div className="form-grid"><label>الشعار<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void upload(e.target.files?.[0],'logo_url')}/></label><label>صورة الغلاف<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void upload(e.target.files?.[0],'banner_url')}/></label></div>
    </section>}

    {step===3&&<section><h1>المواعيد والتشغيل</h1><p className="muted">حدد مواعيد العمل والحد الأدنى ورسوم التوصيل.</p><div className="form-grid">
      <label>وقت الفتح<input type="time" value={settings.opening_time} onChange={e=>set('opening_time',e.target.value)}/></label>
      <label>وقت الإغلاق<input type="time" value={settings.closing_time} onChange={e=>set('closing_time',e.target.value)}/></label>
      <label>الحد الأدنى للطلب<input type="number" min="0" value={settings.min_order} onChange={e=>set('min_order',Number(e.target.value))}/></label>
      <label>رسوم التوصيل الافتراضية<input type="number" min="0" value={settings.default_delivery_fee} onChange={e=>set('default_delivery_fee',Number(e.target.value))}/></label>
    </div><label className="toggle-setting"><input type="checkbox" checked={settings.delivery_enabled} onChange={e=>set('delivery_enabled',e.target.checked)}/> تفعيل التوصيل</label></section>}

    {step===4&&<section><h1>مناطق التوصيل</h1><p className="muted">{settings.delivery_enabled?'أضف المناطق ورسوم كل منطقة. يمكنك تركها فارغة واستخدام الرسوم الافتراضية فقط.':'التوصيل غير مفعل حاليًا، ويمكنك تخطي هذه الخطوة.'}</p>
      {settings.delivery_enabled&&<div className="wizard-area-list">{areas.map((a,i)=><div className="wizard-area-row" key={a.id}><input placeholder={`المنطقة ${i+1}`} value={a.name_ar} onChange={e=>patchArea(a.id,{name_ar:e.target.value})}/><input type="number" min="0" placeholder="رسوم التوصيل" value={a.fee||''} onChange={e=>patchArea(a.id,{fee:Number(e.target.value)})}/><button type="button" className="btn secondary" onClick={()=>setAreas(v=>v.filter(x=>x.id!==a.id))}>حذف</button></div>)}<button type="button" className="btn secondary" onClick={addArea}>+ إضافة منطقة</button></div>}
    </section>}

    {step===5&&<section><h1>{data.products.length?'المنتجات موجودة بالفعل':'أضف أول منتج'}</h1>{data.products.length?<p className="muted">المتجر يحتوي على منتجات بالفعل، ويمكنك المتابعة للمراجعة النهائية.</p>:<><p className="muted">إضافة أول منتج هنا اختيارية؛ تقدر تضيف كل المنتجات من لوحة الإدارة بعد إنهاء الإعداد.</p><div className="form-grid"><label>اسم المنتج<input value={productName} onChange={e=>setProductName(e.target.value)} placeholder="مثال: مانجو عويس"/></label><label>السعر<input type="number" min="0" value={productPrice||''} onChange={e=>setProductPrice(Number(e.target.value))}/></label><label>القسم<select value={productCategory} onChange={e=>setProductCategory(e.target.value)}><option value="">بدون قسم</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></label></div></>}</section>}

    {step===6&&<section><h1>جاهز للنشر</h1><p className="muted">راجع الملخص ثم اضغط إنهاء. بعد ذلك تقدر تعدل أي شيء من لوحة الإدارة.</p><div className="wizard-review-grid">
      <div><small>المتجر</small><b>{settings.store_name||'—'}</b></div>
      <div><small>واتساب</small><b dir="ltr">{settings.whatsapp_number||'—'}</b></div>
      <div><small>التوصيل</small><b>{settings.delivery_enabled?'مفعل':'غير مفعل'}</b></div>
      <div><small>المناطق</small><b>{areas.filter(a=>a.name_ar.trim()).length}</b></div>
      <div><small>المواعيد</small><b dir="ltr">{settings.opening_time} → {settings.closing_time}</b></div>
      <div><small>أول منتج</small><b>{data.products.length?data.products.length+' موجود':productName.trim()||'سيضاف لاحقًا'}</b></div>
    </div></section>}

    {msg&&<p className="error-text">{msg}</p>}
    <div className="wizard-actions">{step>1&&<button className="btn secondary" disabled={busy} onClick={()=>setStep(s=>s-1)}>السابق</button>}{step<6?<button className="btn" disabled={busy} onClick={next}>التالي</button>:<button className="btn" disabled={busy} onClick={()=>void finish()}>{busy?'جاري تجهيز المتجر...':'إنهاء ونشر المتجر'}</button>}</div>
  </div></div>;
}
