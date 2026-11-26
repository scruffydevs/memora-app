import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { q, pool } from './db.js';
import { runMigrations } from './migrate.js';
import { wrap } from './util.js';
import core from './routes/core.js';
import caregiver from './routes/caregiver.js';

const app = express();
const origins = (process.env.WEB_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '3mb' })); // photos arrive as small base64 images

app.get('/health', wrap(async (_req, res) => { await q('SELECT 1'); res.json({ ok: true }); }));

// Optional shared access token, so a public demo URL does not expose data. Set ACCESS_TOKEN where you deploy.
app.use('/api', (req, res, next) => {
  const t = process.env.ACCESS_TOKEN;
  if (t && req.get('x-access-token') !== t) return res.status(401).json({ error: 'unauthorized' });
  next();
});
app.use('/api', core);
app.use('/api', caregiver);

// If the web app has been built (web/dist), serve it from the same URL. One deploy, one app slot.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/|health).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 3000;
runMigrations()
  .then(() => app.listen(port, () => console.log(`memora listening on ${port}`)))
  .catch((e) => { console.error('startup failed', e); pool.end().finally(() => process.exit(1)); });
