import React from 'react';
import { api } from '../api.js';
import { Chip, Notice, dateTime, useAsync } from '../ui.jsx';

// Who has cared for this person. History stays when caregivers change, so a new caregiver sees the full picture.
export default function CareTeam({ pid }) {
  const { data, loading, error } = useAsync(() => api.get(`/api/patients/${pid}/care-team`), [pid]);
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  if (!data.length) return <p className="text-muted">No caregiver is connected yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {data.map((t) => (
        <li key={t.id} className="py-2.5 flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t.name}</span>
          <Chip tone={t.status === 'active' ? 'sage' : 'plain'}>{t.status === 'active' ? (t.role === 'primary' ? 'Main caregiver' : 'Also caring') : 'Previously'}</Chip>
          <span className="text-xs text-muted ml-auto">{t.status === 'active' ? `since ${dateTime(t.connected_at)}` : `${dateTime(t.connected_at)} to ${dateTime(t.ended_at)}`}</span>
        </li>
      ))}
    </ul>
  );
}
