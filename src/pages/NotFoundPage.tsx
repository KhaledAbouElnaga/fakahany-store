import { Link } from 'react-router-dom';
import { tenantHref } from '../lib/tenant';

export default function NotFoundPage(){
  return <main className="center-state error-state"><div className="not-found-card"><b className="not-found-code">404</b><h1>الصفحة غير موجودة</h1><p>الرابط الذي فتحته غير صحيح أو تم نقله.</p><Link className="btn" to={tenantHref('/')}>العودة للمتجر</Link></div></main>;
}
