import React, { Suspense, lazy } from 'react';
import { usePath } from './router.jsx';
import { APP_MODE } from './api.js';
import Landing from './Landing.jsx';
import CaregiverApp from './CaregiverApp.jsx';

// The Android app (APP_MODE) is for caregivers only: it opens straight into the caregiver area and the team console is
// not even part of its bundle. On the website, "/" chooses an area, "/caregiver" is for caregivers (read the patient
// file, log) and "/admin" is the Memora team (profiling, accounts, and the backend showcase at "/admin/showcase").
const AdminApp = APP_MODE ? null : lazy(() => import('./AdminApp.jsx'));

export default function App() {
  const path = usePath();
  if (APP_MODE) return <CaregiverApp />;
  if (path === '/admin' || path.startsWith('/admin/')) {
    return <Suspense fallback={<div className="p-10 text-muted">Loading…</div>}><AdminApp path={path} /></Suspense>;
  }
  if (path === '/caregiver' || path.startsWith('/caregiver/')) return <CaregiverApp />;
  return <Landing />;
}
