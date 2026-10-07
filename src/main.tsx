import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { logClientError } from './lib/errorLogger';

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);

window.addEventListener('error',e=>void logClientError(e.error||e.message,'window.error'));
window.addEventListener('unhandledrejection',e=>void logClientError(e.reason,'unhandledrejection'));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async() => {
    try{
      const reg=await navigator.serviceWorker.register('/sw.js');
      const announce=(worker:ServiceWorker|null)=>worker&&window.dispatchEvent(new CustomEvent('fakahany-sw-update',{detail:worker}));
      if(reg.waiting&&navigator.serviceWorker.controller)announce(reg.waiting);
      reg.addEventListener('updatefound',()=>{
        const installing=reg.installing;
        installing?.addEventListener('statechange',()=>{
          if(installing.state==='installed'&&navigator.serviceWorker.controller)announce(installing);
        });
      });
    }catch(e){void logClientError(e,'service-worker')}
  });
}
