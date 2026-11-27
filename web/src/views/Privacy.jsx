import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Chip, H2, Notice, Toggle, useAsync } from '../ui.jsx';
import CareTeam from './CareTeam.jsx';

// editable = the Memora team's consent page (switches). Caregivers see the same facts, read-only.
export default function Privacy({ pid, me, onMeChange, editable = false }) {
  const prof = useAsync(() => api.get(`/api/patients/${pid}/profile`), [pid]);
  const photos = useAsync(() => api.get(`/api/patients/${pid}/photos`), [pid]);
  const [msg, setMsg] = useState(null);

  if (prof.loading) return <p className="text-muted">Loading…</p>;
  if (prof.error) return <Notice tone="terra">{prof.error.message}</Notice>;
  const { profile, encryptionReady } = prof.data;

  const change = async (patch) => {
    if (patch.consent_photos === false && (photos.data?.length || 0) > 0 && !window.confirm(`Turning photo consent off deletes all ${photos.data.length} stored photo(s). Continue?`)) return;
    try { await api.put(`/api/patients/${pid}/profile`, { ...profile, ...patch }); prof.reload(); photos.reload(); setMsg({ tone: 'sage', t: 'Saved.' }); }
    catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <H2 hint={editable ? "Record what the patient, or their representative, has agreed to. Changing these is the Memora team's job." : 'What the patient, or their representative, has agreed to. The Memora team keeps this up to date.'}>Consent and privacy</H2>
      {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}
      <Card className="p-6 space-y-6">
        {editable ? (
          <>
            <Toggle checked={profile.consent_photos} onChange={(v) => change({ consent_photos: v })} label="Store photos of the patient and the people they know"
              hint="Photos are encrypted before they reach the database. Turning this off deletes every stored photo." />
            <Toggle checked={profile.consent_caregiver_view} onChange={(v) => change({ consent_caregiver_view: v })} label="Caregivers can see this profile and these logs"
              hint="Recorded here as the patient's choice. Sharing with a doctor will have its own switch when the clinician report is built." />
            <Toggle checked={profile.consent_wearables} onChange={(v) => change({ consent_wearables: v })} label="Wearable and phone sensor data (live heart rate, movement, location)"
              hint="Kept as Tier 0 and never sent to an AI model. Turning this off deletes all live samples and device records." />
          </>
        ) : (
          <ul className="space-y-3">
            <li className="flex flex-wrap items-center gap-2"><Chip tone={profile.consent_photos ? 'sage' : 'plain'}>{profile.consent_photos ? 'On' : 'Off'}</Chip><span>Photos of the patient and the people they know are stored, encrypted.</span></li>
            <li className="flex flex-wrap items-center gap-2"><Chip tone={profile.consent_caregiver_view ? 'sage' : 'plain'}>{profile.consent_caregiver_view ? 'On' : 'Off'}</Chip><span>Caregivers can see this profile and these logs.</span></li>
            <li className="flex flex-wrap items-center gap-2"><Chip tone={profile.consent_wearables ? 'sage' : 'plain'}>{profile.consent_wearables ? 'On' : 'Off'}</Chip><span>Wearable and phone sensor data (live heart rate, movement, location) may be collected. It is never sent to an AI model.</span></li>
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <H2 hint="Only these people can open this profile. When a caregiver changes, the history stays with the patient.">Who can see this</H2>
        <CareTeam pid={pid} />
        {me?.user.role === 'caregiver' && (
          <Btn kind="danger" className="mt-4" onClick={async () => {
            if (!window.confirm('Stop caring for this person in Memora? You will lose access to their profile and logs. What you logged stays with them.')) return;
            try { onMeChange(await api.post('/api/auth/disconnect', { patientId: pid })); } catch (e) { setMsg({ tone: 'terra', t: e.message }); }
          }}>Disconnect me from this person</Btn>
        )}
      </Card>

      {editable && !encryptionReady && <Notice tone="gold">Setup: photo storage needs an encryption key on the server before photos can be saved.</Notice>}

      <Card className="p-6">
        <H2>What is stored</H2>
        <ul className="space-y-2 list-disc pl-5">
          <li>The profile, people and care logs.</li>
          <li><b>{photos.data?.length ?? 0}</b> encrypted photo(s), only shown in this app.</li>
          <li>None of it is sent to an AI model.</li>
        </ul>
      </Card>
    </div>
  );
}
