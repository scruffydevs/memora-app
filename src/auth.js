import crypto from 'node:crypto';
import { q } from './db.js';

// ---------- passwords (scrypt) ----------
const scrypt = (pw, salt) => new Promise((resolve, reject) =>
  crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? reject(e) : resolve(k))));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const k = await scrypt(pw, salt);
  return `scrypt1$${salt.toString('hex')}$${k.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [tag, saltHex, hashHex] = String(stored).split('$');
  if (tag !== 'scrypt1' || !saltHex || !hashHex) return false;
  const k = await scrypt(pw, Buffer.from(saltHex, 'hex'));
  const h = Buffer.from(hashHex, 'hex');
  return h.length === k.length && crypto.timingSafeEqual(h, k);
}

// Spend the same time on unknown emails, so response time does not reveal which accounts exist.
let dummy;
export async function dummyVerify(pw) { dummy ||= await hashPassword('not-a-real-password'); await verifyPassword(pw, dummy); }

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
export const validPassword = (p) => typeof p === 'string' && p.length >= 10 && p.length <= 128;

// ---------- sessions (httpOnly cookie, hashed token in the database) ----------
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const COOKIE = 'memora_session';
const SESSION_DAYS = 14;

function readCookie(req, name) {
  const h = req.headers.cookie;
  if (!h) return null;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) { try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; } }
  }
  return null;
}

// The Android app is not served from this site, so a cookie would not follow its requests. It asks for the same
// opaque session token in the response (header X-Memora-Client: app) and sends it back as "Authorization: Bearer".
export const isAppClient = (req) => req.get('x-memora-client') === 'app';
const bearerToken = (req) => {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(req.get('authorization') || '');
  return m ? m[1] : null;
};

export async function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), userId]);
  if (!isAppClient(req)) res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: Boolean(req.secure), maxAge: SESSION_DAYS * 864e5, path: '/' });
  return token;
}

export async function endSession(req, res) {
  for (const t of [readCookie(req, COOKIE), bearerToken(req)]) if (t) await q('DELETE FROM sessions WHERE token_hash=$1', [sha256(t)]);
  res.clearCookie(COOKIE, { path: '/' });
}

export async function loadUser(req, _res, next) {
  try {
    const t = bearerToken(req) || readCookie(req, COOKIE);
    req.user = null;
    if (t) {
      const r = await q('SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND NOT u.disabled', [sha256(t)]);
      req.user = r.rows[0] || null;
    }
    next();
  } catch (e) { next(e); }
}

export const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'unauthorized' }));
export const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'forbidden' }));

// Admins (the Memora team) can open any patient. A caregiver only opens patients they are actively connected to.
export async function canAccess(user, patientId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const r = await q("SELECT 1 FROM patient_connections WHERE patient_id=$1 AND caregiver_id=$2 AND status='active'", [patientId, user.id]);
  return r.rows.length > 0;
}

export const audit = (userId, action, patientId = null, detail = null) =>
  q('INSERT INTO audit_log (user_id, action, patient_id, detail) VALUES ($1,$2,$3,$4)', [userId, action, patientId, detail]);

// ---------- small in-memory rate limiter ----------
const hits = new Map();
export function rateLimit(keyFn, { max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const e = hits.get(key);
    if (!e || e.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); return next(); }
    if (e.count >= max) return res.status(429).json({ error: 'too_many_attempts' });
    e.count++;
    next();
  };
}
export const resetRateLimits = () => hits.clear();

// ---------- connection codes ----------
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export function newCode() {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}
export const normaliseCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const codeHash = (c) => sha256(normaliseCode(c));
export function newPatientCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `MP-${s}`;
}
