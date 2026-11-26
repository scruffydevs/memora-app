import { Router } from 'express';
import { q } from '../db.js';
import { wrap, str } from '../util.js';
import { newCode, codeHash, newPatientCode, hashPassword, validPassword, audit } from '../auth.js';

const r = Router(); // mounted behind requireAdmin

r.get('/patients', wrap(async (_req, res) => {
  res.json((await q(
    `SELECT p.id, p.name, p.patient_code, p.status, p.is_demo, p.created_at,
            COALESCE(json_agg(json_build_object('connection_id', c.id, 'caregiver_id', u.id, 'name', u.name, 'email', u.email, 'role', c.role, 'connected_at', c.connected_at)
                              ORDER BY c.connected_at) FILTER (WHERE c.id IS NOT NULL), '[]') AS caregivers
       FROM patients p
       LEFT JOIN patient_connections c ON c.patient_id = p.id AND c.status = 'active'
       LEFT JOIN users u ON u.id = c.caregiver_id
      GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`)).rows);
}));

// Create the patient account. The caregiver connects to it later with a code.
r.post('/patients', wrap(async (req, res) => {
  const name = str(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: 'name_required' });
  let p;
  for (let i = 0; i < 5 && !p; i++) {
    try { p = (await q('INSERT INTO patients (name, patient_code, created_by) VALUES ($1,$2,$3) RETURNING id, name, patient_code, status, created_at', [name, newPatientCode(), req.user.id])).rows[0]; }
    catch (e) { if (e.code !== '23505') throw e; }
  }
  if (!p) throw new Error('could not allocate a patient code');
  await q('INSERT INTO patient_profiles (patient_id, preferred_name, language, age_band) VALUES ($1,$2,$3,$4)',
    [p.id, str(req.body.preferred_name, 80) || name.split(' ')[0], str(req.body.language, 60), str(req.body.age_band, 20)]);
  await audit(req.user.id, 'patient_created', p.id, p.patient_code);
  res.status(201).json(p);
}));

// One-time connection code. Shown once, stored only as a hash, valid for 7 days.
r.post('/patients/:id/codes', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await q('SELECT 1 FROM patients WHERE id=$1', [id])).rows.length) return res.status(404).json({ error: 'not_found' });
  const role = req.body?.role === 'secondary' ? 'secondary' : 'primary';
  const code = newCode();
  const row = (await q("INSERT INTO connection_codes (code_hash, patient_id, role, created_by, expires_at) VALUES ($1,$2,$3,$4, now() + interval '7 days') RETURNING expires_at",
    [codeHash(code), id, role, req.user.id])).rows[0];
  await audit(req.user.id, 'code_created', id, role);
  res.status(201).json({ code, role, expires_at: row.expires_at });
}));

r.get('/patients/:id/connections', wrap(async (req, res) => {
  res.json((await q(
    `SELECT c.id, c.role, c.status, c.connected_at, c.ended_at, c.ended_reason, u.name, u.email
       FROM patient_connections c JOIN users u ON u.id = c.caregiver_id WHERE c.patient_id=$1 ORDER BY c.connected_at DESC`, [req.params.id])).rows);
}));

r.post('/connections/:id/end', wrap(async (req, res) => {
  const row = (await q("UPDATE patient_connections SET status='ended', ended_at=now(), ended_reason=$2 WHERE id=$1 AND status='active' RETURNING id, patient_id",
    [req.params.id, str(req.body?.reason, 200) || 'ended by Memora team'])).rows[0];
  if (!row) return res.status(404).json({ error: 'not_found' });
  await audit(req.user.id, 'connection_ended', row.patient_id, str(req.body?.reason, 200));
  res.status(204).end();
}));

r.get('/caregivers', wrap(async (_req, res) => {
  res.json((await q(
    `SELECT u.id, u.name, u.email, u.disabled, u.created_at, u.last_login,
            (SELECT COUNT(*)::int FROM patient_connections c WHERE c.caregiver_id=u.id AND c.status='active') AS active_patients
       FROM users u WHERE u.role='caregiver' ORDER BY u.created_at DESC`)).rows);
}));

r.post('/users/:id/disable', wrap(async (req, res) => {
  const disabled = Boolean(req.body?.disabled);
  const u = (await q("UPDATE users SET disabled=$2 WHERE id=$1 AND role='caregiver' RETURNING id", [req.params.id, disabled])).rows[0];
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (disabled) await q('DELETE FROM sessions WHERE user_id=$1', [u.id]);
  await audit(req.user.id, disabled ? 'user_disabled' : 'user_enabled', null, `user ${u.id}`);
  res.status(204).end();
}));

// Forgotten password: set a temporary one and tell the caregiver to change it.
r.post('/users/:id/password', wrap(async (req, res) => {
  if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'weak_password' });
  const u = (await q("UPDATE users SET password_hash=$2 WHERE id=$1 AND role='caregiver' RETURNING id", [req.params.id, await hashPassword(req.body.password)])).rows[0];
  if (!u) return res.status(404).json({ error: 'not_found' });
  await q('DELETE FROM sessions WHERE user_id=$1', [u.id]);
  await audit(req.user.id, 'password_reset', null, `user ${u.id}`);
  res.status(204).end();
}));

r.get('/audit', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json((await q(
    `SELECT a.id, a.ts, a.action, a.detail, a.patient_id, p.name AS patient_name, u.name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN patients p ON p.id=a.patient_id ORDER BY a.ts DESC, a.id DESC LIMIT $1`, [limit])).rows);
}));

export default r;
