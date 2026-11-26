import { Router } from 'express';
import { q } from '../db.js';
import { wrap } from '../util.js';
import { answerQuestion } from '../ask.js';

const r = Router();

r.get('/patients', wrap(async (_req, res) => res.json((await q('SELECT id, name FROM patients ORDER BY id')).rows)));

r.get('/entries', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  res.json((await q('SELECT id, ts, text, source, tier FROM entries WHERE patient_id=$1 ORDER BY ts DESC LIMIT $2', [req.query.patientId, limit])).rows);
}));

r.post('/entries', wrap(async (req, res) => {
  const { patientId, text, ts, source = 'typed', tier = 1 } = req.body || {};
  if (!patientId || !text?.trim()) return res.status(400).json({ error: 'patientId and text are required' });
  if (![0, 1, 2].includes(Number(tier))) return res.status(400).json({ error: 'tier must be 0, 1 or 2' });
  const row = (await q(
    'INSERT INTO entries (patient_id, ts, text, source, tier) VALUES ($1, COALESCE($2::timestamptz, now()), $3, $4, $5) RETURNING id, ts, text, source, tier',
    [patientId, ts || null, text.trim(), source, tier],
  )).rows[0];
  const contacts = (await q('SELECT id, name FROM contacts WHERE patient_id=$1', [patientId])).rows;
  for (const c of contacts) {
    const first = c.name.split(/\s+/).find((p) => p.length > 2 && !/^(dr|mr|mrs|ms)\.?$/i.test(p));
    const alts = [c.name, first].filter(Boolean).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (new RegExp(`\\b(${alts})\\b`, 'i').test(text)) await q('INSERT INTO entry_contacts (entry_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [row.id, c.id]);
  }
  res.status(201).json(row);
}));

r.post('/ask', wrap(async (req, res) => {
  const { patientId, question, dryRun } = req.body || {};
  if (!patientId || !question?.trim()) return res.status(400).json({ error: 'patientId and question are required' });
  res.json(await answerQuestion({ patientId, question: question.trim(), dryRun: Boolean(dryRun) }));
}));

r.get('/receipts', wrap(async (req, res) =>
  res.json((await q('SELECT id, ts, question, entry_ids, masked_count, provider, outbound, dry_run FROM receipts WHERE patient_id=$1 ORDER BY ts DESC LIMIT 20', [req.query.patientId])).rows)));

export default r;
