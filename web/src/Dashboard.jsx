import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Btn, Card, Chip } from './ui.jsx';
import Overview from './views/Overview.jsx';
import Arena from './views/Arena.jsx';
import PatientFile from './views/PatientFile.jsx';
import Behaviour from './views/Behaviour.jsx';
import Logs from './views/Logs.jsx';
import Privacy from './views/Privacy.jsx';

// Caregivers read the patient file and log what they notice. The Memora team does the profiling (/admin).
const TABS = [
  ['overview', 'Overview'], ['arena', 'Log arena'], ['behaviour', 'Behaviour'], ['logs', 'Logs'],
  ['file', 'Patient file'], ['privacy', 'Privacy and access'],
];
const VIEWS = { overview: Overview, arena: Arena, behaviour: Behaviour, logs: Logs, file: PatientFile, privacy: Privacy };

export default function Dashboard({ me, onSignOut, onConnectAnother, onMeChange }) {
  const [patients, setPatients] = useState(null);
  const [pid, setPid] = useState(null);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    api.get('/api/patients').then((list) => { setPatients(list); setPid((cur) => (list.some((p) => p.id === cur) ? cur : list[0]?.id ?? null)); }).catch(() => setPatients([]));
  }, [me]);

  if (!patients) return <div className="p-10 text-muted">Loading…</div>;
  const current = patients.find((p) => p.id === pid);
  const V = VIEWS[tab];

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-5">
        <div className="mr-auto">
          <div className="font-display text-3xl font-bold leading-none">Memora</div>
          <div className="text-xs font-bold tracking-[0.25em] text-terra mt-1">CAREGIVER</div>
        </div>
        {patients.length > 1 && (
          <select className="input !w-auto" value={pid ?? ''} onChange={(e) => { setPid(Number(e.target.value)); setTab('overview'); }} aria-label="Patient">
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {current && <Chip tone="plain">{current.patient_code}</Chip>}
        <Btn kind="ghost" onClick={onConnectAnother}>+ Connect with a code</Btn>
        <span className="text-sm text-muted hidden sm:inline">{me.user.name}</span>
        <Btn kind="ghost" onClick={onSignOut}>Sign out</Btn>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-line mb-6" aria-label="Sections">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 font-semibold whitespace-nowrap border-b-[3px] -mb-px transition ${tab === k ? 'border-terra text-terra' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </nav>

      {pid ? <V key={`${tab}-${pid}`} pid={pid} go={setTab} me={me} onMeChange={onMeChange} /> : (
        <Card className="p-8 text-center"><p className="font-display text-2xl">No patient connected</p><p className="text-muted mt-1">Use a connection code from the Memora team to open someone&rsquo;s dashboard.</p></Card>
      )}
      <p className="text-xs text-muted mt-10 text-center">Prototype on synthetic data. Memora describes what you log. It does not diagnose.</p>
    </div>
  );
}
