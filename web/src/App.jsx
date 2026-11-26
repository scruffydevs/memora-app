import React from 'react';
import { usePath } from './router.jsx';
import Landing from './Landing.jsx';
import CaregiverApp from './CaregiverApp.jsx';
import AdminApp from './AdminApp.jsx';

// "/" chooses an area. "/caregiver" is for caregivers (read the patient file, log). "/admin" is the Memora team (profiling, accounts).
export default function App() {
  const path = usePath();
  if (path === '/admin' || path.startsWith('/admin/')) return <AdminApp path={path} />;
  if (path === '/caregiver' || path.startsWith('/caregiver/')) return <CaregiverApp />;
  return <Landing />;
}
