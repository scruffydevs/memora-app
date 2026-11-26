import React, { useEffect, useState } from 'react';
import { api, AuthError, getToken, setToken } from './api.js';
import { Btn, Card, Field } from './ui.jsx';
import Overview from './views/Overview.jsx';
import Profile from './views/Profile.jsx';
import People from './views/People.jsx';
import Arena from './views/Arena.jsx';
import Behaviour from './views/Behaviour.jsx';
import Logs from './views/Logs.jsx';
import Privacy from './views/Privacy.jsx';

const TABS = [
  ['overview', 'Overview'], ['arena', 'Log arena'], ['profile', 'Profile'], ['people', 'People'],
  ['behaviour', 'Behaviour'], ['logs', 'Logs'], ['privacy', 'Privacy'],
];

function Login({ onDone, bad }) {
  const [t, setT] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <h1 className="font-display text-4xl font-bold">Memora</h1>
        <p className="text-terra font-display italic text-lg mb-6">A memory that belongs to you</p>
        <Field label="Access code" hint={bad ? 'That code was not accepted.' : 'Ask the person who set this up. Demo data is synthetic.'}>
          <input className="input" type="password" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onDone(t)} autoFocus />
        </Field>
        <Btn className="w-full mt-4" onClick={() => onDone(t)}>Open caregiver view</Btn>
      </Card>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState('loading'); // loading | auth | ready | error
  const [bad, setBad] = useState(false);
  const [patients, setPatients] = useState([]);
  const [pid, setPid] = useState(null);
  const [tab, setTab] = useState('overview');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [err, setErr] = useState('');

  const load = async (keep) => {
    try {
      const list = await api.get('/api/patients');
      setPatients(list);
      setPid((cur) => keep ?? cur ?? list[0]?.id ?? null);
      setStatus('ready');
    } catch (e) {
      if (e instanceof AuthError) setStatus('auth'); else { setErr(e.message); setStatus('error'); }
    }
  };
  useEffect(() => { load(); }, []);

  if (status === 'loading') return <div className="p-10 text-muted">Loading…</div>;
  if (status === 'auth') return <Login bad={bad} onDone={(t) => { setToken(t); setBad(true); load(); }} />;
  if (status === 'error') return <div className="p-10"><Card className="p-6 max-w-lg"><b>Could not reach the server.</b><p className="text-muted mt-1">{err}</p><Btn className="mt-4" onClick={() => load()}>Try again</Btn></Card></div>;

  const create = async () => {
    if (!newName.trim()) return;
    const p = await api.post('/api/patients', { name: newName.trim() });
    setNewName(''); setAdding(false); setTab('profile'); await load(p.id);
  };

  const V = { overview: Overview, arena: Arena, profile: Profile, people: People, behaviour: Behaviour, logs: Logs, privacy: Privacy }[tab];

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-5">
        <div className="mr-auto">
          <div className="font-display text-3xl font-bold leading-none">Memora</div>
          <div className="text-xs font-bold tracking-[0.25em] text-terra mt-1">CAREGIVER</div>
        </div>
        {patients.length > 0 && (
          <select className="input !w-auto" value={pid ?? ''} onChange={(e) => setPid(Number(e.target.value))} aria-label="Patient">
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {adding ? (
          <div className="flex gap-2">
            <input className="input" placeholder="Patient name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} autoFocus />
            <Btn onClick={create}>Add</Btn><Btn kind="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        ) : <Btn kind="ghost" onClick={() => setAdding(true)}>+ New patient</Btn>}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-line mb-6" aria-label="Sections">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 font-semibold whitespace-nowrap border-b-[3px] -mb-px transition ${tab === k ? 'border-terra text-terra' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </nav>

      {pid ? <V key={`${tab}-${pid}`} pid={pid} go={setTab} /> : (
        <Card className="p-8 text-center"><p className="font-display text-2xl">No patient yet</p><p className="text-muted mt-1">Add one to start the profile.</p></Card>
      )}
      <p className="text-xs text-muted mt-10 text-center">Prototype on synthetic data. Memora describes what you log. It does not diagnose.</p>
    </div>
  );
}
