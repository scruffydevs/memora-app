import React from 'react';
import { Link } from './router.jsx';
import { Brand } from './Auth.jsx';
import { Card } from './ui.jsx';

export default function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <Brand />
        <div className="grid gap-5 sm:grid-cols-2">
          <Link to="/caregiver" className="block"><Card className="p-6 h-full hover:border-terra transition"><p className="text-xs font-bold tracking-[0.25em] text-terra">CAREGIVER</p><h2 className="font-display text-2xl font-bold mt-1">I look after someone</h2><p className="text-muted mt-2">Sign in, connect with your code, read the patient file and log how they are.</p></Card></Link>
          <Link to="/admin" className="block"><Card className="p-6 h-full hover:border-terra transition"><p className="text-xs font-bold tracking-[0.25em] text-terra">MEMORA TEAM</p><h2 className="font-display text-2xl font-bold mt-1">Team sign-in</h2><p className="text-muted mt-2">Create patient accounts, complete their files and connect caregivers.</p></Card></Link>
        </div>
        <p className="text-xs text-muted mt-8">Memora describes what is logged. It does not diagnose.</p>
      </div>
    </div>
  );
}
