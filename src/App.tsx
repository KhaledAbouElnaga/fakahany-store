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
import SignupPage from './pages/SignupPage';

function StoreScopedRoutes(){
  return <StoreProvider><CartProvider><Routes>
    <Route path="/" element={<PublicStoreGate><Storefront/></PublicStoreGate>}/>
    <Route path="/cart" element={<PublicStoreGate><CartPage/></PublicStoreGate>}/>
    <Route path="/checkout" element={<PublicStoreGate><CheckoutPage/></PublicStoreGate>}/>
    <Route path="/order-success" element={<OrderSuccessPage/>}/>
    <Route path="/track/:token" element={<OrderTrackingPage/>}/>
    <Route path="/admin/*" element={<AdminPage/>}/>
    <Route path="*" element={<NotFoundPage/>}/>
  </Routes></CartProvider></StoreProvider>;
}

export default function App(){
  return <AppErrorBoundary><BrowserRouter>
    <NetworkStatus/>
    <PwaUpdateToast/>
    <Routes>
      <Route path="/platform" element={<PlatformAdminPage/>}/>
      <Route path="/signup" element={<SignupPage/>}/>
      <Route path="/*" element={<StoreScopedRoutes/>}/>
    </Routes>
  </BrowserRouter></AppErrorBoundary>;
}
