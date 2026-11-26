import React, { useEffect, useRef, useState } from 'react';
import { api, fileToDataUrl } from '../api.js';
import { Avatar, Btn, Card, Field, H2, Notice, TagInput, useAsync } from '../ui.jsx';

export default function Profile({ pid }) {
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/patients/${pid}/profile`), [pid]);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [ver, setVer] = useState(0);
  const file = useRef(null);
  useEffect(() => { if (data) setF(data.profile); }, [data]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  if (loading || !f) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;

  const save = async () => {
    setMsg(null);
    try { await api.put(`/api/patients/${pid}/profile`, f); setMsg({ tone: 'sage', t: 'Saved.' }); reload(); }
    catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  };
  const upload = async (e) => {
    const file0 = e.target.files?.[0]; e.target.value = '';
    if (!file0) return;
    try {
      await api.post(`/api/patients/${pid}/photos`, { label: 'profile', dataUrl: await fileToDataUrl(file0) });
      setMsg({ tone: 'sage', t: 'Photo saved (encrypted).' }); setVer((v) => v + 1); reload();
    } catch (er) { setMsg({ tone: 'terra', t: er.message }); }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar photoId={data.photoId} name={f.preferred_name || data.patient.name} size={96} version={ver} />
          <div className="flex-1 min-w-[14rem]">
            <p className="font-display text-2xl font-bold">{data.patient.name}</p>
            <p className="text-sm text-muted mb-3">A photo helps you and visitors. It is stored encrypted, with consent, and is not used for recognition.</p>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={upload} />
            <Btn kind="ghost" disabled={!f.consent_photos || !data.encryptionReady} onClick={() => file.current.click()}>Add or change photo</Btn>
            {!f.consent_photos && <p className="text-xs text-muted mt-2">Photo consent is off. Turn it on in Privacy.</p>}
            {f.consent_photos && !data.encryptionReady && <p className="text-xs text-terra mt-2">Photo storage is not set up on the server yet.</p>}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <H2 hint="What a new caregiver or a paramedic would need first. Sensitive: kept in the vault, never sent to an AI model.">Care essentials</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conditions" hint="As told by their doctors or family"><textarea className="input" rows={2} value={f.conditions || ''} onChange={(e) => set('conditions', e.target.value)} /></Field>
          <Field label="Allergies"><textarea className="input" rows={2} value={f.allergies || ''} onChange={(e) => set('allergies', e.target.value)} /></Field>
          <Field label="Emergency contact"><input className="input" value={f.emergency_name || ''} onChange={(e) => set('emergency_name', e.target.value)} placeholder="Name and relationship" /></Field>
          <Field label="Emergency phone"><input className="input" value={f.emergency_phone || ''} onChange={(e) => set('emergency_phone', e.target.value)} inputMode="tel" /></Field>
          <Field label="Clinician"><input className="input" value={f.clinician_name || ''} onChange={(e) => set('clinician_name', e.target.value)} placeholder="Doctor's name" /></Field>
          <Field label="Clinic or hospital"><input className="input" value={f.clinic || ''} onChange={(e) => set('clinic', e.target.value)} /></Field>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <H2 hint="Write it with them where you can. Short and kind is enough.">Who they are</H2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name they like to be called"><input className="input" value={f.preferred_name || ''} onChange={(e) => set('preferred_name', e.target.value)} /></Field>
          <Field label="Languages"><input className="input" value={f.language || ''} onChange={(e) => set('language', e.target.value)} placeholder="e.g. English and Kannada" /></Field>
          <Field label="Age band" hint="No exact birth date needed"><input className="input" value={f.age_band || ''} onChange={(e) => set('age_band', e.target.value)} placeholder="e.g. 70s" /></Field>
        </div>
        <Field label="Their story" hint="Work, family, what they are proud of, what matters to them"><textarea className="input" rows={4} value={f.background || ''} onChange={(e) => set('background', e.target.value)} /></Field>
        <Field label="Character"><TagInput tone="gold" value={f.traits} onChange={(v) => set('traits', v)} placeholder="e.g. gentle, proud, loves a joke" /></Field>
      </Card>

      <Card className="p-6 space-y-5">
        <H2 hint="This is what a new caregiver most needs to know.">Likes, calm and triggers</H2>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Likes"><TagInput tone="sage" value={f.likes} onChange={(v) => set('likes', v)} placeholder="e.g. old film songs" /></Field>
          <Field label="Dislikes"><TagInput tone="terra" value={f.dislikes} onChange={(v) => set('dislikes', v)} placeholder="e.g. loud television" /></Field>
          <Field label="What calms them"><TagInput tone="sage" value={f.calming} onChange={(v) => set('calming', v)} placeholder="e.g. quiet music" /></Field>
          <Field label="What tends to upset them"><TagInput tone="terra" value={f.triggers} onChange={(v) => set('triggers', v)} placeholder="e.g. being rushed" /></Field>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <H2>Daily life</H2>
        <Field label="How to talk with them"><textarea className="input" rows={3} value={f.communication || ''} onChange={(e) => set('communication', e.target.value)} placeholder="e.g. speak slowly, one question at a time, offer a choice of two" /></Field>
        <Field label="A usual day"><textarea className="input" rows={3} value={f.routine || ''} onChange={(e) => set('routine', e.target.value)} placeholder="e.g. wakes at 7, tea, walk, lunch at 1…" /></Field>
      </Card>

      <div className="flex items-center gap-4 sticky bottom-4">
        <Btn onClick={save}>Save profile</Btn>
        {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}
      </div>
    </div>
  );
}
