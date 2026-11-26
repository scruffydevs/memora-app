import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { q } from './db.js';
import { wrap } from './util.js';
import { loadUser, requireUser, requireAdmin, canAccess } from './auth.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import core from './routes/core.js';
import caregiver from './routes/caregiver.js';
import arena from './routes/arena.js';

// Every patient-scoped request is checked here, before any route runs:
// a caregiver only reaches patients they are actively connected to. Admins (the Memora team) reach all.
const guardPatient = (getId) => async (req, res, next) => {
  try {
    const id = Number(getId(req));
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'patient_id_required' });
    if (!(await canAccess(req.user, id))) return res.status(403).json({ error: 'forbidden' });
    next();
  } catch (e) { next(e); }
};

// Routes addressed by a record id (/contacts/5, /logs/9 ...): find the record's patient, then check access.
const RESOURCES = { contacts: 'contacts', logs: 'care_logs', photos: 'photos', observations: 'observations', medicines: 'medicines' };
const guardResource = (table) => async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'bad_id' });
    const row = (await q(`SELECT patient_id FROM ${table} WHERE id=$1`, [id])).rows[0];
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (!(await canAccess(req.user, row.patient_id))) return res.status(403).json({ error: 'forbidden' });
    next();
  } catch (e) { next(e); }
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind the platform's HTTPS proxy

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    });
    next();
  });

  // Same-origin by default (the API serves the web app). Only allow another origin if WEB_ORIGIN is set.
  const origins = (process.env.WEB_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '3mb' })); // photos arrive as small base64 images

  app.get('/health', wrap(async (_req, res) => { await q('SELECT 1'); res.json({ ok: true }); }));

  const api = express.Router();
  api.use(loadUser);
  api.use('/auth', authRoutes);
  api.use(requireUser);
  api.use('/admin', requireAdmin, adminRoutes);

  api.use('/patients/:id', guardPatient((req) => req.params.id));
  api.use(['/entries', '/receipts'], guardPatient((req) => req.query.patientId ?? req.body?.patientId));
  api.use('/ask', guardPatient((req) => req.body?.patientId));
  for (const [seg, table] of Object.entries(RESOURCES)) api.use(`/${seg}/:id`, guardResource(table));

  api.use(core);
  api.use(caregiver);
  api.use(arena);
  api.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);

  // If the web app has been built (web/dist), serve it from the same URL. One deploy, one app slot.
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/|health).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });
  return app;
}
