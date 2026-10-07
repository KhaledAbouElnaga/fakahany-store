import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import type { ShopSettings } from '../types';
import { tenantHref } from '../lib/tenant';

export default function Header({ settings, showCart=true }: { settings: ShopSettings; showCart?:boolean }) {
  const { count } = useCart();
  return <header className="site-header">
    {settings.announcement_enabled&&settings.announcement_text&&<div className="announcement-bar">{settings.announcement_text}</div>}
    <div className="container header-inner">
      <Link to={tenantHref('/')} className="brand">
        {settings.logo_url ? <img src={settings.logo_url} alt="شعار المتجر"/> : <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19.5 4.5C12 4 6.4 7.4 5 13.5c-.5 2.1.2 4.1 2 5.2 2.1 1.2 4.5.6 5.8-1.2 2.1-2.9 1.8-6.5 6.7-13Z"/><path d="M6.5 18c2.1-3.5 5.2-6.2 9.2-8.1"/></svg></span>}
        <strong>{settings.store_name}</strong>
      </Link>
      {showCart&&<Link className="cart-link" to={tenantHref('/cart')} aria-label="سلة التسوق">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L20.5 8H7.1M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>{count > 0 && <b>{count}</b>}
      </Link>}
    </div>
  </header>;
}
