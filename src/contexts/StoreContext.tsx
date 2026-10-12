import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { StoreSnapshot, TenantInfo } from '../types';
import { loadStore } from '../lib/storeApi';
import { applyTheme } from '../lib/utils';
import { resolveTenant } from '../lib/tenant';

interface StoreContextValue {
  data: StoreSnapshot | null;
  tenant: TenantInfo | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  /** Apply a small optimistic edit without setting global loading or refetching the store. */
  updateSnapshot: (updater: (snapshot: StoreSnapshot) => StoreSnapshot) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const location=useLocation();
  const [data, setData] = useState<StoreSnapshot | null>(null);
  const [tenant,setTenant]=useState<TenantInfo|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async (forceTenant=false) => {
    setLoading(true); setError('');
    try { const resolved=await resolveTenant(forceTenant); setTenant(resolved); const next=await loadStore(); applyTheme(next.settings); setData(next); }
    catch (e: any) { setError(e?.message || 'تعذر تحميل بيانات المتجر.'); }
    finally { setLoading(false); }
  };

  const updateSnapshot = (updater: (snapshot: StoreSnapshot) => StoreSnapshot) =>
    setData(previous => previous ? updater(previous) : previous);

  useEffect(() => { void refresh(true); }, [location.search]);
  const value = useMemo(() => ({ data, tenant, loading, error, refresh }), [data, tenant, loading, error]);
  return <StoreContext.Provider value={{...value,refresh:()=>refresh(false),updateSnapshot}}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider missing');
  return ctx;
}
