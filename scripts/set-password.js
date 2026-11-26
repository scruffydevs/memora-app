// Set or reset a user's password:  EMAIL=someone@example.com NEW_PASSWORD='a long password' node scripts/set-password.js
import 'dotenv/config';
import { pool, q } from '../src/db.js';
import { hashPassword, validPassword } from '../src/auth.js';

const email = String(process.env.EMAIL || '').trim().toLowerCase();
const pw = process.env.NEW_PASSWORD;
if (!email || !validPassword(pw)) { console.error('Set EMAIL and NEW_PASSWORD (10+ characters).'); process.exit(2); }
const r = await q('UPDATE users SET password_hash=$2 WHERE email=$1 RETURNING id', [email, await hashPassword(pw)]);
if (!r.rows.length) { console.error('No such user.'); process.exit(1); }
await q('DELETE FROM sessions WHERE user_id=$1', [r.rows[0].id]);
console.log('Password updated and sessions ended for', email);
await pool.end();
