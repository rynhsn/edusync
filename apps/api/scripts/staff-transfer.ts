import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { account, and, createDb, eq, platformStaff, user } from '@edusync/db';

/**
 * Memindahkan akun staf platform dari database lokal ke server baru TANPA kata sandi di variabel lingkungan:
 * yang dipindah hanya hash kata sandi (scrypt, tidak bergantung pada AUTH_SECRET), lalu login memakai kata
 * sandi yang sama seperti di lokal.
 *
 *   Lokal : pnpm --filter @edusync/api staff:export admin@edusync.dev berkas.json
 *   Server: pnpm --filter @edusync/api staff:import hi.edusync@gmail.com berkas.json
 *
 * Berkas berisi hash kata sandi: jangan di-commit (sudah masuk .gitignore), hapus setelah dipakai.
 */
const [mode, email, file] = process.argv.slice(2);
if ((mode !== 'export' && mode !== 'import') || !email || !file) {
  throw new Error('Pemakaian: staff-transfer <export|import> <email> <berkas.json>');
}

const url = process.env.DATABASE_PLATFORM_URL;
if (!url) throw new Error('DATABASE_PLATFORM_URL belum diatur');
const { db, pool } = createDb(url);
const address = email.trim().toLowerCase();

if (mode === 'export') {
  const [row] = await db
    .select({ name: user.name, hash: account.password })
    .from(user)
    .innerJoin(platformStaff, eq(platformStaff.userId, user.id))
    .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, 'credential')))
    .where(eq(user.email, address));
  if (!row?.hash) throw new Error(`Staf platform dengan akun kata sandi untuk ${address} tidak ditemukan`);
  writeFileSync(file, JSON.stringify({ name: row.name, passwordHash: row.hash }), { mode: 0o600 });
  console.log(`Ditulis ke ${file}. Jaga berkas ini; hapus setelah diimpor.`);
} else {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { name?: string; passwordHash?: string };
  if (!data.name || !data.passwordHash) throw new Error('Isi berkas tidak dikenal');
  const [existing] = await db.select().from(user).where(eq(user.email, address));
  if (existing) {
    await db.insert(platformStaff).values({ userId: existing.id, role: 'admin' }).onConflictDoNothing();
    console.log(`Akun ${address} sudah ada; dijadikan staf admin, kata sandi tidak diubah.`);
  } else {
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id, name: data.name as string, email: address, emailVerified: true });
      await tx.insert(account).values({
        id: randomUUID(),
        userId: id,
        accountId: id,
        providerId: 'credential',
        password: data.passwordHash as string,
      });
      await tx.insert(platformStaff).values({ userId: id, role: 'admin' });
    });
    console.log(`Staf platform admin dibuat: ${address}`);
  }
}
await pool.end();
