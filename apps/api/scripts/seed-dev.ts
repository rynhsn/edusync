import { assignRoles, createDb, eq, foundation, member, school, seedSchoolRoles, user } from '@edusync/db';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

/**
 * Data contoh untuk pengembangan lokal: satu yayasan, dua unit, dua akun.
 * Idempoten. Menolak berjalan di luar development.
 */
const env = loadEnv();
if (env.NODE_ENV !== 'development') throw new Error('seed-dev hanya untuk NODE_ENV=development');
const password = process.env.DEV_SEED_PASSWORD;
if (!password || password.length < 12) throw new Error('DEV_SEED_PASSWORD wajib diisi, minimal 12 karakter');

const app = await buildApp(env);
await app.ready();
const { db, pool } = createDb(env.DATABASE_PLATFORM_URL);

async function ensureFoundation(slug: string, name: string) {
  const [row] = await db.insert(foundation).values({ slug, name }).onConflictDoNothing().returning();
  return row ?? (await db.select().from(foundation).where(eq(foundation.slug, slug)))[0]!;
}

async function ensureSchool(foundationId: string, slug: string, name: string) {
  const [row] = await db
    .insert(school)
    .values({ foundationId, slug, name })
    .onConflictDoNothing()
    .returning();
  const s = row ?? (await db.select().from(school).where(eq(school.slug, slug)))[0]!;
  await seedSchoolRoles(db, s.id);
  return s;
}

async function ensureUser(email: string, name: string) {
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) return existing.id;
  const res = await app.auth.api.signUpEmail({ body: { name, email, password: password as string } });
  return res.user.id;
}

async function ensureMember(userId: string, schoolId: string, roles: string[]) {
  const [row] = await db.insert(member).values({ userId, schoolId }).onConflictDoNothing().returning();
  const m = row ?? (await db.select().from(member).where(eq(member.userId, userId)))[0]!;
  await assignRoles(db, m.id, schoolId, roles);
}

const yayasan = await ensureFoundation('miftahul-huda', 'Yayasan Miftahul Huda');
const smp = await ensureSchool(yayasan.id, 'smpit-miftahul-huda', 'SMP IT Miftahul Huda');
const smk = await ensureSchool(yayasan.id, 'smk-miftahul-huda', 'SMK Miftahul Huda');

const admin = await ensureUser('admin@edusync.test', 'Admin Yayasan');
await ensureMember(admin, smp.id, ['school_admin']);
await ensureMember(admin, smk.id, ['school_admin']);

const guru = await ensureUser('guru@edusync.test', 'Guru Contoh');
await ensureMember(guru, smp.id, ['teacher', 'operator']);
await ensureMember(guru, smk.id, ['teacher']);

console.log('Seed selesai: admin@edusync.test dan guru@edusync.test (kata sandi dari DEV_SEED_PASSWORD)');
await pool.end();
await app.close();
