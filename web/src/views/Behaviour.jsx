import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Chip, Chips, Field, H2, Notice, LABELS, CATEGORIES, dateTime, useAsync } from '../ui.jsx';

export function BehaviourSummary({ pid }) {
  const { data, loading, error } = useAsync(() => api.get(`/api/patients/${pid}/behaviour-summary`), [pid]);
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  const { categories = [], top_triggers = [], top_helped = [] } = data;
  if (!categories.length) return <p className="text-muted">No behaviour logged in the last 8 weeks.</p>;
  const max = Math.max(1, ...categories.map((c) => c.current));
  const change = (c) => (c.previous === 0 ? (c.current ? 'new this period' : '') : c.current > c.previous ? `up from ${c.previous}` : c.current < c.previous ? `down from ${c.previous}` : 'same as before');
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {categories.map((c) => (
          <div key={c.category}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-semibold">{LABELS[c.category]}</span>
              <span className="text-muted">{c.current} in 4 weeks · {change(c)}{c.avg_severity ? ` · avg ${c.avg_severity}/5` : ''}</span>
            </div>
            <div className="h-3 rounded-full bg-sand overflow-hidden"><div className="h-full rounded-full bg-terra" style={{ width: `${(c.current / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      {top_triggers.length > 0 && <div><p className="label">What tended to set it off</p><div className="flex flex-wrap gap-2">{top_triggers.map((t) => <Chip key={t.text} tone="terra">{t.text} · {t.count}</Chip>)}</div></div>}
      {top_helped.length > 0 && <div><p className="label">What helped</p><div className="flex flex-wrap gap-2">{top_helped.map((t) => <Chip key={t.text} tone="sage">{t.text} · {t.count}</Chip>)}</div></div>}
      <p className="text-xs text-muted">These are counts of what was logged, compared with the four weeks before. They describe, and do not diagnose.</p>
    </div>
  );
}

const SEV = ['Mild', 'Noticeable', 'Upsetting', 'Hard', 'Severe'];

export default function Behaviour({ pid }) {
  const logs = useAsync(() => api.get(`/api/patients/${pid}/logs?kind=behaviour&limit=30`), [pid]);
  const [f, setF] = useState({ category: 'mood', severity: 2, text: '', trigger_text: '', helped: '', ts: '', logged_by: (() => { try { return localStorage.getItem('memora_by') || ''; } catch { return ''; } })() });
  const [err, setErr] = useState('');
  const [summaryKey, setSummaryKey] = useState(0);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setErr('');
    if (!f.text.trim()) return setErr('Describe what you saw.');
    try {
      try { localStorage.setItem('memora_by', f.logged_by); } catch { /* ignore */ }
      await api.post(`/api/patients/${pid}/logs`, { ...f, kind: 'behaviour', ts: f.ts ? new Date(f.ts).toISOString() : undefined });
      setF((s) => ({ ...s, text: '', trigger_text: '', helped: '', ts: '' }));
      logs.reload(); setSummaryKey((k) => k + 1);
    } catch (e) { setErr(e.message); }
  };
  const remove = async (id) => { if (window.confirm('Delete this entry?')) { await api.del(`/api/logs/${id}`); logs.reload(); setSummaryKey((k) => k + 1); } };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card className="p-6">
          <H2 hint="A short note each time something stands out. It builds the picture over time.">Log behaviour</H2>
          <div className="space-y-4">
            <Field label="What kind?">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" onClick={() => set('category', c)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${f.category === c ? 'bg-terra text-white border-terra' : 'bg-card border-line hover:bg-sand'}`}>{LABELS[c]}</button>
                ))}
              </div>
            </Field>
            <Field label="How strong was it?">
              <div className="grid grid-cols-5 gap-2">
                {SEV.map((s, i) => (
                  <button key={s} type="button" onClick={() => set('severity', i + 1)}
                    className={`rounded-xl border py-2 text-xs font-semibold ${f.severity === i + 1 ? 'bg-terra text-white border-terra' : 'bg-card border-line hover:bg-sand'}`}>
                    <span className="block text-lg leading-none">{i + 1}</span>{s}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="What happened?"><textarea className="input" rows={3} value={f.text} onChange={(e) => set('text', e.target.value)} placeholder="In your own words" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What seemed to set it off?"><input className="input" value={f.trigger_text} onChange={(e) => set('trigger_text', e.target.value)} placeholder="Optional" /></Field>
              <Field label="What helped?"><input className="input" value={f.helped} onChange={(e) => set('helped', e.target.value)} placeholder="Optional" /></Field>
              <Field label="When?" hint="Leave empty for now"><input className="input" type="datetime-local" value={f.ts} onChange={(e) => set('ts', e.target.value)} /></Field>
              <Field label="Logged by"><input className="input" value={f.logged_by} onChange={(e) => set('logged_by', e.target.value)} placeholder="Your name" /></Field>
            </div>
            {err && <Notice tone="terra">{err}</Notice>}
            <Btn onClick={save}>Save to behaviour log</Btn>
          </div>
        </Card>
        <Card className="p-6"><H2 hint="Last 4 weeks against the 4 weeks before">Patterns you logged</H2><BehaviourSummary key={summaryKey} pid={pid} /></Card>
      </div>

      <Card className="p-6 self-start">
        <H2>Recent behaviour entries</H2>
        {logs.loading ? <p className="text-muted">Loading…</p> : !logs.data?.length ? <p className="text-muted">Nothing logged yet.</p> : (
          <ul className="divide-y divide-line">
            {logs.data.map((l) => (
              <li key={l.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Chip tone="terra">{LABELS[l.category]}</Chip>
                  {l.severity && <Chip tone="gold">{l.severity}/5</Chip>}
                  <span className="text-xs text-muted ml-auto">{dateTime(l.ts)}</span>
                </div>
                <p>{l.text}</p>
                {(l.trigger_text || l.helped) && <p className="text-sm text-muted mt-1">{l.trigger_text && <>Trigger: {l.trigger_text}. </>}{l.helped && <>Helped: {l.helped}.</>}</p>}
                <div className="flex justify-between mt-1"><span className="text-xs text-muted">{l.logged_by}</span><button className="text-xs text-terra hover:underline" onClick={() => remove(l.id)}>Delete</button></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
