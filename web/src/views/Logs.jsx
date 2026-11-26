import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Chip, Field, H2, Notice, KINDS, LABELS, dateTime, dayLabel, useAsync } from '../ui.jsx';

// readOnly = the Memora team's oversight view (no add form, no delete).
export default function Logs({ pid, readOnly = false }) {
  const [kind, setKind] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/patients/${pid}/logs?limit=100${kind ? `&kind=${kind}` : ''}`), [pid, kind]);
  const [f, setF] = useState({ kind: 'note', text: '' });
  const [err, setErr] = useState('');

  const add = async () => {
    setErr('');
    if (!f.text.trim()) return setErr('Write something first.');
    if (f.kind === 'behaviour') return setErr('Use the Behaviour tab for behaviour, so it keeps its category and strength.');
    try { await api.post(`/api/patients/${pid}/logs`, { kind: f.kind, text: f.text }); setF({ ...f, text: '' }); reload(); }
    catch (e) { setErr(e.message); }
  };
  const remove = async (id) => { if (window.confirm('Delete this log?')) { await api.del(`/api/logs/${id}`); reload(); } };

  const groups = [];
  for (const l of data || []) {
    const d = dayLabel(l.ts);
    if (!groups.length || groups[groups.length - 1].d !== d) groups.push({ d, items: [] });
    groups[groups.length - 1].items.push(l);
  }

  return (
    <div className={`grid gap-6 ${readOnly ? '' : 'lg:grid-cols-[1fr_20rem]'}`}>
      <div>
        <div className="flex flex-wrap gap-2 mb-4">
          {['', ...KINDS].map((k) => (
            <button key={k || 'all'} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${kind === k ? 'bg-terra text-white border-terra' : 'bg-card border-line hover:bg-sand'}`}>{k ? LABELS[k] : 'All'}</button>
          ))}
        </div>
        {loading ? <p className="text-muted">Loading…</p> : error ? <Notice tone="terra">{error.message}</Notice> : !groups.length ? <Card className="p-8 text-center text-muted">Nothing here yet.</Card> : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.d}>
                <h3 className="font-display text-lg font-bold mb-2">{g.d}</h3>
                <Card className="divide-y divide-line">
                  {g.items.map((l) => (
                    <div key={l.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={l.kind === 'behaviour' ? 'terra' : l.kind === 'incident' ? 'gold' : 'plain'}>{LABELS[l.kind]}{l.category ? ` · ${LABELS[l.category]}` : ''}</Chip>
                        {l.severity && <Chip tone="gold">{l.severity}/5</Chip>}
                        <span className="text-xs text-muted ml-auto">{dateTime(l.ts)}{l.logged_by ? ` · ${l.logged_by}` : ''}</span>
                      </div>
                      <p className="mt-1">{l.text}</p>
                      {(l.trigger_text || l.helped) && <p className="text-sm text-muted">{l.trigger_text && <>Trigger: {l.trigger_text}. </>}{l.helped && <>Helped: {l.helped}.</>}</p>}
                      {!readOnly && <button className="text-xs text-terra hover:underline mt-1" onClick={() => remove(l.id)}>Delete</button>}
                    </div>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>

      {!readOnly && <Card className="p-5 self-start lg:sticky lg:top-4">
        <H2>Add a log</H2>
        <div className="space-y-3">
          <Field label="Type">
            <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.filter((k) => k !== 'behaviour').map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}</select>
          </Field>
          <Field label="Details"><textarea className="input" rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="e.g. Evening tablet taken with dinner" /></Field>
          {err && <Notice tone="terra">{err}</Notice>}
          <Btn className="w-full" onClick={add}>Add log</Btn>
          <p className="text-xs text-muted">For behaviour, use the Behaviour tab.</p>
        </div>
      </Card>}
    </div>
  );
}
