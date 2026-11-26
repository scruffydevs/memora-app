import 'dotenv/config';
import { pool } from './db.js';
import { runMigrations } from './migrate.js';
import { bootstrapAdmin } from './bootstrap.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
runMigrations()
  .then(bootstrapAdmin)
  .then(() => createApp().listen(port, () => console.log(`memora listening on ${port}`)))
  .catch((e) => { console.error('startup failed', e); pool.end().finally(() => process.exit(1)); });
