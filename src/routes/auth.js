import { Router } from 'express';
import { pool, q } from '../db.js';
import { wrap, str } from '../util.js';
import { hashPassword, verifyPassword, dummyVerify, validEmail, validPassword, startSession, endSession, requireUser, rateLimit, codeHash, normaliseCode, audit } from '../auth.js';

const r = Router();
const byIpEmail = (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;

export async function sessionInfo(user) {
  const connections = user.role === 'admin' ? [] : (await q(
    `SELECT c.patient_id, p.name AS patient_name, p.patient_code, c.role, c.connected_at
       FROM patient_connections c JOIN patients p ON p.id = c.patient_id
      WHERE c.caregiver_id=$1 AND c.status='active' ORDER BY c.connected_at`, [user.id])).rows;
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, connections };
}

r.post('/signup', rateLimit(byIpEmail, { max: 6 }), wrap(async (req, res) => {
  const name = str(req.body?.name, 80);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!name) return res.status(400).json({ error: 'name_required' });
  if (!validEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!validPassword(password)) return res.status(400).json({ error: 'weak_password' });
  if ((await q('SELECT 1 FROM users WHERE email=$1', [email])).rows.length) return res.status(409).json({ error: 'email_taken' });
  const user = (await q("INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,'caregiver') RETURNING id, email, name, role", [email, name, await hashPassword(password)])).rows[0];
  await audit(user.id, 'caregiver_signup');
  await startSession(req, res, user.id);
  res.status(201).json(await sessionInfo(user));
}));

r.post('/login', rateLimit(byIpEmail), wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const u = (await q('SELECT id, email, name, role, password_hash, disabled FROM users WHERE email=$1', [email])).rows[0];
  if (!u) { await dummyVerify(password); return res.status(401).json({ error: 'invalid_login' }); }
  if (!(await verifyPassword(password, u.password_hash))) return res.status(401).json({ error: 'invalid_login' });
  if (u.disabled) return res.status(403).json({ error: 'account_disabled' });
  await q('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
  await startSession(req, res, u.id);
  res.json(await sessionInfo(u));
}));

r.post('/logout', wrap(async (req, res) => { await endSession(req, res); res.status(204).end(); }));

r.get('/me', requireUser, wrap(async (req, res) => res.json(await sessionInfo(req.user))));

// A caregiver connects to a patient with a one-time code created by the Memora team.
r.post('/connect', requireUser, rateLimit((req) => `connect|${req.user?.id}`, { max: 10 }), wrap(async (req, res) => {
  if (req.user.role !== 'caregiver') return res.status(403).json({ error: 'forbidden' });
  const norm = normaliseCode(req.body?.code);
  if (norm.length !== 10) return res.status(400).json({ error: 'invalid_or_expired_code' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const c = (await client.query('SELECT id, patient_id, role FROM connection_codes WHERE code_hash=$1 AND used_at IS NULL AND expires_at > now()', [codeHash(norm)])).rows[0];
    if (!c) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'invalid_or_expired_code' }); }
    const claimed = (await client.query('UPDATE connection_codes SET used_by=$1, used_at=now() WHERE id=$2 AND used_at IS NULL RETURNING id', [req.user.id, c.id])).rows[0];
    if (!claimed) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'invalid_or_expired_code' }); }
    try {
      await client.query("INSERT INTO patient_connections (patient_id, caregiver_id, role) VALUES ($1,$2,$3)", [c.patient_id, req.user.id, c.role]);
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: c.role === 'primary' ? 'primary_exists' : 'already_connected' });
      throw e;
    }
    await client.query('COMMIT');
    await audit(req.user.id, 'connected', c.patient_id, c.role);
    res.json(await sessionInfo(req.user));
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* already rolled back */ } throw e; } finally { client.release(); }
}));

r.post('/disconnect', requireUser, wrap(async (req, res) => {
  const patientId = Number(req.body?.patientId);
  const done = (await q("UPDATE patient_connections SET status='ended', ended_at=now(), ended_reason='left by caregiver' WHERE patient_id=$1 AND caregiver_id=$2 AND status='active' RETURNING id", [patientId, req.user.id])).rows[0];
  if (!done) return res.status(404).json({ error: 'not_connected' });
  await audit(req.user.id, 'disconnected', patientId, 'left by caregiver');
  res.json(await sessionInfo(req.user));
}));

export default r;
