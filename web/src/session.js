import { useEffect, useState } from 'react';
import { api, AuthError } from './api.js';

// The signed-in user for this page. The server keeps the session in an httpOnly cookie.
export function useSession() {
  const [state, set] = useState({ status: 'loading', me: null, error: '' });
  useEffect(() => {
    api.get('/api/auth/me')
      .then((me) => set({ status: 'ready', me, error: '' }))
      .catch((e) => set(e instanceof AuthError ? { status: 'anon', me: null, error: '' } : { status: 'error', me: null, error: e.message }));
  }, []);
  const setMe = (me) => set({ status: 'ready', me, error: '' });
  const signOut = async () => { try { await api.post('/api/auth/logout'); } catch { /* ignore */ } set({ status: 'anon', me: null, error: '' }); };
  return { ...state, setMe, signOut };
}
