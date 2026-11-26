import React, { useEffect, useState } from 'react';
import { photoUrl } from './api.js';

export const Card = ({ children, className = '' }) => (
  <div className={`bg-card border border-line rounded-2xl shadow-soft ${className}`}>{children}</div>
);

export const H2 = ({ children, hint }) => (
  <div className="mb-3">
    <h2 className="font-display text-2xl font-bold">{children}</h2>
    {hint && <p className="text-muted text-sm mt-0.5">{hint}</p>}
  </div>
);

const BTN = {
  primary: 'bg-terra text-white hover:bg-terra2',
  sage: 'bg-sage text-white hover:opacity-90',
  ghost: 'bg-card text-ink border border-line hover:bg-sand',
  danger: 'bg-card text-terra border border-terra/40 hover:bg-tterra',
};
export const Btn = ({ kind = 'primary', className = '', ...p }) => (
  <button {...p} className={`rounded-xl px-4 py-2.5 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${BTN[kind]} ${className}`} />
);

const CHIP = { terra: 'bg-tterra text-terra border-terra/30', sage: 'bg-tsage text-sage border-sage/30', gold: 'bg-tgold text-[#8A5A00] border-gold/40', plain: 'bg-sand text-muted border-line' };
export const Chip = ({ tone = 'plain', children, onRemove }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold ${CHIP[tone]}`}>
    {children}
    {onRemove && <button type="button" onClick={onRemove} aria-label="Remove" className="ml-1 opacity-70 hover:opacity-100">×</button>}
  </span>
);

export const Chips = ({ items = [], tone, empty = 'Nothing added yet' }) =>
  items.length ? <div className="flex flex-wrap gap-2">{items.map((t) => <Chip key={t} tone={tone}>{t}</Chip>)}</div> : <p className="text-muted text-sm">{empty}</p>;

export function TagInput({ value, onChange, placeholder, tone = 'plain' }) {
  const [draft, setDraft] = useState('');
  const add = () => { const t = draft.trim(); if (t && !value.includes(t)) onChange([...value, t]); setDraft(''); };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">{value.map((t) => <Chip key={t} tone={tone} onRemove={() => onChange(value.filter((x) => x !== t))}>{t}</Chip>)}</div>
      <div className="flex gap-2">
        <input className="input" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} />
        <Btn type="button" kind="ghost" onClick={add}>Add</Btn>
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }) => (
  <div>
    <label className="label">{label}</label>
    {children}
    {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
  </div>
);

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`mt-1 h-7 w-12 shrink-0 rounded-full border transition ${checked ? 'bg-sage border-sage' : 'bg-sand border-line'}`}>
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      <span><span className="font-semibold block">{label}</span>{hint && <span className="text-sm text-muted block">{hint}</span>}</span>
    </label>
  );
}

export function Avatar({ photoId, name = '?', size = 72, version = 0 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (photoId) photoUrl(photoId).then((u) => live && setSrc(u)).catch(() => {});
    return () => { live = false; };
  }, [photoId, version]);
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return src
    ? <img src={src} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-white shadow-soft shrink-0" />
    : <div style={{ width: size, height: size, fontSize: size / 2.6 }} className="rounded-full bg-gradient-to-br from-terra2 to-terra text-white font-display font-bold flex items-center justify-center shadow-soft shrink-0">{initials}</div>;
}

export const dateTime = (ts) => new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const dayLabel = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
export const LABELS = { sleep: 'Sleep', mood: 'Mood', agitation: 'Agitation', wandering: 'Wandering', eating: 'Eating', confusion: 'Confusion', repeated_question: 'Repeated questions', social: 'Social', other: 'Other', behaviour: 'Behaviour', medicine: 'Medicine', meal: 'Meal', visit: 'Visit', incident: 'Incident', note: 'Note' };
export const CATEGORIES = ['sleep', 'mood', 'agitation', 'wandering', 'eating', 'confusion', 'repeated_question', 'social', 'other'];
export const KINDS = ['behaviour', 'medicine', 'meal', 'visit', 'incident', 'note'];

export const Notice = ({ tone = 'gold', children }) => (
  <div className={`rounded-xl border px-4 py-3 text-sm ${CHIP[tone]}`}>{children}</div>
);

export function useAsync(fn, deps) {
  const [state, set] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => live && set({ loading: false, data, error: null })).catch((error) => live && set({ loading: false, data: null, error }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
