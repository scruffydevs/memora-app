// The Gate (rules version). Masks names, places, dates and contact details before any text leaves the vault.
// A small model can be added later for what rules miss. Tier 0 data is never passed in at all (see ask.js).
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TITLES = /^(dr|mr|mrs|ms|prof)\.?$/i;
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*';
const DATE_RE = new RegExp(
  [
    '\\b\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2})?(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)?\\b',
    '\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b',
    `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s+\\d{4})?\\b`,
    `\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`,
  ].join('|'),
  'gi',
);
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /\+?\d[\d\s-]{8,}\d/g;

export function createGate({ contacts = [], places = [] } = {}) {
  const termToPh = new Map(); // lower-case term -> placeholder
  const reverse = new Map(); // placeholder -> text to restore
  const seen = new Map(); // placeholder -> first surface form seen
  let masked = 0;
  let dateN = 0;
  let contactN = 0;
  const dateMap = new Map();
  const detailMap = new Map();

  contacts.forEach((c, i) => {
    const ph = `PERSON_${i + 1}`;
    reverse.set(ph, c.name);
    termToPh.set(c.name.trim().toLowerCase(), ph);
    c.name.split(/\s+/).forEach((part) => {
      if (part.length > 2 && !TITLES.test(part)) termToPh.set(part.toLowerCase(), ph);
    });
  });
  places.forEach((p, i) => {
    const ph = `PLACE_${i + 1}`;
    reverse.set(ph, p.label);
    termToPh.set(p.label.trim().toLowerCase(), ph);
  });

  const alts = [...termToPh.keys()].sort((a, b) => b.length - a.length).map(esc);
  const nameRe = alts.length ? new RegExp(`\\b(${alts.join('|')})\\b`, 'gi') : null;

  function mask(text) {
    let out = String(text);
    if (nameRe) {
      out = out.replace(nameRe, (m) => {
        const ph = termToPh.get(m.toLowerCase());
        if (!seen.has(ph)) seen.set(ph, m);
        masked++;
        return ph;
      });
    }
    out = out.replace(DATE_RE, (m) => {
      const k = m.toLowerCase();
      if (!dateMap.has(k)) { const ph = `DATE_${++dateN}`; dateMap.set(k, ph); reverse.set(ph, m); }
      masked++;
      return dateMap.get(k);
    });
    const detail = (m) => {
      const k = m.toLowerCase();
      if (!detailMap.has(k)) { const ph = `CONTACT_${++contactN}`; detailMap.set(k, ph); reverse.set(ph, m); }
      masked++;
      return detailMap.get(k);
    };
    out = out.replace(EMAIL_RE, detail).replace(PHONE_RE, detail);
    return out;
  }

  // Restore real values inside the vault. Prefer the form the person actually used (e.g. first name only).
  function unmask(text) {
    return String(text).replace(/\b(PERSON|PLACE|DATE|CONTACT)_\d+\b/g, (m) => seen.get(m) ?? reverse.get(m) ?? m);
  }

  return { mask, unmask, maskedCount: () => masked };
}
