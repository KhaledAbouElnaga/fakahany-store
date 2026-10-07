import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './contexts/StoreContext';
import { CartProvider } from './contexts/CartContext';
import Storefront from './pages/Storefront';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderSuccessPage from './pages/OrderSuccessPage';
import AdminPage from './pages/admin/AdminPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import NotFoundPage from './pages/NotFoundPage';
import AppErrorBoundary from './components/AppErrorBoundary';
import NetworkStatus from './components/NetworkStatus';
import PublicStoreGate from './components/PublicStoreGate';
import PwaUpdateToast from './components/PwaUpdateToast';
import PlatformAdminPage from './pages/PlatformAdminPage';

export default function App(){
  return <AppErrorBoundary><BrowserRouter><StoreProvider><CartProvider><NetworkStatus/><PwaUpdateToast/><Routes>
    <Route path="/" element={<PublicStoreGate><Storefront/></PublicStoreGate>}/>
    <Route path="/cart" element={<PublicStoreGate><CartPage/></PublicStoreGate>}/>
    <Route path="/checkout" element={<PublicStoreGate><CheckoutPage/></PublicStoreGate>}/>
    <Route path="/order-success" element={<OrderSuccessPage/>}/>
    <Route path="/track/:token" element={<OrderTrackingPage/>}/>
    <Route path="/admin/*" element={<AdminPage/>}/>
    <Route path="/platform" element={<PlatformAdminPage/>}/>
    <Route path="*" element={<NotFoundPage/>}/>
  </Routes></CartProvider></StoreProvider></BrowserRouter></AppErrorBoundary>;
}
