// Synthetic persona: 8 weeks of life with a planted change after week 5
// (shorter sleep, more missed doses, more repeated questions, night exits).
// Everything here is invented. Never load real patient data.
import 'dotenv/config';
import { pool, q } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';

const NAME = 'Demo Patient (synthetic)';
const DAYS = 56;
const PLANT_FROM = 35; // day index where the change starts

function rng(seed) { // mulberry32, deterministic
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const R = rng(42);
const norm = (m, s) => m + s * (R() + R() + R() - 1.5) * 1.6;

await runMigrations();
await q('DELETE FROM patients WHERE name=$1', [NAME]);
const pid = (await q("INSERT INTO patients (name, patient_code, is_demo) VALUES ($1, 'DEMO-0001', true) RETURNING id", [NAME])).rows[0].id;

const mk = async (sql, p) => (await q(sql, p)).rows[0].id;
const anita = await mk("INSERT INTO contacts (patient_id,name,relationship,mention,enrolled) VALUES ($1,'Anita Rao','daughter','Ask about her new job',true) RETURNING id", [pid]);
const ravi = await mk("INSERT INTO contacts (patient_id,name,relationship,mention,enrolled) VALUES ($1,'Ravi Kumar','neighbour','Likes cricket',true) RETURNING id", [pid]);
const doctor = await mk("INSERT INTO contacts (patient_id,name,relationship,mention,enrolled) VALUES ($1,'Dr. Meera Iyer','doctor','Next check-up in the clinic',false) RETURNING id", [pid]);
const home = await mk("INSERT INTO places (patient_id,label,lat,lon,radius_m) VALUES ($1,'Home',12.9716,77.5946,60) RETURNING id", [pid]);
const park = await mk("INSERT INTO places (patient_id,label,lat,lon,radius_m) VALUES ($1,'Lakeview Park',12.9750,77.6000,150) RETURNING id", [pid]);
const pharmacy = await mk("INSERT INTO places (patient_id,label,lat,lon,radius_m) VALUES ($1,'City Pharmacy',12.9700,77.5900,50) RETURNING id", [pid]);
const med = await mk("INSERT INTO medicines (patient_id,name,dose,schedule) VALUES ($1,'Evening tablet (synthetic)','1 tablet','20:00 daily') RETURNING id", [pid]);

const day0 = new Date(); day0.setUTCHours(0, 0, 0, 0); day0.setUTCDate(day0.getUTCDate() - (DAYS - 1));
const at = (d, h, m = 0) => { const t = new Date(day0); t.setUTCDate(t.getUTCDate() + d); t.setUTCHours(h, m, 0, 0); return t.toISOString(); };

let entries = 0;
async function entry(ts, text, placeId = null, contactIds = [], tier = 1, source = 'typed') {
  const id = await mk('INSERT INTO entries (patient_id,ts,text,source,tier,place_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [pid, ts, text, source, tier, placeId]);
  for (const c of contactIds) await q('INSERT INTO entry_contacts (entry_id,contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, c]);
  entries++;
  return id;
}
const event = (ts, type, o = {}) => q('INSERT INTO events (patient_id,ts,type,contact_id,place_id,medicine_id,detail) VALUES ($1,$2,$3,$4,$5,$6,$7)', [pid, ts, type, o.contact || null, o.place || null, o.med || null, o.detail || null]);
const signal = (ts, kind, value) => q('INSERT INTO signals (patient_id,ts,kind,value) VALUES ($1,$2,$3,$4)', [pid, ts, kind, Math.round(value * 100) / 100]);

for (let d = 0; d < DAYS; d++) {
  const changed = d >= PLANT_FROM;
  const dow = new Date(at(d, 12)).getUTCDay();
  await signal(at(d, 7), 'sleep_hours', norm(changed ? 5.7 : 7.1, 0.4));
  await signal(at(d, 21), 'steps', Math.max(800, norm(changed ? 3200 : 5200, 700)));
  await signal(at(d, 20), 'mood', Math.min(5, Math.max(1, norm(changed ? 2.8 : 3.8, 0.5))));
  // Evening tablet
  const missed = R() < (changed ? 0.3 : 0.05);
  await event(at(d, 20), missed ? 'dose_missed' : 'dose_taken', { med });
  if (missed) await entry(at(d, 21), 'I think I forgot my evening tablet today.', home);
  // Sunday visit from Anita
  if (dow === 0) {
    await event(at(d, 11), 'visit', { contact: anita, place: home });
    await entry(at(d, 11, 30), R() < 0.5 ? 'Anita visited and we had lunch. She asked about my knee.' : 'Anita came over. We talked about her new job.', home, [anita]);
  }
  // Wednesday: pharmacy, Friday: Ravi
  if (dow === 3) await entry(at(d, 10), 'Walked to City Pharmacy to collect my tablets.', pharmacy);
  if (dow === 5) await entry(at(d, 17), 'Ravi stopped by and we chatted about the cricket match.', home, [ravi]);
  if (dow === 6 && !changed) await entry(at(d, 8), 'Morning walk in Lakeview Park. Felt good.', park);
  // Occasional doctor note
  if (d === 20) await entry(at(d, 12), 'Dr. Meera Iyer said to take the evening tablet after food.', null, [doctor]);
  // Planted change: repeated questions and night exits
  const asks = changed ? 2 + Math.floor(R() * 3) : Math.floor(R() * 1.3);
  for (let k = 0; k < asks; k++) await event(at(d, 9 + k * 2), 'repeated_question', { detail: 'Asked what day it is' });
  if (asks >= 2) await entry(at(d, 15), 'I keep forgetting what day it is today.', home);
  if (changed && R() < 0.35) { await event(at(d, 2, 30), 'exit', { place: home, detail: 'Left home at night' }); await entry(at(d, 3), 'Woke up and walked outside near home at night.', home); }

  // Caregiver logs (synthetic): behaviour gets more frequent after the planted change.
  const care = (ts, kind, text, o = {}) => q('INSERT INTO care_logs (patient_id,ts,kind,category,severity,trigger_text,helped,text,logged_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [pid, ts, kind, o.category || null, o.severity || null, o.trigger || null, o.helped || null, text, 'Caregiver (synthetic)']);
  await care(at(d, 20, 10), missed ? 'incident' : 'medicine', missed ? 'Evening tablet was missed.' : 'Evening tablet taken with dinner.');
  if (R() < (changed ? 0.55 : 0.12)) await care(at(d, 18), 'behaviour', changed ? 'Restless and unsure where to go in the evening.' : 'A little low in the evening.', { category: R() < 0.5 ? 'agitation' : 'mood', severity: changed ? 2 + Math.floor(R() * 3) : 1 + Math.floor(R() * 2), trigger: R() < 0.5 ? 'Late afternoon noise' : 'Changed routine', helped: R() < 0.6 ? 'Quiet music' : 'A short walk with Anita' });
  if (changed && R() < 0.3) await care(at(d, 3), 'behaviour', 'Up in the night and tried to leave the house.', { category: 'wandering', severity: 3, trigger: 'Woke disoriented', helped: 'Gentle reminder it was night' });
  if (asks >= 2) await care(at(d, 15), 'behaviour', 'Asked the same question several times.', { category: 'repeated_question', severity: 2, helped: 'Wrote the answer on the whiteboard' });

  // Log arena (synthetic): notes around the evening tablet. Invented values, no real meaning.
  if (R() < 0.45) {
    const clamp = (v) => Math.max(-2, Math.min(2, Math.round(v)));
    const base = changed ? -1 : 0;
    const obs = async (ts, rel, mins, traits, note) => {
      const oid = await mk('INSERT INTO observations (patient_id,ts,context_type,context_relation,minutes_offset,medicine_id,note,logged_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [pid, ts, 'medicine', rel, mins, med, note, 'Caregiver (synthetic)']);
      for (const [trait, v, detail] of traits) await q('INSERT INTO observation_traits (observation_id,trait,vs_usual,detail) VALUES ($1,$2,$3,$4)', [oid, trait, clamp(v), detail || null]);
    };
    await obs(at(d, 19, 40), 'before', 20, [['agitation', base - R() * 1.5, 'Pacing near the door'], ['mood', base + R() - 0.5, null], ['orientation', base - R(), null]], 'Before the evening tablet.');
    await obs(at(d, 20, 40), 'after', 40, [['agitation', base + 0.6 + R(), 'Settled in the chair'], ['mood', base + 0.4 + R() - 0.3, null], ['sleepiness', R() * 1.2, null]], 'After the evening tablet.');
  }
}

await q('UPDATE contacts SET consent_noted=true WHERE id IN ($1,$2)', [anita, ravi]);
await q(
  `INSERT INTO patient_profiles (patient_id, preferred_name, language, age_band, background, traits, likes, dislikes, calming, triggers, communication, routine, consent_photos,
                                 conditions, allergies, emergency_name, emergency_phone, clinician_name, clinic)
   VALUES ($1,'Demo','English and Kannada','70s',$2,$3,$4,$5,$6,$7,$8,$9,false,
           'Early-stage Alzheimer''s, as told by the family (synthetic).','None known (synthetic).','Anita Rao (daughter, synthetic)','+00 0000 000000','Dr. Meera Iyer (synthetic)','City Memory Clinic (synthetic)')
   ON CONFLICT (patient_id) DO NOTHING`,
  [pid,
   'Retired teacher (synthetic persona). Lives at home with regular visits from family. Proud of a long career and still enjoys explaining things.',
   ['gentle', 'proud', 'loves a joke', 'values routine'],
   ['Old film songs', 'Tea at four', 'Cricket on the radio', 'Gardening'],
   ['Loud television', 'Being rushed', 'Strangers in the house'],
   ['Quiet music', 'A short walk outside', 'Looking at family photos'],
   ['Late afternoon noise', 'A changed routine', 'Waking in the dark'],
   'Speak slowly, face them, use one question at a time. Offer a choice of two. Avoid correcting; redirect gently.',
   'Wakes around 7. Tea, walk, lunch at 1. Rest at 3. Tea at 4. Evening tablet at 8 with dinner.']);

console.log(`seeded patient ${pid}: ${entries} entries, ${DAYS * 3} signals`);
await pool.end();
