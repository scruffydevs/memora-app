import React, { useState } from 'react';
import { api } from '../api.js';
import { CodeBox } from '../Admin.jsx';
import { Btn, Card, Chip, H2, Notice, dateTime, useAsync } from '../ui.jsx';

// Admin: connect a caregiver with a one-time code, and end connections when the caregiver changes.
export default function Connections({ pid }) {
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/admin/patients/${pid}/connections`), [pid]);
  const [role, setRole] = useState('primary');
  const [code, setCode] = useState(null);
  const [err, setErr] = useState('');

  const gen = async () => { setErr(''); try { setCode(await api.post(`/api/admin/patients/${pid}/codes`, { role })); } catch (e) { setErr(e.message); } };
  const end = async (c) => {
    const reason = window.prompt(`End ${c.name}'s connection? Their access stops now. What they logged stays with the patient.\n\nReason (optional):`, 'caregiver changed');
    if (reason === null) return;
    try { await api.post(`/api/admin/connections/${c.id}/end`, { reason }); reload(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-6">
        <H2 hint="Give the code to the caregiver. They create their own account, then enter it to open this patient's file. Each code works once and expires after 7 days.">Connect a caregiver</H2>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Code type">
            <option value="primary">Main caregiver</option><option value="secondary">Additional caregiver</option>
          </select>
          <Btn onClick={gen}>New connection code</Btn>
        </div>
        {err && <div className="mt-3"><Notice tone="terra">{err}</Notice></div>}
        {code && <div className="mt-4"><CodeBox info={code} onClose={() => setCode(null)} /></div>}
      </Card>

      <Card className="p-6">
        <H2 hint="To change caregivers: end the current connection, then generate a code for the new one. History stays with the patient.">Care team and history</H2>
        {loading ? <p className="text-muted">Loading…</p> : error ? <Notice tone="terra">{error.message}</Notice> : !data.length ? <p className="text-muted">No caregiver has been connected yet.</p> : (
          <ul className="divide-y divide-line">
            {data.map((c) => (
              <li key={c.id} className="py-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.name}</span><span className="text-sm text-muted">{c.email}</span>
                <Chip tone={c.status === 'active' ? 'sage' : 'plain'}>{c.status === 'active' ? (c.role === 'primary' ? 'Main caregiver' : 'Additional') : 'Ended'}</Chip>
                <span className="text-xs text-muted">{c.status === 'active' ? `since ${dateTime(c.connected_at)}` : `${dateTime(c.connected_at)} to ${dateTime(c.ended_at)}${c.ended_reason ? ` (${c.ended_reason})` : ''}`}</span>
                {c.status === 'active' && <button className="ml-auto text-sm text-terra hover:underline" onClick={() => end(c)}>End connection</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
