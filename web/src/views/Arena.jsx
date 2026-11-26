import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Chip, Field, H2, Notice, TRAITS, TRAIT_LABEL, LEVELS, LEVEL_LABEL, levelTone, CONTEXTS, relLabel, contextPhrase, dateTime, useAsync } from '../ui.jsx';

const pad = (n) => String(n).padStart(2, '0');
const localNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const RELS = ['before', 'during', 'after'];
const MINS = [10, 15, 30, 45, 60, 90, 120];
const LEVEL_STYLE = { '-2': 'bg-terra text-white border-terra', '-1': 'bg-tterra text-terra border-terra/40', 0: 'bg-sand text-ink border-line', 1: 'bg-tsage text-sage border-sage/40', 2: 'bg-sage text-white border-sage' };

function Bar({ v }) {
  const w = (Math.abs(v) / 2) * 50;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-sand">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <div className={`absolute inset-y-0 rounded-full ${v < 0 ? 'bg-terra' : 'bg-sage'}`} style={{ width: `${w}%`, left: v < 0 ? `${50 - w}%` : '50%' }} />
    </div>
  );
}

function MedicineCompare({ pid, refreshKey }) {
  const { data, loading, error } = useAsync(() => api.get(`/api/patients/${pid}/observation-summary`), [pid, refreshKey]);
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  const rows = data.traits.filter((t) => t.before || t.after).sort((a, b) => ((b.before?.n || 0) + (b.after?.n || 0)) - ((a.before?.n || 0) + (a.after?.n || 0)));
  if (!rows.length) return <p className="text-muted">Add notes marked <b>before</b> and <b>after</b> a medicine and they will be compared here.</p>;
  const say = (r) => {
    if (!r.before || !r.after) return 'Needs a note both before and after';
    const d = r.after.avg - r.before.avg;
    return Math.abs(d) < 0.5 ? 'About the same' : d > 0 ? 'Noted as better after' : 'Noted as worse after';
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[7.5rem_1fr_1fr] gap-x-4 text-xs font-bold tracking-wider text-muted"><span /> <span>BEFORE</span><span>AFTER</span></div>
      {rows.map((r) => (
        <div key={r.trait} className="grid grid-cols-[7.5rem_1fr_1fr] gap-x-4 gap-y-1 items-center">
          <span className="font-semibold text-sm">{TRAIT_LABEL[r.trait]}</span>
          {['before', 'after'].map((k) => (
            <div key={k}>{r[k] ? <><Bar v={r[k].avg} /><span className="text-xs text-muted">{r[k].avg > 0 ? '+' : ''}{r[k].avg} · {r[k].n} note{r[k].n > 1 ? 's' : ''}{r[k].n < 3 ? ' (few)' : ''}</span></> : <span className="text-xs text-muted">none</span>}</div>
          ))}
          <span className="col-span-3 text-xs text-muted -mt-0.5 mb-1">{say(r)}</span>
        </div>
      ))}
      <p className="text-xs text-muted">Average of your ratings against their usual, from -2 to +2, over the last 60 days. This shows what was written down. It does not show that a medicine caused a change, so share it with their doctor and let them judge.</p>
    </div>
  );
}

export default function Arena({ pid }) {
  const meds = useAsync(() => api.get(`/api/patients/${pid}/medicines`), [pid]);
  const [filter, setFilter] = useState('');
  const list = useAsync(() => api.get(`/api/patients/${pid}/observations?limit=60${filter ? `&context=${filter}` : ''}`), [pid, filter]);
  const [key, setKey] = useState(0);
  const [by] = useState(() => { try { return localStorage.getItem('memora_by') || ''; } catch { return ''; } });
  const [f, setF] = useState({ ts: localNow(), ctx: 'none', rel: 'before', mins: '', medicine_id: '', traits: {}, note: '', by });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [newMed, setNewMed] = useState({ name: '', dose: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setTrait = (t, patch) => setF((s) => ({ ...s, traits: { ...s.traits, [t]: { ...s.traits[t], ...patch } } }));
  const toggleTrait = (t) => setF((s) => { const n = { ...s.traits }; if (n[t]) delete n[t]; else n[t] = { v: null, detail: '' }; return { ...s, traits: n }; });
  const picked = Object.keys(f.traits);

  const save = async () => {
    setErr(''); setOk('');
    if (picked.some((t) => f.traits[t].v === null)) return setErr('Choose a level for each characteristic you picked.');
    if (!picked.length && !f.note.trim()) return setErr('Pick at least one characteristic, or write a note.');
    try { localStorage.setItem('memora_by', f.by); } catch { /* ignore */ }
    try {
      await api.post(`/api/patients/${pid}/observations`, {
        ts: f.ts ? new Date(f.ts).toISOString() : undefined, context_type: f.ctx, context_relation: f.ctx === 'none' ? null : f.rel,
        minutes_offset: f.ctx === 'none' || f.rel === 'during' || f.ctx === 'sleep' ? null : f.mins, medicine_id: f.ctx === 'medicine' && f.medicine_id ? Number(f.medicine_id) : null,
        note: f.note, logged_by: f.by, traits: picked.map((t) => ({ trait: t, vs_usual: f.traits[t].v, detail: f.traits[t].detail })),
      });
      setF((s) => ({ ...s, ts: localNow(), traits: {}, note: '', mins: '' }));
      setOk('Saved to the log.'); list.reload(); setKey((k) => k + 1);
    } catch (e) { setErr(e.message); }
  };
  const addMed = async () => {
    if (!newMed.name.trim()) return;
    try { const m = await api.post(`/api/patients/${pid}/medicines`, newMed); setNewMed({ name: '', dose: '' }); await meds.reload(); set('medicine_id', String(m.id)); } catch (e) { setErr(e.message); }
  };
  const remove = async (id) => { if (window.confirm('Delete this entry?')) { await api.del(`/api/observations/${id}`); list.reload(); setKey((k) => k + 1); } };

  const showMins = f.ctx !== 'none' && f.ctx !== 'sleep' && f.rel !== 'during';

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card className="p-6 space-y-6">
          <H2 hint="Note how they were, when, and what it was around. Small details help the doctor most.">Log arena</H2>

          <section>
            <p className="font-display text-lg font-bold mb-2">1. When did you notice it?</p>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input !w-auto" type="datetime-local" value={f.ts} onChange={(e) => set('ts', e.target.value)} />
              <Btn kind="ghost" onClick={() => set('ts', localNow())}>Now</Btn>
            </div>
          </section>

          <section>
            <p className="font-display text-lg font-bold mb-2">2. What was it around?</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {CONTEXTS.map(([k, l]) => (
                <button key={k} type="button" onClick={() => set('ctx', k)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${f.ctx === k ? 'bg-terra text-white border-terra' : 'bg-card border-line hover:bg-sand'}`}>{l}</button>
              ))}
            </div>
            {f.ctx !== 'none' && (
              <div className="rounded-xl bg-sand/60 border border-line p-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {RELS.map((r) => (
                    <button key={r} type="button" onClick={() => set('rel', r)} className={`rounded-xl border px-4 py-2 font-semibold ${f.rel === r ? 'bg-sage text-white border-sage' : 'bg-card border-line hover:bg-sand'}`}>{relLabel(f.ctx, r)}</button>
                  ))}
                </div>
                {showMins && (
                  <Field label="How long?" hint="Optional. Minutes before or after.">
                    <div className="flex flex-wrap items-center gap-2">
                      {MINS.map((m) => <button key={m} type="button" onClick={() => set('mins', f.mins === m ? '' : m)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${f.mins === m ? 'bg-sage text-white border-sage' : 'bg-card border-line hover:bg-sand'}`}>{m} min</button>)}
                      <input className="input !w-24" type="number" min="0" max="1440" placeholder="other" value={MINS.includes(f.mins) ? '' : f.mins} onChange={(e) => set('mins', e.target.value)} />
                    </div>
                  </Field>
                )}
                {f.ctx === 'medicine' && (
                  <Field label="Which medicine?">
                    <select className="input" value={f.medicine_id} onChange={(e) => set('medicine_id', e.target.value)}>
                      <option value="">Not sure or not listed</option>
                      {(meds.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.dose ? `, ${m.dose}` : ''}</option>)}
                    </select>
                    <div className="flex gap-2 mt-2">
                      <input className="input" placeholder="Add a medicine" value={newMed.name} onChange={(e) => setNewMed({ ...newMed, name: e.target.value })} />
                      <input className="input !w-32" placeholder="Dose" value={newMed.dose} onChange={(e) => setNewMed({ ...newMed, dose: e.target.value })} />
                      <Btn kind="ghost" onClick={addMed}>Add</Btn>
                    </div>
                  </Field>
                )}
              </div>
            )}
          </section>

          <section>
            <p className="font-display text-lg font-bold mb-1">3. What did you notice?</p>
            <p className="text-sm text-muted mb-3">Tap each one you want to describe, then say how it was <b>compared with their usual</b>.</p>
            <div className="flex flex-wrap gap-2">
              {TRAITS.map(([k, l, hint]) => (
                <button key={k} type="button" title={hint} onClick={() => toggleTrait(k)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${f.traits[k] ? 'bg-terra text-white border-terra' : 'bg-card border-line hover:bg-sand'}`}>{f.traits[k] ? '✓ ' : '+ '}{l}</button>
              ))}
            </div>
            <div className="space-y-3 mt-4">
              {picked.map((t) => {
                const meta = TRAITS.find((x) => x[0] === t);
                return (
                  <div key={t} className="rounded-xl border border-line bg-white p-4">
                    <div className="flex items-baseline justify-between gap-2"><b>{meta[1]}</b><span className="text-xs text-muted">{meta[2]}</span></div>
                    <div className="grid grid-cols-5 gap-1.5 mt-2">
                      {LEVELS.map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setTrait(t, { v })} className={`rounded-lg border py-2 text-xs font-semibold ${f.traits[t].v === v ? LEVEL_STYLE[v] : 'bg-card border-line hover:bg-sand'}`}>{l}</button>
                      ))}
                    </div>
                    <input className="input mt-2" placeholder="Detail, e.g. kept asking where her daughter was" value={f.traits[t].detail} onChange={(e) => setTrait(t, { detail: e.target.value })} />
                  </div>
                );
              })}
              {!picked.length && <p className="text-sm text-muted">Nothing picked yet.</p>}
            </div>
          </section>

          <section className="space-y-3">
            <Field label="Anything else?"><textarea className="input" rows={3} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="In your own words" /></Field>
            <Field label="Logged by"><input className="input sm:!w-72" value={f.by} onChange={(e) => set('by', e.target.value)} placeholder="Your name" /></Field>
            {err && <Notice tone="terra">{err}</Notice>}
            {ok && <Notice tone="sage">{ok}</Notice>}
            <Btn onClick={save}>Save to the log</Btn>
          </section>
        </Card>

        <Card className="p-6"><H2 hint="Notes made before a medicine against notes made after">Around medicine</H2><MedicineCompare pid={pid} refreshKey={key} /></Card>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {[['', 'All'], ...CONTEXTS.filter((c) => c[0] !== 'none')].map(([k, l]) => (
            <button key={k || 'all'} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${filter === k ? 'bg-terra text-white border-terra' : 'bg-card border-line hover:bg-sand'}`}>{l}</button>
          ))}
        </div>
        {list.loading ? <p className="text-muted">Loading…</p> : list.error ? <Notice tone="terra">{list.error.message}</Notice> : !list.data.length ? <Card className="p-8 text-center text-muted">Nothing logged here yet.</Card> : (
          <div className="space-y-3">
            {list.data.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={o.context_type === 'none' ? 'plain' : 'gold'}>{contextPhrase(o)}</Chip>
                  <span className="text-xs text-muted ml-auto">{dateTime(o.ts)}{o.logged_by ? ` · ${o.logged_by}` : ''}</span>
                </div>
                {o.traits.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {o.traits.map((t) => (
                      <li key={t.trait}>
                        <div className="flex items-center gap-2"><span className="font-semibold">{TRAIT_LABEL[t.trait]}</span><Chip tone={levelTone(t.vs_usual)}>{LEVEL_LABEL[t.vs_usual]}</Chip></div>
                        {t.detail && <p className="text-sm text-muted">{t.detail}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {o.note && <p className="mt-3">{o.note}</p>}
                <button className="text-xs text-terra hover:underline mt-2" onClick={() => remove(o.id)}>Delete</button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
