import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './contexts/StoreContext';
import { CartProvider } from './contexts/CartContext';
import Storefront from './pages/Storefront';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import AdminPage from './pages/admin/AdminPage';

export default function App(){
  return <BrowserRouter><StoreProvider><CartProvider><Routes>
    <Route path="/" element={<Storefront/>}/>
    <Route path="/cart" element={<CartPage/>}/>
    <Route path="/checkout" element={<CheckoutPage/>}/>
    <Route path="/admin/*" element={<AdminPage/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></CartProvider></StoreProvider></BrowserRouter>;
}
