const BASE = import.meta.env.VITE_API_URL || '';

export class AuthError extends Error {}
export class ApiError extends Error {}

export const getToken = () => { try { return localStorage.getItem('memora_token') || ''; } catch { return ''; } };
export const setToken = (t) => { try { localStorage.setItem('memora_token', t); } catch { /* ignore */ } };

const MESSAGES = {
  photo_consent_required: 'Photo consent is off. Turn it on in Privacy first.',
  contact_consent_required: 'Note this person’s consent first, then add a photo.',
  photo_encryption_not_configured: 'Photo storage is not set up on the server yet (PHOTO_ENC_KEY).',
  unauthorized: 'That access code was not accepted.',
};

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-access-token': getToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError('unauthorized');
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

// Photos are Tier 0 and need the access header, so they are fetched as blobs, never as plain <img src>.
const blobCache = new Map();
export async function photoUrl(id) {
  if (blobCache.has(id)) return blobCache.get(id);
  const res = await fetch(`${BASE}/api/photos/${id}`, { headers: { 'x-access-token': getToken() } });
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
