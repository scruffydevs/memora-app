import React, { useState } from 'react';
import { useSession } from './session.js';
import { AuthScreen, ConnectScreen, WrongArea } from './Auth.jsx';
import Dashboard from './Dashboard.jsx';
import { Btn, Card } from './ui.jsx';

// /caregiver: sign in -> connect with a one-time code -> dashboard for the connected patient.
export default function CaregiverApp() {
  const s = useSession();
  const [connecting, setConnecting] = useState(false);
  const { me } = s;

  if (s.status === 'loading') return <div className="p-10 text-muted">Loading…</div>;
  if (s.status === 'error') return <div className="p-10"><Card className="p-6 max-w-lg"><b>Could not reach the server.</b><p className="text-muted mt-1">{s.error}</p><Btn className="mt-4" onClick={() => window.location.reload()}>Try again</Btn></Card></div>;
  if (s.status === 'anon') return <AuthScreen area="caregiver" onAuthed={s.setMe} />;
  if (me.user.role === 'admin') return <WrongArea youAre="the Memora team" goTo="/admin" goLabel="Go to the team area" onSignOut={s.signOut} />;

  const changed = (m) => { s.setMe(m); setConnecting(false); };
  if (me.connections.length === 0 || connecting) {
    return <ConnectScreen me={me} onConnected={changed} onSignOut={s.signOut} onCancel={me.connections.length ? () => setConnecting(false) : null} />;
  }
  return <Dashboard me={me} onSignOut={s.signOut} onConnectAnother={() => setConnecting(true)} onMeChange={changed} />;
}
