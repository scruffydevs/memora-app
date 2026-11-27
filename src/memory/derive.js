// Memora Core, milestone 1: deterministic derivation. No AI model: fixed rules turn data we already hold into memories.
import { q } from '../db.js';
import { addMemory, supersedeMemory, closeMemory } from './store.js';
import { SINGLE_VALUED } from './model.js';

const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
const dateText = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sum = (a, b) => ({ created: a.created + b.created, superseded: a.superseded + b.superseded, unchanged: a.unchanged + b.unchanged });
export const zero = () => ({ created: 0, superseded: 0, unchanged: 0 });

// ---------- profile -> memories ----------
// Tier 0: identity and medical details. Tier 1: character, preferences, routine (masked before any model sees them).
function profileMemories(p) {
  const out = [];
  const one = (predicate, kind, text, tier) => { if (text && String(text).trim()) out.push({ predicate, kind, text: String(text).trim(), tier, single: true }); };
  const each = (predicate, kind, tags, make, tier = 1) => { for (const t of tags || []) if (String(t).trim()) out.push({ predicate, kind, text: make(String(t).trim()), tier, single: false }); };

  one('preferred_name', 'fact', p.preferred_name && `Prefers to be called ${p.preferred_name}`, 0);
  one('language', 'fact', p.language && `Languages: ${p.language}`, 1);
  one('age_band', 'fact', p.age_band && `In their ${p.age_band}`, 1);
  one('background', 'fact', p.background && `Background: ${p.background}`, 1);
  one('communication', 'preference', p.communication && `How to talk with them: ${p.communication}`, 1);
  one('routine', 'routine', p.routine && `A usual day: ${p.routine}`, 1);
  one('condition', 'fact', p.conditions && `Conditions, as told by family or doctors: ${p.conditions}`, 0);
  one('allergy', 'fact', p.allergies && `Allergies: ${p.allergies}`, 0);
  one('emergency_contact', 'relationship', p.emergency_name && `Emergency contact: ${p.emergency_name}${p.emergency_phone ? `, ${p.emergency_phone}` : ''}`, 0);
  one('clinician', 'relationship', p.clinician_name && `Clinician: ${p.clinician_name}${p.clinic ? `, ${p.clinic}` : ''}`, 0);
  each('trait', 'fact', p.traits, (t) => `Described as ${t}`);
  each('likes', 'preference', p.likes, (t) => `Likes ${t}`);
  each('dislikes', 'preference', p.dislikes, (t) => `Dislikes ${t}`);
  each('calming', 'preference', p.calming, (t) => `What helps calm them: ${t}`);
  each('trigger', 'fact', p.triggers, (t) => `Tends to be upset by: ${t}`);
  return out;
}

// Compare what the profile says now with the active profile memories, then add, supersede or close the difference.
export async function deriveProfile(patientId, actor = 'rules v1') {
  const prof = (await q('SELECT * FROM patient_profiles WHERE patient_id=$1', [patientId])).rows[0];
  const res = zero();
  if (!prof) return res;
  const want = profileMemories(prof);
  const have = (await q(
    `SELECT m.* FROM memories m WHERE m.patient_id=$1 AND m.status='active'
        AND EXISTS (SELECT 1 FROM memory_sources s WHERE s.memory_id=m.id AND s.source_table='profile')`, [patientId])).rows;
  const handled = new Set();
  const source = (tier) => [{ table: 'profile', id: patientId, tier, note: 'patient file' }];

  for (const w of want) {
    const base = { patientId, kind: w.kind, predicate: w.predicate, text: w.text, tier: w.tier, confidence: 0.95, createdBy: actor, sources: source(w.tier) };
    if (SINGLE_VALUED.includes(w.predicate) && w.single) {
      const old = have.find((h) => h.predicate === w.predicate && !handled.has(String(h.id)));
      if (!old) { await addMemory(base); res.created++; continue; }
      handled.add(String(old.id));
      if (old.text !== w.text || Number(old.tier) !== w.tier) { await supersedeMemory(old.id, { text: w.text, tier: w.tier, sources: source(w.tier) }, actor); res.superseded++; } else res.unchanged++;
    } else {
      const found = have.find((h) => h.predicate === w.predicate && norm(h.text) === norm(w.text) && !handled.has(String(h.id)));
      if (found) { handled.add(String(found.id)); res.unchanged++; } else { await addMemory(base); res.created++; }
    }
  }
  // no longer in the profile: the fact stopped being true. Close it (history stays).
  for (const h of have) if (!handled.has(String(h.id))) { if (await closeMemory(h.id, actor, 'removed from the patient file')) res.superseded++; }
  return res;
}

// ---------- observations (log arena) -> memories ----------
const LEVEL = { '-2': 'much worse than usual', '-1': 'worse than usual', 0: 'about the same as usual', 1: 'better than usual', 2: 'much better than usual' };
const REL_SLEEP = { before: 'at bedtime', during: 'in the night', after: 'on waking' };

function contextPhrase(o) {
  if (!o.context_type || o.context_type === 'none') return '';
  if (o.context_type === 'sleep') return `, ${REL_SLEEP[o.context_relation]}`;
  const what = { medicine: o.medicine_name || 'a medicine', meal: 'a meal', visit: 'a visit', outing: 'an outing' }[o.context_type];
  const mins = o.minutes_offset != null && o.context_relation !== 'during' ? `${o.minutes_offset} min ` : '';
  return `, ${mins}${o.context_relation} ${what}`;
}

const hasSource = async (table, id) =>
  (await q('SELECT 1 FROM memory_sources WHERE source_table=$1 AND source_id=$2 LIMIT 1', [table, id])).rows.length > 0;

export async function deriveObservation(observationId, actor = 'rules v1') {
  const res = zero();
  if (await hasSource('observations', observationId)) { res.unchanged++; return res; }
  const o = (await q(
    `SELECT o.*, m.name AS medicine_name FROM observations o LEFT JOIN medicines m ON m.id = o.medicine_id WHERE o.id=$1`, [observationId])).rows[0];
  if (!o) return res;
  const traits = (await q('SELECT trait, vs_usual, detail FROM observation_traits WHERE observation_id=$1 ORDER BY trait', [observationId])).rows;
  const by = actor === 'rules v1' ? (o.logged_by || actor) : actor;
  const base = { patientId: o.patient_id, kind: 'observation', predicate: 'observation', confidence: 0.9, validFrom: o.ts, createdBy: by,
    sources: [{ table: 'observations', id: o.id, tier: 1, note: 'log arena' }], tier: 1 };
  for (const t of traits) {
    const detail = t.detail ? ` ${t.detail.trim().replace(/\.$/, '')}.` : '';
    await addMemory({ ...base, text: `${cap(t.trait)} was ${LEVEL[t.vs_usual]}${contextPhrase(o)} (${dateText(o.ts)}).${detail}` });
    res.created++;
  }
  if (o.note && o.note.trim()) { await addMemory({ ...base, kind: 'event', predicate: 'note', text: `Note${contextPhrase(o)} (${dateText(o.ts)}): ${o.note.trim()}` }); res.created++; }
  return res;
}

// ---------- care logs -> memories ----------
const KIND_LABEL = { behaviour: 'Behaviour', medicine: 'Medicine', meal: 'Meal', visit: 'Visit', incident: 'Incident', note: 'Note' };
const CAT_LABEL = { repeated_question: 'repeated questions' };

export async function deriveCareLog(logId, actor = 'rules v1') {
  const res = zero();
  if (await hasSource('care_logs', logId)) { res.unchanged++; return res; }
  const l = (await q('SELECT * FROM care_logs WHERE id=$1', [logId])).rows[0];
  if (!l) return res;
  const by = actor === 'rules v1' ? (l.logged_by || actor) : actor;
  const when = `(${dateText(l.ts)})`;
  let text; let kind = 'event'; let predicate = l.kind;
  if (l.kind === 'behaviour') {
    kind = 'observation'; predicate = 'behaviour';
    text = `Behaviour noted: ${CAT_LABEL[l.category] || l.category}, strength ${l.severity} of 5${l.trigger_text ? `. Seemed to be set off by ${l.trigger_text}` : ''}${l.helped ? `. What helped: ${l.helped}` : ''}. ${l.text} ${when}`;
  } else text = `${KIND_LABEL[l.kind] || 'Note'}: ${l.text} ${when}`;
  await addMemory({ patientId: l.patient_id, kind, predicate, text: text.slice(0, 1000), tier: 1, confidence: 0.9, validFrom: l.ts, createdBy: by,
    sources: [{ table: 'care_logs', id: l.id, tier: 1, note: 'care log' }] });
  res.created++;
  return res;
}

// ---------- rebuild: safe to run again, creates nothing twice ----------
export async function rebuild(patientId, actor = 'rules v1') {
  let res = await deriveProfile(patientId, actor);
  const obs = (await q('SELECT id FROM observations WHERE patient_id=$1 ORDER BY ts', [patientId])).rows;
  for (const o of obs) res = sum(res, await deriveObservation(o.id, actor));
  const logs = (await q('SELECT id FROM care_logs WHERE patient_id=$1 ORDER BY ts', [patientId])).rows;
  for (const l of logs) res = sum(res, await deriveCareLog(l.id, actor));
  return res;
}
