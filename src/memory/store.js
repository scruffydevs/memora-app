// Memora Core: the only code that writes the memory tables. Every change is one transaction and leaves an event.
import { pool, q } from '../db.js';
import { validateMemory, inheritTier, MemoryError } from './model.js';

async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
  catch (e) { try { await c.query('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
  finally { c.release(); }
}

const event = (c, memoryId, action, actor, detail = null) =>
  c.query('INSERT INTO memory_events (memory_id, action, actor, detail) VALUES ($1,$2,$3,$4)', [memoryId, action, actor, detail]);

export async function addMemory(input, client) {
  const m = validateMemory(input);
  const tier = inheritTier(m.tier, m.sources);
  const run = async (c) => {
    const row = (await c.query(
      `INSERT INTO memories (patient_id, kind, predicate, subject_type, subject_id, text, tier, confidence, status, valid_from, supersedes_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active', COALESCE($9::timestamptz, now()), $10, $11) RETURNING *`,
      [m.patientId, m.kind, m.predicate, m.subjectType, m.subjectId, m.text, tier, m.confidence, m.validFrom, m.supersedes, m.createdBy])).rows[0];
    for (const s of m.sources) {
      await c.query('INSERT INTO memory_sources (memory_id, source_table, source_id, tier, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [row.id, s.table, s.id, s.tier, s.note]);
    }
    await event(c, row.id, 'created', m.createdBy, m.supersedes ? `replaces #${m.supersedes}` : `${m.kind}/${m.predicate}`);
    return row;
  };
  return client ? run(client) : tx(run);
}

// Replace a memory by a newer version. The old one is closed (valid_to set), not erased.
export function supersedeMemory(oldId, changes, actor) {
  return tx(async (c) => {
    const old = (await c.query("SELECT * FROM memories WHERE id=$1 AND status='active' FOR UPDATE", [oldId])).rows[0];
    if (!old) throw new MemoryError('not_active', 409);
    const sources = changes.sources ?? (await c.query('SELECT source_table AS "table", source_id AS id, tier, note FROM memory_sources WHERE memory_id=$1', [oldId])).rows;
    await c.query("UPDATE memories SET status='superseded', valid_to=now() WHERE id=$1", [oldId]);
    await event(c, oldId, 'superseded', actor, 'replaced by a newer version'); // before the new version's "created", so the history reads in order
    const next = await addMemory({
      patientId: old.patient_id, kind: old.kind, predicate: old.predicate, subjectType: old.subject_type, subjectId: old.subject_id,
      text: changes.text ?? old.text, tier: changes.tier ?? old.tier, confidence: changes.confidence ?? old.confidence,
      supersedes: old.id, createdBy: actor, sources,
    }, c);
    return next;
  });
}

// The fact is no longer true and nothing replaces it (for example a profile tag was removed). History stays.
export function closeMemory(id, actor, reason) {
  return tx(async (c) => {
    const r = await c.query("UPDATE memories SET status='superseded', valid_to=now() WHERE id=$1 AND status='active' RETURNING id", [id]);
    if (!r.rows.length) return false;
    await event(c, id, 'closed', actor, reason);
    return true;
  });
}

// Every version of the same fact: this memory, the ones it replaced, and the ones that replaced it.
async function chainIds(c, id) {
  const r = await c.query(
    `WITH RECURSIVE up AS (
       SELECT id, supersedes_id FROM memories WHERE id=$1
       UNION SELECT m.id, m.supersedes_id FROM memories m JOIN up ON m.id = up.supersedes_id),
     down AS (
       SELECT id FROM memories WHERE id=$1
       UNION SELECT m.id FROM memories m JOIN down ON m.supersedes_id = down.id)
     SELECT id FROM up UNION SELECT id FROM down`, [id]);
  return r.rows.map((x) => x.id);
}

// Retract means forget: the words of every version are blanked, the sources are removed, and only
// an event (who, when, never what) remains.
export function retractMemory(id, actor) {
  return tx(async (c) => {
    const ids = await chainIds(c, id);
    if (!ids.length) throw new MemoryError('not_found', 404);
    const ph = ids.map((_, i) => `$${i + 1}`).join(',');
    await c.query(`UPDATE memories SET text='[retracted]', status='retracted', valid_to=COALESCE(valid_to, now()) WHERE id IN (${ph})`, ids);
    await c.query(`DELETE FROM memory_sources WHERE memory_id IN (${ph})`, ids);
    for (const mid of ids) await event(c, mid, 'retracted', actor, ids.length > 1 ? 'whole version chain' : null);
    return ids.length;
  });
}

// When a source record is deleted (an observation or a care log), forget what was derived from it.
export async function retractBySource(table, sourceId, actor) {
  const rows = (await q('SELECT DISTINCT memory_id FROM memory_sources WHERE source_table=$1 AND source_id=$2', [table, sourceId])).rows;
  let n = 0;
  for (const r of rows) { try { n += await retractMemory(r.memory_id, actor); } catch (e) { if (!(e instanceof MemoryError)) throw e; } }
  return n;
}

export async function getMemory(id) {
  return (await q('SELECT * FROM memories WHERE id=$1', [id])).rows[0] || null;
}

export async function history(id) {
  const c = { query: (t, p) => q(t, p) };
  const ids = await chainIds(c, id);
  if (!ids.length) throw new MemoryError('not_found', 404);
  const ph = ids.map((_, i) => `$${i + 1}`).join(',');
  const versions = (await q(`SELECT id, status, tier, confidence, valid_from, valid_to, supersedes_id, created_by, created_at, text FROM memories WHERE id IN (${ph}) ORDER BY id`, ids)).rows;
  const events = (await q(`SELECT memory_id, ts, action, actor, detail FROM memory_events WHERE memory_id IN (${ph}) ORDER BY ts, id`, ids)).rows;
  return { versions, events };
}
