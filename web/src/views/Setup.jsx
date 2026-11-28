import React, { useMemo, useRef, useState } from 'react';
import { api, fileToDataUrl } from '../api.js';
import { Avatar, Btn, Card, Chip, Notice, TagInput, Toggle, useAsync } from '../ui.jsx';
import { CARDS, fieldKey, isEmpty, labelFor, FIELD_BY_KEY } from '../../../shared/intake.js';

// Patient onboarding: one card at a time. Every question can be skipped, answers are saved as you go, and the
// answers fill in the patient file. The last step writes the portfolio.
const chipBtn = (on) => `min-h-[44px] rounded-full border px-4 py-2 font-semibold transition ${on ? 'bg-tterra text-terra border-terra' : 'bg-card text-ink border-line hover:bg-sand'}`;

function Choices({ options, value, onChange, multi, grid }) {
  const has = (o) => (multi ? (value || []).includes(o) : value === o);
  const click = (o) => {
    if (multi) { const cur = value || []; onChange(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]); } else onChange(value === o ? '' : o);
  };
  return <div className={grid ? 'grid grid-cols-2 sm:grid-cols-4 gap-2' : 'flex flex-wrap gap-2'}>{options.map((o) => <button key={o} type="button" aria-pressed={has(o)} className={`${chipBtn(has(o))} ${grid ? 'justify-center text-sm sm:text-base' : ''}`} onClick={() => click(o)}>{o}</button>)}</div>;
}

function Question({ f, value, onChange }) {
  switch (f.type) {
    case 'text': return <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number': return <input className="input !w-32" type="number" inputMode="numeric" min={f.min} max={f.max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'longtext': return <textarea className="input min-h-[7rem]" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'month': return <input className="input !w-56" type="month" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'choice': return <Choices options={f.options} value={value} onChange={onChange} />;
    case 'multi': return <Choices options={f.options} value={value} onChange={onChange} multi />;
    case 'scale': return <Choices options={f.options} value={value} onChange={onChange} grid />;
    case 'tags': return <TagInput value={value || []} onChange={onChange} placeholder="Type one, then press Enter" />;
    default: return null;
  }
}

function PhotoBlock({ pid, consentSaved }) {
  const { data, reload } = useAsync(() => api.get(`/api/patients/${pid}/profile`), [pid, consentSaved]);
  const [ver, setVer] = useState(0);
  const [msg, setMsg] = useState(null);
  const file = useRef(null);
  const upload = async (e) => {
    const f0 = e.target.files?.[0]; e.target.value = '';
    if (!f0) return;
    try { await api.post(`/api/patients/${pid}/photos`, { label: 'profile', dataUrl: await fileToDataUrl(f0) }); setMsg({ tone: 'sage', t: 'Photo saved, encrypted.' }); setVer((v) => v + 1); reload(); }
    catch (er) { setMsg({ tone: 'terra', t: er.message }); }
  };
  if (!data) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <Avatar photoId={data.photoId} name={data.patient.name} size={96} version={ver} />
      <div>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={upload} />
        <Btn kind="ghost" disabled={!consentSaved} onClick={() => file.current?.click()}>{data.photoId ? 'Replace photo' : 'Choose a photo'}</Btn>
        {!consentSaved && <p className="text-sm text-muted mt-1">Switch on their agreement first.</p>}
        {msg && <div className="mt-2"><Notice tone={msg.tone}>{msg.t}</Notice></div>}
      </div>
    </div>
  );
}

function Wizard({ pid, initial, ai, go, defaultName }) {
  // The account already has a name; start the first card with it so it is not typed twice.
  const seeded = !initial.answers?.['about.name'] && defaultName;
  const [answers, setAnswers] = useState(seeded ? { ...initial.answers, 'about.name': defaultName } : (initial.answers || {}));
  const [dirty, setDirty] = useState(seeded ? { 'about.name': true } : {});
  const [idx, setIdx] = useState(Math.min(initial.step || 0, CARDS.length));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saved, setSaved] = useState(initial.answers || {});
  const top = useRef(null);
  const onReview = idx === CARDS.length;
  const card = CARDS[idx];

  const set = (key, v) => { setAnswers((a) => ({ ...a, [key]: v })); setDirty((d) => ({ ...d, [key]: true })); };

  async function save(to, extra = {}) {
    setBusy(true); setMsg(null);
    try {
      const body = Object.fromEntries(Object.keys({ ...dirty, ...extra }).map((k) => [k, isEmpty({ ...answers, ...extra }[k]) ? null : { ...answers, ...extra }[k]]));
      const out = await api.put(`/api/patients/${pid}/intake`, { answers: body, step: to });
      setSaved(out.answers); setAnswers(out.answers); setDirty({}); setIdx(to);
      if (to !== idx) top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return out;
    } catch (e) { setMsg({ tone: 'terra', t: e.message }); return null; } finally { setBusy(false); }
  }

  const missing = useMemo(() => Object.values(FIELD_BY_KEY).filter((x) => x.field.key_question && isEmpty(answers[x.key])), [answers]);
  const answered = (c) => c.fields.some((f) => f.type !== 'toggle' && !isEmpty(answers[fieldKey(c, f)]));

  async function generate(withAi) {
    setBusy(true); setMsg(null);
    try {
      const saveOut = Object.keys(dirty).length ? await save(idx) : true;
      if (!saveOut) return;
      await api.post(`/api/patients/${pid}/portfolio/generate`, { ai: withAi });
      go?.('portfolio');
    } catch (e) { setMsg({ tone: 'terra', t: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto" ref={top}>
      <div className="flex items-center gap-3 mb-2">
        <p className="text-sm font-semibold text-muted">{onReview ? 'Last step' : `Step ${idx + 1} of ${CARDS.length}`}</p>
        <div className="flex-1 h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-terra transition-all" style={{ width: `${((idx + (onReview ? 0 : 1)) / (CARDS.length + 1)) * 100}%` }} /></div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-5" role="navigation" aria-label="Onboarding steps">
        {CARDS.map((c, i) => (
          <button key={c.id} type="button" title={c.title} aria-label={c.title} onClick={() => (Object.keys(dirty).length ? save(i) : setIdx(i))}
            className={`h-3 w-3 rounded-full border ${i === idx && !onReview ? 'bg-terra border-terra scale-125' : answered(c) ? 'bg-sage border-sage' : 'bg-card border-line'}`} />
        ))}
        <button type="button" title="Review" aria-label="Review" onClick={() => (Object.keys(dirty).length ? save(CARDS.length) : setIdx(CARDS.length))} className={`h-3 w-3 rounded-sm border ${onReview ? 'bg-terra border-terra' : 'bg-card border-line'}`} />
      </div>

      {!onReview ? (
        <Card className="p-6 sm:p-8">
          <h2 className="font-display text-3xl font-bold">{card.title}</h2>
          <p className="text-muted mt-1 mb-6">{card.intro}</p>
          <div className="space-y-6">
            {card.fields.map((f) => {
              const key = fieldKey(card, f);
              if (f.type === 'toggle') {
                return (
                  <div key={key}>
                    <Toggle checked={answers[key] ?? Boolean(f.default)} onChange={(v) => (card.id === 'photo' ? save(idx, { [key]: v }) : set(key, v))} label={f.label} hint={f.help} />
                    {card.id === 'photo' && <PhotoBlock pid={pid} consentSaved={saved[key] === true} />}
                  </div>
                );
              }
              return (
                <div key={key}>
                  <label className="block font-semibold mb-1.5">{f.label}{f.key_question && <span className="ml-2 align-middle"><Chip tone="gold">Important</Chip></span>}</label>
                  {f.help && <p className="text-sm text-muted -mt-1 mb-2">{f.help}</p>}
                  {f.type === 'scale' ? <ScaleRow f={f} value={answers[key]} onChange={(v) => set(key, v)} /> : <Question f={f} value={answers[key]} onChange={(v) => set(key, v)} />}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="font-display text-3xl font-bold">Review and create the portfolio</h2>
            <p className="text-muted mt-1">The answers fill in the patient file. The portfolio is a plain-language summary of them for the family, carers and doctors. You check it before anyone else sees it.</p>
          </div>
          {missing.length ? (
            <div>
              <p className="font-semibold mb-2">Important questions still open ({missing.length})</p>
              <div className="flex flex-wrap gap-2">
                {missing.map((m) => <button key={m.key} type="button" className="rounded-full border border-gold/40 bg-tgold px-3 py-1 text-sm font-semibold text-[#8A5A00] hover:opacity-80" onClick={() => setIdx(CARDS.findIndex((c) => c.id === m.card.id))}>{labelFor(m.key)}</button>)}
              </div>
              <p className="text-sm text-muted mt-2">You can create the portfolio now. These are listed in it as things still to find out.</p>
            </div>
          ) : <Notice tone="sage">Every important question has an answer.</Notice>}
          {ai.available && <Notice tone="gold">Writing with AI sends the answers to {ai.model} through OpenRouter, with names, places and dates masked first. This prototype is for synthetic or volunteer data only.</Notice>}
          <div className="flex flex-wrap gap-3">
            {ai.available && <Btn disabled={busy} onClick={() => generate(true)}>{busy ? 'Writing…' : 'Create portfolio with AI'}</Btn>}
            <Btn kind={ai.available ? 'ghost' : 'primary'} disabled={busy} onClick={() => generate(false)}>{ai.available ? 'Create without AI' : 'Create portfolio'}</Btn>
          </div>
        </Card>
      )}

      {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.t}</Notice></div>}
      <div className="flex items-center gap-3 mt-5">
        <Btn kind="ghost" disabled={busy || idx === 0} onClick={() => save(idx - 1)}>Back</Btn>
        <span className="flex-1" />
        {!onReview && <Btn kind="ghost" disabled={busy} onClick={() => setIdx(idx + 1)}>Skip</Btn>}
        {!onReview && <Btn disabled={busy} onClick={() => save(idx + 1)}>{busy ? 'Saving…' : idx === CARDS.length - 1 ? 'Review' : 'Next'}</Btn>}
      </div>
    </div>
  );
}

function ScaleRow({ f, value, onChange }) {
  return <Choices options={f.options} value={value} onChange={onChange} />;
}

export default function Setup({ pid, go }) {
  const intake = useAsync(() => api.get(`/api/patients/${pid}/intake`), [pid]);
  const info = useAsync(() => api.get(`/api/patients/${pid}/portfolio`), [pid]);
  const file = useAsync(() => api.get(`/api/patients/${pid}/profile`), [pid]);
  if (intake.loading || info.loading || file.loading) return <p className="text-muted">Loading…</p>;
  if (intake.error) return <Notice tone="terra">{intake.error.message}</Notice>;
  return <Wizard pid={pid} initial={intake.data} ai={info.data?.ai || { available: false }} go={go} defaultName={file.data?.patient?.name} />;
}
