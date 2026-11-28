const BASE = import.meta.env.VITE_API_URL || '';

// The Android app bundles these screens and calls the server across origins, so it signs in with a bearer token
// (kept on the phone) instead of the httpOnly cookie a website uses.
export const APP_MODE = import.meta.env.VITE_APP_MODE === '1';
const TOKEN_KEY = 'memora_token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };
const authInit = () => (APP_MODE
  ? { credentials: 'omit', headers: { 'X-Memora-Client': 'app', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) } }
  : { credentials: 'include', headers: {} });

export class AuthError extends Error {}
export class ApiError extends Error {}

const MESSAGES = {
  invalid_login: 'That email and password do not match.',
  account_disabled: 'This account has been switched off. Please contact the Memora team.',
  email_taken: 'An account with that email already exists. Try signing in.',
  weak_password: 'Use a password of at least 10 characters.',
  invalid_email: 'That email address does not look right.',
  name_required: 'Please enter a name.',
  invalid_or_expired_code: 'That code is not valid, or it has expired. Ask the Memora team for a new one.',
  primary_exists: 'This person already has a main caregiver. Ask the Memora team to end that connection first.',
  already_connected: 'You are already connected to this person.',
  too_many_attempts: 'Too many tries. Please wait a few minutes and try again.',
  forbidden: 'You do not have access to that.',
  photo_consent_required: 'Photo consent is off. Turn it on in Privacy first.',
  contact_consent_required: 'Note this person’s consent first, then add a photo.',
  use_website: 'Memora team accounts sign in on the website, not in the app.',
  photo_encryption_not_configured: 'Photo storage is not set up on the server yet.',
};

async function request(method, path, body) {
  const init = authInit();
  const res = await fetch(BASE + path, {
    method,
    credentials: init.credentials,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const isLogin = path.startsWith('/api/auth/login') || path.startsWith('/api/auth/signup');
  if (path === '/api/auth/logout') setToken(null);
  if (res.status === 401 && !isLogin) { setToken(null); throw new AuthError('unauthorized'); }
  if (!res.ok) {
    let code = res.statusText;
    try { code = (await res.json()).error || code; } catch { /* ignore */ }
    throw new ApiError(MESSAGES[code] || code);
  }
  if (res.status === 204) return null;
  const json = await res.json();
  if (APP_MODE && isLogin && json?.token) { setToken(json.token); delete json.token; }
  return json;
}

// A live stream (Server-Sent Events) read with fetch, so it can carry the bearer token. It reconnects by itself.
export function subscribe(path, { onOpen, onMessage, onError } = {}) {
  const ctrl = new AbortController();
  let stopped = false;
  (async () => {
    while (!stopped) {
      try {
        const init = authInit();
        const res = await fetch(BASE + path, { credentials: init.credentials, headers: { Accept: 'text/event-stream', ...init.headers }, signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error('stream_unavailable');
        onOpen?.();
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
            if (data) onMessage?.(data);
          }
        }
      } catch { /* dropped or stopped: fall through */ }
      if (stopped) return;
      onError?.();
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
  return () => { stopped = true; ctrl.abort(); };
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  del: (p) => request('DELETE', p),
};

// Photos are Tier 0 and need the session, so they are fetched as blobs, never as plain <img src>.
const blobCache = new Map();
export async function photoUrl(id) {
  if (blobCache.has(id)) return blobCache.get(id);
  const init = authInit();
  const res = await fetch(`${BASE}/api/photos/${id}`, { credentials: init.credentials, headers: init.headers });
  if (!res.ok) throw new ApiError('photo_unavailable');
  const url = URL.createObjectURL(await res.blob());
  blobCache.set(id, url);
  return url;
}
export const forgetPhoto = (id) => { const u = blobCache.get(id); if (u) URL.revokeObjectURL(u); blobCache.delete(id); };

// Resize in the browser so stored photos stay small (max 512 px, JPEG).
export function fileToDataUrl(file, max = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new ApiError('That file could not be read as an image.'));
    img.src = URL.createObjectURL(file);
  });
}
