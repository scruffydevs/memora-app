// End-to-end tests of sign-in, connection codes and access rules, against an in-memory Postgres (PGlite).
// Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_DRIVER = 'pglite';
process.env.PHOTO_ENC_KEY = 'ab'.repeat(32);
process.env.ADMIN_EMAIL = 'admin@memora.test';
process.env.ADMIN_PASSWORD = 'correct horse battery';

const { pool } = await import('../src/db.js');
const { runMigrations } = await import('../src/migrate.js');
const { bootstrapAdmin } = await import('../src/bootstrap.js');
const { createApp } = await import('../src/app.js');
const { resetRateLimits } = await import('../src/auth.js');

let server; let base;
before(async () => {
  await runMigrations();
  await bootstrapAdmin();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); });

// A tiny HTTP client that keeps its own cookie, like one browser.
const client = () => {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie');
    if (sc) { const c = sc.split(';')[0]; cookie = c.endsWith('=') ? '' : c; }
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* not json */ }
    return { status: r.status, json, buf, headers: r.headers };
  };
};
const admin = client(); const alice = client(); const bob = client(); const anon = client();
let P1; let P2; let codeP1; let P2contact; let P2log; let aliceContact; let aliceLog; let photoId;

test('security headers are set and anonymous access is refused', async () => {
  const h = await anon('GET', '/health');
  assert.equal(h.status, 200);
  assert.ok(h.headers.get('content-security-policy'));
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await anon('GET', '/api/patients')).status, 401);
  assert.equal((await anon('GET', '/api/patients/1/profile')).status, 401);
  assert.equal((await anon('GET', '/api/admin/patients')).status, 401);
});

test('admin signs in; wrong passwords are refused', async () => {
  resetRateLimits();
  assert.equal((await admin('POST', '/api/auth/login', { email: 'admin@memora.test', password: 'wrong password!!' })).status, 401);
  assert.equal((await admin('POST', '/api/auth/login', { email: 'nobody@memora.test', password: 'wrong password!!' })).status, 401);
  const ok = await admin('POST', '/api/auth/login', { email: 'ADMIN@memora.test', password: 'correct horse battery' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.role, 'admin');
  assert.equal((await admin('GET', '/api/auth/me')).json.user.email, 'admin@memora.test');
});

test('admin creates patient accounts and one-time codes', async () => {
  P1 = (await admin('POST', '/api/admin/patients', { name: 'Pat One', language: 'English' })).json;
  P2 = (await admin('POST', '/api/admin/patients', { name: 'Pat Two' })).json;
  assert.match(P1.patient_code, /^MP-[A-Z0-9]{6}$/);
  assert.notEqual(P1.patient_code, P2.patient_code);
  const c = (await admin('POST', `/api/admin/patients/${P1.id}/codes`, { role: 'primary' })).json;
  codeP1 = c.code;
  assert.match(codeP1, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  // the code is stored only as a hash
  const stored = (await pool.query('SELECT code_hash FROM connection_codes')).rows.map((r) => r.code_hash);
  assert.ok(!stored.includes(codeP1) && stored.every((s) => s.length === 64));
});

test('a new caregiver account sees nothing and cannot use admin routes', async () => {
  resetRateLimits();
  assert.equal((await alice('POST', '/api/auth/signup', { name: 'Alice', email: 'alice@x.test', password: 'short' })).status, 400);
  const s = await alice('POST', '/api/auth/signup', { name: 'Alice', email: 'Alice@x.test', password: 'alice long password' });
  assert.equal(s.status, 201);
  assert.equal(s.json.user.role, 'caregiver');
  assert.deepEqual(s.json.connections, []);
  assert.equal((await anon('POST', '/api/auth/signup', { name: 'A2', email: 'alice@x.test', password: 'another long password' })).status, 409);
  assert.deepEqual((await alice('GET', '/api/patients')).json, []);
  assert.equal((await alice('GET', `/api/patients/${P1.id}/profile`)).status, 403);
  assert.equal((await alice('GET', '/api/admin/patients')).status, 403);
  assert.equal((await alice('POST', '/api/admin/patients', { name: 'Sneaky' })).status, 403);
});

test('wrong codes do not connect', async () => {
  assert.equal((await alice('POST', '/api/auth/connect', { code: 'AAAAA-AAAAA' })).status, 400);
  assert.equal((await alice('POST', '/api/auth/connect', { code: 'x' })).status, 400);
  assert.equal((await alice('GET', `/api/patients/${P1.id}/profile`)).status, 403);
});

test('the right code connects to exactly that patient', async () => {
  const r = await alice('POST', '/api/auth/connect', { code: codeP1.toLowerCase().replace('-', ' ') }); // forgiving format
  assert.equal(r.status, 200);
  assert.equal(r.json.connections.length, 1);
  assert.equal(r.json.connections[0].patient_id, P1.id);
  assert.equal((await alice('GET', `/api/patients/${P1.id}/profile`)).status, 200);
  assert.equal((await alice('GET', `/api/patients/${P2.id}/profile`)).status, 403);
  const list = (await alice('GET', '/api/patients')).json;
  assert.deepEqual(list.map((p) => p.id), [P1.id]);
});

test('records are scoped per patient, including record-id routes', async () => {
  P2contact = (await admin('POST', `/api/patients/${P2.id}/contacts`, { name: 'Other Person' })).json;
  P2log = (await admin('POST', `/api/patients/${P2.id}/logs`, { kind: 'note', text: 'private to patient two' })).json;
  assert.equal((await alice('GET', `/api/patients/${P2.id}/logs`)).status, 403);
  assert.equal((await alice('GET', `/api/patients/${P2.id}/contacts`)).status, 403);
  assert.equal((await alice('GET', `/api/patients/${P2.id}/observations`)).status, 403);
  assert.equal((await alice('PUT', `/api/contacts/${P2contact.id}`, { name: 'Hacked' })).status, 403);
  assert.equal((await alice('DELETE', `/api/contacts/${P2contact.id}`)).status, 403);
  assert.equal((await alice('DELETE', `/api/logs/${P2log.id}`)).status, 403);
  assert.equal((await alice('GET', `/api/entries?patientId=${P2.id}`)).status, 403);
  assert.equal((await alice('POST', '/api/entries', { patientId: P2.id, text: 'x' })).status, 403);
  assert.equal((await alice('POST', '/api/ask', { patientId: P2.id, question: 'anything' })).status, 403);
  assert.equal((await alice('GET', `/api/receipts?patientId=${P2.id}`)).status, 403);
  assert.equal((await alice('GET', '/api/entries')).status, 400); // no patient given
  assert.equal((await alice('GET', '/api/contacts/abc')).status, 400); // malformed id is refused before any lookup
  assert.equal((await admin('GET', `/api/patients/${P2.id}/logs`)).json.length, 1); // untouched
});

test('logs record the signed-in author, not what the client claims', async () => {
  const l = await alice('POST', `/api/patients/${P1.id}/logs`, { kind: 'note', text: 'Evening tablet taken', logged_by: 'Someone Else' });
  assert.equal(l.status, 201);
  assert.equal(l.json.logged_by, 'Alice');
  aliceLog = l.json;
  aliceContact = (await alice('POST', `/api/patients/${P1.id}/contacts`, { name: 'Anita Rao', relationship: 'daughter', consent_noted: true })).json;
  const med = (await alice('POST', `/api/patients/${P1.id}/medicines`, { name: 'Evening tablet', dose: '1' })).json;
  const o = await alice('POST', `/api/patients/${P1.id}/observations`, { context_type: 'medicine', context_relation: 'after', minutes_offset: 30, medicine_id: med.id, logged_by: 'Mallory', traits: [{ trait: 'agitation', vs_usual: 1, detail: 'calmer' }] });
  assert.equal(o.status, 201);
  const list = (await alice('GET', `/api/patients/${P1.id}/observations`)).json;
  assert.equal(list[0].logged_by, 'Alice');
  assert.equal(list[0].traits[0].trait, 'agitation');
  assert.equal((await alice('POST', `/api/patients/${P1.id}/observations`, { context_type: 'medicine', traits: [] })).status, 400);
});

test('photos need consent, are encrypted at rest and stay scoped', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  assert.equal((await alice('POST', `/api/patients/${P1.id}/photos`, { dataUrl })).status, 403); // patient consent is off
  const prof = (await alice('GET', `/api/patients/${P1.id}/profile`)).json.profile;
  assert.equal((await alice('PUT', `/api/patients/${P1.id}/profile`, { ...prof, consent_photos: true })).status, 200);
  const noConsent = (await alice('POST', `/api/patients/${P1.id}/contacts`, { name: 'No Consent' })).json;
  assert.equal((await alice('POST', `/api/patients/${P1.id}/photos`, { contactId: noConsent.id, dataUrl })).status, 403); // person has not agreed
  assert.equal((await alice('POST', `/api/patients/${P1.id}/photos`, { dataUrl: 'data:text/html;base64,PGI+' })).status, 400); // not an image
  const up = await alice('POST', `/api/patients/${P1.id}/photos`, { contactId: aliceContact.id, dataUrl });
  assert.equal(up.status, 201);
  photoId = up.json.id;
  const got = await alice('GET', `/api/photos/${photoId}`);
  assert.equal(got.status, 200);
  assert.ok(got.buf.equals(png));
  const raw = (await pool.query('SELECT data FROM photos WHERE id=$1', [photoId])).rows[0].data;
  assert.ok(!Buffer.from(raw).includes(png.subarray(0, 8)), 'stored bytes must not contain the plain PNG');
  assert.equal((await anon('GET', `/api/photos/${photoId}`)).status, 401);
  assert.equal((await bob('GET', `/api/photos/${photoId}`)).status, 401);
});

test('a primary caregiver cannot be doubled, and a failed attempt does not burn the code', async () => {
  resetRateLimits();
  const code2 = (await admin('POST', `/api/admin/patients/${P1.id}/codes`, { role: 'primary' })).json.code;
  await bob('POST', '/api/auth/signup', { name: 'Bob', email: 'bob@x.test', password: 'bob long password!' });
  const r = await bob('POST', '/api/auth/connect', { code: code2 });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'primary_exists');
  assert.equal((await bob('GET', `/api/patients/${P1.id}/profile`)).status, 403);
  codeP1 = code2; // still unused
});

test('ending a connection removes access; history stays and the next caregiver sees it', async () => {
  const conns = (await admin('GET', `/api/admin/patients/${P1.id}/connections`)).json;
  const active = conns.find((c) => c.status === 'active');
  assert.equal(active.name, 'Alice');
  assert.equal((await admin('POST', `/api/admin/connections/${active.id}/end`, { reason: 'caregiver changed' })).status, 204);
  assert.equal((await alice('GET', `/api/patients/${P1.id}/profile`)).status, 403);
  assert.equal((await alice('POST', `/api/patients/${P1.id}/logs`, { kind: 'note', text: 'still here?' })).status, 403);
  assert.deepEqual((await alice('GET', '/api/patients')).json, []);

  assert.equal((await bob('POST', '/api/auth/connect', { code: codeP1 })).status, 200);
  const logs = (await bob('GET', `/api/patients/${P1.id}/logs`)).json;
  assert.ok(logs.some((l) => l.id === aliceLog.id && l.logged_by === 'Alice'), 'Bob sees what Alice logged');
  const team = (await bob('GET', `/api/patients/${P1.id}/care-team`)).json;
  assert.deepEqual(team.map((t) => [t.name, t.status]), [['Bob', 'active'], ['Alice', 'ended']]);
  assert.equal((await bob('GET', `/api/photos/${photoId}`)).status, 200); // the patient file carries over
  assert.equal((await bob('POST', '/api/auth/connect', { code: codeP1 })).status, 400); // single use
});

test('a caregiver can leave, and a disabled caregiver is locked out', async () => {
  const left = await bob('POST', '/api/auth/disconnect', { patientId: P1.id });
  assert.equal(left.status, 200);
  assert.deepEqual(left.json.connections, []);
  assert.equal((await bob('GET', `/api/patients/${P1.id}/profile`)).status, 403);
  assert.equal((await bob('POST', '/api/auth/disconnect', { patientId: P1.id })).status, 404);

  const users = (await admin('GET', '/api/admin/caregivers')).json;
  const aliceRow = users.find((u) => u.email === 'alice@x.test');
  assert.equal((await admin('POST', `/api/admin/users/${aliceRow.id}/disable`, { disabled: true })).status, 204);
  assert.equal((await alice('GET', '/api/auth/me')).status, 401);
  resetRateLimits();
  assert.equal((await alice('POST', '/api/auth/login', { email: 'alice@x.test', password: 'alice long password' })).status, 403);
});

test('logout ends the session; repeated bad logins are rate limited; audit trail exists', async () => {
  resetRateLimits();
  assert.equal((await bob('POST', '/api/auth/logout')).status, 204);
  assert.equal((await bob('GET', '/api/patients')).status, 401);
  let last;
  for (let i = 0; i < 10; i++) last = await anon('POST', '/api/auth/login', { email: 'bob@x.test', password: 'definitely wrong' });
  assert.equal(last.status, 429);
  resetRateLimits();
  const audit = (await admin('GET', '/api/admin/audit')).json.map((a) => a.action);
  for (const a of ['patient_created', 'code_created', 'connected', 'connection_ended', 'disconnected', 'user_disabled']) assert.ok(audit.includes(a), `audit has ${a}`);
});
