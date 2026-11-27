import { Router } from 'express';
import { q } from '../db.js';
import { wrap } from '../util.js';

const r = Router(); // patient scope is checked by guardPatient on /patients/:id

const WEEK = 7 * 864e5;
// Counts per week for the last 8 weeks, oldest first.
function weekly(rows, now = Date.now()) {
  const bins = Array(8).fill(0);
  for (const x of rows) {
    const i = 7 - Math.floor((now - new Date(x.ts).getTime()) / WEEK);
    if (i >= 0 && i < 8) bins[i]++;
  }
  return bins;
}
const n = (v) => Number(v) || 0;
const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
const PROFILE_FIELDS = ['preferred_name', 'language', 'age_band', 'background', 'traits', 'likes', 'dislikes', 'calming', 'triggers', 'communication', 'routine', 'conditions', 'allergies', 'emergency_name', 'clinician_name'];

// An inventory of what Memora holds about one patient and what could still be collected. It counts records and
// never returns their content, so it is safe to show next to the consent switches.
r.get('/patients/:id/data-overview', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const one = async (sql, p = [id]) => (await q(sql, p)).rows[0] || {};
  const since = "ts > now() - interval '56 days'";

  const prof = await one('SELECT * FROM patient_profiles WHERE patient_id=$1');
  const filled = PROFILE_FIELDS.filter((f) => (Array.isArray(prof[f]) ? prof[f].length : String(prof[f] ?? '').trim())).length;

  const people = await one(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE consent_noted)::int AS consented FROM contacts WHERE patient_id=$1`);
  const peoplePhotos = await one('SELECT COUNT(*)::int AS n FROM photos WHERE patient_id=$1 AND contact_id IS NOT NULL');
  const allPhotos = await one('SELECT COUNT(*)::int AS n, MAX(created_at) AS last FROM photos WHERE patient_id=$1');
  const meds = await one('SELECT COUNT(*)::int AS n FROM medicines WHERE patient_id=$1');
  const places = await one('SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE lat IS NOT NULL)::int AS located FROM places WHERE patient_id=$1');
  const logs = await one('SELECT COUNT(*)::int AS n, MAX(ts) AS last FROM care_logs WHERE patient_id=$1');
  const logKinds = (await q('SELECT kind, COUNT(*)::int AS n FROM care_logs WHERE patient_id=$1 GROUP BY kind ORDER BY n DESC', [id])).rows;
  const logTs = (await q(`SELECT ts FROM care_logs WHERE patient_id=$1 AND ${since}`, [id])).rows;
  const obs = await one('SELECT COUNT(*)::int AS n, MAX(ts) AS last FROM observations WHERE patient_id=$1');
  const traits = await one('SELECT COUNT(*)::int AS n FROM observation_traits t JOIN observations o ON o.id=t.observation_id WHERE o.patient_id=$1');
  const obsTs = (await q(`SELECT ts FROM observations WHERE patient_id=$1 AND ${since}`, [id])).rows;
  const mem = await one(`SELECT COUNT(*) FILTER (WHERE status='active')::int AS active, COUNT(*) FILTER (WHERE status='superseded')::int AS replaced,
                                COUNT(*) FILTER (WHERE status='retracted')::int AS forgotten,
                                COUNT(*) FILTER (WHERE status='active' AND tier=0)::int AS t0, COUNT(*) FILTER (WHERE status='active' AND tier=1)::int AS t1,
                                COUNT(*) FILTER (WHERE status='active' AND tier=2)::int AS t2, MAX(created_at) AS last FROM memories WHERE patient_id=$1`);
  const memTs = (await q("SELECT created_at AS ts FROM memories WHERE patient_id=$1 AND created_at > now() - interval '56 days'", [id])).rows;
  const sig = await one('SELECT COUNT(*)::int AS n, MAX(ts) AS last FROM signals WHERE patient_id=$1 AND device_id IS NOT NULL');
  const sigTs = (await q(`SELECT ts FROM signals WHERE patient_id=$1 AND device_id IS NOT NULL AND ${since}`, [id])).rows;
  const dev = await one('SELECT COUNT(*)::int AS n FROM devices WHERE patient_id=$1');
  const rec = await one('SELECT COUNT(*)::int AS n, COALESCE(SUM(masked_count),0)::int AS masked, COUNT(*) FILTER (WHERE dry_run)::int AS dry, MAX(ts) AS last FROM receipts WHERE patient_id=$1');
  const team = await one("SELECT COUNT(*) FILTER (WHERE status='active')::int AS active, COUNT(*)::int AS ever FROM patient_connections WHERE patient_id=$1");

  const consent = { photos: Boolean(prof.consent_photos), wearables: Boolean(prof.consent_wearables), caregiver_view: prof.consent_caregiver_view !== false };
  const cat = (key, label, blurb, tier, state, count, detail, extra = {}) => ({ key, label, blurb, tier, state, count, detail, ...extra });

  const categories = [
    cat('profile', 'Patient file', 'Who they are, what helps, care essentials', '0 and 1', filled ? 'collected' : 'available', filled,
      [`${filled} of ${PROFILE_FIELDS.length} sections filled`, prof.updated_at ? 'Kept up to date by the Memora team' : 'Not started'],
      { last: prof.updated_at || null, next: filled ? null : { text: 'Complete the patient file', tab: 'file' }, unit: 'sections' }),
    cat('people', 'People', 'The people who matter, and what to mention', '1', people.n ? 'collected' : 'available', people.n,
      [plural(people.n, 'person', 'people'), `${people.consented} with consent noted`, plural(peoplePhotos.n, 'photo', 'photos')],
      { next: people.n ? null : { text: 'Add the family and friends', tab: 'people' }, unit: 'people' }),
    cat('medicines', 'Medicines', 'Names, doses and times', '0 and 1', meds.n ? 'collected' : 'available', meds.n, [plural(meds.n, 'medicine', 'medicines')],
      { next: meds.n ? null : { text: 'Add the medicines so caregivers can log before and after', tab: 'medicines' }, unit: 'medicines' }),
    cat('places', 'Places', 'Home, the park, the pharmacy', '0', places.n ? 'collected' : 'available', places.n,
      [plural(places.n, 'place', 'places'), `${places.located} with coordinates`],
      { next: places.n ? null : { text: 'Add Home so location can be placed', tab: 'places' }, unit: 'places' }),
    cat('logs', 'Care logs', 'Notes caregivers write: medicine, meals, visits, incidents, behaviour', '1', logs.n ? 'collected' : 'available', logs.n,
      logKinds.length ? logKinds.map((k) => `${k.n} ${k.kind}`) : ['Nothing logged yet'],
      { last: logs.last || null, series: weekly(logTs), next: logs.n ? null : { text: 'Caregivers log from their dashboard', tab: 'logs' }, unit: 'logs' }),
    cat('observations', 'Log arena notes', 'How they were, when, and what it was around', '1', obs.n ? 'collected' : 'available', obs.n,
      [plural(obs.n, 'note', 'notes'), `${traits.n} characteristics rated`],
      { last: obs.last || null, series: weekly(obsTs), next: obs.n ? null : { text: 'Caregivers add notes in the log arena', tab: 'observations' }, unit: 'notes' }),
    cat('memories', 'Memories', 'Small dated statements built from the records above', '0, 1 and 2', mem.active ? 'collected' : 'available', mem.active,
      [`${mem.active} current`, `${mem.replaced} replaced (kept as history)`, `${mem.forgotten} forgotten`],
      { last: mem.last || null, series: weekly(memTs), next: mem.active ? null : { text: 'Build them from the records', tab: 'memory' }, unit: 'memories' }),
    cat('photos', 'Photos', 'Of the patient and the people they know, stored encrypted', '0',
      !consent.photos ? 'off' : allPhotos.n ? 'collected' : 'available', allPhotos.n, [plural(allPhotos.n, 'photo', 'photos'), consent.photos ? 'Consent given' : 'Consent not given'],
      { last: allPhotos.last || null, next: consent.photos ? (allPhotos.n ? null : { text: 'Add a profile photo', tab: 'file' }) : { text: 'Switch on photo consent to allow photos', tab: 'consent' }, unit: 'photos' }),
    cat('wearables', 'Phone and wearable data', 'Live heart rate, movement and location', '0',
      !consent.wearables ? 'off' : sig.n ? 'collected' : 'available', sig.n, [plural(sig.n, 'reading', 'readings'), plural(dev.n, 'device', 'devices'), consent.wearables ? 'Consent given' : 'Consent not given'],
      { last: sig.last || null, series: weekly(sigTs), next: consent.wearables ? (sig.n ? null : { text: 'Start a source on the Live tab', tab: 'live' }) : { text: 'Switch on wearable consent to allow live data', tab: 'consent' }, unit: 'readings' }),
  ];

  const records = people.n + meds.n + places.n + logs.n + obs.n + mem.active + allPhotos.n + sig.n;
  res.json({
    consent,
    totals: { records, collected: categories.filter((c) => c.state === 'collected').length, kinds: categories.length, consents_on: Object.values(consent).filter(Boolean).length },
    categories,
    tiers: { t0: mem.t0, t1: mem.t1, t2: mem.t2 },
    team: { active: team.active || 0, ever: team.ever || 0 },
    vault: { receipts: rec.n, masked: rec.masked, dry_runs: rec.dry, last: rec.last || null },
  });
}));

export default r;
