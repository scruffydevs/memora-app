import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Field, H2, Notice, useAsync } from '../ui.jsx';

// Admin: the medicines a caregiver can pick when logging "before / after a medicine".
export default function Medicines({ pid }) {
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/patients/${pid}/medicines`), [pid]);
  const [f, setF] = useState({ name: '', dose: '', schedule: '' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const add = async () => {
    setErr('');
    if (!f.name.trim()) return setErr('Enter the medicine name.');
    try { await api.post(`/api/patients/${pid}/medicines`, f); setF({ name: '', dose: '', schedule: '' }); reload(); } catch (e) { setErr(e.message); }
  };
  const del = async (m) => { if (window.confirm(`Remove ${m.name}? Past observations keep their notes but lose the link to it.`)) { await api.del(`/api/medicines/${m.id}`); reload(); } };
  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-6">
        <H2 hint="Caregivers choose from this list when they log how someone was before or after a medicine.">Add a medicine</H2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Dose"><input className="input" value={f.dose} onChange={(e) => set('dose', e.target.value)} placeholder="e.g. 1 tablet" /></Field>
          <Field label="When"><input className="input" value={f.schedule} onChange={(e) => set('schedule', e.target.value)} placeholder="e.g. 8 pm daily" /></Field>
        </div>
        {err && <div className="mt-3"><Notice tone="terra">{err}</Notice></div>}
        <Btn className="mt-4" onClick={add}>Add medicine</Btn>
      </Card>
      {loading ? <p className="text-muted">Loading…</p> : error ? <Notice tone="terra">{error.message}</Notice> : !data.length ? <Card className="p-8 text-center text-muted">No medicines listed.</Card> : (
        <Card className="divide-y divide-line">
          {data.map((m) => (
            <div key={m.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="mr-auto"><p className="font-semibold">{m.name}</p><p className="text-sm text-muted">{[m.dose, m.schedule].filter(Boolean).join(' · ') || 'No dose or time set'}</p></div>
              <Btn kind="danger" onClick={() => del(m)}>Remove</Btn>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
