// Onboarding answers, their effect on the patient file, and the portfolio written from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAnswer, FIELD_BY_KEY, factsFromAnswers, missingKeyQuestions, KEY_QUESTIONS, CARDS, ALL_FIELDS } from '../shared/intake.js';
import { cleanPortfolio, generatePortfolio, templatePortfolio, buildMessages, namesInFreeText } from '../src/portfolio.js';
import { profilePatch } from '../src/routes/onboarding.js';

const A = {
  'about.name': 'Lakshmi Devi', 'about.preferred': 'Lakshmi', 'about.age': 76, 'about.area': 'Mysuru',
  'language.languages': ['Kannada', 'English'], 'language.comfortable': 'Kannada', 'language.hearing': 'Uses a hearing aid',
  'story.work': 'a school teacher', 'story.loves': ['old film songs', 'tea'],
  'diagnosis.type': "Alzheimer's disease", 'diagnosis.diagnosed': '2024-03', 'diagnosis.stage': 'Early or mild', 'diagnosis.doctor': 'Dr Rao',
  'mood.calming': ['quiet music'], 'mood.triggers': ['loud television'],
  'support.emergency_name': 'Meera', 'support.emergency_phone': '+91 00000 00000', 'photo.consent': true,
};

test('every card has questions with unique keys, and the important ones are marked', () => {
  const keys = ALL_FIELDS.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(CARDS.length >= 12 && CARDS[0].id === 'about' && CARDS[1].id === 'photo' && CARDS[2].id === 'language', 'name and age, then photo, then language');
  for (const c of CARDS) for (const f of c.fields) if (['choice', 'multi', 'scale'].includes(f.type)) assert.ok(f.options?.length, `${c.id}.${f.key} has options`);
  for (const k of ['diagnosis.type', 'diagnosis.diagnosed', 'diagnosis.stage', 'diagnosis.noticed', 'health.allergies', 'support.emergency_phone']) assert.ok(KEY_QUESTIONS.includes(k), `${k} is a key question`);
});

test('answers are cleaned to fit their question', () => {
  const f = (k) => FIELD_BY_KEY[k].field;
  assert.equal(cleanAnswer(f('about.age'), '76'), 76);
  assert.equal(cleanAnswer(f('about.age'), 5), undefined, 'out of range');
  assert.equal(cleanAnswer(f('diagnosis.stage'), 'Early or mild'), 'Early or mild');
  assert.equal(cleanAnswer(f('diagnosis.stage'), 'made up'), undefined, 'not one of the options');
  assert.equal(cleanAnswer(f('diagnosis.diagnosed'), '2024-03'), '2024-03');
  assert.equal(cleanAnswer(f('diagnosis.diagnosed'), 'March'), undefined);
  assert.deepEqual(cleanAnswer(f('thinking.difficulties'), ['Repeats questions', 'nonsense', 'Repeats questions']), ['Repeats questions']);
  assert.deepEqual(cleanAnswer(f('story.loves'), [' tea ', '', 'songs']), ['tea', 'songs']);
  assert.equal(cleanAnswer(f('photo.consent'), 'yes'), undefined);
  assert.equal(cleanAnswer(f('about.name'), '   '), undefined);
});

test('answers become facts, and the unanswered important questions are listed', () => {
  const facts = factsFromAnswers(A);
  assert.ok(facts.every((x) => x.key && x.label && x.text));
  assert.equal(facts.find((x) => x.key === 'diagnosis.diagnosed').text, 'March 2024', 'months read as words');
  const missing = missingKeyQuestions(A);
  assert.ok(missing.includes('health.allergies') && !missing.includes('diagnosis.type'));
});

test('answers map onto the patient file', () => {
  const p = profilePatch(A, { allergies: 'old value', calming: ['x'] });
  assert.equal(p.preferred_name, 'Lakshmi');
  assert.equal(p.age_band, '70s');
  assert.equal(p.language, 'Kannada, English');
  assert.deepEqual(p.likes, ['old film songs', 'tea']);
  assert.deepEqual(p.calming, ['quiet music'], 'an answered question replaces the old value');
  assert.equal(p.allergies, 'old value', 'an unanswered question leaves the file alone');
  assert.match(p.conditions, /Alzheimer's disease, diagnosed March 2024, stage as told: Early or mild/);
  assert.equal(p.emergency_name, 'Meera');
  assert.equal(p.clinician_name, 'Dr Rao');
  assert.equal(p.consent_photos, true);
  assert.match(p.communication, /Hearing: Uses a hearing aid/);
});

test('the model path masks names going out and drops any line that cites nothing real', async () => {
  const built = buildMessages(A);
  assert.ok(!built.outbound.includes('Lakshmi Devi') && !built.outbound.includes('Mysuru') && !built.outbound.includes('Meera'), 'names and places are masked before sending');
  assert.ok(built.outbound.includes('PERSON_1'));

  let sent;
  const fake = async (messages) => {
    sent = messages;
    const token = messages[1].content.match(/\[about\.name\][^\n]*?(PERSON_\d+)/)?.[1] || 'PERSON_1';
    return '```json\n' + JSON.stringify({
      headline: `${token}, 76`, about_me: `${token} is 76 and most comfortable in Kannada.`, about_from: ['about.name', 'about.age', 'made.up'],
      sections: [
        { id: 'who', items: [{ text: `${token} worked as a school teacher.`, from: ['story.work'] }, { text: 'Loves to swim.', from: [] }, { text: 'Was a pilot.', from: ['story.pilot'] }] },
        { id: 'not-a-section', items: [{ text: 'x', from: ['about.name'] }] },
        { id: 'diagnosis', items: [{ text: "Told it is Alzheimer's disease, diagnosed March 2024.", from: ['diagnosis.type', 'diagnosis.diagnosed'] }] },
      ],
    }) + '\n```';
  };
  const out = await generatePortfolio(A, { callModel: fake });
  assert.equal(out.provider, 'openrouter');
  assert.ok(out.maskedCount > 0);
  const text = JSON.stringify(out.content);
  assert.ok(text.includes('Lakshmi Devi worked as a school teacher'), 'names are put back in the answer');
  assert.ok(!text.includes('swim') && !text.includes('pilot'), 'lines with no valid source are dropped');
  assert.deepEqual(out.content.sections.map((s) => s.id), ['who', 'diagnosis']);
  assert.ok(out.content.sections.every((s) => s.items.every((i) => i.from.length)));
  assert.deepEqual(out.content.about_from, ['about.name', 'about.age'], 'only real keys are kept');
  assert.ok(out.content.gaps.some((g) => /allergies/i.test(g.question)), 'unanswered important questions come from our list');
  assert.ok(sent[0].role === 'system' && /never diagnose/i.test(sent[0].content));
});

test('if the AI reply is unusable or the call fails, the answers are laid out directly', async () => {
  const bad = [async () => 'not json at all', async () => JSON.stringify({ sections: [{ id: 'who', items: [{ text: 'a', from: ['nope'] }] }] }), async () => { throw new Error('LLM_ERROR 500'); }];
  for (const callModel of bad) {
    const out = await generatePortfolio(A, { callModel });
    assert.equal(out.provider, 'template');
    assert.ok(out.content.sections.length > 0 && out.content.note);
  }
  assert.throws(() => cleanPortfolio({ sections: [] }, A), /EMPTY_PORTFOLIO/);
  assert.equal(templatePortfolio({}).sections.length, 0);
});

test('names that nobody listed, written in free text, are masked too and come back in the reply', async () => {
  const B = { ...A, 'story.life': 'Her husband Raghav passed away in 2019. Her sister Kamalamma lives nearby. Visits on Sundays.', 'diagnosis.by': 'Dr Rao, Apollo hospital', 'story.loves': ['Kannada songs', 'tea'] };
  const found = namesInFreeText(B);
  assert.ok(found.includes('Raghav') && found.includes('Kamalamma') && found.includes('Apollo'));
  assert.ok(!found.includes('Kannada') && !found.includes('Sundays') && !found.includes('Her'), 'languages, days and ordinary capitals are left alone');
  const built = buildMessages(B);
  for (const n of ['Raghav', 'Kamalamma', 'Apollo', 'Lakshmi', 'Mysuru', 'Meera', 'Rao']) assert.ok(!built.outbound.includes(n), `${n} is not sent`);
  assert.ok(built.outbound.includes('Kannada'), 'a language is not a name');
  const out = await generatePortfolio(B, { callModel: async (m) => JSON.stringify({ headline: 'x', about_me: '', about_from: [], sections: [{ id: 'who', items: [{ text: 'Her husband ' + (m[1].content.match(/husband (PERSON_\d+)/)?.[1] || 'PERSON_X') + ' died in 2019.', from: ['story.life'] }] }] }) });
  assert.match(JSON.stringify(out.content), /Her husband Raghav died in 2019/, 'the real name is restored');
});
