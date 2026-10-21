import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { platformDbPool } from './pool.js';

const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

async function migrate(): Promise<void> {
  await platformDbPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrations = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const client = await platformDbPool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [73190421]);
    for (const name of migrations) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (applied.rowCount) continue;

      const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.info(`Applied Platform migration: ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [73190421]);
    } finally {
      client.release();
    }
  }
}

migrate()
  .catch((error: unknown) => {
    console.error('Platform database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformDbPool.end();
  });
