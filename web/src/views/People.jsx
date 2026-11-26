import React, { useRef, useState } from 'react';
import { api, fileToDataUrl, forgetPhoto } from '../api.js';
import { Avatar, Btn, Card, Chip, Field, H2, Notice, Toggle, useAsync } from '../ui.jsx';

const BLANK = { name: '', relationship: '', mention: '', enrolled: false, consent_noted: false };

function Form({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Card className="p-5 border-terra/40">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Relationship"><input className="input" value={f.relationship || ''} onChange={(e) => set('relationship', e.target.value)} placeholder="e.g. daughter, neighbour, doctor" /></Field>
      </div>
      <div className="mt-4"><Field label="What to mention" hint="A gentle conversation starter, like a shared memory"><input className="input" value={f.mention || ''} onChange={(e) => set('mention', e.target.value)} /></Field></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Toggle checked={f.consent_noted} onChange={(v) => set('consent_noted', v)} label="This person agrees to be in Memora" hint="Required before a photo can be stored. Turning it off deletes their photo." />
        <Toggle checked={f.enrolled} onChange={(v) => set('enrolled', v)} label="Enrolled person" hint="Someone the patient knows. Recognition is planned, not built." />
      </div>
      <div className="flex gap-2 mt-5"><Btn onClick={() => f.name.trim() && onSave(f)}>Save person</Btn><Btn kind="ghost" onClick={onCancel}>Cancel</Btn></div>
    </Card>
  );
}

function Person({ c, pid, onChange, onEdit, setMsg }) {
  const file = useRef(null);
  const upload = async (e) => {
    const f0 = e.target.files?.[0]; e.target.value = '';
    if (!f0) return;
    try {
      await api.post(`/api/patients/${pid}/photos`, { contactId: c.id, label: c.name, dataUrl: await fileToDataUrl(f0) });
      if (c.photo_id) forgetPhoto(c.photo_id);
      setMsg({ tone: 'sage', t: `Photo of ${c.name} saved (encrypted).` }); onChange();
    } catch (er) { setMsg({ tone: 'terra', t: er.message }); }
  };
  const removePhoto = async () => { await api.del(`/api/photos/${c.photo_id}`); forgetPhoto(c.photo_id); onChange(); };
  const del = async () => { if (window.confirm(`Remove ${c.name} and their photo?`)) { await api.del(`/api/contacts/${c.id}`); onChange(); } };
  return (
    <Card className="p-5">
      <div className="flex gap-4">
        <Avatar photoId={c.photo_id} name={c.name} size={84} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-bold leading-tight">{c.name}</p>
          <p className="text-muted">{c.relationship || 'No relationship set'}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {c.enrolled && <Chip tone="sage">Enrolled</Chip>}
            <Chip tone={c.consent_noted ? 'gold' : 'plain'}>{c.consent_noted ? 'Consent noted' : 'No consent yet'}</Chip>
          </div>
        </div>
      </div>
      {c.mention && <p className="mt-3 text-sm"><span className="font-semibold text-muted">Mention: </span>{c.mention}</p>}
      <div className="flex flex-wrap gap-2 mt-4">
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={upload} />
        <Btn kind="ghost" onClick={() => file.current.click()}>{c.photo_id ? 'Change photo' : 'Add photo'}</Btn>
        {c.photo_id && <Btn kind="ghost" onClick={removePhoto}>Remove photo</Btn>}
        <Btn kind="ghost" onClick={onEdit}>Edit</Btn>
        <Btn kind="danger" onClick={del}>Delete</Btn>
      </div>
    </Card>
  );
}

export default function People({ pid }) {
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/patients/${pid}/contacts`), [pid]);
  const [editing, setEditing] = useState(null); // null | 'new' | contact
  const [msg, setMsg] = useState(null);

  const save = async (f) => {
    try {
      if (editing === 'new') await api.post(`/api/patients/${pid}/contacts`, f);
      else await api.put(`/api/contacts/${editing.id}`, f);
      setEditing(null); setMsg(null); reload();
    } catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto"><H2 hint="The people who matter, with a note on what to mention.">People</H2></div>
        <Btn onClick={() => setEditing('new')}>+ Add a person</Btn>
      </div>
      <Notice tone="gold">Photos are stored <b>encrypted</b>, only with consent, and are only shown here. <b>Face recognition is not built.</b> It is a planned feature that needs consent, platform and legal checks first.</Notice>
      {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}
      {editing && <Form initial={editing === 'new' ? BLANK : editing} onSave={save} onCancel={() => setEditing(null)} />}
      {loading ? <p className="text-muted">Loading…</p> : error ? <Notice tone="terra">{error.message}</Notice> : !data.length ? <Card className="p-8 text-center text-muted">No one added yet.</Card> : (
        <div className="grid gap-5 md:grid-cols-2">
          {data.map((c) => <Person key={c.id} c={c} pid={pid} onChange={reload} onEdit={() => setEditing(c)} setMsg={setMsg} />)}
        </div>
      )}
    </div>
  );
}
