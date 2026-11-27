// Memora Core: the one facade the rest of the app calls. Nothing outside src/memory/ writes the memory tables.
import { addMemory, supersedeMemory, retractMemory, retractBySource, history } from './store.js';
import { search } from './retrieve.js';
import { deriveProfile, deriveObservation, deriveCareLog, rebuild } from './derive.js';
import { MemoryError } from './model.js';

export const enabled = () => process.env.MEMORY_ENGINE !== 'off';

// Derivation after a save must never block the save itself: log the problem and carry on. `rebuild` can repair it.
const safely = async (label, fn) => { if (!enabled()) return null; try { return await fn(); } catch (e) { console.error(`memory engine (${label}):`, e); return null; } };

export const engine = {
  enabled,
  search,
  history,
  rebuild,
  // a person adds a memory by hand: a stated reason is mandatory, it becomes the source
  add: ({ patientId, kind, predicate, text, tier, reason, subjectType, subjectId }, actor) =>
    addMemory({ patientId, kind, predicate, text, tier, subjectType, subjectId, confidence: 1, createdBy: actor,
      sources: [{ table: 'manual', id: null, tier: tier == null ? 1 : Number(tier), note: reason }] }),
  edit: (id, changes, actor) => supersedeMemory(id, changes, actor),
  retract: (id, actor) => retractMemory(id, actor),
  retractBySource: (table, id, actor) => safely('retract', () => retractBySource(table, id, actor)),
  onProfileSaved: (patientId, actor) => safely('profile', () => deriveProfile(patientId, actor)),
  onObservationSaved: (id, actor) => safely('observation', () => deriveObservation(id, actor)),
  onCareLogSaved: (id, actor) => safely('care log', () => deriveCareLog(id, actor)),
};

export { MemoryError };
