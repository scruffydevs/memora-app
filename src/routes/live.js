import { Router } from 'express';
import { q } from '../db.js';
import { wrap, str } from '../util.js';
import { rateLimit, requireAdmin } from '../auth.js';
import { subscribe, publish } from '../live.js';
import { recordBurst } from '../activity.js';

const r = Router(); // mounted under /api; patient access is checked by guardPatient on /patients/:id

const RANGES = { heart_rate: [30, 220], motion: [0, 100], lat: [-90, 90], lon: [-180, 180] };
const DEVICE_KINDS = ['phone_sensors', 'ble_heart_rate', 'simulator'];
const MAX_SAMPLES = 100;

const consentOn = async (patientId) =>
  Boolean((await q('SELECT consent_wearables FROM patient_profiles WHERE patient_id=$1', [patientId])).rows[0]?.consent_wearables);

const rad = (d) => (d * Math.PI) / 180;
function metres(a, b) { // haversine
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// Places with coordinates (home, park, pharmacy). The team sets them; caregivers read them. Coordinates are Tier 0.
r.get('/patients/:id/places', wrap(async (req, res) =>
  res.json((await q('SELECT id, label, lat, lon, radius_m, private FROM places WHERE patient_id=$1 ORDER BY label', [req.params.id])).rows)));

r.post('/patients/:id/places', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const label = str(b.label, 80);
  const lat = Number(b.lat); const lon = Number(b.lon); const radius = Math.round(Number(b.radius_m) || 100);
  if (!label) return res.status(400).json({ error: 'label_required' });
  if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return res.status(400).json({ error: 'bad_coordinates' });
  if (radius < 10 || radius > 5000) return res.status(400).json({ error: 'bad_radius' });
  res.status(201).json((await q('INSERT INTO places (patient_id, label, lat, lon, radius_m, private) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, label, lat, lon, radius_m, private',
    [req.params.id, label, lat, lon, radius, Boolean(b.private)])).rows[0]);
}));

r.delete('/places/:id', requireAdmin, wrap(async (req, res) => { await q('DELETE FROM places WHERE id=$1', [req.params.id]); res.status(204).end(); }));

// Samples in. Refused unless the patient (or their representative) has switched wearable data on.
r.post('/patients/:id/live/samples', rateLimit((req) => `live|${req.user?.id}|${req.params.id}`, { max: 240, windowMs: 60 * 1000 }), wrap(async (req, res) => {
  const patientId = Number(req.params.id);
  if (!(await consentOn(patientId))) return res.status(403).json({ error: 'wearable_consent_required' });
  const b = req.body || {};
  const kind = b.device?.kind;
  if (!DEVICE_KINDS.includes(kind)) return res.status(400).json({ error: 'unknown_device_kind' });
  const label = str(b.device.label, 80) || kind;
  const input = Array.isArray(b.samples) ? b.samples.slice(0, MAX_SAMPLES) : [];
  if (!input.length) return res.status(400).json({ error: 'no_samples' });

  let dev = (await q('SELECT id FROM devices WHERE patient_id=$1 AND kind=$2 AND label=$3', [patientId, kind, label])).rows[0];
  if (!dev) dev = (await q('INSERT INTO devices (patient_id, kind, label) VALUES ($1,$2,$3) ON CONFLICT (patient_id, kind, label) DO UPDATE SET label=EXCLUDED.label RETURNING id', [patientId, kind, label])).rows[0];

  const now = Date.now();
  let accepted = 0; let rejected = 0;
  for (const s of input) {
    const range = RANGES[s?.kind];
    const v = Number(s?.value);
    if (!range || !Number.isFinite(v) || v < range[0] || v > range[1]) { rejected++; continue; }
    const t = Date.parse(s.ts);
    const ts = Number.isFinite(t) && Math.abs(t - now) <= 5 * 60 * 1000 ? new Date(t) : new Date(now); // clocks may differ a little
    await q('INSERT INTO signals (patient_id, ts, kind, value, device_id) VALUES ($1,$2,$3,$4,$5)', [patientId, ts, s.kind, v, dev.id]);
    publish(patientId, { kind: s.kind, value: v, ts: ts.toISOString(), device: { kind, label } });
    accepted++;
  }
  await q('UPDATE devices SET last_seen=now() WHERE id=$1', [dev.id]);
  if (accepted) recordBurst(`${patientId}|${kind}|${label}`, 'live', patientId, accepted, label);
  res.json({ accepted, rejected });
}));

// Samples out: a live stream (Server-Sent Events) for dashboards.
r.get('/patients/:id/live', wrap(async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  subscribe(Number(req.params.id), res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => clearInterval(ping));
}));

// Current state: the last few minutes of samples, a plain summary, devices, and where the phone is relative to known places.
r.get('/patients/:id/live/state', wrap(async (req, res) => {
  const patientId = Number(req.params.id);
  const minutes = Math.min(Math.max(Number(req.query.minutes) || 10, 1), 120);
  const consent = await consentOn(patientId);
  const samples = (await q(
    `SELECT s.kind, s.ts, s.value FROM signals s
      WHERE s.patient_id=$1 AND s.device_id IS NOT NULL AND s.ts > now() - make_interval(mins => $2::int)
      ORDER BY s.ts`, [patientId, minutes])).rows;
  const places = (await q('SELECT label, lat, lon, radius_m FROM places WHERE patient_id=$1 AND lat IS NOT NULL AND lon IS NOT NULL', [patientId])).rows;
  const devices = (await q('SELECT kind, label, last_seen FROM devices WHERE patient_id=$1 ORDER BY last_seen DESC NULLS LAST', [patientId])).rows;

  const of = (k) => samples.filter((x) => x.kind === k).map((x) => Number(x.value));
  const hr = of('heart_rate'); const mo = of('motion');
  const lats = samples.filter((x) => x.kind === 'lat'); const lons = samples.filter((x) => x.kind === 'lon');
  let location = null;
  if (lats.length && lons.length) {
    const here = { lat: Number(lats[lats.length - 1].value), lon: Number(lons[lons.length - 1].value) };
    let nearest = null;
    for (const p of places) { const d = metres(here, { lat: Number(p.lat), lon: Number(p.lon) }); if (!nearest || d < nearest.distance_m) nearest = { label: p.label, distance_m: Math.round(d), inside: d <= p.radius_m }; }
    location = { ...here, ts: lats[lats.length - 1].ts, nearest };
  }
  res.json({
    consent, window_minutes: minutes, places,
    samples: samples.map((x) => ({ kind: x.kind, ts: x.ts, value: Number(x.value) })),
    summary: {
      heart_rate: hr.length ? { n: hr.length, avg: Math.round(hr.reduce((a, v) => a + v, 0) / hr.length), min: Math.min(...hr), max: Math.max(...hr) } : null,
      motion: mo.length ? { n: mo.length, avg: Math.round((mo.reduce((a, v) => a + v, 0) / mo.length) * 100) / 100 } : null,
      location,
    },
    devices,
  });
}));

export default r;
