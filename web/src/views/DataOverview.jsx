import React from 'react';
import { api } from '../api.js';
import { Btn, Card, Chip, H2, Notice, dateTime, useAsync } from '../ui.jsx';

// What Memora holds about this patient, what could still be collected, and what has left the vault.
// It shows counts and dates only. It never shows the content of any record.
const STATE = {
  collected: ['Collected', 'sage'],
  available: ['Can be collected', 'gold'],
  off: ['Needs consent', 'terra'],
};

function Bars({ values }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1 h-9" aria-label="records per week, last 8 weeks" role="img">
      {values.map((v, i) => <div key={i} title={`${v}`} className={`flex-1 rounded-sm ${v ? 'bg-terra' : 'bg-line'}`} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />)}
    </div>
  );
}

function Stat({ value, label, hint }) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="font-display text-3xl sm:text-4xl font-bold text-terra tabular-nums leading-none">{value}</p>
      <p className="font-semibold mt-2 leading-snug">{label}</p>
      {hint && <p className="text-xs text-muted mt-0.5 hidden sm:block">{hint}</p>}
    </Card>
  );
}

function CategoryCard({ c, go }) {
  const [label, tone] = STATE[c.state];
  const collected = c.state === 'collected';
  return (
    <Card className={`p-5 flex flex-col ${collected ? '' : 'border-dashed bg-card/70'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-xl font-bold mr-auto">{c.label}</p>
        <Chip tone={tone}>{label}</Chip>
      </div>
      <p className="text-sm text-muted mt-1">{c.blurb}</p>
      <div className="flex items-end gap-4 mt-4">
        <div><p className={`font-display text-4xl font-bold tabular-nums leading-none ${collected ? 'text-ink' : 'text-muted/50'}`}>{c.count}</p><p className="text-xs text-muted mt-1">{c.unit}</p></div>
        {c.series && <div className="flex-1 min-w-0"><Bars values={c.series} /><p className="text-[0.7rem] text-muted mt-0.5">last 8 weeks</p></div>}
      </div>
      <ul className="text-sm mt-3 space-y-0.5">{c.detail.map((d, i) => <li key={i} className="text-muted">{d}</li>)}</ul>
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-line">
        <Chip>{`Tier ${c.tier}`}</Chip>
        {c.last && <span className="text-xs text-muted">Latest {dateTime(c.last)}</span>}
        {go && <div className="ml-auto">{c.next ? <Btn kind="ghost" onClick={() => go(c.next.tab)}>{c.next.text}</Btn> : <button className="inline-flex items-center min-h-[44px] px-3 text-sm text-terra font-semibold hover:underline" onClick={() => go(c.key === 'profile' ? 'file' : c.key === 'logs' ? 'logs' : c.key === 'observations' ? 'observations' : c.key === 'memories' ? 'memory' : c.key === 'wearables' ? 'live' : c.key === 'daily' ? 'watch' : c.key === 'photos' ? 'file' : c.key)}>Open</button>}</div>}
      </div>
    </Card>
  );
}

function TierBar({ tiers }) {
  const total = tiers.t0 + tiers.t1 + tiers.t2;
  if (!total) return <p className="text-sm text-muted">No memories yet.</p>;
  const seg = [['t0', 'Tier 0', 'Never sent to an AI model', 'bg-terra'], ['t1', 'Tier 1', 'Masked before any AI model sees it', 'bg-gold'], ['t2', 'Tier 2', 'Sent as written', 'bg-sage']];
  return (
    <div>
      <div className="flex h-5 rounded-full overflow-hidden bg-line" role="img" aria-label="memories by privacy tier">
        {seg.map(([k, , , bg]) => tiers[k] ? <div key={k} className={bg} style={{ width: `${(tiers[k] / total) * 100}%` }} /> : null)}
      </div>
      <ul className="grid gap-2 sm:grid-cols-3 mt-3">
        {seg.map(([k, name, text, bg]) => <li key={k} className="flex gap-2 text-sm"><span className={`mt-1.5 h-3 w-3 rounded-sm shrink-0 ${bg}`} /><span><b>{name}: {tiers[k]}</b><br /><span className="text-muted">{text}</span></span></li>)}
      </ul>
    </div>
  );
}

export default function DataOverview({ pid, go }) {
  const { data, loading, error } = useAsync(() => api.get(`/api/patients/${pid}/data-overview`), [pid]);
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  const { totals, categories, tiers, consent, team, vault } = data;
  const collected = categories.filter((c) => c.state === 'collected');
  const could = categories.filter((c) => c.state !== 'collected');
  const consents = [['Photos', consent.photos], ['Phone and wearable data', consent.wearables], ['Caregivers can see the profile', consent.caregiver_view]];

  return (
    <div className="space-y-8">
      <H2 hint="Everything Memora holds about this person, what could still be collected, and what has left the vault. Counts and dates only, never the content.">Data overview</H2>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat value={totals.records} label="Records held" hint="People, medicines, places, logs, notes, memories, photos, readings" />
        <Stat value={`${totals.collected} of ${totals.kinds}`} label="Kinds of data collected" hint="The rest could still be collected" />
        <Stat value={`${totals.consents_on} of 3`} label="Consent switches on" hint="Photos, wearable data, caregiver view" />
        <Stat value={vault.receipts} label="Times data left the vault" hint={vault.receipts ? `${vault.masked} names, places or dates masked first` : 'Nothing has been sent to an AI model'} />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-lg font-bold mr-auto">Consent</p>
          {consents.map(([name, on]) => <span key={name} className="flex items-center gap-2 text-sm"><Chip tone={on ? 'sage' : 'plain'}>{on ? 'On' : 'Off'}</Chip>{name}</span>)}
          {go && <Btn kind="ghost" onClick={() => go('consent')}>Change</Btn>}
        </div>
      </Card>

      <section>
        <p className="font-display text-2xl font-bold mb-3">Collected <span className="text-muted font-body text-lg font-normal">({collected.length})</span></p>
        {collected.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{collected.map((c) => <CategoryCard key={c.key} c={c} go={go} />)}</div> : <Card className="p-8 text-center text-muted">Nothing has been collected yet.</Card>}
      </section>

      <section>
        <p className="font-display text-2xl font-bold mb-1">Can be collected <span className="text-muted font-body text-lg font-normal">({could.length})</span></p>
        <p className="text-sm text-muted mb-3">These are empty today. Each one says what is needed to start.</p>
        {could.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{could.map((c) => <CategoryCard key={c.key} c={c} go={go} />)}</div> : <Card className="p-8 text-center text-muted">Every kind of data has something in it.</Card>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <H2 hint="How the memories are protected. Tier 0 is never sent to an AI model.">Memories by privacy tier</H2>
          <TierBar tiers={tiers} />
        </Card>
        <Card className="p-6 space-y-5">
          <div>
            <p className="font-display text-xl font-bold">Who can see it</p>
            <p className="mt-1"><span className="font-display text-3xl font-bold text-terra tabular-nums">{team.active}</span> caregiver{team.active === 1 ? '' : 's'} connected now{team.ever > team.active ? `, ${team.ever - team.active} before` : ''}. The Memora team can open any patient to help set up.</p>
            {go && <Btn kind="ghost" className="mt-2" onClick={() => go('connections')}>See the care team</Btn>}
          </div>
          <div className="border-t border-line pt-4">
            <p className="font-display text-xl font-bold">What has left the vault</p>
            {vault.receipts ? (
              <p className="mt-1">{vault.receipts} question{vault.receipts === 1 ? '' : 's'} used an AI model, with {vault.masked} names, places or dates masked first{vault.last ? `. Latest ${dateTime(vault.last)}` : ''}. Each one has a receipt.</p>
            ) : <p className="mt-1 text-muted">Nothing. No question has used an AI model, and none of this data has been sent anywhere.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
