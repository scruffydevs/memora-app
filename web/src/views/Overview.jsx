import React from 'react';
import { api } from '../api.js';
import { Avatar, Btn, Card, Chip, Chips, H2, Notice, LABELS, dateTime, useAsync } from '../ui.jsx';
import { BehaviourSummary } from './Behaviour.jsx';
import CareTeam from './CareTeam.jsx';

const Fact = ({ label, children }) => (
  <div><p className="label">{label}</p><p className={children ? '' : 'text-muted text-sm'}>{children || 'Not added yet'}</p></div>
);

export default function Overview({ pid, go }) {
  const p = useAsync(() => api.get(`/api/patients/${pid}/profile`), [pid]);
  const logs = useAsync(() => api.get(`/api/patients/${pid}/logs?limit=6`), [pid]);
  if (p.loading) return <p className="text-muted">Loading…</p>;
  if (p.error) return <Notice tone="terra">{p.error.message}</Notice>;
  const { patient, profile: pr, photoId } = p.data;
  const empty = !pr.background && !pr.traits.length && !pr.calming.length;

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8 bg-gradient-to-br from-card to-tterra/50">
        <div className="flex flex-wrap items-center gap-6">
          <Avatar photoId={photoId} name={pr.preferred_name || patient.name} size={112} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl font-bold">{pr.preferred_name || patient.name}</h1>
            <p className="text-muted">{patient.name}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {pr.age_band && <Chip tone="plain">In their {pr.age_band}</Chip>}
              {pr.language && <Chip tone="plain">{pr.language}</Chip>}
              {pr.traits.map((t) => <Chip key={t} tone="gold">{t}</Chip>)}
            </div>
          </div>
          <div className="flex gap-2"><Btn onClick={() => go('arena')}>Open log arena</Btn><Btn kind="ghost" onClick={() => go('file')}>See patient file</Btn></div>
        </div>
        {pr.background && <p className="mt-5 text-lg leading-relaxed max-w-3xl">{pr.background}</p>}
      </Card>

      <Card className="p-5 border-terra/30">
        <H2 hint="Sensitive. Kept in the vault and never sent to an AI model.">Care essentials</H2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Conditions">{pr.conditions}</Fact>
          <Fact label="Allergies">{pr.allergies}</Fact>
          <Fact label="Emergency contact">{pr.emergency_name ? `${pr.emergency_name}${pr.emergency_phone ? ` · ${pr.emergency_phone}` : ''}` : null}</Fact>
          <Fact label="Clinician">{pr.clinician_name ? `${pr.clinician_name}${pr.clinic ? `, ${pr.clinic}` : ''}` : null}</Fact>
        </div>
      </Card>

      {empty && <Notice tone="gold">The Memora team is still completing this patient file. Meanwhile, write what you notice in the <button className="font-bold underline" onClick={() => go('arena')}>log arena</button> so it is not lost.</Notice>}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-5"><H2>What helps</H2><Chips items={pr.calming} tone="sage" empty="Add what calms them" /></Card>
        <Card className="p-5"><H2>What tends to upset</H2><Chips items={pr.triggers} tone="terra" empty="Add known triggers" /></Card>
        <Card className="p-5"><H2>How to talk with them</H2><p className={pr.communication ? '' : 'text-muted text-sm'}>{pr.communication || 'Add tips for talking with them'}</p></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5"><H2>Likes and dislikes</H2>
          <p className="label">Likes</p><Chips items={pr.likes} tone="sage" empty="None added" />
          <p className="label mt-4">Dislikes</p><Chips items={pr.dislikes} tone="terra" empty="None added" />
        </Card>
        <Card className="p-5"><H2>A usual day</H2><p className={pr.routine ? '' : 'text-muted text-sm'}>{pr.routine || 'Add their daily routine'}</p></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5"><H2 hint="Last 4 weeks against the 4 before">Behaviour at a glance</H2><BehaviourSummary pid={pid} /></Card>
        <Card className="p-5">
          <H2>Latest logs</H2>
          {logs.loading ? <p className="text-muted">Loading…</p> : !logs.data?.length ? <p className="text-muted">Nothing logged yet.</p> : (
            <ul className="divide-y divide-line">
              {logs.data.map((l) => (
                <li key={l.id} className="py-2.5">
                  <div className="flex items-center gap-2"><Chip tone={l.kind === 'behaviour' ? 'terra' : 'plain'}>{LABELS[l.kind]}</Chip><span className="text-xs text-muted ml-auto">{dateTime(l.ts)}</span></div>
                  <p className="mt-1">{l.text}</p>
                </li>
              ))}
            </ul>
          )}
          <Btn kind="ghost" className="mt-3" onClick={() => go('logs')}>See all logs</Btn>
        </Card>
      </div>

      <Card className="p-5"><H2 hint="Everything logged stays with the patient when caregivers change.">Care team</H2><CareTeam pid={pid} /></Card>
    </div>
  );
}
