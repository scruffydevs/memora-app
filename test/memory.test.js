// Memora Core, milestone 1: derivation, versioning, retrieval, forgetting, tiers, provenance and access.
// Run: npm test  (uses an in-memory Postgres, no server needed)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_DRIVER = 'pglite';
process.env.ADMIN_EMAIL = 'admin@memora.test';
process.env.ADMIN_PASSWORD = 'correct horse battery';
process.env.OPENROUTER_API_KEY = ''; // tests never call a real AI service
process.env.PORTFOLIO_AI = 'off';

const { pool } = await import('../src/db.js');
const { runMigrations } = await import('../src/migrate.js');
const { bootstrapAdmin } = await import('../src/bootstrap.js');
const { createApp } = await import('../src/app.js');
const { resetRateLimits } = await import('../src/auth.js');
const { inheritTier, validateMemory, MemoryError } = await import('../src/memory/model.js');

let server; let base;
before(async () => {
  await runMigrations(); await bootstrapAdmin();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); });

const client = () => {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) { const c = sc.split(';')[0]; cookie = c.endsWith('=') ? '' : c; }
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json };
  };
};
const admin = client(); const alice = client(); const bob = client(); const anon = client();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let P; let P2;
const url = (p, id = P.id) => `/api/patients/${id}${p}`;
const list = async (qs = '') => {
  const r = await admin('GET', url(`/memories${qs}`));
  assert.ok(Array.isArray(r.json), `GET /memories${qs} returned ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};
const texts = (rows) => rows.map((m) => m.text);
const profile = async (patch) => { const cur = (await admin('GET', url('/profile'))).json.profile; return admin('PUT', url('/profile'), { ...cur, ...patch }); };

test('setup: a patient, a connected caregiver, and a profile', async () => {
  resetRateLimits();
  await admin('POST', '/api/auth/login', { email: 'admin@memora.test', password: 'correct horse battery' });
  P = (await admin('POST', '/api/admin/patients', { name: 'Test Patient' })).json;
  P2 = (await admin('POST', '/api/admin/patients', { name: 'Other Patient' })).json;
  await alice('POST', '/api/auth/signup', { name: 'Alice', email: 'alice@x.test', password: 'alice long password' });
  const code = (await admin('POST', `/api/admin/patients/${P.id}/codes`, {})).json.code;
  assert.equal((await alice('POST', '/api/auth/connect', { code })).status, 200);
  await bob('POST', '/api/auth/signup', { name: 'Bob', email: 'bob@x.test', password: 'bob long password!' });

  const r = await profile({ likes: ['old film songs'], calming: ['quiet music'], triggers: ['loud television'], routine: 'Tea at four', conditions: 'Early-stage Alzheimer\'s (synthetic)', allergies: 'None known', emergency_name: 'Anita, daughter', emergency_phone: '+00 000', background: 'Retired teacher' });
  assert.equal(r.status, 200);
});

test('the profile derives memories with the right kind, tier and sources', async () => {
  const all = await list();
  const by = (p) => all.filter((m) => m.predicate === p);
  assert.equal(by('likes')[0].text, 'Likes old film songs');
  assert.equal(by('likes')[0].tier, 1);
  assert.equal(by('calming')[0].kind, 'preference');
  assert.equal(by('routine')[0].kind, 'routine');
  for (const p of ['condition', 'allergy', 'emergency_contact', 'preferred_name']) assert.equal(by(p)[0].tier, 0, `${p} is Tier 0`);
  for (const m of all) assert.ok(m.sources.length >= 1 && m.sources[0].table === 'profile', 'every memory has a source');
  assert.ok(all.every((m) => m.status === 'active' && m.valid_to === null));
});

test('rebuild is idempotent: running it twice creates nothing new', async () => {
  const before = (await list('?status=all')).length;
  const one = (await admin('POST', url('/memories/rebuild'), {})).json;
  const two = (await admin('POST', url('/memories/rebuild'), {})).json;
  assert.deepEqual([one.created, two.created], [0, 0]);
  assert.equal((await list('?status=all')).length, before);
});

test('changing a profile value supersedes the old memory and keeps history, and asOf answers about the past', async () => {
  await sleep(30);
  const beforeChange = new Date().toISOString();
  await sleep(30);
  await profile({ calming: ['a short walk'], routine: 'Tea at five' });
  const active = await list();
  assert.ok(texts(active).includes('What helps calm them: a short walk'));
  assert.ok(!texts(active).includes('What helps calm them: quiet music'));
  assert.ok(texts(active).includes('A usual day: Tea at five'));

  const all = await list('?status=superseded');
  const oldCalm = all.find((m) => m.text === 'What helps calm them: quiet music');
  assert.equal(oldCalm.status, 'superseded');
  assert.ok(oldCalm.valid_to, 'the old version is closed, not erased');

  // the single-valued routine was REPLACED: the new version points back at the old one
  const newRoutine = active.find((m) => m.predicate === 'routine');
  const oldRoutine = all.find((m) => m.predicate === 'routine');
  assert.equal(String(newRoutine.supersedes_id), String(oldRoutine.id));

  const past = (await admin('GET', url(`/memories?asOf=${encodeURIComponent(beforeChange)}`))).json;
  assert.ok(texts(past).includes('What helps calm them: quiet music') && texts(past).includes('A usual day: Tea at four'));
  assert.ok(!texts(past).includes('What helps calm them: a short walk'));
  const nowAs = (await admin('GET', url(`/memories?asOf=${encodeURIComponent(new Date().toISOString())}`))).json;
  assert.ok(texts(nowAs).includes('A usual day: Tea at five') && !texts(nowAs).includes('A usual day: Tea at four'));

  const hist = (await admin('GET', `/api/memories/${newRoutine.id}/history`)).json;
  assert.equal(hist.versions.length, 2);
  assert.deepEqual(hist.events.map((e) => e.action), ['created', 'superseded', 'created']);
});

test('log arena observations and care logs become memories with sources, and deleting them forgets', async () => {
  const med = (await admin('POST', url('/medicines'), { name: 'Evening tablet', dose: '1' })).json;
  const o = await alice('POST', url('/observations'), { context_type: 'medicine', context_relation: 'after', minutes_offset: 30, medicine_id: med.id, note: 'Quiet evening', traits: [{ trait: 'agitation', vs_usual: 1, detail: 'settled in the chair' }, { trait: 'mood', vs_usual: 0 }] });
  assert.equal(o.status, 201);
  const obsMems = (await list()).filter((m) => m.sources.some((s) => s.table === 'observations' && String(s.id) === String(o.json.id)));
  assert.equal(obsMems.length, 3); // two traits and the note
  const agit = obsMems.find((m) => /Agitation/.test(m.text));
  assert.match(agit.text, /better than usual, 30 min after Evening tablet/);
  assert.equal(agit.tier, 1);
  assert.equal(agit.created_by, 'Alice');

  const log = await alice('POST', url('/logs'), { kind: 'behaviour', category: 'agitation', severity: 3, trigger_text: 'late afternoon noise', helped: 'quiet music', text: 'Restless near the door' });
  assert.equal(log.status, 201);
  const logMems = (await list()).filter((m) => m.sources.some((s) => s.table === 'care_logs' && String(s.id) === String(log.json.id)));
  assert.equal(logMems.length, 1);
  assert.match(logMems[0].text, /strength 3 of 5.*late afternoon noise.*quiet music/);

  assert.equal((await alice('DELETE', `/api/observations/${o.json.id}`)).status, 204);
  assert.equal((await alice('DELETE', `/api/logs/${log.json.id}`)).status, 204);
  const left = (await list()).filter((m) => m.sources.some((s) => ['observations', 'care_logs'].includes(s.table)));
  assert.equal(left.length, 0, 'deleting a record forgets what was derived from it');
});

test('retract blanks every version, removes sources, and leaves no trace of the words', async () => {
  const phrase = 'zebra-unique-phrase-9137';
  const added = await admin('POST', url('/memories'), { kind: 'fact', predicate: 'manual', text: `Likes the ${phrase}`, tier: 1, reason: 'told by the family' });
  assert.equal(added.status, 201);
  const v2 = await admin('PUT', `/api/memories/${added.json.id}`, { text: `Now prefers the ${phrase} on Sundays` });
  assert.equal(v2.status, 200);
  assert.equal((await admin('POST', url('/memories/search'), { query: phrase })).json.length, 1); // current version found

  assert.equal((await admin('DELETE', `/api/memories/${v2.json.id}`)).status, 204); // retract the newest; the older version goes too
  assert.equal((await admin('POST', url('/memories/search'), { query: phrase })).json.length, 0);
  assert.equal((await list('?status=all')).filter((m) => m.text.includes(phrase)).length, 0);
  for (const t of ['memories', 'memory_sources', 'memory_events']) {
    const rows = (await pool.query(`SELECT * FROM ${t}`)).rows;
    assert.ok(!JSON.stringify(rows).includes(phrase), `${t} holds no trace of the retracted words`);
  }
  const events = (await pool.query("SELECT action FROM memory_events WHERE memory_id IN ($1,$2)", [added.json.id, v2.json.id])).rows.map((r) => r.action);
  assert.ok(events.includes('retracted'), 'only the fact that it was retracted remains');
  assert.equal((await admin('DELETE', `/api/memories/${v2.json.id}`)).status, 204); // retracting again is harmless
});

test('Tier 0 memories are never returned for a model, and tiers never get less strict', async () => {
  const { search } = await import('../src/memory/retrieve.js');
  const human = await search(P.id, { query: '', limit: 200 });
  assert.ok(human.some((m) => m.tier === 0), 'people can see Tier 0 in the app');
  const model = await search(P.id, { query: '', limit: 200, forModel: true });
  assert.ok(model.length > 0 && model.every((m) => m.tier !== 0), 'model-bound search never returns Tier 0');
  assert.ok(!texts(model).some((t) => /Alzheimer|Allergies|Anita, daughter/.test(t)));

  // 0 is the strictest. A memory takes the strictest tier among what it asks for and where it came from.
  assert.equal(inheritTier(1, [{ tier: 0 }, { tier: 1 }]), 0);
  assert.equal(inheritTier(2, [{ tier: 1 }]), 1, 'cannot be looser than its source');
  assert.equal(inheritTier(0, [{ tier: 1 }]), 0, 'a person may make it stricter');
  assert.equal(inheritTier(2, [{ tier: 2 }, { tier: 1 }]), 1);
  assert.equal(inheritTier(1, []), 1);

  // editing cannot loosen a memory below its source: the allergy source is Tier 0, asking for 2 stays 0
  const allergy = (await list()).find((m) => m.predicate === 'allergy');
  assert.equal(allergy.tier, 0);
  const edited = await admin('PUT', `/api/memories/${allergy.id}`, { text: 'Allergies: none known (checked)', tier: 2 });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.tier, 0, 'still Tier 0');
  assert.ok(!texts((await search(P.id, { query: 'allergies', forModel: true }))).some((t) => /Allergies/.test(t)), 'and still hidden from the model');
  // a Tier 1 memory made stricter by the team becomes Tier 0 and disappears from model-bound search
  const like = (await list()).find((m) => m.predicate === 'likes');
  assert.equal((await admin('PUT', `/api/memories/${like.id}`, { tier: 0 })).json.tier, 0);
  assert.ok(!(await search(P.id, { query: 'film songs', forModel: true })).length);
});

test('provenance is mandatory and bad input is refused', async () => {
  assert.equal((await admin('POST', url('/memories'), { kind: 'fact', predicate: 'manual', text: 'no reason given', tier: 1 })).status, 400);
  assert.equal((await admin('POST', url('/memories'), { kind: 'nope', predicate: 'manual', text: 'x', reason: 'r' })).status, 400);
  assert.equal((await admin('POST', url('/memories'), { kind: 'fact', predicate: 'Bad Predicate!', text: 'x', reason: 'r' })).status, 400);
  assert.equal((await admin('POST', url('/memories'), { kind: 'fact', predicate: 'manual', text: '', reason: 'r' })).status, 400);
  assert.equal((await admin('POST', url('/memories'), { kind: 'fact', predicate: 'manual', text: 'x', tier: 7, reason: 'r' })).status, 400);
  assert.throws(() => validateMemory({ patientId: 1, kind: 'fact', predicate: 'manual', text: 'x', createdBy: 'a', sources: [] }), (e) => e instanceof MemoryError && e.code === 'sources_required');
  // a stored memory always resolves to a real source record
  const all = await list();
  const prof = (await admin('GET', url('/profile'))).json.profile;
  for (const m of all.filter((x) => x.sources[0].table === 'profile')) assert.equal(String(m.sources[0].id), String(prof.patient_id));
});

test('search finds relevant memories', async () => {
  const hit = (await alice('POST', url('/memories/search'), { query: 'what calms them down' })).json;
  assert.ok(hit.length >= 1 && /calm/i.test(hit[0].text));
  const none = (await alice('POST', url('/memories/search'), { query: 'zzzz qqqq' })).json;
  assert.deepEqual(none, []);
});

test('access: caregivers read their patient only; only the team writes; strangers and anonymous are refused', async () => {
  const any = (await list())[0];
  // connected caregiver: can list, search, read history
  assert.equal((await alice('GET', url('/memories'))).status, 200);
  assert.equal((await alice('POST', url('/memories/search'), { query: 'likes' })).status, 200);
  assert.equal((await alice('GET', `/api/memories/${any.id}/history`)).status, 200);
  // ...but cannot write
  assert.equal((await alice('POST', url('/memories'), { kind: 'fact', predicate: 'manual', text: 'x', reason: 'r' })).status, 403);
  assert.equal((await alice('PUT', `/api/memories/${any.id}`, { text: 'hacked' })).status, 403);
  assert.equal((await alice('DELETE', `/api/memories/${any.id}`)).status, 403);
  assert.equal((await alice('POST', url('/memories/rebuild'), {})).status, 403);
  // not connected: nothing at all
  assert.equal((await bob('GET', url('/memories'))).status, 403);
  assert.equal((await bob('POST', url('/memories/search'), { query: 'x' })).status, 403);
  assert.equal((await bob('GET', `/api/memories/${any.id}/history`)).status, 403);
  assert.equal((await bob('PUT', `/api/memories/${any.id}`, { text: 'x' })).status, 403);
  // another patient's memories
  await admin('PUT', url('/profile', P2.id), { ...(await admin('GET', url('/profile', P2.id))).json.profile, likes: ['secret hobby'] });
  assert.equal((await alice('GET', url('/memories', P2.id))).status, 403);
  assert.ok((await admin('GET', url('/memories', P2.id))).json.some((m) => /secret hobby/.test(m.text)));
  assert.ok(!texts(await list()).some((t) => /secret hobby/.test(t)), 'memories never mix between patients');
  // anonymous
  assert.equal((await anon('GET', url('/memories'))).status, 401);
});

test('the engine can be switched off, and a profile save still works', async () => {
  process.env.MEMORY_ENGINE = 'off';
  const before = (await list('?status=all')).length;
  assert.equal((await profile({ likes: ['gardening'] })).status, 200);
  assert.equal((await list('?status=all')).length, before, 'no memories were derived while switched off');
  delete process.env.MEMORY_ENGINE;
  const out = (await admin('POST', url('/memories/rebuild'), {})).json; // rebuild repairs the gap
  assert.ok(out.created >= 1);
  assert.ok(texts(await list()).includes('Likes gardening'));
});

test('the data overview counts what is held without showing content, follows consent, and respects access', async () => {
  const get = async (client = admin, id = P.id) => client('GET', url('/data-overview', id));
  const r = await get();
  assert.equal(r.status, 200);
  const d = r.json;
  const cat = (k, x = d) => x.categories.find((c) => c.key === k);

  assert.equal(cat('profile').state, 'collected');
  assert.ok(cat('memories').count > 0 && cat('memories').state === 'collected');
  assert.equal(cat('wearables').state, 'off', 'no consent yet');
  assert.equal(cat('photos').state, 'off');
  assert.equal(cat('logs').state, 'available', 'nothing logged any more, so it can still be collected');
  assert.ok(cat('logs').next && cat('logs').next.tab === 'logs', 'an empty kind says what to do next');
  assert.equal(d.team.active, 1);
  assert.equal(d.vault.receipts, 0, 'nothing has left the vault');
  assert.equal(d.tiers.t0 + d.tiers.t1 + d.tiers.t2, cat('memories').count);
  assert.equal(d.totals.consents_on, 1); // only "caregivers can see" is on by default
  assert.equal(cat('profile').series, undefined);
  assert.equal(cat('memories').series.length, 8);

  // counts and dates only: no record content anywhere in the answer
  assert.ok(!/Retired teacher|Early-stage|gardening|Anita, daughter|Tea at/.test(JSON.stringify(d)));

  // consent changes what can be collected
  await profile({ consent_photos: true, consent_wearables: true });
  const d2 = (await get()).json;
  assert.equal(cat('wearables', d2).state, 'available');
  assert.equal(cat('photos', d2).state, 'available');
  assert.equal(d2.totals.consents_on, 3);

  // access
  assert.equal((await get(alice)).status, 200);
  assert.equal((await get(bob)).status, 403);
  assert.equal((await get(anon)).status, 401);
  assert.equal((await get(alice, P2.id)).status, 403);
});

test('daily watch data: saved per day, updated not duplicated, validated, consent-gated, deleted on withdrawal', async () => {
  const iso = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
  const post = (body, who = admin, id = P.id) => who('POST', url('/daily-metrics', id), body);
  const get = (who = admin, id = P.id) => who('GET', url('/daily-metrics?days=30', id));
  await profile({ consent_wearables: true });

  const night = { day: iso(-1), sleep_minutes: 412, deep_minutes: 80, rem_minutes: 95, light_minutes: 237, awake_minutes: 22, awakenings: 3, resting_hr: 61, avg_hr: 74 };
  let r = await post({ source_name: 'Amazfit Bip 5 via Zepp', days: [night, { day: iso(0), steps: 3120 }] });
  assert.equal(r.status, 200);
  assert.equal(r.json.saved, 2);

  let g = (await get()).json;
  assert.equal(g.consent, true);
  assert.deepEqual(g.days.map((d) => d.day), [iso(-1), iso(0)], 'oldest first');
  assert.equal(g.days[0].sleep_minutes, 412);
  assert.equal(g.days[1].steps, 3120);

  // syncing the same day again updates it, and a number that is missing keeps what was stored
  r = await post({ days: [{ day: iso(-1), steps: 8800 }] });
  assert.equal(r.status, 200);
  g = (await get()).json;
  assert.equal(g.days.length, 2, 'no duplicate row');
  assert.equal(g.days[0].steps, 8800);
  assert.equal(g.days[0].sleep_minutes, 412, 'sleep was not wiped by a steps-only sync');

  // bad input is dropped, not stored
  r = await post({ days: [{ day: 'yesterday', steps: 5 }, { day: iso(-2), steps: -4, resting_hr: 5, sleep_minutes: 99999 }, { day: iso(-3), steps: 4000 }] });
  assert.equal(r.status, 200);
  assert.equal(r.json.saved, 1, 'only the valid day is saved');
  assert.equal(r.json.skipped, 2, 'a bad date and a day with nothing valid in it are skipped');
  g = (await get()).json;
  assert.ok(!g.days.some((d) => d.day === iso(-2)), 'out-of-range numbers are dropped, so that day is not stored');
  assert.equal((await post({ days: [] })).status, 400);
  assert.equal((await post({ days: [{ day: '2001-01-01', steps: 1 }] })).status, 400, 'too old');

  // the data overview counts it
  const ov = (await admin('GET', url('/data-overview'))).json;
  const cat = ov.categories.find((c) => c.key === 'daily');
  assert.equal(cat.state, 'collected');
  assert.equal(cat.count, 3);

  // access: a connected caregiver may sync, a stranger and a signed-out visitor may not
  assert.equal((await post({ days: [{ day: iso(0), steps: 3300 }] }, alice)).status, 200);
  assert.equal((await post({ days: [{ day: iso(0), steps: 1 }] }, bob)).status, 403);
  assert.equal((await get(bob)).status, 403);
  assert.equal((await post({ days: [{ day: iso(0), steps: 1 }] }, anon)).status, 401);
  assert.equal((await post({ days: [{ day: iso(0), steps: 1 }] }, alice, P2.id)).status, 403);

  // withdrawing consent deletes every daily row and blocks new ones
  await profile({ consent_wearables: false });
  g = (await get()).json;
  assert.equal(g.consent, false);
  assert.equal(g.days.length, 0);
  assert.equal((await post({ days: [night] })).status, 403);
});

test('the Android app signs in with a bearer token, no cookie, and only the phone origin may call across origins', async () => {
  const call = (method, path, { headers = {}, body } = {}) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const app = { 'x-memora-client': 'app', origin: 'https://localhost' };

  // a website login gets a cookie and no token in the body
  let r = await call('POST', '/api/auth/login', { body: { email: 'alice@x.test', password: 'alice long password' } });
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('set-cookie'), 'websites keep the httpOnly cookie');
  assert.equal((await r.json()).token, undefined, 'and never see the token');

  // the app asks for the token and gets no cookie
  r = await call('POST', '/api/auth/login', { headers: app, body: { email: 'alice@x.test', password: 'alice long password' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('set-cookie'), null);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://localhost');
  assert.equal(r.headers.get('access-control-allow-credentials'), null, 'no credentials are ever allowed cross-origin');
  const { token, user } = await r.json();
  assert.ok(token && token.length >= 40);
  assert.equal(user.email, 'alice@x.test');

  // the token works, and a made-up or malformed one does not
  const bearer = (t) => ({ authorization: `Bearer ${t}`, origin: 'https://localhost' });
  assert.equal((await call('GET', '/api/auth/me', { headers: bearer(token) })).status, 200);
  assert.equal((await call('GET', '/api/auth/me', { headers: bearer('x'.repeat(43)) })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { headers: { authorization: 'Bearer short' } })).status, 401);
  assert.equal((await call('GET', `/api/patients/${P.id}/daily-metrics`, { headers: bearer(token) })).status, 200, 'a connected caregiver reaches their patient');
  assert.equal((await call('GET', `/api/patients/${P2.id}/daily-metrics`, { headers: bearer(token) })).status, 403, 'but not anyone else\'s');

  // preflight: allowed for the phone origin, nothing for any other site
  r = await call('OPTIONS', '/api/auth/login', { headers: { origin: 'https://localhost', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,x-memora-client' } });
  assert.equal(r.status, 204);
  assert.match(r.headers.get('access-control-allow-headers'), /Authorization/);
  r = await call('GET', '/api/auth/me', { headers: { origin: 'https://evil.example', authorization: `Bearer ${token}` } });
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'another origin gets no CORS headers');

  // signing out from the app ends that token
  assert.equal((await call('POST', '/api/auth/logout', { headers: bearer(token) })).status, 204);
  assert.equal((await call('GET', '/api/auth/me', { headers: bearer(token) })).status, 401);
});

test('the backend showcase feed is admin-only, shows what the backend did, and never carries record content', async () => {
  const { resetActivity } = await import('../src/activity.js');
  resetActivity();
  await profile({ consent_wearables: true });
  const secret = 'ZZUNIQUEPHRASEZZ';
  assert.equal((await alice('POST', url('/logs'), { kind: 'note', text: `Saw ${secret} today` })).status, 201);
  assert.equal((await alice('POST', url('/daily-metrics'), { days: [{ day: new Date().toISOString().slice(0, 10), steps: 4100 }] })).status, 200);
  const live = await alice('POST', url('/live/samples'), { device: { kind: 'simulator', label: 'Test sim' }, samples: [{ kind: 'heart_rate', value: 72 }] });
  assert.equal(live.status, 200);

  const feed = await admin('GET', '/api/admin/showcase/activity');
  assert.equal(feed.status, 200);
  const text = feed.json.map((e) => e.text).join(' | ');
  assert.match(text, /a note entry was added to the care log/i);
  assert.match(text, /Watch data arrived: 1 day/);
  assert.match(text, /1 live reading from Test sim/);
  assert.ok(feed.json.every((e) => e.id && e.ts && e.kind), 'each event has an id, time and kind');
  assert.ok(!text.includes(secret), 'the content of a log never appears in the feed');

  assert.equal((await alice('GET', '/api/admin/showcase/activity')).status, 403, 'caregivers cannot read it');
  assert.equal((await anon('GET', '/api/admin/showcase/activity')).status, 401);
  await profile({ consent_wearables: false });
});

test('team accounts cannot sign in from the Android app', async () => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-memora-client': 'app', origin: 'https://localhost' }, body: JSON.stringify({ email: 'admin@memora.test', password: 'correct horse battery' }) });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'use_website');
  assert.equal(r.headers.get('set-cookie'), null);
  // the website login for the same account still works
  const w = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@memora.test', password: 'correct horse battery' }) });
  assert.equal(w.status, 200);
});

test('onboarding: answers save a card at a time, flow into the patient file, and only the team can write them', async () => {
  const intake = (body, who = admin, id = P2.id) => who('PUT', url('/intake', id), body);
  let r = await admin('GET', url('/intake', P2.id));
  assert.equal(r.status, 200);
  assert.equal(r.json.started, false);

  r = await intake({ step: 1, answers: { 'about.name': 'Kamala Rao', 'about.preferred': 'Kamala', 'about.age': '81', 'about.pronouns': 'Nonsense', 'nope.key': 'x', 'diagnosis.stage': 'Early or mild', 'photo.consent': true } });
  assert.equal(r.status, 200);
  assert.equal(r.json.answers['about.age'], 81);
  assert.equal(r.json.answers['about.pronouns'], undefined, 'an answer that is not an option is dropped');
  assert.equal(r.json.answers['nope.key'], undefined, 'an unknown question is dropped');
  assert.equal(r.json.step, 1);
  assert.ok(r.json.started && r.json.progress.done === 4 && r.json.missing_key.includes('health.allergies'));

  // it reaches the patient file and the patient record
  const file = (await admin('GET', url('/profile', P2.id))).json;
  assert.equal(file.patient.name, 'Kamala Rao');
  assert.equal(file.profile.preferred_name, 'Kamala');
  assert.equal(file.profile.age_band, '80s');
  assert.equal(file.profile.consent_photos, true);
  assert.match(file.profile.conditions, /stage as told: Early or mild/);

  // a later card adds to the earlier answers, and null clears one
  r = await intake({ answers: { 'language.comfortable': 'Kannada', 'about.preferred': null } });
  assert.equal(r.json.answers['about.name'], 'Kamala Rao');
  assert.equal(r.json.answers['about.preferred'], undefined);
  assert.equal(r.json.answers['language.comfortable'], 'Kannada');

  // access: the team only
  assert.equal((await alice('GET', url('/intake'))).status, 403);
  assert.equal((await intake({ answers: { 'about.name': 'X' } }, alice, P.id)).status, 403);
  assert.equal((await anon('GET', url('/intake', P2.id))).status, 401);
});

test('onboarding: a portfolio is a draft until approved, and carers only ever see the approved one', async () => {
  const id = P.id;
  await admin('PUT', url('/intake', id), { answers: { 'about.name': 'Test Patient', 'about.age': 79, 'diagnosis.type': "Alzheimer's disease", 'diagnosis.stage': 'Early or mild', 'language.comfortable': 'Kannada', 'consent.caregiver_view': true } });

  // nothing yet
  assert.equal((await alice('GET', url('/portfolio', id))).json.approved, null);
  assert.equal((await admin('POST', url('/portfolio/generate', P2.id + 100), {})).status, 400, 'nothing to write from when there are no answers');
  assert.equal((await alice('POST', url('/portfolio/generate', id), {})).status, 403, 'carers cannot generate');

  let r = await admin('POST', url('/portfolio/generate', id), { ai: false });
  assert.equal(r.status, 201);
  assert.equal(r.json.version, 1);
  assert.equal(r.json.status, 'draft');
  assert.equal(r.json.provider, 'template');
  const c = r.json.content;
  assert.ok(c.sections.length && c.sections.every((s) => s.items.every((i) => i.from.length)));
  assert.ok(c.gaps.some((g) => /allergies/i.test(g.question)));

  // the team sees the draft, carers see nothing
  const asAdmin = (await admin('GET', url('/portfolio', id))).json;
  assert.equal(asAdmin.draft.version, 1);
  assert.equal(asAdmin.approved, null);
  assert.equal((await alice('GET', url('/portfolio', id))).json.approved, null);
  assert.equal((await bob('GET', url('/portfolio', id))).status, 403);

  // approve it: now carers see it
  assert.equal((await alice('POST', url('/portfolio/1/approve', id))).status, 403);
  assert.equal((await admin('POST', url('/portfolio/1/approve', id))).status, 200);
  const seen = (await alice('GET', url('/portfolio', id))).json;
  assert.equal(seen.approved.version, 1);
  assert.equal(seen.can_edit, false);
  assert.equal(seen.draft, undefined, 'carers are never shown a draft');

  // a new draft does not replace the approved one until it is approved
  r = await admin('POST', url('/portfolio/generate', id), { ai: false });
  assert.equal(r.json.version, 2);
  assert.equal((await alice('GET', url('/portfolio', id))).json.approved.version, 1);
  assert.equal((await admin('POST', url('/portfolio/2/approve', id))).status, 200);
  assert.equal((await alice('GET', url('/portfolio', id))).json.approved.version, 2);
  assert.equal((await admin('POST', url('/portfolio/2/approve', id))).status, 404, 'only a draft can be approved');

  // a portfolio cannot be made from nothing
  assert.equal((await admin('POST', url('/portfolio/generate', P2.id + 0), { ai: false })).status === 201, true, 'the other patient has answers');
});
