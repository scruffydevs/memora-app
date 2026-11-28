// Turns what Health Connect holds (read on the phone through the Health plugin) into one row per day for Memora.
// Pure functions plus one reader that takes the plugin as an argument, so it can be tested without a phone.

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

// A night belongs to the day the person woke up. Shifting by six hours puts a segment that ends at 23:40 on the next day
// and one that ends at 07:00 on the same day. A nap in the afternoon counts toward that day's sleep.
const NIGHT_SHIFT_MS = 6 * 3600e3;
const nightKey = (end) => localDay(new Date(new Date(end).getTime() + NIGHT_SHIFT_MS));
const minutesBetween = (a, b) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);
const ASLEEP = new Set(['asleep', 'light', 'deep', 'rem']);

// Sleep samples may arrive as whole sessions with stage segments, or as one sample per segment. Both are handled.
export function summariseSleep(samples) {
  const nights = {};
  const add = (key, seg) => { (nights[key] ||= []).push(seg); };
  for (const s of samples || []) {
    if (Array.isArray(s.stages) && s.stages.length) {
      for (const g of s.stages) add(nightKey(g.endDate), { start: g.startDate, end: g.endDate, stage: g.stage, minutes: g.durationMinutes ?? minutesBetween(g.startDate, g.endDate) });
    } else if (s.startDate && s.endDate) {
      add(nightKey(s.endDate), { start: s.startDate, end: s.endDate, stage: s.sleepState || 'asleep', minutes: Number.isFinite(s.value) && s.value > 0 ? s.value : minutesBetween(s.startDate, s.endDate) });
    }
  }
  const out = {};
  for (const [day, segs] of Object.entries(nights)) {
    segs.sort((a, b) => new Date(a.start) - new Date(b.start));
    const sleepSegs = segs.filter((g) => ASLEEP.has(g.stage));
    const sum = (f) => Math.round(segs.filter(f).reduce((t, g) => t + g.minutes, 0));
    const sleep = Math.round(sleepSegs.reduce((t, g) => t + g.minutes, 0));
    if (sleep < 30) continue; // not a night
    const first = new Date(sleepSegs[0].start).getTime();
    const last = Math.max(...sleepSegs.map((g) => new Date(g.end).getTime()));
    // wakefulness counts only between falling asleep and the final waking
    const awake = segs.filter((g) => g.stage === 'awake' && new Date(g.start).getTime() >= first && new Date(g.end).getTime() <= last && g.minutes >= 1);
    out[day] = {
      sleep_minutes: sleep,
      deep_minutes: sum((g) => g.stage === 'deep') || null,
      rem_minutes: sum((g) => g.stage === 'rem') || null,
      light_minutes: sum((g) => g.stage === 'light') || null,
      awake_minutes: Math.round(awake.reduce((t, g) => t + g.minutes, 0)),
      awakenings: awake.length,
      sleep_start: new Date(first).toISOString(),
      sleep_end: new Date(last).toISOString(),
    };
  }
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function meanByDay(samples, pick = (s) => s.value) {
  const by = {};
  for (const s of samples || []) { const v = pick(s); if (Number.isFinite(v)) (by[localDay(s.startDate)] ||= []).push(v); }
  return Object.fromEntries(Object.entries(by).map(([d, xs]) => [d, mean(xs)]));
}
function bucketByDay(samples, field = 'value') {
  const by = {};
  for (const s of samples || []) { const v = s.values?.[field] ?? s.value; if (Number.isFinite(v)) by[localDay(s.startDate)] = v; }
  return by;
}

export const READ_TYPES = ['steps', 'sleep', 'heartRate', 'restingHeartRate', 'heartRateVariability', 'oxygenSaturation', 'calories'];

// Reads the last `days` days from Health Connect. One failing data type never stops the others.
// `found` says how many days each type returned, which shows what the watch really writes into Health Connect.
export async function collectDays(Health, { days = 14, now = new Date() } = {}) {
  const end = new Date(now);
  const startDay = new Date(end); startDay.setHours(0, 0, 0, 0); startDay.setDate(startDay.getDate() - days);
  const startDate = new Date(startDay.getTime() - 12 * 3600e3).toISOString(); // include the evening before, for the first night
  const endDate = end.toISOString();
  const found = {}; const failed = {};
  const attempt = async (name, fn) => { try { const v = await fn(); return v; } catch (e) { failed[name] = String(e?.message || e); return null; } };
  const read = (dataType) => attempt(dataType, async () => (await Health.readSamples({ dataType, startDate, endDate, limit: 5000, ascending: true })).samples);
  const agg = (dataType, aggregation) => attempt(dataType, async () => (await Health.queryAggregated({ dataType, startDate, endDate, bucket: 'day', aggregation })).samples);

  const [sleepRaw, steps, hr, resting, hrv, spo2, kcal] = [
    await read('sleep'), await agg('steps', 'sum'), await agg('heartRate', 'average'), await agg('restingHeartRate', 'average'),
    await read('heartRateVariability'), await read('oxygenSaturation'), await agg('calories', 'sum'),
  ];

  const sleep = summariseSleep(sleepRaw);
  const stepsBy = bucketByDay(steps); const hrBy = bucketByDay(hr, 'average'); const restBy = bucketByDay(resting, 'average');
  const hrvBy = meanByDay(hrv); const kcalBy = bucketByDay(kcal);
  const spo2By = meanByDay(spo2, (s) => (s.value <= 1 ? s.value * 100 : s.value));
  const round = (v) => (v == null ? null : Math.round(v));
  const positive = (v) => (v > 0 ? v : null); // Health Connect returns 0 when nothing was recorded

  const dayKeys = new Set([...Object.keys(sleep), ...Object.keys(stepsBy), ...Object.keys(hrBy), ...Object.keys(restBy), ...Object.keys(hrvBy), ...Object.keys(kcalBy), ...Object.keys(spo2By)]);
  const rows = [];
  for (const day of [...dayKeys].sort()) {
    if (day < localDay(startDay)) continue; // the evening-before buffer is only for sleep
    const row = {
      day, ...(sleep[day] || {}),
      steps: round(positive(stepsBy[day])), avg_hr: round(positive(hrBy[day])), resting_hr: round(positive(restBy[day])),
      hrv_ms: round(positive(hrvBy[day])), active_kcal: round(positive(kcalBy[day])), spo2_avg: spo2By[day] != null ? Math.round(spo2By[day] * 10) / 10 : null,
    };
    if (!['sleep_minutes', 'steps', 'avg_hr', 'resting_hr', 'hrv_ms', 'active_kcal', 'spo2_avg'].some((k) => row[k] != null)) continue; // nothing was recorded that day
    for (const [k, t] of [['sleep_minutes', 'sleep'], ['steps', 'steps'], ['avg_hr', 'heartRate'], ['resting_hr', 'restingHeartRate'], ['hrv_ms', 'heartRateVariability'], ['spo2_avg', 'oxygenSaturation'], ['active_kcal', 'calories']]) {
      if (row[k] != null) found[t] = (found[t] || 0) + 1;
    }
    rows.push(row);
  }
  return { days: rows, found, failed };
}
