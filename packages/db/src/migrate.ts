import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { seedCatalog } from './catalog';
import { createDb } from './client';
import { syncSystemRolePermissions } from './roles';

const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL wajib diisi untuk migrasi');

const { db, pool } = createDb(url);
await migrate(db, {
  migrationsFolder: new URL('../drizzle', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});
await seedCatalog(db);
await pool.end();

// Izin peran bawaan baru sampai ke sekolah yang sudah ada (lewat koneksi platform karena tabel `role` ber-RLS).
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (platformUrl) {
  const platform = createDb(platformUrl);
  const added = await syncSystemRolePermissions(platform.db);
  await platform.pool.end();
  if (added > 0) console.log(`Izin peran bawaan dilengkapi: ${added}`);
}
console.log('Migrasi selesai');
