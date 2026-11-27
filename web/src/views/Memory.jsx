import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Chip, Field, H2, Notice, dateTime, useAsync } from '../ui.jsx';

const KINDS = ['fact', 'preference', 'routine', 'relationship', 'observation', 'event'];
const TIER = { 0: ['Tier 0: never sent to AI', 'terra'], 1: ['Tier 1: masked before AI', 'gold'], 2: ['Tier 2: sent as written', 'sage'] };
const SOURCE = { profile: 'Patient file', observations: 'Log arena', care_logs: 'Care log', entries: 'Entry', manual: 'Added by hand' };
const sourceLabel = (s) => `${SOURCE[s.table] || s.table}${s.table !== 'profile' && s.table !== 'manual' && s.id ? ` #${s.id}` : ''}${s.table === 'manual' && s.note ? `: ${s.note}` : ''}`;
const pad = (n) => String(n).padStart(2, '0');
const toLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function History({ id }) {
  const { data, loading, error } = useAsync(() => api.get(`/api/memories/${id}/history`), [id]);
  if (loading) return <p className="text-sm text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  return (
    <div className="mt-3 grid gap-4 md:grid-cols-2 border-t border-line pt-3">
      <div>
        <p className="label">Versions of this fact</p>
        <ul className="space-y-2 text-sm">
          {data.versions.map((v) => (
            <li key={v.id} className="rounded-lg bg-sand/60 p-2.5">
              <div className="flex flex-wrap items-center gap-2"><b>#{v.id}</b><Chip tone={v.status === 'active' ? 'sage' : 'plain'}>{v.status}</Chip><span className="text-xs text-muted">{dateTime(v.valid_from)}{v.valid_to ? ` to ${dateTime(v.valid_to)}` : ' to now'}</span></div>
              <p className="mt-1">{v.text}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="label">What happened</p>
        <ul className="space-y-1.5 text-sm">
          {data.events.map((e, i) => <li key={i} className="flex flex-wrap gap-x-2"><Chip>{e.action}</Chip><span>#{e.memory_id}</span><span className="text-muted">{e.actor}{e.detail ? `, ${e.detail}` : ''}</span><span className="text-xs text-muted ml-auto">{dateTime(e.ts)}</span></li>)}
        </ul>
      </div>
    </div>
  );
}

function MemoryCard({ m, onChanged, setMsg }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text);
  const [tier, setTier] = useState(m.tier);
  const [tierName, tone] = TIER[m.tier];

  const save = async () => {
    try { await api.put(`/api/memories/${m.id}`, { text, tier: Number(tier) }); setEditing(false); setMsg({ tone: 'sage', t: 'Saved as a new version. The old one is kept in the history.' }); onChanged(); }
    catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  };
  const retract = async () => {
    if (!window.confirm('Forget this? The words of every version of this fact are erased and cannot be recovered. Only a note that it was retracted remains.')) return;
    try { await api.del(`/api/memories/${m.id}`); setMsg({ tone: 'sage', t: 'Forgotten.' }); onChanged(); } catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  };

  return (
    <Card className={`p-4 ${m.status === 'superseded' ? 'opacity-80' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <Chip tone="plain">{m.kind}</Chip><Chip tone="plain">{m.predicate.replace(/_/g, ' ')}</Chip><Chip tone={tone}>{tierName}</Chip>
        {m.status !== 'active' && <Chip tone="plain">{m.status}</Chip>}
        <span className="text-xs text-muted ml-auto">{Math.round(m.confidence * 100)}% sure</span>
      </div>
      {editing ? (
        <div className="space-y-3">
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <Field label="Privacy tier" hint="You can make it stricter. It cannot be looser than where it came from."><select className="input !w-auto" value={tier} onChange={(e) => setTier(e.target.value)}>{[0, 1, 2].map((t) => <option key={t} value={t}>{TIER[t][0]}</option>)}</select></Field>
          <div className="flex gap-2"><Btn onClick={save}>Save new version</Btn><Btn kind="ghost" onClick={() => { setEditing(false); setText(m.text); setTier(m.tier); }}>Cancel</Btn></div>
        </div>
      ) : <p className="text-[1.05rem]">{m.text}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted">
        <span>{dateTime(m.valid_from)}{m.valid_to ? ` to ${dateTime(m.valid_to)}` : ' to now'}</span><span>by {m.created_by}</span>
        {m.sources.map((s, i) => <Chip key={i}>{sourceLabel(s)}</Chip>)}
      </div>
      {!editing && (
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn kind="ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Hide history' : 'History'}</Btn>
          {m.status === 'active' && <Btn kind="ghost" onClick={() => setEditing(true)}>Edit</Btn>}
          <Btn kind="danger" onClick={retract}>Forget</Btn>
        </div>
      )}
      {open && <History id={m.id} />}
    </Card>
  );
}

// Admin: see what Memora knows about a patient, where each memory came from, and correct or forget it.
export default function Memory({ pid }) {
  const [f, setF] = useState({ q: '', status: 'active', kind: '', asOf: '' });
  const [applied, setApplied] = useState(f);
  const [adding, setAdding] = useState(false);
  const [nm, setNm] = useState({ kind: 'fact', predicate: 'manual', text: '', tier: 1, reason: '' });
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const qs = new URLSearchParams();
  if (applied.q) qs.set('q', applied.q);
  if (applied.kind) qs.set('kind', applied.kind);
  if (applied.asOf) qs.set('asOf', new Date(applied.asOf).toISOString()); else qs.set('status', applied.status);
  qs.set('limit', '200');
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/patients/${pid}/memories?${qs}`), [pid, JSON.stringify(applied)]);

  const rebuild = async () => {
    setMsg(null);
    try { const r = await api.post(`/api/patients/${pid}/memories/rebuild`); setMsg({ tone: 'sage', t: `Rebuilt from the patient file, log arena and care logs: ${r.created} added, ${r.superseded} replaced or closed, ${r.unchanged} unchanged.` }); reload(); }
    catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  };
  const add = async () => {
    setMsg(null);
    try { await api.post(`/api/patients/${pid}/memories`, { ...nm, tier: Number(nm.tier) }); setNm({ kind: 'fact', predicate: 'manual', text: '', tier: 1, reason: '' }); setAdding(false); setMsg({ tone: 'sage', t: 'Memory added.' }); reload(); }
    catch (e) { setMsg({ tone: 'terra', t: e.message === 'reason_required' || e.message === 'sources_required' ? 'Say why you are adding it (for example "told by the family").' : e.message }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto"><H2 hint="What Memora knows, in small dated statements. Each one shows where it came from. Tier 0 memories are never sent to an AI model.">Memory</H2></div>
        <Btn kind="ghost" onClick={rebuild}>Rebuild from records</Btn>
        <Btn onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : '+ Add a memory'}</Btn>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}

      {adding && (
        <Card className="p-5 space-y-4 border-terra/40">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Kind"><select className="input" value={nm.kind} onChange={(e) => setNm({ ...nm, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="About" hint="A short label, like likes or routine"><input className="input" value={nm.predicate} onChange={(e) => setNm({ ...nm, predicate: e.target.value })} /></Field>
            <Field label="Privacy tier"><select className="input" value={nm.tier} onChange={(e) => setNm({ ...nm, tier: e.target.value })}>{[0, 1, 2].map((t) => <option key={t} value={t}>{TIER[t][0]}</option>)}</select></Field>
          </div>
          <Field label="The memory, in plain words"><textarea className="input" rows={2} value={nm.text} onChange={(e) => setNm({ ...nm, text: e.target.value })} /></Field>
          <Field label="Why are you adding it?" hint="Required. It becomes the memory's source."><input className="input" value={nm.reason} onChange={(e) => setNm({ ...nm, reason: e.target.value })} placeholder="e.g. told by the family on 27 Nov" /></Field>
          <Btn onClick={add}>Add memory</Btn>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1"><label className="label">Search</label><input className="input" value={f.q} onChange={(e) => set('q', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setApplied(f)} placeholder="e.g. calm, medicine" /></div>
          <div><label className="label">Kind</label><select className="input !w-auto" value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="">All</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
          <div><label className="label">Status</label><select className="input !w-auto" value={f.status} disabled={Boolean(f.asOf)} onChange={(e) => set('status', e.target.value)}><option value="active">Current</option><option value="superseded">Replaced</option><option value="all">All</option></select></div>
          <div><label className="label">What was true on</label><input className="input !w-auto" type="datetime-local" value={f.asOf} onChange={(e) => set('asOf', e.target.value)} /></div>
          <Btn onClick={() => setApplied(f)}>Apply</Btn>
          {(f.asOf) && <Btn kind="ghost" onClick={() => { const n = { ...f, asOf: '' }; setF(n); setApplied(n); }}>Back to now</Btn>}
        </div>
        {applied.asOf && <p className="text-xs text-muted mt-2">Showing what was true on {dateTime(applied.asOf)}. <button className="underline" onClick={() => set('asOf', toLocal(new Date()))}>Use now</button></p>}
      </Card>

      {loading ? <p className="text-muted">Loading…</p> : error ? <Notice tone="terra">{error.message}</Notice> : !data.length ? (
        <Card className="p-8 text-center text-muted">No memories match. If the patient file has content, press &ldquo;Rebuild from records&rdquo;.</Card>
      ) : (
        <>
          <p className="text-sm text-muted">{data.length} memor{data.length === 1 ? 'y' : 'ies'}</p>
          <div className="grid gap-4 lg:grid-cols-2">{data.map((m) => <MemoryCard key={m.id} m={m} onChanged={reload} setMsg={setMsg} />)}</div>
        </>
      )}
    </div>
  );
}
