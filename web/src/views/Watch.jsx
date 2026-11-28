import React, { useState } from 'react';
import { api } from '../api.js';
import { Btn, Card, Chip, H2, Notice, dateTime, useAsync } from '../ui.jsx';
import { isNative, Health } from '../native.js';
import { collectDays, READ_TYPES } from '../health.js';

// Daily numbers from a watch: sleep, steps and heart rate. The Memora Android app reads them from Health Connect
// (where the watch's own app writes them) and sends one row per day. A browser shows what has been sent.
const hm = (m) => (m == null ? 'None' : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`);
const dayText = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const TYPE_LABEL = { sleep: 'Sleep', steps: 'Steps', heartRate: 'Heart rate', restingHeartRate: 'Resting heart rate', heartRateVariability: 'Heart rate variability', oxygenSaturation: 'Blood oxygen', calories: 'Active calories' };

function Bar({ value, max, tone = 'bg-terra' }) {
  return <div className="h-2 rounded-full bg-line overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${value ? Math.max(4, Math.min(100, (value / max) * 100)) : 0}%` }} /></div>;
}

export default function Watch({ pid }) {
  const { data, loading, error, reload } = useAsync(() => api.get(`/api/patients/${pid}/daily-metrics?days=30`), [pid]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState(null);
  const native = isNative();

  async function allow() {
    setProblem(null);
    try {
      const a = await Health.isAvailable();
      if (!a.available) { setProblem(a.reason || 'Health Connect is not available on this phone. Install “Health Connect by Android” from the Play Store.'); return; }
      await Health.requestAuthorization({ read: READ_TYPES });
      setResult({ message: 'Access updated. Tap Sync now.' });
    } catch (e) { setProblem(e?.message || 'Could not open Health Connect.'); }
  }

  async function sync() {
    setBusy(true); setProblem(null); setResult(null);
    try {
      const a = await Health.isAvailable();
      if (!a.available) { setProblem(a.reason || 'Health Connect is not available on this phone.'); return; }
      const got = await collectDays(Health, { days: 14 });
      if (!got.days.length) { setResult({ found: got.found, failed: got.failed, message: 'Health Connect had nothing to send for the last 14 days. Open the watch app, let it sync, and check it is allowed to write to Health Connect.' }); return; }
      const saved = await api.post(`/api/patients/${pid}/daily-metrics`, { source_name: 'Health Connect', days: got.days });
      setResult({ found: got.found, failed: got.failed, message: `Sent ${saved.saved} day${saved.saved === 1 ? '' : 's'}.` });
      reload();
    } catch (e) { setProblem(e?.message || 'Sync failed.'); } finally { setBusy(false); }
  }

  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="terra">{error.message}</Notice>;
  const days = [...data.days].reverse(); // newest first
  const maxSleep = Math.max(600, ...days.map((d) => d.sleep_minutes || 0));
  const maxSteps = Math.max(8000, ...days.map((d) => d.steps || 0));

  return (
    <div className="space-y-6">
      <H2 hint="Sleep, steps and heart rate from a watch, one row a day. The Memora Android app reads them from Health Connect.">Watch data</H2>

      {!data.consent && <Notice tone="gold">Watch data is off for this person. The Memora team can switch it on under Consent.</Notice>}

      <Card className="p-5">
        {native ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-display text-xl font-bold mr-auto">Sync from this phone</p>
              <Btn kind="ghost" onClick={allow} disabled={busy}>Allow access</Btn>
              <Btn onClick={sync} disabled={busy || !data.consent}>{busy ? 'Syncing…' : 'Sync now'}</Btn>
            </div>
            <p className="text-sm text-muted">Link the watch app (for Amazfit, the Zepp app) to Health Connect first. Then tap Allow access once, and Sync now whenever you want fresh numbers.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto"><p className="font-display text-xl font-bold">Synced from the Android app</p><p className="text-sm text-muted">Open Memora on the Android phone that holds the watch data, then sign in and tap Sync now here.</p></div>
          </div>
        )}
        {problem && <div className="mt-3"><Notice tone="terra">{problem}</Notice></div>}
        {result && (
          <div className="mt-3 space-y-2">
            <Notice tone="sage">{result.message}</Notice>
            {result.found && (
              <div>
                <p className="text-sm font-semibold mb-1">What the watch gave Health Connect (days with data)</p>
                <div className="flex flex-wrap gap-2">
                  {READ_TYPES.map((t) => <Chip key={t} tone={result.found[t] ? 'sage' : 'plain'}>{`${TYPE_LABEL[t]}: ${result.found[t] || 0}`}</Chip>)}
                </div>
                {Object.keys(result.failed || {}).length > 0 && <p className="text-xs text-muted mt-2">Could not read: {Object.keys(result.failed).map((t) => TYPE_LABEL[t] || t).join(', ')}. Allow them under Allow access.</p>}
              </div>
            )}
          </div>
        )}
        {data.last_synced && <p className="text-xs text-muted mt-3">Last synced {dateTime(data.last_synced)}</p>}
      </Card>

      {days.length === 0 ? (
        <Card className="p-8 text-center text-muted">No watch data yet.</Card>
      ) : (
        <Card className="p-0 overflow-hidden hidden sm:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted border-b border-line">
                <tr><th className="p-3 font-semibold">Day</th><th className="p-3 font-semibold min-w-[9rem]">Sleep</th><th className="p-3 font-semibold">Awake in the night</th><th className="p-3 font-semibold min-w-[9rem]">Steps</th><th className="p-3 font-semibold">Resting heart rate</th></tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day} className="border-b border-line last:border-0 align-top">
                    <td className="p-3 whitespace-nowrap font-semibold">{dayText(d.day)}</td>
                    <td className="p-3"><div className="tabular-nums">{hm(d.sleep_minutes)}</div><Bar value={d.sleep_minutes} max={maxSleep} /></td>
                    <td className="p-3 tabular-nums text-muted">{d.awakenings != null ? `${d.awakenings} time${d.awakenings === 1 ? '' : 's'}, ${d.awake_minutes ?? 0} min` : 'None'}</td>
                    <td className="p-3"><div className="tabular-nums">{d.steps != null ? d.steps.toLocaleString() : 'None'}</div><Bar value={d.steps} max={maxSteps} tone="bg-sage" /></td>
                    <td className="p-3 tabular-nums text-muted">{d.resting_hr != null ? `${d.resting_hr} bpm` : 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {days.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {days.map((d) => (
            <Card key={d.day} className="p-4">
              <p className="font-semibold">{dayText(d.day)}</p>
              <div className="mt-2 space-y-3">
                <div><div className="flex justify-between text-sm"><span className="text-muted">Sleep</span><span className="tabular-nums font-semibold">{hm(d.sleep_minutes)}</span></div><Bar value={d.sleep_minutes} max={maxSleep} /></div>
                <div><div className="flex justify-between text-sm"><span className="text-muted">Steps</span><span className="tabular-nums font-semibold">{d.steps != null ? d.steps.toLocaleString() : 'None'}</span></div><Bar value={d.steps} max={maxSteps} tone="bg-sage" /></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Awake in the night</span><span className="tabular-nums">{d.awakenings != null ? `${d.awakenings} time${d.awakenings === 1 ? '' : 's'}, ${d.awake_minutes ?? 0} min` : 'None'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Resting heart rate</span><span className="tabular-nums">{d.resting_hr != null ? `${d.resting_hr} bpm` : 'None'}</span></div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
