const BASE = import.meta.env.VITE_API_URL || '';

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
  photo_encryption_not_configured: 'Photo storage is not set up on the server yet.',
};

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const isLogin = path.startsWith('/api/auth/login') || path.startsWith('/api/auth/signup');
  if (res.status === 401 && !isLogin) throw new AuthError('unauthorized');
  if (!res.ok) {
    let code = res.statusText;
    try { code = (await res.json()).error || code; } catch { /* ignore */ }
    throw new ApiError(MESSAGES[code] || code);
  }
  return res.status === 204 ? null : res.json();
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
  const res = await fetch(`${BASE}/api/photos/${id}`, { credentials: 'include' });
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
