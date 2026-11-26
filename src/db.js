import pg from 'pg';

// Normal use: a PostgreSQL pool. DB_DRIVER=pglite (tests only) runs an in-memory Postgres, so the access rules can be
// tested without any server. The adapter mimics the small part of the pg API that this app uses.
let impl;
if (process.env.DB_DRIVER === 'pglite') {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite({ parsers: { 20: (v) => v } }); // keep bigint as text, like pg
  const query = async (text, params) => {
    if (params && params.length) return db.query(text, params);
    const out = await db.exec(text);
    return out[out.length - 1] ?? { rows: [] };
  };
  impl = { query, connect: async () => ({ query, release() {} }), end: () => db.close() };
} else {
  impl = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
}

export const pool = impl;
export const q = (text, params) => impl.query(text, params);
