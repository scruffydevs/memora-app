import React, { useEffect, useState } from 'react';

// A tiny router: three areas, "/", "/caregiver" and "/admin". The server serves the app for all of them.
export const navigate = (to) => {
  if (to !== window.location.pathname) window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export function usePath() {
  const [p, setP] = useState(window.location.pathname);
  useEffect(() => {
    const f = () => setP(window.location.pathname);
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);
  return p.replace(/\/+$/, '') || '/';
}

export const Link = ({ to, children, className, ...rest }) => (
  <a href={to} className={className} {...rest}
    onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigate(to); }}>{children}</a>
);
