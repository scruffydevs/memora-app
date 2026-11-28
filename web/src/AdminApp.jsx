import React, { useState } from 'react';
import { useSession } from './session.js';
import { AuthScreen, WrongArea } from './Auth.jsx';
import AdminConsole from './Admin.jsx';
import AdminPatient from './AdminPatient.jsx';
import Showcase from './Showcase.jsx';
import { Btn, Card } from './ui.jsx';

// /admin: the Memora team. Create patient accounts, do the profiling, connect caregivers.
export default function AdminApp({ path }) {
  const s = useSession();
  const [denied, setDenied] = useState('');
  const { me } = s;

  if (s.status === 'loading') return <div className="p-10 text-muted">Loading…</div>;
  if (s.status === 'error') return <div className="p-10"><Card className="p-6 max-w-lg"><b>Could not reach the server.</b><p className="text-muted mt-1">{s.error}</p><Btn className="mt-4" onClick={() => window.location.reload()}>Try again</Btn></Card></div>;
  if (s.status === 'anon') {
    return <AuthScreen area="admin" notice={denied} onAuthed={async (m) => {
      if (m.user.role !== 'admin') { setDenied('That account is a caregiver account. Please use the caregiver sign-in.'); await s.signOut(); return; }
      setDenied(''); s.setMe(m);
    }} />;
  }
  if (me.user.role !== 'admin') return <WrongArea youAre="a caregiver" goTo="/caregiver" goLabel="Go to your dashboard" onSignOut={s.signOut} />;

  if (path === '/admin/showcase') return <Showcase me={me} onSignOut={s.signOut} />;
  const m = path.match(/^\/admin\/patients\/(\d+)$/);
  return m ? <AdminPatient me={me} pid={Number(m[1])} onSignOut={s.signOut} /> : <AdminConsole me={me} onSignOut={s.signOut} />;
}
