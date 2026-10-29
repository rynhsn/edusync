import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL wajib diisi untuk migrasi');

const { db, pool } = createDb(url);
await migrate(db, {
  migrationsFolder: new URL('../drizzle', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});
await pool.end();
console.log('Migrasi selesai');
