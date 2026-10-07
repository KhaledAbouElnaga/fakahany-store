import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import type { ShopSettings } from '../types';

export default function Header({ settings, showCart=true }: { settings: ShopSettings; showCart?:boolean }) {
  const { count } = useCart();
  return <header className="site-header">
    {settings.announcement_enabled&&settings.announcement_text&&<div className="announcement-bar">{settings.announcement_text}</div>}
    <div className="container header-inner">
      <Link to="/" className="brand">
        {settings.logo_url ? <img src={settings.logo_url} alt="شعار المتجر"/> : <span className="brand-mark">🥬</span>}
        <strong>{settings.store_name}</strong>
      </Link>
      {showCart&&<Link className="cart-link" to="/cart" aria-label="سلة التسوق">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L20.5 8H7.1M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>{count > 0 && <b>{count}</b>}
      </Link>}
    </div>
  </header>;
}
