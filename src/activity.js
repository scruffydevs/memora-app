// What the backend is doing, as it happens. The backend showcase (admin only) reads this feed.
// Every event is a short plain sentence made of counts and labels. It never carries the content of a record.
const KEEP = 300;
const events = [];
let seq = 0;
const listeners = new Set();
const coalesce = new Map();

export function record(kind, patientId, text) {
  const e = { id: ++seq, ts: new Date().toISOString(), kind, patient_id: patientId ?? null, text };
  events.push(e);
  if (events.length > KEEP) events.shift();
  const frame = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of listeners) res.write(frame);
  return e;
}

// Busy sources (a live sensor posting every few seconds) become one line per window with a running count.
export function recordBurst(key, kind, patientId, count, label, windowMs = 15000) {
  const now = Date.now();
  const cur = coalesce.get(key) || { n: 0, at: 0 };
  cur.n += count;
  if (now - cur.at >= windowMs) { record(kind, patientId, `${cur.n} live reading${cur.n === 1 ? '' : 's'} from ${label}`); cur.n = 0; cur.at = now; }
  coalesce.set(key, cur);
}

export const recent = (limit = 100) => events.slice(-Math.min(Math.max(Number(limit) || 100, 1), KEEP));

export function subscribe(res) {
  listeners.add(res);
  res.on('close', () => listeners.delete(res));
}

// Audit entries worth showing live. Free-text details are left out; only counts and ids from our own code are kept.
const SHOW_DETAIL = new Set(['memory_rebuild', 'memory_added', 'memory_edited', 'memory_retracted', 'patient_created']);
export function recordAudit(action, patientId, detail) {
  record('team', patientId, `${action.replace(/_/g, ' ')}${detail && SHOW_DETAIL.has(action) ? ` (${detail})` : ''}`);
}

export const resetActivity = () => { events.length = 0; coalesce.clear(); };
