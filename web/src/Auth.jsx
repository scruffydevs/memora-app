import React, { useState } from 'react';
import { api } from './api.js';
import { Link } from './router.jsx';
import { Btn, Card, Field, Notice } from './ui.jsx';

export const Brand = ({ label }) => (
  <>
    <h1 className="font-display text-4xl font-bold">Memora</h1>
    {label && <p className="text-xs font-bold tracking-[0.25em] text-terra mt-1 mb-1">{label}</p>}
    <p className="text-terra font-display italic text-lg mb-6">A memory that belongs to you</p>
  </>
);

// area = 'admin' (sign in only, for the Memora team) or 'caregiver' (sign in or create an account).
export function AuthScreen({ onAuthed, area = 'caregiver', notice }) {
  const isAdmin = area === 'admin';
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { onAuthed(await api.post(mode === 'login' ? '/api/auth/login' : '/api/auth/signup', f)); }
    catch (er) { setErr(er.message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <Brand label={isAdmin ? 'MEMORA TEAM' : 'CAREGIVER'} />
        {!isAdmin && (
          <div className="flex gap-1 mb-5 border-b border-line">
            {[['login', 'Sign in'], ['signup', 'Create caregiver account']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setMode(k); setErr(''); }}
                className={`px-3 py-2 font-semibold border-b-[3px] -mb-px ${mode === k ? 'border-terra text-terra' : 'border-transparent text-muted'}`}>{l}</button>
            ))}
          </div>
        )}
        {isAdmin && <h2 className="font-display text-2xl font-bold mb-4">Team sign-in</h2>}
        {notice && <div className="mb-4"><Notice tone="gold">{notice}</Notice></div>}
        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && <Field label="Your name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" required /></Field>}
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" required /></Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 10 characters' : undefined}>
            <input className="input" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </Field>
          {err && <Notice tone="terra">{err}</Notice>}
          <Btn className="w-full" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}</Btn>
        </form>
        {mode === 'signup' && <p className="text-xs text-muted mt-4">After you sign up, the Memora team gives you a one-time code that connects you to the person you care for. Until then you will not see anyone&rsquo;s information.</p>}
        <p className="text-xs text-muted mt-5">{isAdmin ? <>Caregiver? <Link to="/caregiver" className="text-terra font-semibold hover:underline">Go to caregiver sign-in</Link></> : <>Memora team? <Link to="/admin" className="text-terra font-semibold hover:underline">Team sign-in</Link></>}</p>
      </Card>
    </div>
  );
}

export function ConnectScreen({ me, onConnected, onSignOut, onCancel }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { onConnected(await api.post('/api/auth/connect', { code })); } catch (er) { setErr(er.message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <Brand label="CAREGIVER" />
        <h2 className="font-display text-2xl font-bold mb-1">Hello, {me.user.name.split(' ')[0]}</h2>
        <p className="text-muted mb-5">Enter the connection code the Memora team gave you. It opens the patient file and dashboard for the person you care for.</p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Connection code" hint="Looks like ABCDE-FGH23. Each code works once and expires after 7 days.">
            <input className="input tracking-widest text-lg uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" autoFocus />
          </Field>
          {err && <Notice tone="terra">{err}</Notice>}
          <Btn className="w-full" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 10}>{busy ? 'Connecting…' : 'Connect'}</Btn>
        </form>
        <div className="flex justify-between mt-5 text-sm">
          {onCancel ? <button className="text-muted hover:underline" onClick={onCancel}>Back to dashboard</button> : <span />}
          <button className="text-terra font-semibold hover:underline" onClick={onSignOut}>Sign out</button>
        </div>
      </Card>
    </div>
  );
}

export function WrongArea({ youAre, goTo, goLabel, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <Brand />
        <h2 className="font-display text-2xl font-bold mb-2">You are signed in as {youAre}</h2>
        <p className="text-muted mb-5">This area is for someone else. Go to your own area, or sign out to use a different account.</p>
        <div className="flex gap-2"><Link to={goTo} className="rounded-xl px-4 py-2.5 font-semibold bg-terra text-white hover:bg-terra2">{goLabel}</Link><Btn kind="ghost" onClick={onSignOut}>Sign out</Btn></div>
      </Card>
    </div>
  );
}
