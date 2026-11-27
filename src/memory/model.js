// Memora Core: what a valid memory is. Everything that writes a memory goes through validateMemory.
export const KINDS = ['fact', 'preference', 'routine', 'relationship', 'observation', 'event'];
export const SUBJECT_TYPES = ['patient', 'contact', 'place', 'medicine'];
export const SOURCE_TABLES = ['profile', 'observations', 'care_logs', 'entries', 'manual'];

// Predicates that hold ONE current value per patient: a new value supersedes the old one.
export const SINGLE_VALUED = ['background', 'communication', 'routine', 'language', 'age_band', 'preferred_name', 'condition', 'allergy', 'emergency_contact', 'clinician'];

export class MemoryError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const isId = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

export function validateMemory(m) {
  if (!isId(m.patientId)) throw new MemoryError('patient_required');
  if (!KINDS.includes(m.kind)) throw new MemoryError('bad_kind');
  const predicate = String(m.predicate || '').trim().toLowerCase();
  if (!/^[a-z][a-z_]{1,39}$/.test(predicate)) throw new MemoryError('bad_predicate');
  const text = String(m.text ?? '').trim();
  if (!text || text.length > 1000) throw new MemoryError('bad_text');
  const subjectType = m.subjectType || 'patient';
  if (!SUBJECT_TYPES.includes(subjectType)) throw new MemoryError('bad_subject');
  const tier = m.tier == null ? 1 : Number(m.tier);
  if (![0, 1, 2].includes(tier)) throw new MemoryError('bad_tier');
  const confidence = m.confidence == null ? 0.9 : Number(m.confidence);
  if (!(confidence >= 0 && confidence <= 1)) throw new MemoryError('bad_confidence');
  const createdBy = String(m.createdBy || '').trim().slice(0, 120);
  if (!createdBy) throw new MemoryError('created_by_required');

  // Provenance is mandatory: a memory with no source is refused.
  const sources = (Array.isArray(m.sources) ? m.sources : []).map((s) => {
    if (!SOURCE_TABLES.includes(s.table)) throw new MemoryError('bad_source');
    if (s.table === 'manual' && !String(s.note || '').trim()) throw new MemoryError('reason_required');
    const stier = s.tier == null ? 1 : Number(s.tier);
    if (![0, 1, 2].includes(stier)) throw new MemoryError('bad_tier');
    return { table: s.table, id: s.id == null ? null : Number(s.id), tier: stier, note: s.note ? String(s.note).slice(0, 300) : null };
  });
  if (!sources.length) throw new MemoryError('sources_required');

  return {
    patientId: Number(m.patientId), kind: m.kind, predicate, text, subjectType,
    subjectId: m.subjectId == null ? null : Number(m.subjectId), tier, confidence, createdBy, sources,
    validFrom: m.validFrom || null, supersedes: m.supersedes == null ? null : Number(m.supersedes),
  };
}

// Tiers: 0 never leaves the vault (the strictest), 1 is masked, 2 is sent as written.
// A memory is never less strict than its strictest source, so it takes the LOWEST tier number among them.
// It can be made stricter by a person, never looser than what it came from.
export const inheritTier = (requested, sources) => {
  const r = Number.isInteger(Number(requested)) ? Number(requested) : 1;
  return Math.min(r, ...sources.map((s) => (Number.isInteger(Number(s.tier)) ? Number(s.tier) : 1)));
};
