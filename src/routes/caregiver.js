import { Router } from 'express';
import { q } from '../db.js';
import { wrap, toList, str, BEHAVIOUR_CATEGORIES, LOG_KINDS } from '../util.js';
import { encrypt, decrypt, encryptionReady } from '../crypto.js';
import { requireAdmin } from '../auth.js';
import { engine } from '../memory/engine.js';
import { record } from '../activity.js';

// Profiling (the patient file, people, consent, photos) is done by the Memora team. Caregivers read it and log.

const r = Router();

// ---------- patients and profile ----------
// Patient accounts are created by the Memora team (admin routes), not here.

// Who has cared for this person, and when. History stays when caregivers change.
r.get('/patients/:id/care-team', wrap(async (req, res) => {
  res.json((await q(
    `SELECT c.id, c.role, c.status, c.connected_at, c.ended_at, c.ended_reason, u.name
       FROM patient_connections c JOIN users u ON u.id = c.caregiver_id
      WHERE c.patient_id=$1 ORDER BY (c.status = 'active') DESC, c.connected_at DESC`, [req.params.id])).rows);
}));

r.get('/patients/:id/profile', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const p = (await q('SELECT id, name, patient_code FROM patients WHERE id=$1', [id])).rows[0];
  if (!p) return res.status(404).json({ error: 'not_found' });
  await q('INSERT INTO patient_profiles (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  const prof = (await q('SELECT * FROM patient_profiles WHERE patient_id=$1', [id])).rows[0];
  const photo = (await q('SELECT id FROM photos WHERE patient_id=$1 AND contact_id IS NULL ORDER BY created_at DESC LIMIT 1', [id])).rows[0];
  res.json({ patient: p, profile: prof, photoId: photo?.id ?? null, encryptionReady: encryptionReady() });
}));

r.put('/patients/:id/profile', requireAdmin, wrap(async (req, res) => {
  res.json(await saveProfile(Number(req.params.id), req.body || {}, req.user.name));
}));

// The profile save is a function so onboarding can use it too.
export async function saveProfile(id, b, userName) {
  const row = (await q(
    `INSERT INTO patient_profiles (patient_id, preferred_name, language, age_band, background, traits, likes, dislikes, calming, triggers, communication, routine, consent_photos, consent_caregiver_view,
                                   conditions, allergies, emergency_name, emergency_phone, clinician_name, clinic, consent_wearables, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
     ON CONFLICT (patient_id) DO UPDATE SET
       preferred_name=EXCLUDED.preferred_name, language=EXCLUDED.language, age_band=EXCLUDED.age_band, background=EXCLUDED.background,
       traits=EXCLUDED.traits, likes=EXCLUDED.likes, dislikes=EXCLUDED.dislikes, calming=EXCLUDED.calming, triggers=EXCLUDED.triggers,
       communication=EXCLUDED.communication, routine=EXCLUDED.routine, consent_photos=EXCLUDED.consent_photos,
       consent_caregiver_view=EXCLUDED.consent_caregiver_view, conditions=EXCLUDED.conditions, allergies=EXCLUDED.allergies,
       emergency_name=EXCLUDED.emergency_name, emergency_phone=EXCLUDED.emergency_phone, clinician_name=EXCLUDED.clinician_name,
       clinic=EXCLUDED.clinic, consent_wearables=EXCLUDED.consent_wearables, updated_at=now()
     RETURNING *`,
    [id, str(b.preferred_name, 80), str(b.language, 60), str(b.age_band, 20), str(b.background, 4000), toList(b.traits), toList(b.likes), toList(b.dislikes), toList(b.calming), toList(b.triggers), str(b.communication, 2000), str(b.routine, 3000), Boolean(b.consent_photos), b.consent_caregiver_view !== false,
      str(b.conditions, 1500), str(b.allergies, 600), str(b.emergency_name, 120), str(b.emergency_phone, 40), str(b.clinician_name, 120), str(b.clinic, 160), Boolean(b.consent_wearables)],
  )).rows[0];
  // Withdrawing wearable consent deletes every live sample and device record for this patient.
  if (!row.consent_wearables) {
    await q('DELETE FROM signals WHERE patient_id=$1 AND device_id IS NOT NULL', [id]);
    await q('DELETE FROM devices WHERE patient_id=$1', [id]);
    await q('DELETE FROM daily_metrics WHERE patient_id=$1', [id]);
  }
  // Withdrawing photo consent removes stored photos.
  if (!row.consent_photos) await q('DELETE FROM photos WHERE patient_id=$1', [id]);
  await engine.onProfileSaved(id, userName); // keep the memory engine in step with the patient file
  record('profile', id, 'Patient file saved; memories brought up to date');
  return row;
}

// ---------- people ----------
r.get('/patients/:id/contacts', wrap(async (req, res) => {
  res.json((await q(
    `SELECT c.id, c.name, c.relationship, c.mention, c.enrolled, c.consent_noted, c.last_seen,
            (SELECT p.id FROM photos p WHERE p.contact_id=c.id ORDER BY p.created_at DESC LIMIT 1) AS photo_id
       FROM contacts c WHERE c.patient_id=$1 ORDER BY c.name`, [req.params.id])).rows);
}));

r.post('/patients/:id/contacts', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  if (!name) return res.status(400).json({ error: 'name is required' });
  res.status(201).json((await q(
    'INSERT INTO contacts (patient_id, name, relationship, mention, enrolled, consent_noted) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.params.id, name, str(b.relationship, 60), str(b.mention, 400), Boolean(b.enrolled), Boolean(b.consent_noted)])).rows[0]);
}));

r.put('/contacts/:id', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const row = (await q(
    'UPDATE contacts SET name=$2, relationship=$3, mention=$4, enrolled=$5, consent_noted=$6 WHERE id=$1 RETURNING *',
    [req.params.id, name, str(b.relationship, 60), str(b.mention, 400), Boolean(b.enrolled), Boolean(b.consent_noted)])).rows[0];
  if (!row) return res.status(404).json({ error: 'not_found' });
  // Withdrawn consent removes that person's photos.
  if (!row.consent_noted) await q('DELETE FROM photos WHERE contact_id=$1', [row.id]);
  res.json(row);
}));

r.delete('/contacts/:id', requireAdmin, wrap(async (req, res) => { await q('DELETE FROM contacts WHERE id=$1', [req.params.id]); res.status(204).end(); }));

// ---------- care logs and behaviour ----------
r.get('/patients/:id/logs', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const kind = LOG_KINDS.includes(req.query.kind) ? req.query.kind : null;
  res.json((await q(
    `SELECT id, ts, kind, category, severity, trigger_text, helped, text, logged_by FROM care_logs
      WHERE patient_id=$1 AND ($2::text IS NULL OR kind=$2) ORDER BY ts DESC LIMIT $3`, [req.params.id, kind, limit])).rows);
}));

r.post('/patients/:id/logs', wrap(async (req, res) => {
  const b = req.body || {};
  const kind = LOG_KINDS.includes(b.kind) ? b.kind : 'note';
  const text = str(b.text, 2000);
  if (!text) return res.status(400).json({ error: 'text is required' });
  let category = null, severity = null;
  if (kind === 'behaviour') {
    category = BEHAVIOUR_CATEGORIES.includes(b.category) ? b.category : null;
    severity = Number(b.severity);
    if (!category || !(severity >= 1 && severity <= 5)) return res.status(400).json({ error: 'behaviour logs need a category and a severity from 1 to 5' });
  }
  const log = (await q(
    `INSERT INTO care_logs (patient_id, ts, kind, category, severity, trigger_text, helped, text, logged_by, author_id)
     VALUES ($1, COALESCE($2::timestamptz, now()), $3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    // The author is always the signed-in caregiver, never typed in by the client.
    [req.params.id, b.ts || null, kind, category, severity, str(b.trigger_text, 300), str(b.helped, 300), text, req.user.name, req.user.id])).rows[0];
  await engine.onCareLogSaved(log.id, req.user.name);
  record('log', Number(req.params.id), `A ${kind} entry was added to the care log`);
  res.status(201).json(log);
}));

// Deleting a log also forgets what the memory engine derived from it.
r.delete('/logs/:id', wrap(async (req, res) => { await engine.retractBySource('care_logs', Number(req.params.id), req.user.name); await q('DELETE FROM care_logs WHERE id=$1', [req.params.id]); res.status(204).end(); }));

// Descriptive only: counts this 28 days against the previous 28. No scores, no diagnosis, no forecast.
r.get('/patients/:id/behaviour-summary', wrap(async (req, res) => {
  const id = req.params.id;
  const cats = (await q(
    `SELECT category,
            COUNT(*) FILTER (WHERE ts >= now() - interval '28 days')::int AS current,
            COUNT(*) FILTER (WHERE ts <  now() - interval '28 days' AND ts >= now() - interval '56 days')::int AS previous,
            ROUND(AVG(severity) FILTER (WHERE ts >= now() - interval '28 days')::numeric, 1) AS avg_severity
       FROM care_logs WHERE patient_id=$1 AND kind='behaviour' AND ts >= now() - interval '56 days' AND category IS NOT NULL
      GROUP BY category ORDER BY current DESC`, [id])).rows;
  const top = async (col) => (await q(
    `SELECT ${col} AS text, COUNT(*)::int AS count FROM care_logs
      WHERE patient_id=$1 AND kind='behaviour' AND ts >= now() - interval '28 days' AND ${col} IS NOT NULL
      GROUP BY ${col} ORDER BY count DESC, text LIMIT 5`, [id])).rows;
  res.json({ window_days: 28, categories: cats, top_triggers: await top('trigger_text'), top_helped: await top('helped') });
}));

// ---------- photos (Tier 0, encrypted, consent first, no recognition) ----------
r.get('/patients/:id/photos', wrap(async (req, res) =>
  res.json((await q('SELECT id, contact_id, label, mime, created_at FROM photos WHERE patient_id=$1 ORDER BY created_at DESC', [req.params.id])).rows)));

r.post('/patients/:id/photos', requireAdmin, wrap(async (req, res) => {
  if (!encryptionReady()) return res.status(503).json({ error: 'photo_encryption_not_configured' });
  const id = Number(req.params.id);
  const { contactId, label, dataUrl } = req.body || {};
  const prof = (await q('SELECT consent_photos FROM patient_profiles WHERE patient_id=$1', [id])).rows[0];
  if (!prof?.consent_photos) return res.status(403).json({ error: 'photo_consent_required' });
  if (contactId) {
    const c = (await q('SELECT consent_noted FROM contacts WHERE id=$1 AND patient_id=$2', [contactId, id])).rows[0];
    if (!c) return res.status(404).json({ error: 'contact_not_found' });
    if (!c.consent_noted) return res.status(403).json({ error: 'contact_consent_required' });
  }
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return res.status(400).json({ error: 'a png, jpeg or webp image is required' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1_500_000) return res.status(413).json({ error: 'image too large (max 1.5 MB)' });
  const { iv, data } = encrypt(buf);
  // One current photo per subject: replace the previous one.
  await q('DELETE FROM photos WHERE patient_id=$1 AND contact_id IS NOT DISTINCT FROM $2', [id, contactId || null]);
  const row = (await q('INSERT INTO photos (patient_id, contact_id, label, mime, iv, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, contact_id, label, mime, created_at',
    [id, contactId || null, str(label, 80), m[1], iv, data])).rows[0];
  res.status(201).json(row);
}));

r.get('/photos/:id', wrap(async (req, res) => {
  const p = (await q('SELECT mime, iv, data FROM photos WHERE id=$1', [req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.set('Content-Type', p.mime).set('Cache-Control', 'private, no-store').send(decrypt(p.iv, p.data));
}));

r.delete('/photos/:id', requireAdmin, wrap(async (req, res) => { await q('DELETE FROM photos WHERE id=$1', [req.params.id]); res.status(204).end(); }));

export default r;
