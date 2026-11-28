import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, subscribe } from '../api.js';
import { Btn, Card, Chip, H2, Notice, dateTime } from '../ui.jsx';

// Live data: a phone's sensors, a Bluetooth heart-rate device, or a simulator feed one pipeline.
// Samples go to the server (Tier 0, never sent to an AI model) and come back to every open dashboard as a live stream.
const KEEP = 150;
const FLUSH_MS = 5000;
const parseHr = (dv) => ((dv.getUint8(0) & 1) ? dv.getUint16(1, true) : dv.getUint8(1)); // Bluetooth Heart Rate Measurement

function Spark({ points, color = 'var(--c-terra)', min, max, height = 64 }) {
  if (points.length < 2) return <div style={{ height }} className="rounded-lg bg-sand/60 flex items-center justify-center text-xs text-muted">waiting for data</div>;
  const lo = min ?? Math.min(...points.map((p) => p.v)); const hi = max ?? Math.max(...points.map((p) => p.v));
  const span = hi - lo || 1; const w = 320;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${height - 4 - ((p.v - lo) / span) * (height - 8)}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} role="img" aria-label="recent values"><polyline points={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

export default function Live({ pid }) {
  const [state, setState] = useState(null);
  const [series, setSeries] = useState({ heart_rate: [], motion: [] });
  const [loc, setLoc] = useState(null);
  const [running, setRunning] = useState({ phone: false, ble: false, sim: false });
  const [msg, setMsg] = useState(null);
  const [places, setPlaces] = useState([]);
  const [streamOn, setStreamOn] = useState(false);
  const buf = useRef({ hr: [], motion: [], loc: null });
  const handles = useRef({});
  const bleName = useRef('Heart-rate device');

  const push = useCallback((kind, value, ts) => {
    if (kind === 'heart_rate' || kind === 'motion') setSeries((s) => ({ ...s, [kind]: [...s[kind], { t: ts, v: value }].slice(-KEEP) }));
  }, []);

  // initial state, then the live stream
  const load = useCallback(async () => {
    try {
      const st = await api.get(`/api/patients/${pid}/live/state?minutes=10`);
      setState(st);
      const hr = []; const mo = []; let lat; let lon; let ts;
      for (const s of st.samples) { if (s.kind === 'heart_rate') hr.push({ t: s.ts, v: s.value }); if (s.kind === 'motion') mo.push({ t: s.ts, v: s.value }); if (s.kind === 'lat') lat = s.value; if (s.kind === 'lon') { lon = s.value; ts = s.ts; } }
      setSeries({ heart_rate: hr.slice(-KEEP), motion: mo.slice(-KEEP) });
      if (st.summary.location) setLoc(st.summary.location); else if (lat != null) setLoc({ lat, lon, ts });
    } catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  }, [pid]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!state?.consent) return undefined;
    let lastLat = null;
    const stop = subscribe(`/api/patients/${pid}/live`, { onOpen: () => setStreamOn(true), onError: () => setStreamOn(false), onMessage: (raw) => {
      const m = JSON.parse(raw);
      push(m.kind, m.value, m.ts);
      if (m.kind === 'lat') lastLat = m.value;
      if (m.kind === 'lon' && lastLat != null) {
        setLoc((cur) => ({ ...(cur || {}), lat: lastLat, lon: m.value, ts: m.ts }));
        api.get(`/api/patients/${pid}/live/state?minutes=1`).then((st) => { if (st.summary.location) setLoc(st.summary.location); setPlaces(st.places || []); setState((s) => ({ ...s, devices: st.devices, summary: st.summary })); }).catch(() => {});
      }
      if (m.kind === 'heart_rate' || m.kind === 'motion') setState((s) => s && { ...s, devices: s.devices.some((d) => d.label === m.device.label) ? s.devices.map((d) => (d.label === m.device.label ? { ...d, last_seen: m.ts } : d)) : [{ ...m.device, last_seen: m.ts }, ...s.devices] });
    } });
    return () => { stop(); setStreamOn(false); };
  }, [pid, state?.consent, push]);

  const send = useCallback(async (device, samples) => {
    if (!samples.length) return;
    try { await api.post(`/api/patients/${pid}/live/samples`, { device, samples }); }
    catch (e) { setMsg({ tone: 'terra', t: e.message }); }
  }, [pid]);

  // ---- phone sensors (motion + location) ----
  const startPhone = async () => {
    setMsg(null);
    if (!('geolocation' in navigator)) return setMsg({ tone: 'terra', t: 'This browser has no location access.' });
    handles.current.watch = navigator.geolocation.watchPosition(
      (p) => { buf.current.loc = { lat: p.coords.latitude, lon: p.coords.longitude }; },
      (e) => setMsg({ tone: 'terra', t: `Location: ${e.message}` }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    handles.current.motion = (e) => {
      const a = e.accelerationIncludingGravity; if (!a) return;
      buf.current.motion.push(Math.abs(Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2) - 9.81));
    };
    window.addEventListener('devicemotion', handles.current.motion);
    handles.current.phoneTimer = setInterval(() => {
      const out = []; const m = buf.current.motion; buf.current.motion = [];
      if (m.length) out.push({ kind: 'motion', value: Math.min(100, m.reduce((a, v) => a + v, 0) / m.length) });
      if (buf.current.loc) out.push({ kind: 'lat', value: buf.current.loc.lat }, { kind: 'lon', value: buf.current.loc.lon });
      send({ kind: 'phone_sensors', label: 'Android phone' }, out);
    }, FLUSH_MS);
    setRunning((r) => ({ ...r, phone: true }));
  };
  const stopPhone = () => {
    if (handles.current.watch != null) navigator.geolocation.clearWatch(handles.current.watch);
    window.removeEventListener('devicemotion', handles.current.motion);
    clearInterval(handles.current.phoneTimer);
    setRunning((r) => ({ ...r, phone: false }));
  };

  // ---- Bluetooth heart-rate device (Web Bluetooth: Chrome or Edge, secure page) ----
  const startBle = async () => {
    setMsg(null);
    if (!navigator.bluetooth) return setMsg({ tone: 'terra', t: 'This browser cannot use Bluetooth. Use Chrome on Android, on the https address.' });
    try {
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      bleName.current = dev.name || 'Heart-rate device';
      const server = await dev.gatt.connect();
      const ch = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', (e) => { buf.current.hr.push(parseHr(e.target.value)); });
      dev.addEventListener('gattserverdisconnected', () => { clearInterval(handles.current.bleTimer); setRunning((r) => ({ ...r, ble: false })); setMsg({ tone: 'gold', t: `${bleName.current} disconnected.` }); });
      handles.current.ble = dev;
      handles.current.bleTimer = setInterval(() => {
        const h = buf.current.hr; buf.current.hr = [];
        if (h.length) send({ kind: 'ble_heart_rate', label: bleName.current }, [{ kind: 'heart_rate', value: Math.round(h.reduce((a, v) => a + v, 0) / h.length) }]);
      }, FLUSH_MS);
      setRunning((r) => ({ ...r, ble: true }));
    } catch (e) { if (e.name !== 'NotFoundError') setMsg({ tone: 'terra', t: `Bluetooth: ${e.message}` }); }
  };
  const stopBle = () => { clearInterval(handles.current.bleTimer); try { handles.current.ble?.gatt.disconnect(); } catch { /* already gone */ } setRunning((r) => ({ ...r, ble: false })); };

  // ---- simulator (clearly labelled; for when no device is available) ----
  const startSim = async () => {
    setMsg(null);
    let home = places[0];
    if (!home) { try { const st = await api.get(`/api/patients/${pid}/live/state?minutes=1`); home = (st.places || [])[0]; } catch { /* use default */ } }
    const base = home ? { lat: Number(home.lat), lon: Number(home.lon) } : { lat: 12.9716, lon: 77.5946 };
    let hr = 74; let t = 0;
    handles.current.sim = setInterval(() => {
      t += 1;
      hr = Math.max(60, Math.min(112, hr + (Math.random() - 0.5) * 4 + (t % 40 === 0 ? 14 : 0) - (hr > 92 ? 1.5 : 0)));
      const wander = 120 * Math.max(0, Math.sin(t / 18)); // metres: drifts out of the home area and back
      send({ kind: 'simulator', label: 'Simulator (not a real person)' }, [
        { kind: 'heart_rate', value: Math.round(hr) },
        { kind: 'motion', value: Math.round((0.4 + 0.3 * Math.abs(Math.sin(t / 5)) + Math.random() * 0.2) * 100) / 100 },
        { kind: 'lat', value: base.lat + wander / 111320 },
        { kind: 'lon', value: base.lon },
      ]);
    }, 2000);
    setRunning((r) => ({ ...r, sim: true }));
  };
  const stopSim = () => { clearInterval(handles.current.sim); setRunning((r) => ({ ...r, sim: false })); };

  useEffect(() => () => { stopPhone(); stopBle(); stopSim(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <p className="text-muted">Loading…</p>;
  const hrNow = series.heart_rate.at(-1)?.v;
  const moNow = series.motion.at(-1)?.v;
  const near = loc?.nearest;

  return (
    <div className="space-y-6">
      <H2 hint="Live readings from a phone, a Bluetooth heart-rate device or a simulator. Kept as Tier 0: shown here, never sent to an AI model.">Live</H2>
      {!state.consent && <Notice tone="gold">Wearable data is switched off for this patient. The Memora team can switch it on under Consent. Until then nothing can be sent or shown.</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-6 space-y-5">
          <p className="font-display text-xl font-bold">Sources</p>
          {[
            ['phone', 'Phone sensors', 'Movement and location from this phone. Open this page on the phone, on the https address.', startPhone, stopPhone],
            ['ble', 'Bluetooth heart-rate device', 'A chest strap or a watch that shares heart rate over Bluetooth. Chrome on Android.', startBle, stopBle],
            ['sim', 'Simulator', 'Made-up data for a demo when no device is available. Marked as not a real person.', startSim, stopSim],
          ].map(([k, title, text, on, off]) => (
            <div key={k} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4">
              <div className="mr-auto min-w-[12rem]"><p className="font-semibold">{title} {running[k] && <Chip tone="sage">On</Chip>}</p><p className="text-sm text-muted">{text}</p></div>
              {running[k] ? <Btn kind="danger" onClick={off}>Stop</Btn> : <Btn disabled={!state.consent} onClick={on}>Start</Btn>}
            </div>
          ))}
          <div>
            <p className="label">Devices seen</p>
            {!state.devices.length ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="space-y-1.5">{state.devices.map((d) => <li key={`${d.kind}${d.label}`} className="flex flex-wrap items-center gap-2 text-sm"><b>{d.label}</b><Chip>{d.kind.replace(/_/g, ' ')}</Chip><span className="text-muted ml-auto">{d.last_seen ? `last seen ${dateTime(d.last_seen)}` : ''}</span></li>)}</ul>
            )}
          </div>
          <p className="text-xs text-muted">For the hackathon demo, use a volunteer team member&rsquo;s own device, with their agreement. This is not patient data.</p>
        </Card>

        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-2"><p className="font-display text-xl font-bold">Live now</p><Chip tone={streamOn ? 'sage' : 'plain'}>{streamOn ? 'Connected' : 'Not connected'}</Chip></div>
          <div>
            <p className="label">Heart rate</p>
            <div className="flex items-end gap-3"><span className="font-display text-6xl font-bold text-terra tabular-nums">{hrNow ?? '–'}</span><span className="text-muted pb-2">beats per minute</span></div>
            <Spark points={series.heart_rate} min={50} max={120} />
          </div>
          <div>
            <p className="label">Movement</p>
            <div className="flex items-center gap-3"><span className="font-display text-2xl font-bold tabular-nums">{moNow != null ? moNow.toFixed(2) : '–'}</span><span className="text-sm text-muted">0 is still, higher is more movement</span></div>
            <Spark points={series.motion} color="var(--c-sage)" min={0} max={2} height={48} />
          </div>
          <div>
            <p className="label">Location</p>
            {loc ? (
              <div className="flex flex-wrap items-center gap-2">
                {near ? <Chip tone={near.inside ? 'sage' : 'terra'}>{near.inside ? `At ${near.label}` : `${near.distance_m} m from ${near.label}`}</Chip> : <Chip>No known places</Chip>}
                <span className="text-sm text-muted tabular-nums">{Number(loc.lat).toFixed(5)}, {Number(loc.lon).toFixed(5)}</span>
              </div>
            ) : <p className="text-sm text-muted">No location yet.</p>}
          </div>
          {state.summary?.heart_rate && <p className="text-sm text-muted">Last 10 minutes: heart rate averaged <b>{state.summary.heart_rate.avg}</b> (lowest {state.summary.heart_rate.min}, highest {state.summary.heart_rate.max}) from {state.summary.heart_rate.n} readings. This describes what was measured. It does not diagnose.</p>}
        </Card>
      </div>
    </div>
  );
}
