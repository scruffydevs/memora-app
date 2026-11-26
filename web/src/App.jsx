import React, { useEffect, useState } from 'react';
import { api, AuthError } from './api.js';
import { Btn, Card } from './ui.jsx';
import { AuthScreen, ConnectScreen } from './Auth.jsx';
import AdminConsole from './Admin.jsx';
import Dashboard from './Dashboard.jsx';

// Flow: sign in -> (caregiver) connect to a patient with a code -> dashboard.  Admin (Memora team): console -> open a patient.
export default function App() {
  const [status, setStatus] = useState('loading'); // loading | anon | ready | error
  const [me, setMe] = useState(null);
  const [adminPid, setAdminPid] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/api/auth/me').then((m) => { setMe(m); setStatus('ready'); })
      .catch((e) => { if (e instanceof AuthError) setStatus('anon'); else { setErr(e.message); setStatus('error'); } });
  }, []);

  const signOut = async () => { try { await api.post('/api/auth/logout'); } catch { /* ignore */ } setMe(null); setAdminPid(null); setConnecting(false); setStatus('anon'); };
  const sessionChanged = (m) => { setMe(m); setConnecting(false); setStatus('ready'); };

  if (status === 'loading') return <div className="p-10 text-muted">Loading…</div>;
  if (status === 'error') return <div className="p-10"><Card className="p-6 max-w-lg"><b>Could not reach the server.</b><p className="text-muted mt-1">{err}</p><Btn className="mt-4" onClick={() => window.location.reload()}>Try again</Btn></Card></div>;
  if (status === 'anon') return <AuthScreen onAuthed={sessionChanged} />;

  if (me.user.role === 'admin') {
    return adminPid
      ? <Dashboard me={me} initialPid={adminPid} onSignOut={signOut} onBack={() => setAdminPid(null)} onMeChange={sessionChanged} />
      : <AdminConsole me={me} onOpen={setAdminPid} onSignOut={signOut} />;
  }

  if (me.connections.length === 0 || connecting) {
    return <ConnectScreen me={me} onConnected={sessionChanged} onSignOut={signOut} onCancel={me.connections.length ? () => setConnecting(false) : null} />;
  }
  return <Dashboard me={me} onSignOut={signOut} onConnectAnother={() => setConnecting(true)} onMeChange={sessionChanged} />;
}
