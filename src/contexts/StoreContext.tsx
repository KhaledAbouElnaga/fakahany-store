import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StoreSnapshot } from '../types';
import { loadStore } from '../lib/storeApi';

interface StoreContextValue {
  data: StoreSnapshot | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true); setError('');
    try { setData(await loadStore()); }
    catch (e: any) { setError(e?.message || 'تعذر تحميل بيانات المتجر.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);
  const value = useMemo(() => ({ data, loading, error, refresh }), [data, loading, error]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider missing');
  return ctx;
}
