// Leak test: run questions through the Gate in dry-run mode and assert that no known identifier
// (contact names, place labels, dates) appears in the text that would be sent to the cloud model.
import 'dotenv/config';
import { pool, q } from '../src/db.js';
import { answerQuestion } from '../src/ask.js';

const patient = (await q("SELECT id FROM patients WHERE name LIKE 'Demo Patient%' ORDER BY id DESC LIMIT 1")).rows[0];
if (!patient) { console.error('No synthetic patient. Run: npm run seed'); process.exit(2); }

const contacts = (await q('SELECT name FROM contacts WHERE patient_id=$1', [patient.id])).rows;
const places = (await q('SELECT label FROM places WHERE patient_id=$1', [patient.id])).rows;
const secrets = new Set();
for (const c of contacts) { secrets.add(c.name); c.name.split(/\s+/).filter((p) => p.length > 2 && !/^(dr|mr|mrs|ms)\.?$/i.test(p)).forEach((p) => secrets.add(p)); }
places.forEach((p) => secrets.add(p.label));

const questions = [
  'When did Anita last visit and what did we talk about?',
  'What did Dr. Meera Iyer say about my tablet?',
  'Did Ravi come over to talk about cricket?',
  'Did I go to City Pharmacy?',
  'Did I walk in Lakeview Park?',
  'Where did I leave home at night?',
];

let leaks = 0;
for (const question of questions) {
  const r = await answerQuestion({ patientId: patient.id, question, dryRun: true });
  if (!r.outbound) { console.log(`- no match (nothing sent): ${question}`); continue; }
  const found = [...secrets].filter((s) => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(r.outbound));
  const dates = r.outbound.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  if (found.length || dates.length) { leaks++; console.log(`LEAK in "${question}": ${[...found, ...dates].join(', ')}`); }
  else console.log(`ok (${r.receipt.chunks} chunks, ${r.receipt.masked} masked): ${question}`);
}
console.log(leaks ? `\nFAILED: ${leaks} question(s) leaked identifiers` : '\nPASSED: zero planted identifiers in outbound text');
await pool.end();
process.exit(leaks ? 1 : 0);
