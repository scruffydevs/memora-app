import React, { useEffect, useRef, useState } from 'react';
import { api, subscribe } from './api.js';
import { Btn, Card, Chip, H2, Notice, useAsync } from './ui.jsx';
import { Link } from './router.jsx';

// The backend showcase: what Memora is doing behind the screens, as it happens. Memora team only.
// Everything here is real: the feed is the server's own activity, and the memory search runs the real engine.
const KIND = {
  watch: ['Watch', 'sage'], live: ['Live', 'terra'], log: ['Care log', 'gold'], observation: ['Log arena', 'gold'],
  profile: ['Patient file', 'plain'], team: ['Team', 'plain'],
};
const clock = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Feed({ patients, onEvent }) {
  const [items, setItems] = useState([]);
  const [on, setOn] = useState(false);
  const name = (id) => patients.find((p) => p.id === id)?.name;

  useEffect(() => {
    let live = true;
    api.get('/api/admin/showcase/activity?limit=60').then((rows) => { if (live) setItems(rows.slice().reverse()); }).catch(() => {});
    const stop = subscribe('/api/admin/showcase/stream', {
      onOpen: () => setOn(true), onError: () => setOn(false),
      onMessage: (raw) => { const e = JSON.parse(raw); setItems((cur) => (cur.some((x) => x.id === e.id) ? cur : [e, ...cur].slice(0, 80))); onEvent?.(e); },
    });
    return () => { live = false; stop(); };
  }, []);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
        <div className="mr-auto"><p className="font-display text-xl font-bold">What the backend is doing</p><p className="text-sm text-muted">Each line is something the server just did. Counts and labels only, never the content of a record.</p></div>
        <Chip tone={on ? 'sage' : 'plain'}>{on ? 'Live' : 'Connecting'}</Chip>
      </div>
      {items.length === 0
        ? <p className="p-8 text-center text-muted">Nothing yet. Lines appear here when caregivers, the watch app or the team use Memora.</p>
        : (
          <ul className="divide-y divide-line max-h-[26rem] overflow-y-auto">
            {items.map((e) => {
              const [label, tone] = KIND[e.kind] || [e.kind, 'plain'];
              return (
                <li key={e.id} className="px-5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="tabular-nums text-muted w-[5.5rem] shrink-0">{clock(e.ts)}</span>
                  <Chip tone={tone}>{label}</Chip>
                  <span className="flex-1 min-w-[12rem]">{e.text}</span>
                  {e.patient_id && name(e.patient_id) && <span className="text-xs text-muted">{name(e.patient_id)}</span>}
                </li>
              );
            })}
          </ul>
        )}
    </Card>
  );
}

function Pipeline({ pid, tick }) {
  const { data, loading, error } = useAsync(() => api.get(`/api/patients/${pid}/data-overview`), [pid, tick]);
  if (loading && !data) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  const cats = data.categories.filter((c) => c.key !== 'memories');
  const mem = data.categories.find((c) => c.key === 'memories');
  const tone = { collected: 'sage', available: 'gold', off: 'terra' };
  return (
    <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
        {cats.map((c) => (
          <div key={c.key} className="rounded-xl border border-line bg-card p-3">
            <p className="text-xs text-muted leading-tight">{c.label}</p>
            <p className="font-display text-2xl font-bold tabular-nums mt-1">{c.count}<span className="text-xs font-body font-normal text-muted ml-1">{c.unit}</span></p>
            <div className="mt-1"><Chip tone={tone[c.state]}>{c.state === 'collected' ? 'Collected' : c.state === 'off' ? 'Needs consent' : 'Empty'}</Chip></div>
          </div>
        ))}
      </div>
      <div className="hidden lg:flex items-center text-3xl text-terra" aria-hidden="true">→</div>
      <div className="lg:hidden text-center text-3xl text-terra" aria-hidden="true">↓</div>
      <div className="rounded-xl border-2 border-terra/40 bg-tterra p-5 lg:w-64 flex flex-col justify-center">
        <p className="text-xs font-bold tracking-[0.2em] text-terra">MEMORY ENGINE</p>
        <p className="font-display text-4xl font-bold tabular-nums mt-1">{mem.count}</p>
        <p className="text-sm">current memories</p>
        <p className="text-xs text-muted mt-2">{data.tiers.t0} Tier 0 · {data.tiers.t1} Tier 1 · {data.tiers.t2} Tier 2</p>
        <p className="text-xs text-muted">{mem.detail[1]}, {mem.detail[2]}</p>
      </div>
    </div>
  );
}

const SAMPLES = ['calm', 'medicine', 'daughter', 'afternoon'];

function Search({ pid }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setRes(null); setErr(''); }, [pid]);

  async function run(text) {
    setBusy(true); setErr('');
    const t0 = performance.now();
    try {
      const rows = await api.get(`/api/patients/${pid}/memories?q=${encodeURIComponent(text)}&limit=8`);
      setRes({ q: text, rows, ms: Math.round(performance.now() - t0), words: [...new Set(text.toLowerCase().match(/[a-z]{3,}/g) || [])] });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <p className="font-display text-xl font-bold">Ask the memory engine</p>
        <p className="text-sm text-muted">Type a few words. The engine returns the memories that match, with where each one came from. This is keyword search today.</p>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="for example: what helps when she is upset" aria-label="Search memories" />
        <Btn type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</Btn>
      </form>
      <div className="flex flex-wrap gap-2">{SAMPLES.map((s) => <button key={s} type="button" className="rounded-full border border-line bg-sand px-3 py-1 text-sm font-semibold text-muted hover:text-ink" onClick={() => { setQ(s); run(s); }}>{s}</button>)}</div>
      {err && <Notice tone="terra">{err}</Notice>}
      {res && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{res.rows.length} memor{res.rows.length === 1 ? 'y' : 'ies'} in {res.ms} ms{res.words.length ? ` for ${res.words.map((w) => `“${w}”`).join(', ')}` : ' (no words: showing the most confident)'}</p>
          {res.rows.map((m) => (
            <div key={m.id} className="rounded-xl border border-line bg-card p-4">
              <p>{m.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip tone="terra">{m.kind}</Chip><Chip>{`Tier ${m.tier}`}</Chip><Chip>{`${Math.round(m.confidence * 100)}% confident`}</Chip>
                {m.sources.map((s, i) => <Chip key={i} tone="sage">{`from ${String(s.table).replace(/_/g, ' ')}${s.note ? `: ${s.note}` : ''}`}</Chip>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Showcase({ me, onSignOut }) {
  const list = useAsync(() => api.get('/api/admin/patients'), []);
  const patients = list.data || [];
  const [pid, setPid] = useState(null);
  const current = pid ?? patients[0]?.id ?? null;
  // When the backend does something, refresh the numbers (at most once a second).
  const [tick, setTick] = useState(0);
  const timer = useRef(null);
  const bump = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setTick((t) => t + 1), 800); };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-5">
        <div className="mr-auto">
          <Link to="/admin" className="inline-block py-2 text-sm text-terra font-semibold hover:underline">← Team console</Link>
          <div className="font-display text-3xl font-bold leading-tight">Backend showcase</div>
        </div>
        <span className="text-sm text-muted hidden sm:inline">{me.user.email}</span>
        <Btn kind="ghost" onClick={onSignOut}>Sign out</Btn>
      </header>

      <div className="space-y-8">
        <Feed patients={patients} onEvent={bump} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <H2 hint="What goes in, and what the memory engine holds for this person.">How the data flows</H2>
            {patients.length > 0 && (
              <select className="input !w-auto ml-auto" value={current ?? ''} onChange={(e) => setPid(Number(e.target.value))} aria-label="Patient">
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          {current ? <Pipeline pid={current} tick={tick} /> : <Card className="p-8 text-center text-muted">Create a patient account first.</Card>}
        </section>

        {current && <Search pid={current} />}
        <p className="text-xs text-muted text-center">This page shows the selected patient's records on screen. Use a demo patient when presenting.</p>
      </div>
    </div>
  );
}
