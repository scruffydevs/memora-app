// Memora Core: finding memories. Keyword search for now; embeddings and hybrid ranking arrive in milestone 3.
import { q } from '../db.js';
import { KINDS } from './model.js';

export async function search(patientId, opts = {}) {
  const { query = '', limit = 20, asOf = null, kinds = null, status = 'active', forModel = false } = opts;
  const where = ['m.patient_id = $1']; const params = [patientId];
  const add = (v) => { params.push(v); return `$${params.length}`; };

  if (asOf) { // what was true at that moment (retracted memories are never shown)
    const t = add(new Date(asOf).toISOString());
    where.push(`m.status <> 'retracted' AND m.valid_from <= ${t}::timestamptz AND (m.valid_to IS NULL OR m.valid_to > ${t}::timestamptz)`);
  } else if (status === 'all') where.push("m.status <> 'retracted'");
  else where.push(`m.status = ${add(status)}`);

  if (forModel) where.push('m.tier IN (1, 2)'); // Tier 0 is never retrieved for a model
  const ks = (kinds || []).filter((k) => KINDS.includes(k));
  if (ks.length) where.push(`m.kind IN (${ks.map((k) => add(k)).join(',')})`);

  const words = [...new Set(String(query).toLowerCase().match(/[a-z]{3,}/g) || [])];
  let rank = '0.0::float'; // a decimal constant: a bare integer in ORDER BY would mean a column position
  if (words.length) {
    const tsq = add(words.join(' | '));
    where.push(`m.search @@ to_tsquery('english', ${tsq})`);
    rank = `ts_rank(m.search, to_tsquery('english', ${tsq}))`;
  }
  const rows = (await q(
    `SELECT m.id, m.kind, m.predicate, m.subject_type, m.subject_id, m.text, m.tier, m.confidence, m.status, m.valid_from, m.valid_to,
            m.supersedes_id, m.created_by, m.created_at, ${rank} AS score
       FROM memories m WHERE ${where.join(' AND ')}
      ORDER BY ${rank} DESC, m.confidence DESC, m.valid_from DESC LIMIT ${Math.min(Number(limit) || 20, 200)}`, params)).rows;

  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map((_, i) => `$${i + 1}`).join(',');
  const sources = (await q(`SELECT memory_id, source_table AS "table", source_id AS id, tier, note FROM memory_sources WHERE memory_id IN (${ph})`, ids)).rows;
  const by = new Map();
  for (const s of sources) { const k = String(s.memory_id); (by.get(k) || by.set(k, []).get(k)).push({ table: s.table, id: s.id, tier: s.tier, note: s.note }); }
  return rows.map((r) => ({ ...r, score: Number(r.score), sources: by.get(String(r.id)) || [] }));
}
