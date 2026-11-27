import { Router } from 'express';
import { wrap } from '../util.js';
import { requireAdmin, audit } from '../auth.js';
import { engine, MemoryError } from '../memory/engine.js';

const r = Router(); // patient scope is checked by guardPatient on /patients/:id, record scope by guardResource on /memories/:id

// Turn the engine's own errors into clean API answers.
const mem = (fn) => wrap(async (req, res) => {
  try { await fn(req, res); } catch (e) { if (e instanceof MemoryError) return res.status(e.status).json({ error: e.code }); throw e; }
});

const parseKinds = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : null);
const parseAsOf = (v) => { if (!v) return null; const t = Date.parse(v); if (!Number.isFinite(t)) throw new MemoryError('bad_as_of'); return new Date(t).toISOString(); };

// List and search. People see every tier here. Only the model-facing path (forModel) drops Tier 0, and that is used on the server.
r.get('/patients/:id/memories', mem(async (req, res) => {
  res.json(await engine.search(Number(req.params.id), {
    query: req.query.q || '', status: ['active', 'superseded', 'all'].includes(req.query.status) ? req.query.status : 'active',
    kinds: parseKinds(req.query.kind), asOf: parseAsOf(req.query.asOf), limit: req.query.limit,
  }));
}));

r.post('/patients/:id/memories/search', mem(async (req, res) => {
  const b = req.body || {};
  res.json(await engine.search(Number(req.params.id), { query: b.query || '', limit: b.limit, asOf: parseAsOf(b.asOf), kinds: parseKinds(b.kinds), status: 'active' }));
}));

r.get('/memories/:id/history', mem(async (req, res) => res.json(await engine.history(Number(req.params.id)))));

r.post('/patients/:id/memories', requireAdmin, mem(async (req, res) => {
  const b = req.body || {};
  const m = await engine.add({ patientId: Number(req.params.id), kind: b.kind, predicate: b.predicate, text: b.text, tier: b.tier, reason: b.reason, subjectType: b.subject_type, subjectId: b.subject_id }, req.user.name);
  await audit(req.user.id, 'memory_added', Number(req.params.id), `#${m.id}`);
  res.status(201).json(m);
}));

// Editing creates a new version and closes the old one.
r.put('/memories/:id', requireAdmin, mem(async (req, res) => {
  const b = req.body || {};
  const m = await engine.edit(Number(req.params.id), { text: b.text, tier: b.tier, confidence: b.confidence }, req.user.name);
  await audit(req.user.id, 'memory_edited', Number(m.patient_id), `#${req.params.id} -> #${m.id}`);
  res.json(m);
}));

r.delete('/memories/:id', requireAdmin, mem(async (req, res) => {
  const n = await engine.retract(Number(req.params.id), req.user.name);
  await audit(req.user.id, 'memory_retracted', null, `#${req.params.id} (${n} version${n === 1 ? '' : 's'})`);
  res.status(204).end();
}));

r.post('/patients/:id/memories/rebuild', requireAdmin, mem(async (req, res) => {
  const out = await engine.rebuild(Number(req.params.id), req.user.name);
  await audit(req.user.id, 'memory_rebuild', Number(req.params.id), `created ${out.created}, replaced ${out.superseded}, unchanged ${out.unchanged}`);
  res.json(out);
}));

export default r;
