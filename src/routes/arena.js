import { Router } from 'express';
import { q, pool } from '../db.js';
import { wrap, str, TRAITS, CONTEXT_TYPES, RELATIONS } from '../util.js';
import { requireAdmin } from '../auth.js';

const r = Router();

// ---------- medicines (so observations can point at one) ----------
r.get('/patients/:id/medicines', wrap(async (req, res) =>
  res.json((await q('SELECT id, name, dose, schedule FROM medicines WHERE patient_id=$1 ORDER BY name', [req.params.id])).rows)));

r.post('/patients/:id/medicines', requireAdmin, wrap(async (req, res) => {
  const name = str(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: 'name is required' });
  res.status(201).json((await q('INSERT INTO medicines (patient_id, name, dose, schedule) VALUES ($1,$2,$3,$4) RETURNING id, name, dose, schedule',
    [req.params.id, name, str(req.body.dose, 60), str(req.body.schedule, 120)])).rows[0]);
}));

r.delete('/medicines/:id', requireAdmin, wrap(async (req, res) => { await q('DELETE FROM medicines WHERE id=$1', [req.params.id]); res.status(204).end(); }));

// ---------- observations ----------
r.post('/patients/:id/observations', wrap(async (req, res) => {
  const b = req.body || {};
  const patientId = Number(req.params.id);
  const ctx = CONTEXT_TYPES.includes(b.context_type) ? b.context_type : 'none';
  const rel = ctx === 'none' ? null : RELATIONS.includes(b.context_relation) ? b.context_relation : null;
  if (ctx !== 'none' && !rel) return res.status(400).json({ error: 'say whether it was before, during or after' });
  const mins = ctx === 'none' || rel === 'during' || b.minutes_offset == null || b.minutes_offset === '' ? null : Math.round(Number(b.minutes_offset));
  if (mins != null && !(mins >= 0 && mins <= 1440)) return res.status(400).json({ error: 'minutes must be between 0 and 1440' });

  const traits = [];
  for (const t of Array.isArray(b.traits) ? b.traits : []) {
    const v = Number(t.vs_usual);
    if (!TRAITS.includes(t.trait) || !Number.isInteger(v) || v < -2 || v > 2) return res.status(400).json({ error: `each characteristic needs a valid level (${t.trait || '?'})` });
    if (traits.some((x) => x.trait === t.trait)) continue;
    traits.push({ trait: t.trait, vs_usual: v, detail: str(t.detail, 600) });
  }
  const note = str(b.note, 2000);
  if (!traits.length && !note) return res.status(400).json({ error: 'add at least one characteristic or a note' });

  let medicineId = null;
  if (ctx === 'medicine' && b.medicine_id) {
    const m = (await q('SELECT id FROM medicines WHERE id=$1 AND patient_id=$2', [b.medicine_id, patientId])).rows[0];
    if (!m) return res.status(400).json({ error: 'unknown medicine' });
    medicineId = m.id;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = (await client.query(
      `INSERT INTO observations (patient_id, ts, context_type, context_relation, minutes_offset, medicine_id, note, logged_by, author_id)
       VALUES ($1, COALESCE($2::timestamptz, now()), $3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [patientId, b.ts || null, ctx, rel, mins, medicineId, note, req.user.name, req.user.id])).rows[0];
    for (const t of traits) await client.query('INSERT INTO observation_traits (observation_id, trait, vs_usual, detail) VALUES ($1,$2,$3,$4)', [o.id, t.trait, t.vs_usual, t.detail]);
    await client.query('COMMIT');
    res.status(201).json({ id: o.id });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}));

r.get('/patients/:id/observations', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  const ctx = CONTEXT_TYPES.includes(req.query.context) ? req.query.context : null;
  res.json((await q(
    `SELECT o.id, o.ts, o.context_type, o.context_relation, o.minutes_offset, o.medicine_id, m.name AS medicine_name, o.note, o.logged_by,
            COALESCE(json_agg(json_build_object('trait', t.trait, 'vs_usual', t.vs_usual, 'detail', t.detail) ORDER BY t.trait) FILTER (WHERE t.trait IS NOT NULL), '[]') AS traits
       FROM observations o
       LEFT JOIN observation_traits t ON t.observation_id = o.id
       LEFT JOIN medicines m ON m.id = o.medicine_id
      WHERE o.patient_id=$1 AND ($2::text IS NULL OR o.context_type=$2)
      GROUP BY o.id, m.name ORDER BY o.ts DESC LIMIT $3`, [req.params.id, ctx, limit])).rows);
}));

r.delete('/observations/:id', wrap(async (req, res) => { await q('DELETE FROM observations WHERE id=$1', [req.params.id]); res.status(204).end(); }));

// Descriptive only: average rating (against usual) of each characteristic noted BEFORE a medicine vs AFTER one, last 60 days.
// It reports what was written down. It says nothing about cause.
r.get('/patients/:id/observation-summary', wrap(async (req, res) => {
  const med = req.query.medicine ? Number(req.query.medicine) : null;
  const rows = (await q(
    `SELECT t.trait, o.context_relation AS relation, COUNT(*)::int AS n, ROUND(AVG(t.vs_usual)::numeric, 2)::float AS avg
       FROM observations o JOIN observation_traits t ON t.observation_id = o.id
      WHERE o.patient_id=$1 AND o.context_type='medicine' AND o.context_relation IN ('before','after')
        AND o.ts >= now() - interval '60 days' AND ($2::int IS NULL OR o.medicine_id=$2)
      GROUP BY t.trait, o.context_relation`, [req.params.id, med])).rows;
  const by = {};
  for (const x of rows) (by[x.trait] ||= { trait: x.trait })[x.relation] = { n: x.n, avg: x.avg };
  res.json({ window_days: 60, traits: Object.values(by) });
}));

export default r;
