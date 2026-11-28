import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Link } from './router.jsx';
import { Btn, Chip, Notice, useAsync } from './ui.jsx';
import Profile from './views/Profile.jsx';
import People from './views/People.jsx';
import Medicines from './views/Medicines.jsx';
import Privacy from './views/Privacy.jsx';
import Connections from './views/Connections.jsx';
import Arena from './views/Arena.jsx';
import Logs from './views/Logs.jsx';
import Live from './views/Live.jsx';
import Watch from './views/Watch.jsx';
import Places from './views/Places.jsx';
import Memory from './views/Memory.jsx';
import DataOverview from './views/DataOverview.jsx';
import Setup from './views/Setup.jsx';
import Portfolio from './views/Portfolio.jsx';

const TABS = [
  ['setup', 'Onboarding'], ['portfolio', 'Portfolio'], ['data', 'Data'], ['file', 'Patient file'], ['people', 'People'], ['medicines', 'Medicines'], ['places', 'Places'], ['consent', 'Consent'],
  ['connections', 'Connections'], ['memory', 'Memory'], ['watch', 'Watch'], ['live', 'Live'], ['observations', 'Observations'], ['logs', 'Logs'],
];

// The Memora team's page for one patient: complete the profiling here. Caregivers see it read-only.
export default function AdminPatient({ me, pid, onSignOut }) {
  const [tab, setTab] = useState('data');
  const info = useAsync(() => api.get(`/api/patients/${pid}/profile`), [pid]);
  const intake = useAsync(() => api.get(`/api/patients/${pid}/intake`), [pid]);
  // A patient whose onboarding is not finished opens on it.
  useEffect(() => { if (intake.data && !intake.data.completed_at) setTab('setup'); }, [intake.data]);

  const views = {
    setup: <Setup pid={pid} go={setTab} />,
    portfolio: <Portfolio pid={pid} admin go={setTab} />,
    data: <DataOverview pid={pid} go={setTab} />,
    file: <Profile pid={pid} />,
    people: <People pid={pid} />,
    medicines: <Medicines pid={pid} />,
    places: <Places pid={pid} />,
    consent: <Privacy pid={pid} me={me} editable />,
    connections: <Connections pid={pid} />,
    memory: <Memory pid={pid} />,
    watch: <Watch pid={pid} />,
    live: <Live pid={pid} />,
    observations: <Arena pid={pid} readOnly />,
    logs: <Logs pid={pid} readOnly />,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-5">
        <div className="mr-auto">
          <Link to="/admin" className="inline-block py-2 text-sm text-terra font-semibold hover:underline">← All patients</Link>
          <div className="font-display text-3xl font-bold leading-tight mt-1">{info.data?.patient.name || 'Patient'}</div>
        </div>
        {info.data && <Chip tone="plain">{info.data.patient.patient_code}</Chip>}
        <Chip tone="gold">Memora team view</Chip>
        <Btn kind="ghost" onClick={onSignOut}>Sign out</Btn>
      </header>
      {info.error && <Notice tone="terra">{info.error.message}</Notice>}
      <nav className="tabs-scroll flex gap-1 overflow-x-auto border-b border-line mb-6" aria-label="Patient sections">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={(e) => { setTab(k); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }} className={`px-4 py-2.5 font-semibold whitespace-nowrap border-b-[3px] -mb-px transition ${tab === k ? 'border-terra text-terra' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
        ))}
      </nav>
      <div key={`${tab}-${pid}`}>{views[tab]}</div>
      <p className="text-xs text-muted mt-10 text-center">What you complete here is what the caregiver reads. Caregivers cannot edit the patient file; they log what they notice.</p>
    </div>
  );
}
