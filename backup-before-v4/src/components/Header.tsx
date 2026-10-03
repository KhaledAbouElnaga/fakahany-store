import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import type { ShopSettings } from '../types';

export default function Header({ settings }: { settings: ShopSettings }) {
  const { count } = useCart();
  return <header className="site-header">
    <div className="container header-inner">
      <Link to="/" className="brand">
        {settings.logo_url ? <img src={settings.logo_url} alt="شعار المتجر"/> : <span className="brand-mark">🥬</span>}
        <strong>{settings.store_name}</strong>
      </Link>
      <Link className="cart-link" to="/cart" aria-label="سلة التسوق">
        <span>🛒</span>{count > 0 && <b>{count}</b>}
      </Link>
    </div>
  </header>;
}
