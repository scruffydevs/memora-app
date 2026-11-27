// A tiny in-process hub: connected dashboards subscribe per patient; new samples are pushed to them (Server-Sent Events).
// One server process only. If we ever run several, this becomes a shared channel (for example Postgres LISTEN/NOTIFY).
const hubs = new Map();

export function subscribe(patientId, res) {
  let set = hubs.get(patientId);
  if (!set) { set = new Set(); hubs.set(patientId, set); }
  set.add(res);
  res.on('close', () => { set.delete(res); if (!set.size) hubs.delete(patientId); });
}

export function publish(patientId, event) {
  const set = hubs.get(patientId);
  if (!set) return;
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) res.write(frame);
}

export const listeners = (patientId) => hubs.get(patientId)?.size ?? 0;
