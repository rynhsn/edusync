import { createDb, school, sql, withTenant } from '@edusync/db';
import { verifyFinalReports } from '../src/grading-verify-lib';

/**
 * Verifikasi BACA-SAJA konfigurasi nilai terhadap rapor final yang sudah terbit.
 *
 *   pnpm --filter @edusync/api verify:grading-config
 *
 * Untuk tiap sekolah dan kelas yang rapornya final: hitung ulang dengan konfigurasi HIDUP hari ini dan bandingkan `final`,
 * `predicate`, dan `kkm` dengan snapshot. Selisih berarti finalisasi ulang (buka kembali lalu finalkan) akan mengubah angka
 * terbit. Daftar sekolah dibaca lewat DATABASE_PLATFORM_URL; hitungan berjalan lewat DATABASE_URL (peran aplikasi, tunduk RLS)
 * dalam transaksi `READ ONLY`, jadi skrip ini tidak dapat menulis apa pun. Kode keluar 0 walau ada selisih.
 */
const appUrl = process.env.DATABASE_URL;
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!appUrl || !platformUrl) throw new Error('DATABASE_URL dan DATABASE_PLATFORM_URL wajib diisi');
const app = createDb(appUrl);
const platform = createDb(platformUrl);

let schoolsWithFinal = 0;
let classesChecked = 0;
let classesChanged = 0;
try {
  const schools = await platform.db.select({ id: school.id, name: school.name }).from(school);
  if (schools.length === 0) console.warn('Tidak ada sekolah terbaca.');
  for (const s of schools) {
    const classes = await withTenant(app.db, [s.id], async (tx) => {
      await tx.execute(sql`set transaction read only`);
      return verifyFinalReports(tx);
    });
    if (classes.length === 0) continue;
    schoolsWithFinal++;
    console.log(`\n${s.name} (${s.id})`);
    for (const c of classes) {
      classesChecked++;
      const state = c.diffs.length === 0 ? 'sama' : `BERBEDA (${c.changedStudents} dari ${c.students} siswa)`;
      if (c.diffs.length > 0) classesChanged++;
      console.log(
        `  ${c.semesterName} / ${c.className}: ${c.students} rapor final, hitung ulang hari ini: ${state}`,
      );
      for (const d of c.diffs.slice(0, 20)) {
        console.log(
          `    siswa ${d.studentId} mapel ${d.subjectId} ${d.field}: terbit ${d.report} -> hari ini ${d.today}`,
        );
      }
      if (c.diffs.length > 20) console.log(`    ... ${c.diffs.length - 20} selisih lain`);
    }
  }
  console.log(
    `\nRingkasan: ${schoolsWithFinal} sekolah punya rapor final, ${classesChecked} kelas diperiksa, ${classesChanged} kelas akan berubah bila difinalkan ulang.`,
  );
} finally {
  await app.pool.end();
  await platform.pool.end();
}
