import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Chip, H2, Notice, dateTime, useAsync } from '../ui.jsx';
import { labelFor } from '../../../shared/intake.js';

// The portfolio: a plain-language file about the person, written from the onboarding answers.
// The Memora team reviews each version; carers only ever see the approved one. `admin` shows the review controls and sources.
function Doc({ content, admin }) {
  return (
    <div className="space-y-6 print:space-y-4">
      <div>
        <h2 className="font-display text-3xl font-bold leading-tight">{content.headline}</h2>
        {content.about_me && <p className="mt-2 text-lg">{content.about_me}</p>}
      </div>
      {content.note && <Notice tone="gold">{content.note}</Notice>}
      {content.sections.map((s) => (
        <section key={s.id} className="break-inside-avoid">
          <h3 className="font-display text-xl font-bold border-b border-line pb-1 mb-2">{s.title}</h3>
          <ul className="space-y-2">
            {s.items.map((it, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-terra shrink-0" />
                <span>{it.text}{admin && <span className="ml-2 inline-flex flex-wrap gap-1 align-middle print:hidden">{it.from.map((k) => <span key={k} title={labelFor(k)} className="rounded-full bg-sand px-2 py-0.5 text-[0.7rem] text-muted">{labelFor(k).split(': ')[1]}</span>)}</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {content.gaps?.length > 0 && (
        <section className="rounded-xl border border-gold/40 bg-tgold p-4 break-inside-avoid">
          <h3 className="font-display text-lg font-bold">Still to find out</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">{content.gaps.map((g, i) => <li key={i}>{g.question}<span className="text-muted"> ({g.card})</span></li>)}</ul>
        </section>
      )}
      <p className="text-xs text-muted">Written from what the family reported. Memora records it and does not diagnose. {content.answered != null && `${content.answered} of ${content.total} questions answered.`}</p>
    </div>
  );
}

export default function Portfolio({ pid, admin = false, go }) {
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/patients/${pid}/portfolio`), [pid]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showApproved, setShowApproved] = useState(false);

  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;

  const act = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'sage', t: ok }); setShowApproved(false); reload(); } catch (e) { setMsg({ tone: 'terra', t: e.message }); } finally { setBusy(false); }
  };

  if (!admin) {
    if (!data.approved) return <Card className="p-8 text-center text-muted">The Memora team is still preparing this person’s portfolio. It will appear here once it has been checked.</Card>;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 print:hidden"><H2 hint={`Checked by the Memora team ${dateTime(data.approved.approved_at)}`}>Portfolio</H2><span className="flex-1" /><Btn kind="ghost" onClick={() => window.print()}>Print</Btn></div>
        <Card className="p-6 sm:p-8 print:border-0 print:shadow-none"><Doc content={data.approved.content} admin={false} /></Card>
      </div>
    );
  }

  const shown = showApproved ? data.approved : (data.draft || data.approved);
  const isDraft = shown && shown.status === 'draft';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <H2 hint="Check it against the family's answers, approve it, and carers can read it.">Portfolio</H2>
        <span className="flex-1" />
        <Btn kind="ghost" onClick={() => go?.('setup')}>Back to onboarding</Btn>
        {shown && <Btn kind="ghost" onClick={() => window.print()}>Print</Btn>}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}
      {!shown ? (
        <Card className="p-8 text-center text-muted">No portfolio yet. Finish the onboarding cards and create one on the last step.</Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Chip tone={isDraft ? 'gold' : 'sage'}>{isDraft ? `Draft, version ${shown.version}` : `Approved, version ${shown.version}`}</Chip>
            <Chip>{shown.provider === 'openrouter' ? `Written with AI (${shown.model})` : 'Laid out without AI'}</Chip>
            <span className="text-sm text-muted">{dateTime(shown.created_at)}</span>
            {data.draft && data.approved && <button type="button" className="text-sm font-semibold text-terra hover:underline" onClick={() => setShowApproved(!showApproved)}>{showApproved ? 'Show the draft' : `Show approved version ${data.approved.version}`}</button>}
            <span className="flex-1" />
            {isDraft && <Btn kind="ghost" disabled={busy} onClick={() => act(() => api.post(`/api/patients/${pid}/portfolio/${shown.version}/discard`), 'Draft discarded.')}>Discard</Btn>}
            {isDraft && <Btn kind="sage" disabled={busy} onClick={() => act(() => api.post(`/api/patients/${pid}/portfolio/${shown.version}/approve`), 'Approved. Carers can now read it.')}>Approve</Btn>}
          </div>
          {!isDraft && !data.draft && <p className="text-sm text-muted print:hidden">This is what carers see. To change it, create a new version.</p>}
          <Card className="p-6 sm:p-8 print:border-0 print:shadow-none"><Doc content={shown.content} admin /></Card>
        </>
      )}
      <div className="flex flex-wrap gap-3 print:hidden">
        <Btn kind="ghost" disabled={busy} onClick={() => act(() => api.post(`/api/patients/${pid}/portfolio/generate`, { ai: false }), 'New version created without AI.')}>New version without AI</Btn>
        {data.ai?.available && <Btn kind="ghost" disabled={busy} onClick={() => act(() => api.post(`/api/patients/${pid}/portfolio/generate`, { ai: true }), 'New version written with AI.')}>{busy ? 'Writing…' : 'New version with AI'}</Btn>}
      </div>
    </div>
  );
}
