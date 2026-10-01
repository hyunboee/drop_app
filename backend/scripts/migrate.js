import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { withTransaction } from '../src/db.js';

export async function migrate(pool, dir = join(import.meta.dirname, '../db/migrations')) {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));
  const pending = (await readdir(dir)).filter((f) => f.endsWith('.sql') && !applied.has(f)).sort();

  for (const name of pending) {
    const sql = await readFile(join(dir, name), 'utf8');
    await withTransaction(pool, async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [name]);
    });
  }
  return pending;
}

if (import.meta.main) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const applied = await migrate(pool, process.argv[2]);
    console.log(`applied: ${applied.join(', ') || '(none)'}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
