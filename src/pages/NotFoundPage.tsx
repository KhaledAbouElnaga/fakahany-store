import { Link } from 'react-router-dom';

export default function NotFoundPage(){
  return <main className="center-state error-state"><div className="not-found-card"><b className="not-found-code">404</b><h1>الصفحة غير موجودة</h1><p>الرابط الذي فتحته غير صحيح أو تم نقله.</p><Link className="btn" to="/">العودة للمتجر</Link></div></main>;
}
