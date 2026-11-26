import React from 'react';
import { api } from '../api.js';
import { Avatar, Card, Chip, Chips, H2, Notice, dateTime, useAsync } from '../ui.jsx';

const Fact = ({ label, children }) => (
  <div><p className="label">{label}</p><p className={children ? 'whitespace-pre-line' : 'text-muted text-sm'}>{children || 'Not added yet'}</p></div>
);

// Caregiver: the whole patient file, read-only. The Memora team completes and updates it.
export default function PatientFile({ pid }) {
  const p = useAsync(() => api.get(`/api/patients/${pid}/profile`), [pid]);
  const c = useAsync(() => api.get(`/api/patients/${pid}/contacts`), [pid]);
  const m = useAsync(() => api.get(`/api/patients/${pid}/medicines`), [pid]);
  if (p.loading) return <p className="text-muted">Loading…</p>;
  if (p.error) return <Notice tone="terra">{p.error.message}</Notice>;
  const { patient, profile: pr, photoId } = p.data;

  return (
    <div className="space-y-6">
      <Card className="p-6 flex flex-wrap items-center gap-5">
        <Avatar photoId={photoId} name={pr.preferred_name || patient.name} size={96} />
        <div className="flex-1 min-w-[14rem]">
          <h1 className="font-display text-3xl font-bold">{patient.name}</h1>
          <p className="text-muted">Called {pr.preferred_name || patient.name.split(' ')[0]} · {patient.patient_code}</p>
          <div className="flex flex-wrap gap-2 mt-2">{pr.age_band && <Chip>In their {pr.age_band}</Chip>}{pr.language && <Chip>{pr.language}</Chip>}</div>
        </div>
        <p className="text-sm text-muted max-w-xs">Kept up to date by the Memora team. Last updated {dateTime(pr.updated_at)}.</p>
      </Card>

      <Notice tone="gold">This file is read-only. If something is missing or out of date, tell the Memora team, and write what you notice in the log arena so it is not lost.</Notice>

      <Card className="p-6 border-terra/30">
        <H2 hint="Sensitive. Kept in the vault and never sent to an AI model.">Care essentials</H2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Conditions">{pr.conditions}</Fact>
          <Fact label="Allergies">{pr.allergies}</Fact>
          <Fact label="Emergency contact">{pr.emergency_name ? `${pr.emergency_name}${pr.emergency_phone ? `\n${pr.emergency_phone}` : ''}` : null}</Fact>
          <Fact label="Clinician">{pr.clinician_name ? `${pr.clinician_name}${pr.clinic ? `\n${pr.clinic}` : ''}` : null}</Fact>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6"><H2>Who they are</H2>
          <p className={`mb-4 ${pr.background ? '' : 'text-muted text-sm'}`}>{pr.background || 'Their story has not been added yet.'}</p>
          <p className="label">Character</p><Chips items={pr.traits} tone="gold" empty="None added" />
        </Card>
        <Card className="p-6"><H2>Daily life</H2>
          <Fact label="How to talk with them">{pr.communication}</Fact>
          <div className="mt-4"><Fact label="A usual day">{pr.routine}</Fact></div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6"><H2>Likes and what calms them</H2>
          <p className="label">Likes</p><Chips items={pr.likes} tone="sage" empty="None added" />
          <p className="label mt-4">What calms them</p><Chips items={pr.calming} tone="sage" empty="None added" />
        </Card>
        <Card className="p-6"><H2>Dislikes and triggers</H2>
          <p className="label">Dislikes</p><Chips items={pr.dislikes} tone="terra" empty="None added" />
          <p className="label mt-4">What tends to upset them</p><Chips items={pr.triggers} tone="terra" empty="None added" />
        </Card>
      </div>

      <Card className="p-6">
        <H2 hint="You can pick these when you log how they were before or after a medicine.">Medicines</H2>
        {m.loading ? <p className="text-muted">Loading…</p> : !m.data?.length ? <p className="text-muted">No medicines listed yet.</p> : (
          <ul className="divide-y divide-line">{m.data.map((x) => <li key={x.id} className="py-2.5 flex flex-wrap gap-x-3"><b>{x.name}</b><span className="text-muted">{[x.dose, x.schedule].filter(Boolean).join(' · ')}</span></li>)}</ul>
        )}
      </Card>

      <Card className="p-6">
        <H2 hint="The people who matter, and what to mention.">People</H2>
        {c.loading ? <p className="text-muted">Loading…</p> : !c.data?.length ? <p className="text-muted">No one has been added yet.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {c.data.map((x) => (
              <div key={x.id} className="flex gap-4 rounded-xl border border-line bg-white p-4">
                <Avatar photoId={x.photo_id} name={x.name} size={64} />
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold leading-tight">{x.name}</p>
                  <p className="text-muted text-sm">{x.relationship || 'No relationship set'}</p>
                  {x.mention && <p className="text-sm mt-1"><span className="font-semibold text-muted">Mention: </span>{x.mention}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
