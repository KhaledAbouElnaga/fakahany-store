import { useState } from 'react';
import { newProduct, saveProduct, saveSettings, uploadImage } from '../../lib/storeApi';
import type { ShopSettings, StoreSnapshot } from '../../types';

const THEMES=[
  {id:'green',name:'أخضر كلاسيك'},
  {id:'orange',name:'برتقالي دافئ'},
  {id:'navy',name:'كحلي احترافي'},
  {id:'plum',name:'بنفسجي فاخر'},
] as const;

export default function SetupWizard({data,refresh}:{data:StoreSnapshot,refresh:()=>Promise<void>}){
  const [step,setStep]=useState(1);
  const [settings,setSettings]=useState<ShopSettings>(structuredClone(data.settings));
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

  const finish=async()=>{
    if(!settings.store_name.trim())return setMsg('اكتب اسم المتجر.');
    if(!settings.whatsapp_number.trim())return setMsg('اكتب رقم واتساب لاستقبال الطلبات.');
    if(!data.products.length&&productName.trim()&&productPrice<=0)return setMsg('اكتب سعرًا صحيحًا لأول منتج.');
    setBusy(true);setMsg('');
    try{
      await saveSettings({...settings,setup_completed:true});
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

  return <div className="setup-wizard-backdrop"><div className="setup-wizard-card">
    <div className="wizard-progress"><span className={step>=1?'done':''}/><span className={step>=2?'done':''}/><span className={step>=3?'done':''}/><span className={step>=4?'done':''}/></div>
    <small className="muted">إعداد المتجر · خطوة {step} من 4</small>

    {step===1&&<section><h1>بيانات المتجر الأساسية</h1><p className="muted">دي البيانات الأساسية اللي هيشوفها العميل ويستخدمها في التواصل.</p><div className="form-grid">
      <label>اسم المتجر<input value={settings.store_name} onChange={e=>set('store_name',e.target.value)}/></label>
      <label>اسم الموقع<input value={settings.site_name} onChange={e=>set('site_name',e.target.value)}/></label>
      <label>رقم واتساب<input value={settings.whatsapp_number} onChange={e=>set('whatsapp_number',e.target.value)} placeholder="01012345678"/></label>
      <label>رقم الهاتف<input value={settings.phone} onChange={e=>set('phone',e.target.value)}/></label>
      <label className="full">العنوان<input value={settings.address} onChange={e=>set('address',e.target.value)}/></label>
    </div></section>}

    {step===2&&<section><h1>الهوية والشكل</h1><p className="muted">اختار الشكل الأقرب للبراند. تقدر تغيره بعدين من الإعدادات.</p>
      <div className="theme-picker">{THEMES.map(t=><button key={t.id} className={settings.theme_preset===t.id?'theme-option active':'theme-option'} data-preview-theme={t.id} onClick={()=>set('theme_preset',t.id)}><i/><b>{t.name}</b></button>)}</div>
      <div className="form-grid"><label>الشعار<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void upload(e.target.files?.[0],'logo_url')}/></label><label>صورة الغلاف<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void upload(e.target.files?.[0],'banner_url')}/></label></div>
    </section>}

    {step===3&&<section><h1>الطلبات والتشغيل</h1><div className="form-grid">
      <label>الحد الأدنى للطلب<input type="number" min="0" value={settings.min_order} onChange={e=>set('min_order',Number(e.target.value))}/></label>
      <label>رسوم التوصيل الافتراضية<input type="number" min="0" value={settings.default_delivery_fee} onChange={e=>set('default_delivery_fee',Number(e.target.value))}/></label>
      <label>وقت الفتح<input type="time" value={settings.opening_time} onChange={e=>set('opening_time',e.target.value)}/></label>
      <label>وقت الإغلاق<input type="time" value={settings.closing_time} onChange={e=>set('closing_time',e.target.value)}/></label>
    </div><label className="toggle-setting"><input type="checkbox" checked={settings.delivery_enabled} onChange={e=>set('delivery_enabled',e.target.checked)}/> تفعيل التوصيل</label></section>}

    {step===4&&<section><h1>{data.products.length?'المتجر جاهز':'أضف أول منتج'}</h1>{data.products.length?<p className="muted">عندك منتجات بالفعل، فاضغط إنهاء لفتح لوحة الإدارة.</p>:<><p className="muted">ممكن تضيف أول منتج دلوقتي أو تسيبه فاضي وتضيف المنتجات بعدين.</p><div className="form-grid"><label>اسم المنتج<input value={productName} onChange={e=>setProductName(e.target.value)} placeholder="مثال: مانجو عويس"/></label><label>السعر<input type="number" min="0" value={productPrice||''} onChange={e=>setProductPrice(Number(e.target.value))}/></label><label>القسم<select value={productCategory} onChange={e=>setProductCategory(e.target.value)}><option value="">بدون قسم</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></label></div></>}</section>}

    {msg&&<p className="error-text">{msg}</p>}
    <div className="wizard-actions">{step>1&&<button className="btn secondary" disabled={busy} onClick={()=>setStep(s=>s-1)}>السابق</button>}{step<4?<button className="btn" disabled={busy} onClick={()=>setStep(s=>s+1)}>التالي</button>:<button className="btn" disabled={busy} onClick={()=>void finish()}>{busy?'جاري الإعداد...':'إنهاء الإعداد'}</button>}</div>
  </div></div>;
}
