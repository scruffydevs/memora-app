import React, { useState } from 'react';
import { api } from './api.js';
import { Btn, Card, Chip, Field, H2, Notice, dateTime, useAsync } from './ui.jsx';
import { navigate } from './router.jsx';

export function CodeBox({ info, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(info.code); setCopied(true); } catch { /* ignore */ } };
  return (
    <div className="rounded-xl border-2 border-dashed border-terra bg-tterra/60 p-4">
      <p className="text-sm text-muted">One-time connection code ({info.role === 'primary' ? 'main caregiver' : 'additional caregiver'}). <b>Shown only now.</b> Expires {dateTime(info.expires_at)}.</p>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <span className="font-mono text-2xl tracking-widest font-bold">{info.code}</span>
        <Btn kind="ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</Btn>
        <button className="text-sm text-muted hover:underline" onClick={onClose}>Hide</button>
      </div>
    </div>
  );
}

function PatientRow({ p, reload }) {
  const [role, setRole] = useState('primary');
  const [code, setCode] = useState(null);
  const [err, setErr] = useState('');
  const gen = async () => { setErr(''); try { setCode(await api.post(`/api/admin/patients/${p.id}/codes`, { role })); } catch (e) { setErr(e.message); } };
  const end = async (c) => {
    const reason = window.prompt(`End ${c.name}'s connection to ${p.name}? Their access stops now; the history stays.\n\nReason (optional):`, 'caregiver changed');
    if (reason === null) return;
    try { await api.post(`/api/admin/connections/${c.connection_id}/end`, { reason }); reload(); } catch (e) { setErr(e.message); }
  };
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <p className="font-display text-xl font-bold leading-tight">{p.name} {p.is_demo && <Chip tone="gold">Demo</Chip>}</p>
          <p className="text-sm text-muted font-mono">{p.patient_code}</p>
        </div>
        <Btn onClick={() => navigate(`/admin/patients/${p.id}`)}>Open patient file</Btn>
      </div>
      <div className="mt-3">
        <p className="label">Connected caregivers</p>
        {p.caregivers.length === 0 ? <p className="text-sm text-muted">None yet. Generate a code and give it to the caregiver.</p> : (
          <ul className="space-y-1.5">
            {p.caregivers.map((c) => (
              <li key={c.connection_id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.name}</span><span className="text-sm text-muted">{c.email}</span>
                <Chip tone="sage">{c.role === 'primary' ? 'Main' : 'Additional'}</Chip>
                <span className="text-xs text-muted">since {dateTime(c.connected_at)}</span>
                <button className="ml-auto text-sm text-terra hover:underline" onClick={() => end(c)}>End connection</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Code type">
          <option value="primary">Main caregiver</option><option value="secondary">Additional caregiver</option>
        </select>
        <Btn onClick={gen}>New connection code</Btn>
      </div>
      {err && <div className="mt-3"><Notice tone="terra">{err}</Notice></div>}
      {code && <div className="mt-3"><CodeBox info={code} onClose={() => setCode(null)} /></div>}
    </Card>
  );
}

function Patients() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/patients'), []);
  const [f, setF] = useState({ name: '', preferred_name: '', language: '', age_band: '' });
  const [err, setErr] = useState('');
  const [made, setMade] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const create = async () => {
    setErr(''); setMade(null);
    if (!f.name.trim()) return setErr('Enter the patient’s full name.');
    try { const p = await api.post('/api/admin/patients', { name: f.name }); navigate(`/admin/patients/${p.id}`); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <H2 hint="Create the account, then a short card-by-card onboarding collects everything else and writes their portfolio. The caregiver connects later with a one-time code.">New patient</H2>
        <div className="max-w-md">
          <Field label="Full name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} /></Field>
        </div>
        {err && <div className="mt-4"><Notice tone="terra">{err}</Notice></div>}
        {made && <div className="mt-4"><Notice tone="sage"><b>{made.name}</b> created with patient code <b className="font-mono">{made.patient_code}</b>. Next: open the patient file to complete the profile, then generate a connection code for their caregiver.</Notice></div>}
        <Btn className="mt-4" onClick={create}>Start onboarding</Btn>
      </Card>
      {loading ? <p className="text-muted">Loading…</p> : error ? <Notice tone="terra">{error.message}</Notice> : !data.length ? <Card className="p-8 text-center text-muted">No patient accounts yet.</Card> : (
        <div className="grid gap-5 lg:grid-cols-2">{data.map((p) => <PatientRow key={p.id} p={p} reload={reload} />)}</div>
      )}
    </div>
  );
}

function Caregivers() {
  const { data, loading, error, reload } = useAsync(() => api.get('/api/admin/caregivers'), []);
  const [msg, setMsg] = useState(null);
  const toggle = async (u) => { try { await api.post(`/api/admin/users/${u.id}/disable`, { disabled: !u.disabled }); reload(); } catch (e) { setMsg({ tone: 'terra', t: e.message }); } };
  const reset = async (u) => {
    const pw = window.prompt(`Set a temporary password for ${u.name} (at least 10 characters). Tell them to keep it private. Their current sessions will end.`);
    if (!pw) return;
    try { await api.post(`/api/admin/users/${u.id}/password`, { password: pw }); setMsg({ tone: 'sage', t: `Temporary password set for ${u.name}.` }); } catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  };
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}
      {!data.length ? <Card className="p-8 text-center text-muted">No caregivers have signed up yet.</Card> : (
        <Card className="divide-y divide-line">
          {data.map((u) => (
            <div key={u.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="mr-auto"><p className="font-semibold">{u.name} {u.disabled && <Chip tone="terra">Switched off</Chip>}</p><p className="text-sm text-muted">{u.email} · {u.active_patients} active patient{u.active_patients === 1 ? '' : 's'} · last sign-in {u.last_login ? dateTime(u.last_login) : 'never'}</p></div>
              <Btn kind="ghost" onClick={() => reset(u)}>Temporary password</Btn>
              <Btn kind={u.disabled ? 'sage' : 'danger'} onClick={() => toggle(u)}>{u.disabled ? 'Switch on' : 'Switch off'}</Btn>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Activity() {
  const { data, loading, error } = useAsync(() => api.get('/api/admin/audit?limit=80'), []);
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  return (
    <Card className="divide-y divide-line">
      {data.map((a) => (
        <div key={a.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2 text-sm">
          <Chip tone="plain">{a.action.replace(/_/g, ' ')}</Chip>
          <span>{a.user_name || 'system'}</span>{a.patient_name && <span className="text-muted">on {a.patient_name}</span>}{a.detail && <span className="text-muted">({a.detail})</span>}
          <span className="ml-auto text-xs text-muted">{dateTime(a.ts)}</span>
        </div>
      ))}
    </Card>
  );
}

export default function AdminConsole({ me, onSignOut }) {
  const [tab, setTab] = useState('patients');
  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-5">
        <div className="mr-auto"><div className="font-display text-3xl font-bold leading-none">Memora</div><div className="text-xs font-bold tracking-[0.25em] text-terra mt-1">MEMORA TEAM</div></div>
        <span className="text-sm text-muted">{me.user.email}</span>
        <Btn kind="ghost" onClick={() => navigate('/admin/showcase')}>Backend showcase</Btn>
        <Btn kind="ghost" onClick={onSignOut}>Sign out</Btn>
      </header>
      <nav className="flex gap-1 border-b border-line mb-6">
        {[['patients', 'Patient accounts'], ['caregivers', 'Caregivers'], ['activity', 'Activity']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 font-semibold border-b-[3px] -mb-px ${tab === k ? 'border-terra text-terra' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
        ))}
      </nav>
      {tab === 'patients' && <Patients />}
      {tab === 'caregivers' && <Caregivers />}
      {tab === 'activity' && <Activity />}
      <p className="text-xs text-muted mt-10 text-center">The Memora team can open any patient to help set up. Every connection and code is recorded under Activity.</p>
    </div>
  );
}
