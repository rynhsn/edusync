import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { seedCatalog } from './catalog';
import { createDb } from './client';
import { backfillSemesterGradingConfigs } from './grading-backfill';
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
  if (added > 0) console.log(`Izin peran bawaan dilengkapi: ${added}`);
  // Konfigurasi nilai beku untuk semester lama (tabel ber-RLS, jadi tidak bisa di SQL migrasi). Gagal KERAS bila koneksi
  // ternyata tunduk RLS; idempoten (tidak menimpa salinan yang ada). Pool baru ditutup SESUDAH backfill.
  let frozen: Awaited<ReturnType<typeof backfillSemesterGradingConfigs>>;
  try {
    frozen = await backfillSemesterGradingConfigs(platform.db);
  } finally {
    await platform.pool.end();
  }
  console.log(
    `Backfill konfigurasi nilai beku: ${frozen.created} dibuat (rapor final ${frozen.byReason.final}, lewat dan bernilai ${frozen.byReason.pastGraded}), ${frozen.alreadyFrozen} sudah ada, ${frozen.schools} sekolah`,
  );
} else {
  console.warn(
    'PERINGATAN: DATABASE_PLATFORM_URL kosong, sehingga sinkron izin peran dan backfill konfigurasi nilai beku DILEWATI. ' +
      'Jalankan `pnpm --filter @edusync/db backfill:grading-config` dengan koneksi BYPASSRLS sebelum memakai rilis ini.',
  );
}
console.log('Migrasi selesai');
