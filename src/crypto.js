import crypto from 'node:crypto';

// App-level encryption for Tier 0 data (photos). Key: PHOTO_ENC_KEY = 64 hex characters (32 bytes).
// Generate one:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
function key() {
  const hex = process.env.PHOTO_ENC_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

export const encryptionReady = () => key() !== null;

export function encrypt(buf) {
  const k = key();
  if (!k) throw new Error('ENCRYPTION_NOT_CONFIGURED');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return { iv, data: Buffer.concat([enc, c.getAuthTag()]) };
}

export function decrypt(iv, data) {
  const k = key();
  if (!k) throw new Error('ENCRYPTION_NOT_CONFIGURED');
  const tag = data.subarray(data.length - 16);
  const body = data.subarray(0, data.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}
