// Patient onboarding: the card sequence the Memora team walks through with the person and their family.
// One topic per card, plain words, every question can be skipped. Questions marked `key` are the important ones:
// the review step lists any that are still unanswered, and the portfolio asks for them as "still to find out".
//
// The topics follow what dementia care guidance asks for when a person's care is planned: who they are and how they like
// to be spoken to (the Alzheimer's Society "This is me" idea), the diagnosis and stage as told by their doctor, what has
// changed in memory and thinking, everyday abilities, health and medicines, mood, sleep and behaviour, safety, routine,
// the support around them, and who decides when they cannot. Memora records what the family tells us. It never diagnoses.
//
// This file is shared by the server (validation, facts for the portfolio) and the web app (the cards).

const LEVELS = ['On their own', 'Needs reminding', 'Needs help', 'Cannot do'];

export const CARDS = [
  {
    id: 'about', title: 'About them', intro: 'Start with the basics.',
    fields: [
      { key: 'name', label: 'Full name', type: 'text', key_question: true },
      { key: 'preferred', label: 'What do they like to be called?', type: 'text' },
      { key: 'age', label: 'Age', type: 'number', min: 30, max: 120, key_question: true },
      { key: 'pronouns', label: 'How should we refer to them?', type: 'choice', options: ['She / her', 'He / him', 'They / them', 'Prefer not to say'] },
      { key: 'area', label: 'Where do they live? (town or area)', type: 'text' },
      { key: 'lives_with', label: 'Who do they live with?', type: 'choice', options: ['Alone', 'Spouse or partner', 'Family', 'In a care home', 'Someone else'] },
    ],
  },
  {
    id: 'photo', title: 'Profile photo', intro: 'A photo helps carers and the app feel familiar. It is optional, stored encrypted, and only with their agreement.',
    fields: [
      { key: 'consent', label: 'They agree to a profile photo', type: 'toggle', help: 'Switching this off later deletes the photo.' },
    ],
  },
  {
    id: 'language', title: 'Language and communication', intro: 'How to talk with them so they feel understood.',
    fields: [
      { key: 'languages', label: 'Which languages do they speak?', type: 'tags', key_question: true },
      { key: 'comfortable', label: 'Which language is most comfortable for them?', type: 'text', key_question: true },
      { key: 'reading', label: 'Reading', type: 'choice', options: ['Reads easily', 'Reads with difficulty', 'Cannot read'] },
      { key: 'hearing', label: 'Hearing', type: 'choice', options: ['No difficulty', 'Uses a hearing aid', 'Has difficulty hearing'] },
      { key: 'vision', label: 'Eyesight', type: 'choice', options: ['No difficulty', 'Wears glasses', 'Has difficulty seeing'] },
      { key: 'speech', label: 'Speech', type: 'choice', options: ['Clear', 'Sometimes searches for words', 'Hard to understand'] },
      { key: 'style', label: 'How do they like to be spoken to?', type: 'longtext', help: 'For example: short sentences, a calm voice, their name first.' },
    ],
  },
  {
    id: 'story', title: 'Their story', intro: 'Who they are matters as much as what they have. This is what makes the assistant feel like theirs.',
    fields: [
      { key: 'work', label: 'What work did they do?', type: 'text' },
      { key: 'loves', label: 'What do they love? (music, food, hobbies, places)', type: 'tags' },
      { key: 'dislikes', label: 'What do they dislike?', type: 'tags' },
      { key: 'faith', label: 'Faith, customs or traditions that matter to them', type: 'text' },
      { key: 'life', label: 'Important people, places or events in their life', type: 'longtext' },
    ],
  },
  {
    id: 'diagnosis', title: 'Diagnosis', intro: 'What the doctor has told the family. Memora records it as told and does not judge it.',
    fields: [
      { key: 'status', label: 'Do they have a diagnosis?', type: 'choice', options: ['Yes, diagnosed', 'Being assessed', 'No diagnosis', 'Not sure'], key_question: true },
      { key: 'type', label: 'What type were they told?', type: 'choice', options: ["Alzheimer's disease", 'Vascular dementia', 'Mixed dementia', 'Lewy body dementia', 'Frontotemporal dementia', "Parkinson's disease dementia", 'Mild cognitive impairment', 'Something else', 'Not told'], key_question: true },
      { key: 'noticed', label: 'When did the family first notice changes?', type: 'month', key_question: true },
      { key: 'diagnosed', label: 'When were they diagnosed?', type: 'month', key_question: true },
      { key: 'by', label: 'Who diagnosed them? (doctor or hospital)', type: 'text' },
      { key: 'stage', label: 'What stage did the doctor say?', type: 'choice', options: ['Early or mild', 'Middle or moderate', 'Late or severe', 'Not told', 'Not sure'], key_question: true },
      { key: 'tests', label: 'Any test results or scores?', type: 'longtext', help: 'For example MMSE, MoCA or FAST, with the date, if the family has them.' },
      { key: 'doctor', label: 'Doctor looking after them now', type: 'text' },
      { key: 'clinic', label: 'Clinic or hospital', type: 'text' },
    ],
  },
  {
    id: 'thinking', title: 'Memory and thinking', intro: 'What the family sees day to day.',
    fields: [
      { key: 'difficulties', label: 'Which of these happen?', type: 'multi', key_question: true, options: ['Forgets recent events', 'Repeats questions', 'Loses things', 'Gets lost in familiar places', 'Confused about the time or day', 'Trouble finding words', 'Trouble with money', 'Trouble following conversations', 'Does not recognise familiar people'] },
      { key: 'recognises', label: 'Do they recognise close family?', type: 'choice', options: ['Always', 'Sometimes', 'Often not'], key_question: true },
      { key: 'worse', label: 'When did things get noticeably worse, and what changed?', type: 'longtext' },
    ],
  },
  {
    id: 'daily', title: 'Daily living', intro: 'How much help they need with everyday things.',
    fields: [
      { key: 'eating', label: 'Eating and drinking', type: 'scale', options: LEVELS },
      { key: 'dressing', label: 'Dressing', type: 'scale', options: LEVELS },
      { key: 'washing', label: 'Washing and bathing', type: 'scale', options: LEVELS },
      { key: 'toilet', label: 'Using the toilet', type: 'scale', options: LEVELS },
      { key: 'walking', label: 'Walking and moving around', type: 'scale', options: LEVELS },
      { key: 'medicines', label: 'Taking their medicines', type: 'scale', options: LEVELS, key_question: true },
      { key: 'cooking', label: 'Cooking', type: 'scale', options: LEVELS },
      { key: 'shopping', label: 'Shopping', type: 'scale', options: LEVELS },
      { key: 'phone', label: 'Using the phone', type: 'scale', options: LEVELS },
      { key: 'money', label: 'Handling money and bills', type: 'scale', options: LEVELS, key_question: true },
    ],
  },
  {
    id: 'health', title: 'Health and medicines', intro: 'Other health matters that affect care.',
    fields: [
      { key: 'conditions', label: 'Other health conditions', type: 'multi', options: ['Diabetes', 'High blood pressure', 'Heart disease', 'Stroke', 'Depression or anxiety', 'Epilepsy', 'Thyroid', 'Arthritis or pain'] },
      { key: 'other', label: 'Anything else?', type: 'text' },
      { key: 'allergies', label: 'Allergies', type: 'text', key_question: true, help: 'Write "none known" if there are none.' },
      { key: 'medicines', label: 'Current medicines (names and times, if known)', type: 'longtext', key_question: true },
      { key: 'swallowing', label: 'Swallowing', type: 'choice', options: ['No problem', 'Sometimes coughs when eating', 'Has difficulty'] },
      { key: 'falls', label: 'Falls in the last year', type: 'choice', options: ['None', 'Once', 'More than once'] },
      { key: 'hospital', label: 'Hospital stays in the last year', type: 'text' },
    ],
  },
  {
    id: 'mood', title: 'Mood, sleep and behaviour', intro: 'What the family has noticed, and what helps.',
    fields: [
      { key: 'sleep', label: 'Sleep', type: 'choice', options: ['Sleeps well', 'Wakes in the night', 'Awake at night, asleep by day'] },
      { key: 'evenings', label: 'Evenings', type: 'choice', options: ['Calm', 'Restless or confused in the evening', 'It varies'], key_question: true },
      { key: 'seen', label: 'Which of these have you seen?', type: 'multi', options: ['Agitation', 'Anxiety', 'Low mood', 'Seeing or hearing things', 'Suspicion of others', 'Wandering', 'Aggression', 'Repeating actions', 'Calling out'] },
      { key: 'triggers', label: 'What usually sets it off?', type: 'tags', key_question: true },
      { key: 'calming', label: 'What helps them settle?', type: 'tags', key_question: true },
    ],
  },
  {
    id: 'safety', title: 'Safety', intro: 'So the people around them can keep them safe.',
    fields: [
      { key: 'lost', label: 'Have they gone missing or got lost?', type: 'choice', options: ['Never', 'Once', 'More than once'], key_question: true },
      { key: 'alone', label: 'Can they be left alone?', type: 'choice', options: ['For long periods', 'For a short while', 'Not safely'] },
      { key: 'stove', label: 'Using the stove or gas', type: 'choice', options: ['Safe', 'Needs watching', 'Not safe', 'Does not apply'] },
      { key: 'driving', label: 'Driving', type: 'choice', options: ['Never drove', 'Has stopped', 'Still drives'] },
      { key: 'concerns', label: 'Other safety worries at home', type: 'longtext' },
    ],
  },
  {
    id: 'routine', title: 'Daily routine', intro: 'The shape of an ordinary day.',
    fields: [
      { key: 'wake', label: 'Usual wake-up time', type: 'text' },
      { key: 'bed', label: 'Usual bedtime', type: 'text' },
      { key: 'meals', label: 'Mealtimes', type: 'text' },
      { key: 'best', label: 'Best and hardest times of day', type: 'text' },
      { key: 'day', label: 'What does a usual day look like?', type: 'longtext' },
    ],
  },
  {
    id: 'support', title: 'People and support', intro: 'Who looks after them, and who decides when they cannot.',
    fields: [
      { key: 'carer', label: 'Main carer', type: 'text', key_question: true },
      { key: 'carer_relation', label: 'Their relationship to the person', type: 'text' },
      { key: 'emergency_name', label: 'Who to call in an emergency', type: 'text', key_question: true },
      { key: 'emergency_phone', label: 'Their phone number', type: 'text', key_question: true },
      { key: 'coping', label: 'How is the main carer coping?', type: 'choice', options: ['Coping well', 'Stretched', 'Struggling'] },
      { key: 'decision_maker', label: 'Is someone named to make decisions if they cannot? (power of attorney)', type: 'choice', options: ['Yes', 'No', 'Not sure'], key_question: true },
      { key: 'wishes', label: 'Are their wishes for the future written down?', type: 'choice', options: ['Yes', 'No', 'Not sure'] },
    ],
  },
  {
    id: 'consent', title: 'Sharing and consent', intro: 'What the family agrees to. Each can be changed at any time.',
    fields: [
      { key: 'caregiver_view', label: 'Connected carers can read their patient file and portfolio', type: 'toggle', default: true },
      { key: 'wearables', label: 'Allow watch and phone health data (sleep, steps, heart rate)', type: 'toggle', help: 'Switching this off later deletes that data.' },
    ],
  },
  {
    id: 'more', title: 'Anything else', intro: 'The last things only the family would know.',
    fields: [
      { key: 'must_know', label: 'The one thing everyone should know about them', type: 'longtext', key_question: true },
      { key: 'other', label: 'Anything we did not ask', type: 'longtext' },
    ],
  },
];

export const fieldKey = (card, field) => `${card.id}.${field.key}`;
export const ALL_FIELDS = CARDS.flatMap((c) => c.fields.map((f) => ({ card: c, field: f, key: fieldKey(c, f) })));
export const FIELD_BY_KEY = Object.fromEntries(ALL_FIELDS.map((x) => [x.key, x]));
export const KEY_QUESTIONS = ALL_FIELDS.filter((x) => x.field.key_question).map((x) => x.key);
export const labelFor = (key) => { const x = FIELD_BY_KEY[key]; return x ? `${x.card.title}: ${x.field.label}` : key; };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthText = (v) => { const m = /^(\d{4})-(\d{2})$/.exec(v || ''); return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''; };

export const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

// Clean one answer for storage. Anything that does not fit the question is dropped (returns undefined).
export function cleanAnswer(field, v) {
  if (isEmpty(v)) return undefined;
  switch (field.type) {
    case 'text': return String(v).trim().slice(0, 300) || undefined;
    case 'longtext': return String(v).trim().slice(0, 3000) || undefined;
    case 'number': { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= field.min && n <= field.max ? n : undefined; }
    case 'choice': return field.options.includes(v) ? v : undefined;
    case 'scale': return field.options.includes(v) ? v : undefined;
    case 'multi': { const out = (Array.isArray(v) ? v : []).filter((x) => field.options.includes(x)); return out.length ? [...new Set(out)] : undefined; }
    case 'tags': { const out = (Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 30); return out.length ? out : undefined; }
    case 'month': return monthText(String(v)) ? String(v) : undefined;
    case 'toggle': return typeof v === 'boolean' ? v : undefined;
    default: return undefined;
  }
}

// An answer as plain words.
export function valueText(field, v) {
  if (isEmpty(v)) return '';
  if (field.type === 'month') return monthText(v);
  if (field.type === 'toggle') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// What the portfolio is built from: one fact per answered question, each with a key the portfolio must cite.
export function factsFromAnswers(answers) {
  return ALL_FIELDS.flatMap(({ card, field, key }) => {
    const v = answers[key];
    if (isEmpty(v) || field.type === 'toggle') return [];
    return [{ key, label: `${card.title} - ${field.label}`, text: valueText(field, v) }];
  });
}

export const missingKeyQuestions = (answers) => KEY_QUESTIONS.filter((k) => isEmpty(answers[k]));
export const progress = (answers) => {
  const total = ALL_FIELDS.filter((x) => x.field.type !== 'toggle').length;
  const done = ALL_FIELDS.filter((x) => x.field.type !== 'toggle' && !isEmpty(answers[x.key])).length;
  return { done, total };
};
