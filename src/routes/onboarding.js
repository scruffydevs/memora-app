import { Router } from 'express';
import { q } from '../db.js';
import { wrap } from '../util.js';
import { requireAdmin, rateLimit, audit } from '../auth.js';
import { saveProfile } from './caregiver.js';
import { record } from '../activity.js';
import { callOpenRouter, openRouterEnabled, openRouterModel } from '../llm.js';
import { generatePortfolio } from '../portfolio.js';
import { ALL_FIELDS, FIELD_BY_KEY, cleanAnswer, isEmpty, missingKeyQuestions, progress, valueText } from '../../shared/intake.js';

const r = Router(); // patient scope is checked by guardPatient on /patients/:id

const get = async (id) => {
  const row = (await q('SELECT answers, step, completed_at, updated_at FROM patient_intake WHERE patient_id=$1', [id])).rows[0];
  return row || { answers: {}, step: 0, completed_at: null, updated_at: null };
};

// What the onboarding answers mean for the patient file. Only answered questions change anything.
export function profilePatch(a, current = {}) {
  const v = (k) => (isEmpty(a[k]) ? null : a[k]);
  const lines = (pairs) => pairs.filter(([, t]) => !isEmpty(t)).map(([l, t]) => `${l}: ${Array.isArray(t) ? t.join(', ') : t}`).join('\n');
  const p = {};
  const set = (k, val) => { if (!isEmpty(val)) p[k] = val; };
  set('preferred_name', v('about.preferred'));
  if (v('about.age')) set('age_band', `${Math.floor(a['about.age'] / 10) * 10}s`);
  const langs = [...new Set([v('language.comfortable'), ...(a['language.languages'] || [])].filter(Boolean))];
  set('language', langs.join(', '));
  set('background', lines([['Work', v('story.work')], ['Faith and customs', v('story.faith')], ['Life story', v('story.life')], ['Lives', [a['about.area'], a['about.lives_with']].filter(Boolean).join(', ')]]));
  set('likes', v('story.loves')); set('dislikes', v('story.dislikes'));
  set('calming', v('mood.calming')); set('triggers', v('mood.triggers'));
  set('communication', lines([['How to speak', v('language.style')], ['Hearing', v('language.hearing')], ['Eyesight', v('language.vision')], ['Speech', v('language.speech')], ['Reading', v('language.reading')]]));
  set('routine', lines([['Wakes', v('routine.wake')], ['Bedtime', v('routine.bed')], ['Meals', v('routine.meals')], ['Best and hardest times', v('routine.best')], ['A usual day', v('routine.day')]]));
  const dx = [v('diagnosis.type'), v('diagnosis.diagnosed') && `diagnosed ${valueText(FIELD_BY_KEY['diagnosis.diagnosed'].field, a['diagnosis.diagnosed'])}`, v('diagnosis.stage') && `stage as told: ${a['diagnosis.stage']}`].filter(Boolean).join(', ');
  set('conditions', [dx, ...(a['health.conditions'] || []), a['health.other']].filter(Boolean).join('; '));
  set('allergies', v('health.allergies'));
  set('emergency_name', v('support.emergency_name')); set('emergency_phone', v('support.emergency_phone'));
  set('clinician_name', v('diagnosis.doctor')); set('clinic', v('diagnosis.clinic'));
  if (typeof a['photo.consent'] === 'boolean') p.consent_photos = a['photo.consent'];
  if (typeof a['consent.caregiver_view'] === 'boolean') p.consent_caregiver_view = a['consent.caregiver_view'];
  if (typeof a['consent.wearables'] === 'boolean') p.consent_wearables = a['consent.wearables'];
  return { ...current, ...p };
}

async function applyToProfile(id, answers, userName) {
  const name = answers['about.name'];
  if (name) await q('UPDATE patients SET name=$2 WHERE id=$1 AND name <> $2', [id, name]);
  await q('INSERT INTO patient_profiles (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  const cur = (await q('SELECT * FROM patient_profiles WHERE patient_id=$1', [id])).rows[0];
  await saveProfile(id, profilePatch(answers, cur), userName);
}

const summary = (row) => ({ answers: row.answers, step: row.step, completed_at: row.completed_at, updated_at: row.updated_at,
  started: !isEmpty(Object.keys(row.answers || {})), progress: progress(row.answers || {}), missing_key: missingKeyQuestions(row.answers || {}) });

r.get('/patients/:id/intake', requireAdmin, wrap(async (req, res) => res.json(summary(await get(Number(req.params.id))))));

// Save some answers (a card at a time). An answer of null or "" clears it. Unknown or invalid answers are dropped.
r.put('/patients/:id/intake', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await get(id);
  const answers = { ...cur.answers };
  for (const [k, raw] of Object.entries(req.body?.answers || {})) {
    const f = FIELD_BY_KEY[k];
    if (!f) continue;
    const val = cleanAnswer(f.field, raw);
    if (val === undefined) delete answers[k]; else answers[k] = val;
  }
  const step = Number.isInteger(req.body?.step) ? Math.min(Math.max(req.body.step, 0), 30) : cur.step;
  await q(`INSERT INTO patient_intake (patient_id, answers, step, updated_at, updated_by) VALUES ($1,$2,$3, now(), $4)
           ON CONFLICT (patient_id) DO UPDATE SET answers=EXCLUDED.answers, step=EXCLUDED.step, updated_at=now(), updated_by=EXCLUDED.updated_by`,
    [id, JSON.stringify(answers), step, req.user.name]);
  await applyToProfile(id, answers, req.user.name);
  record('profile', id, `Onboarding saved: ${progress(answers).done} of ${progress(answers).total} questions answered`);
  res.json(summary(await get(id)));
}));

// ---- the portfolio ----
const latest = async (id, where = '') => (await q(`SELECT id, version, status, content, provider, model, created_by, created_at, approved_by, approved_at FROM patient_portfolios WHERE patient_id=$1 ${where} ORDER BY version DESC LIMIT 1`, [id])).rows[0] || null;

r.get('/patients/:id/portfolio', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const approved = await latest(id, "AND status='approved'");
  if (req.user.role !== 'admin') return res.json({ approved, can_edit: false });
  const draft = await latest(id, "AND status='draft'");
  res.json({ approved, draft, can_edit: true, ai: { available: openRouterEnabled(), model: openRouterEnabled() ? openRouterModel() : null } });
}));

r.post('/patients/:id/portfolio/generate', requireAdmin, rateLimit((req) => `portfolio|${req.user.id}`, { max: 8, windowMs: 60 * 1000 }), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const intake = await get(id);
  if (isEmpty(Object.keys(intake.answers))) return res.status(400).json({ error: 'no_answers' });
  const useAi = req.body?.ai !== false && openRouterEnabled();
  const contacts = (await q('SELECT name FROM contacts WHERE patient_id=$1', [id])).rows.map((c) => c.name);
  const out = await generatePortfolio(intake.answers, { callModel: useAi ? (m) => callOpenRouter(m) : null, extraNames: contacts });
  const version = ((await q('SELECT COALESCE(MAX(version),0)+1 AS v FROM patient_portfolios WHERE patient_id=$1', [id])).rows[0].v);
  await q("UPDATE patient_portfolios SET status='discarded' WHERE patient_id=$1 AND status='draft'", [id]); // one draft at a time
  const row = (await q(`INSERT INTO patient_portfolios (patient_id, version, content, provider, model, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, version, status, content, provider, model, created_at`,
    [id, version, JSON.stringify(out.content), out.provider, out.provider === 'openrouter' ? openRouterModel() : null, req.user.name])).rows[0];
  if (out.outbound) { // what was sent to the AI service, already masked, kept as a receipt
    await q('INSERT INTO receipts (patient_id, question, masked_count, provider, outbound, dry_run) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, 'Portfolio from onboarding answers', out.maskedCount, `openrouter ${openRouterModel()} (synthetic data only)`, out.outbound, out.provider !== 'openrouter']);
  }
  await q('UPDATE patient_intake SET completed_at=COALESCE(completed_at, now()) WHERE patient_id=$1', [id]);
  await audit(req.user.id, 'portfolio_drafted', id, `v${version}, ${out.provider}`);
  record('profile', id, `Portfolio drafted (version ${version}, ${out.provider === 'openrouter' ? 'written with AI' : 'laid out without AI'})`);
  res.status(201).json(row);
}));

const decide = (status) => wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = (await q(`UPDATE patient_portfolios SET status=$3, approved_by=$4, approved_at=now() WHERE patient_id=$1 AND version=$2 AND status='draft' RETURNING id, version, status`,
    [id, Number(req.params.version), status, req.user.name])).rows[0];
  if (!row) return res.status(404).json({ error: 'draft_not_found' });
  if (status === 'approved') await q("UPDATE patient_portfolios SET status='discarded' WHERE patient_id=$1 AND status='approved' AND version <> $2", [id, row.version]);
  await audit(req.user.id, `portfolio_${status}`, id, `v${row.version}`);
  record('profile', id, `Portfolio version ${row.version} ${status}`);
  res.json(row);
});
r.post('/patients/:id/portfolio/:version/approve', requireAdmin, decide('approved'));
r.post('/patients/:id/portfolio/:version/discard', requireAdmin, decide('discarded'));

export { ALL_FIELDS };
export default r;
