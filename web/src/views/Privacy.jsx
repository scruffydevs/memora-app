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
          </>
        ) : (
          <ul className="space-y-3">
            <li className="flex flex-wrap items-center gap-2"><Chip tone={profile.consent_photos ? 'sage' : 'plain'}>{profile.consent_photos ? 'On' : 'Off'}</Chip><span>Photos of the patient and the people they know are stored, encrypted.</span></li>
            <li className="flex flex-wrap items-center gap-2"><Chip tone={profile.consent_caregiver_view ? 'sage' : 'plain'}>{profile.consent_caregiver_view ? 'On' : 'Off'}</Chip><span>Caregivers can see this profile and these logs.</span></li>
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

      {!encryptionReady &&<Notice tone="terra">Photo storage is switched off on the server (no encryption key is set), so photos cannot be saved yet.</Notice>}

      <Card className="p-6">
        <H2>What is stored</H2>
        <ul className="space-y-2 list-disc pl-5">
          <li>The profile, people and care logs you type in.</li>
          <li><b>{photos.data?.length ?? 0}</b> encrypted photo(s). Photos are only shown in this app.</li>
          <li>Nothing here is sent to an AI model. Any later model use will go through the privacy gateway, with a receipt.</li>
        </ul>
      </Card>

      <Card className="p-6 bg-tgold/50">
        <H2>What is not built</H2>
        <ul className="space-y-2 list-disc pl-5">
          <li>Face recognition. Photos are for people to look at, not for matching.</li>
          <li>The doctor report and its sharing controls.</li>
          <li>Real patient data. This prototype runs on a synthetic persona only.</li>
        </ul>
      </Card>
    </div>
  );
}
