import { createDb, eq, platformStaff, user } from '@edusync/db';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

/**
 * Membuat akun staf platform (admin) tanpa data demo, untuk server baru.
 * Pakai: STAFF_PASSWORD='kata-sandi-panjang' pnpm --filter @edusync/api create:staff email@contoh.id "Nama Staf"
 * Kata sandi lewat variabel lingkungan agar tidak tercatat di riwayat perintah; minimal 12 karakter.
 */
const [email, name] = process.argv.slice(2);
const password = process.env.STAFF_PASSWORD;
if (!email || !name)
  throw new Error('Pemakaian: create:staff <email> "<nama>" (kata sandi di STAFF_PASSWORD)');
if (!password || password.length < 12) throw new Error('STAFF_PASSWORD wajib diisi, minimal 12 karakter');

const env = loadEnv();
const app = await buildApp(env);
await app.ready();
const { db, pool } = createDb(env.DATABASE_PLATFORM_URL);

const address = email.trim().toLowerCase();
const [existing] = await db.select().from(user).where(eq(user.email, address));
const userId =
  existing?.id ?? (await app.auth.api.signUpEmail({ body: { name, email: address, password } })).user.id;
await db.insert(platformStaff).values({ userId, role: 'admin' }).onConflictDoNothing();

console.log(`Staf platform siap: ${address}${existing ? ' (akun sudah ada, kata sandi tidak diubah)' : ''}`);
await pool.end();
await app.close();
