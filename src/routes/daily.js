import { Router } from 'express';
import { q } from '../db.js';
import { wrap, str } from '../util.js';
import { rateLimit } from '../auth.js';

const r = Router(); // patient scope is checked by guardPatient on /patients/:id

const consentOn = async (patientId) =>
  Boolean((await q('SELECT consent_wearables FROM patient_profiles WHERE patient_id=$1', [patientId])).rows[0]?.consent_wearables);

// A number in range, or null. Anything else is dropped rather than stored.
const num = (v, min, max) => {
  if (v == null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const real = (v, min, max) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : null;
};
const when = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};

const FIELDS = ['sleep_minutes', 'deep_minutes', 'rem_minutes', 'light_minutes', 'awake_minutes', 'awakenings', 'sleep_start', 'sleep_end', 'steps', 'active_kcal', 'resting_hr', 'avg_hr', 'hrv_ms', 'spo2_avg'];

export function cleanDay(d) {
  const day = String(d?.day ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = new Date(`${day}T00:00:00Z`).getTime();
  const now = Date.now();
  if (Number.isNaN(t) || t > now + 2 * 864e5 || t < now - 400 * 864e5) return null;
  const row = {
    day,
    sleep_minutes: num(d.sleep_minutes, 0, 1440), deep_minutes: num(d.deep_minutes, 0, 1440), rem_minutes: num(d.rem_minutes, 0, 1440),
    light_minutes: num(d.light_minutes, 0, 1440), awake_minutes: num(d.awake_minutes, 0, 1440), awakenings: num(d.awakenings, 0, 100),
    sleep_start: when(d.sleep_start), sleep_end: when(d.sleep_end),
    steps: num(d.steps, 0, 200000), active_kcal: num(d.active_kcal, 0, 20000),
    resting_hr: num(d.resting_hr, 25, 200), avg_hr: num(d.avg_hr, 25, 220), hrv_ms: num(d.hrv_ms, 1, 500), spo2_avg: real(d.spo2_avg, 50, 100),
  };
  return FIELDS.some((f) => row[f] != null) ? row : null; // a day with nothing valid in it is not stored
}

// The phone app sends up to two months of daily rows. Re-sending a day updates it; a missing number keeps what was there.
r.post('/patients/:id/daily-metrics', rateLimit((req) => `daily|${req.user?.id}|${req.params.id}`, { max: 30, windowMs: 60 * 1000 }), wrap(async (req, res) => {
  const patientId = Number(req.params.id);
  if (!(await consentOn(patientId))) return res.status(403).json({ error: 'wearable_consent_required' });
  const input = Array.isArray(req.body?.days) ? req.body.days : [];
  if (!input.length) return res.status(400).json({ error: 'days_required' });
  if (input.length > 62) return res.status(400).json({ error: 'too_many_days' });
  const days = input.map(cleanDay).filter(Boolean);
  if (!days.length) return res.status(400).json({ error: 'no_valid_days' });
  const sourceName = str(req.body?.source_name, 120);

  const cols = ['patient_id', 'day', ...FIELDS, 'source', 'source_name', 'synced_at'];
  for (const d of days) {
    const vals = [patientId, d.day, ...FIELDS.map((f) => d[f]), 'health_connect', sourceName, new Date().toISOString()];
    const ph = vals.map((_, i) => `$${i + 1}`).join(',');
    const update = [...FIELDS.map((f) => `${f}=COALESCE(EXCLUDED.${f}, daily_metrics.${f})`), 'source=EXCLUDED.source', 'source_name=EXCLUDED.source_name', 'synced_at=EXCLUDED.synced_at'].join(', ');
    await q(`INSERT INTO daily_metrics (${cols.join(',')}) VALUES (${ph}) ON CONFLICT (patient_id, day) DO UPDATE SET ${update}`, vals);
  }
  await q(`INSERT INTO devices (patient_id, kind, label, last_seen) VALUES ($1,'health_connect',$2,now())
           ON CONFLICT (patient_id, kind, label) DO UPDATE SET last_seen=now()`, [patientId, sourceName || 'Health Connect']);
  res.json({ saved: days.length, skipped: input.length - days.length });
}));

r.get('/patients/:id/daily-metrics', wrap(async (req, res) => {
  const patientId = Number(req.params.id);
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 120);
  const rows = (await q(
    `SELECT to_char(day,'YYYY-MM-DD') AS day, sleep_minutes, deep_minutes, rem_minutes, light_minutes, awake_minutes, awakenings,
            sleep_start, sleep_end, steps, active_kcal, resting_hr, avg_hr, hrv_ms, spo2_avg, source, source_name, synced_at
       FROM daily_metrics WHERE patient_id=$1 AND day >= (now()::date - $2::int) ORDER BY day ASC`, [patientId, days],
  )).rows;
  const last = rows.reduce((m, x) => (!m || new Date(x.synced_at) > new Date(m) ? x.synced_at : m), null);
  res.json({ consent: await consentOn(patientId), last_synced: last, days: rows });
}));

export default r;
