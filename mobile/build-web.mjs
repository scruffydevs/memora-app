// Builds the Memora screens for the Android app into web/dist-app.
// This is a separate build from the website: it calls the server across origins and signs in with a bearer token.
//   MEMORA_API   the server the app talks to (default: the deployed site)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const api = (process.env.MEMORA_API || 'https://memora-app.deploygrid.net').replace(/\/+$/, '');
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: web, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

console.log(`Building the app screens for ${api}`);
run('npm', ['install', '--no-audit', '--no-fund']);
run('npx', ['vite', 'build', '--outDir', 'dist-app', '--emptyOutDir'], { VITE_APP_MODE: '1', VITE_API_URL: api });
