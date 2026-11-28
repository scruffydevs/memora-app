// The phone-side reader: turns Health Connect samples into one row per day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseSleep, collectDays, localDay } from '../web/src/health.js';

// Local-time helper so the tests give the same answer in any time zone.
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

test('a night that crosses midnight belongs to the day the person woke up', () => {
  const night = {
    startDate: at(2026, 11, 26, 23, 0), endDate: at(2026, 11, 27, 6, 30), value: 450, sleepState: 'asleep', hasStageData: true,
    stages: [
      { startDate: at(2026, 11, 26, 23, 0), endDate: at(2026, 11, 27, 0, 30), stage: 'light', durationMinutes: 90 },
      { startDate: at(2026, 11, 27, 0, 30), endDate: at(2026, 11, 27, 2, 0), stage: 'deep', durationMinutes: 90 },
      { startDate: at(2026, 11, 27, 2, 0), endDate: at(2026, 11, 27, 2, 20), stage: 'awake', durationMinutes: 20 },
      { startDate: at(2026, 11, 27, 2, 20), endDate: at(2026, 11, 27, 4, 20), stage: 'rem', durationMinutes: 120 },
      { startDate: at(2026, 11, 27, 4, 20), endDate: at(2026, 11, 27, 4, 25), stage: 'awake', durationMinutes: 5 },
      { startDate: at(2026, 11, 27, 4, 25), endDate: at(2026, 11, 27, 6, 30), stage: 'light', durationMinutes: 125 },
    ],
  };
  const out = summariseSleep([night]);
  assert.deepEqual(Object.keys(out), [localDay(at(2026, 11, 27, 12))]);
  const n = out['2026-11-27'];
  assert.equal(n.sleep_minutes, 90 + 90 + 120 + 125);
  assert.equal(n.deep_minutes, 90);
  assert.equal(n.rem_minutes, 120);
  assert.equal(n.light_minutes, 215);
  assert.equal(n.awakenings, 2);
  assert.equal(n.awake_minutes, 25);
  assert.equal(new Date(n.sleep_start).getTime(), new Date(at(2026, 11, 26, 23, 0)).getTime());
});

test('wakefulness before falling asleep or after the last waking is not counted as an awakening', () => {
  const out = summariseSleep([{ startDate: at(2026, 11, 27, 0, 0), endDate: at(2026, 11, 27, 7, 0), value: 420, stages: [
    { startDate: at(2026, 11, 27, 0, 0), endDate: at(2026, 11, 27, 0, 20), stage: 'awake', durationMinutes: 20 },
    { startDate: at(2026, 11, 27, 0, 20), endDate: at(2026, 11, 27, 6, 40), stage: 'light', durationMinutes: 380 },
    { startDate: at(2026, 11, 27, 6, 40), endDate: at(2026, 11, 27, 7, 0), stage: 'awake', durationMinutes: 20 },
  ] }]);
  assert.equal(out['2026-11-27'].awakenings, 0);
  assert.equal(out['2026-11-27'].sleep_minutes, 380);
});

test('a session with no stages still gives total sleep, and a tiny fragment is not a night', () => {
  const out = summariseSleep([
    { startDate: at(2026, 11, 26, 23, 30), endDate: at(2026, 11, 27, 6, 0), value: 390, sleepState: 'asleep' },
    { startDate: at(2026, 11, 25, 22, 0), endDate: at(2026, 11, 25, 22, 10), value: 10, sleepState: 'asleep' },
  ]);
  assert.equal(out['2026-11-27'].sleep_minutes, 390);
  assert.equal(out['2026-11-27'].deep_minutes, null);
  assert.equal(out['2026-11-26'], undefined);
});

const fakeHealth = (data, failing = []) => ({
  readSamples: async ({ dataType }) => { if (failing.includes(dataType)) throw new Error('not allowed'); return { samples: data[dataType] || [] }; },
  queryAggregated: async ({ dataType }) => { if (failing.includes(dataType)) throw new Error('not allowed'); return { samples: data[dataType] || [] }; },
});

test('collectDays builds one row per day, drops zeros, and reports what each data type returned', async () => {
  const now = new Date(2026, 10, 27, 20, 0);
  const health = fakeHealth({
    sleep: [{ startDate: at(2026, 11, 26, 23, 0), endDate: at(2026, 11, 27, 6, 30), value: 450, sleepState: 'asleep' }],
    steps: [{ startDate: at(2026, 11, 26), value: 8123 }, { startDate: at(2026, 11, 27), value: 3010 }, { startDate: at(2026, 11, 25), value: 0 }],
    heartRate: [{ startDate: at(2026, 11, 27), values: { average: 74.4 } }],
    restingHeartRate: [{ startDate: at(2026, 11, 27), values: { average: 61 } }],
    oxygenSaturation: [{ startDate: at(2026, 11, 27, 3), value: 0.96 }, { startDate: at(2026, 11, 27, 4), value: 0.98 }],
  }, ['heartRateVariability']);
  const r = await collectDays(health, { days: 14, now });
  assert.deepEqual(r.days.map((d) => d.day), ['2026-11-26', '2026-11-27']);
  const d27 = r.days[1];
  assert.equal(d27.sleep_minutes, 450);
  assert.equal(d27.steps, 3010);
  assert.equal(d27.avg_hr, 74);
  assert.equal(d27.resting_hr, 61);
  assert.equal(d27.spo2_avg, 97);
  assert.equal(r.days[0].steps, 8123);
  assert.equal(r.days[0].sleep_minutes, undefined, 'no sleep that morning');
  assert.equal(r.found.steps, 2);
  assert.equal(r.found.sleep, 1);
  assert.ok(r.failed.heartRateVariability, 'a type that failed is reported, and the rest still arrive');
  assert.equal(r.found.heartRateVariability, undefined);
});

test('collectDays with nothing recorded returns no days rather than empty ones', async () => {
  const r = await collectDays(fakeHealth({}), { now: new Date(2026, 10, 27, 20, 0) });
  assert.deepEqual(r.days, []);
  assert.deepEqual(r.found, {});
});
