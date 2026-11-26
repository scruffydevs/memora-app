export const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  });

// Clean a list of short strings (traits, likes, triggers...).
export const toList = (v, max = 30) =>
  Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, 120)) : [];

export const str = (v, max = 2000) => (v == null ? null : String(v).trim().slice(0, max) || null);

export const BEHAVIOUR_CATEGORIES = ['sleep', 'mood', 'agitation', 'wandering', 'eating', 'confusion', 'repeated_question', 'social', 'other'];
export const LOG_KINDS = ['behaviour', 'medicine', 'meal', 'visit', 'incident', 'note'];
