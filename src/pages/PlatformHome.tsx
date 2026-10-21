import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { updateNeutralPageMeta } from '../lib/utils';

export default function PlatformHome(){
  useEffect(()=>updateNeutralPageMeta('Matgark — متجرك','منصة واحدة لإنشاء متجرك وإدارة منتجاتك وطلباتك وفريقك.'),[]);
  return <main className="container narrow" dir="rtl" style={{paddingTop:64,paddingBottom:64}}>
    <header><strong dir="ltr" style={{fontSize:32}}>Matgark</strong><p>متجرك</p></header>
    <h1>كل متجرك في مكان واحد</h1>
    <p className="muted">أنشئ المتاجر وأدر المنتجات والطلبات وفريق العمل، مع اسم ورابط مستقل لكل متجر.</p>
    <div className="actions-row" style={{marginTop:32}}>
      <Link className="btn" to="/platform">دخول إدارة المنصة</Link>
      <Link className="btn secondary" to="/signup">إنشاء متجر جديد</Link>
    </div>
    <section style={{marginTop:48}}><h2>عندك متجر بالفعل؟</h2>
      <p>افتح رابط متجرك المعتاد للوصول إليه أو لإدارته. تظل أسماء المتاجر وبياناتها خاصة بكل متجر.</p>
    </section>
  </main>;
}
