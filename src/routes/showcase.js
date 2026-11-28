import { Router } from 'express';
import { wrap } from '../util.js';
import { recent, subscribe } from '../activity.js';

const r = Router(); // mounted behind requireAdmin: the backend showcase is for the Memora team

r.get('/activity', wrap(async (req, res) => res.json(recent(req.query.limit))));

// A live stream (Server-Sent Events) of what the backend is doing.
r.get('/stream', wrap(async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  subscribe(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => clearInterval(ping));
}));

export default r;
