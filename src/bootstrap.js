import { q } from './db.js';
import { hashPassword, validEmail, validPassword } from './auth.js';

// Create the first admin from ADMIN_EMAIL and ADMIN_PASSWORD, only if that user does not exist yet.
// It never overwrites an existing account. Change a password later with scripts/set-password.js.
export async function bootstrapAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    const n = (await q("SELECT COUNT(*)::int AS n FROM users WHERE role='admin'")).rows[0].n;
    if (!n) console.warn('No admin account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart.');
    return;
  }
  if (!validEmail(email) || !validPassword(password)) { console.warn('ADMIN_EMAIL or ADMIN_PASSWORD is invalid (password needs 10+ characters). Admin not created.'); return; }
  if ((await q('SELECT 1 FROM users WHERE email=$1', [email])).rows.length) return;
  await q("INSERT INTO users (email, name, password_hash, role) VALUES ($1,'Memora team',$2,'admin')", [email, await hashPassword(password)]);
  console.log(`Created admin account ${email}`);
}
