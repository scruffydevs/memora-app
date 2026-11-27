import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Field, H2, Notice, useAsync } from '../ui.jsx';

// Admin: named places with coordinates. The Live tab shows how far the phone is from them.
export default function Places({ pid }) {
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/patients/${pid}/places`), [pid]);
  const [f, setF] = useState({ label: 'Home', lat: '', lon: '', radius_m: 60 });
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const here = () => {
    if (!('geolocation' in navigator)) return setMsg({ tone: 'terra', t: 'This browser has no location access.' });
    navigator.geolocation.getCurrentPosition((p) => { set('lat', p.coords.latitude.toFixed(6)); set('lon', p.coords.longitude.toFixed(6)); setMsg({ tone: 'sage', t: `Used your current location, accurate to about ${Math.round(p.coords.accuracy)} m.` }); },
      (e) => setMsg({ tone: 'terra', t: `Location: ${e.message}` }), { enableHighAccuracy: true, timeout: 15000 });
  };
  const add = async () => {
    setMsg(null);
    try { await api.post(`/api/patients/${pid}/places`, f); setF({ label: '', lat: '', lon: '', radius_m: 60 }); reload(); } catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  };
  const del = async (p) => { if (window.confirm(`Remove ${p.label}?`)) { await api.del(`/api/places/${p.id}`); reload(); } };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-6">
        <H2 hint="Places the patient goes: home, the park, the pharmacy. Coordinates are sensitive (Tier 0) and are never sent to an AI model.">Add a place</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className="input" value={f.label} onChange={(e) => set('label', e.target.value)} /></Field>
          <Field label="Radius in metres" hint="Inside this circle counts as being there"><input className="input" type="number" min="10" max="5000" value={f.radius_m} onChange={(e) => set('radius_m', e.target.value)} /></Field>
          <Field label="Latitude"><input className="input" value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="12.9716" inputMode="decimal" /></Field>
          <Field label="Longitude"><input className="input" value={f.lon} onChange={(e) => set('lon', e.target.value)} placeholder="77.5946" inputMode="decimal" /></Field>
        </div>
        {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.t}</Notice></div>}
        <div className="flex flex-wrap gap-2 mt-4"><Btn kind="ghost" onClick={here}>Use my current location</Btn><Btn onClick={add}>Add place</Btn></div>
      </Card>
      {loading ? <p className="text-muted">Loading…</p> : error ? <Notice tone="terra">{error.message}</Notice> : !data.length ? <Card className="p-8 text-center text-muted">No places yet.</Card> : (
        <Card className="divide-y divide-line">
          {data.map((p) => (
            <div key={p.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="mr-auto"><p className="font-semibold">{p.label}</p><p className="text-sm text-muted tabular-nums">{p.lat != null ? `${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)} · ${p.radius_m} m` : 'No coordinates'}</p></div>
              <Btn kind="danger" onClick={() => del(p)}>Remove</Btn>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
