import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { academicYear, createDb, foundation, school, withTenant } from './index';

const appUrl = process.env.DATABASE_URL;
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!appUrl || !platformUrl) throw new Error('DATABASE_URL dan DATABASE_PLATFORM_URL wajib diisi');

// Pool aplikasi dibatasi 1 koneksi agar kebocoran konteks antar-transaksi pasti terdeteksi.
const app = createDb(appUrl);
app.pool.options.max = 1;
const platform = createDb(platformUrl);

const run = Math.random().toString(36).slice(2, 8);
let foundationA = '';
let foundationB = '';
let schoolA1 = '';
let schoolA2 = '';
let schoolB = '';

async function makeSchool(foundationId: string, slug: string) {
  const [s] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `${slug}-${run}`, name: slug })
    .returning();
  await platform.db
    .insert(academicYear)
    .values({ schoolId: s!.id, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30' });
  return s!.id;
}

beforeAll(async () => {
  const [fa] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan A', slug: `ya-${run}` })
    .returning();
  const [fb] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan B', slug: `yb-${run}` })
    .returning();
  foundationA = fa!.id;
  foundationB = fb!.id;
  schoolA1 = await makeSchool(foundationA, 'smp-it');
  schoolA2 = await makeSchool(foundationA, 'smk');
  schoolB = await makeSchool(foundationB, 'sma-lain');
});

afterAll(async () => {
  for (const id of [schoolA1, schoolA2, schoolB]) {
    await platform.db.delete(academicYear).where(eq(academicYear.schoolId, id));
    await platform.db.delete(school).where(eq(school.id, id));
  }
  await platform.db.delete(foundation).where(eq(foundation.id, foundationA));
  await platform.db.delete(foundation).where(eq(foundation.id, foundationB));
  await app.pool.end();
  await platform.pool.end();
});

describe('isolasi tenant (RLS)', () => {
  it('peran aplikasi tidak boleh melewati RLS', async () => {
    const rows = await app.db.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
      sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`,
    );
    expect(rows.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('tanpa konteks tenant tidak ada baris yang terlihat', async () => {
    expect(await app.db.select().from(academicYear)).toHaveLength(0);
    expect(await app.db.select().from(school)).toHaveLength(0);
    expect(await app.db.select().from(foundation)).toHaveLength(0);
  });

  it('sekolah A hanya melihat datanya sendiri', async () => {
    const years = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(academicYear));
    expect(years.map((y) => y.schoolId)).toEqual([schoolA1]);
    const schools = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(school));
    expect(schools.map((s) => s.id)).toEqual([schoolA1]);
  });

  it('yayasan hanya terlihat dari unitnya sendiri', async () => {
    const f = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(foundation));
    expect(f.map((x) => x.id)).toEqual([foundationA]);
  });

  it('konteks beberapa unit dalam satu yayasan melihat semua unit itu, bukan yayasan lain', async () => {
    const years = await withTenant(app.db, [schoolA1, schoolA2], (tx) => tx.select().from(academicYear));
    expect(years.map((y) => y.schoolId).sort()).toEqual([schoolA1, schoolA2].sort());
    expect(years.some((y) => y.schoolId === schoolB)).toBe(false);
  });

  it('tidak bisa menulis data ke sekolah lain', async () => {
    await expect(
      withTenant(app.db, [schoolA1], (tx) =>
        tx
          .insert(academicYear)
          .values({ schoolId: schoolB, name: 'sisipan', startsOn: '2026-01-01', endsOn: '2026-12-31' }),
      ),
    ).rejects.toThrow();
  });

  it('tidak bisa mengubah atau menghapus data sekolah lain', async () => {
    const updated = await withTenant(app.db, [schoolA1], (tx) =>
      tx.update(academicYear).set({ name: 'diubah' }).where(eq(academicYear.schoolId, schoolB)).returning(),
    );
    expect(updated).toHaveLength(0);
    const deleted = await withTenant(app.db, [schoolA1], (tx) =>
      tx.delete(academicYear).where(eq(academicYear.schoolId, schoolB)).returning(),
    );
    expect(deleted).toHaveLength(0);
    const stillThere = await platform.db
      .select()
      .from(academicYear)
      .where(eq(academicYear.schoolId, schoolB));
    expect(stillThere[0]?.name).toBe('2026/2027');
  });

  it('konteks tidak bocor ke transaksi berikutnya pada koneksi yang sama', async () => {
    await withTenant(app.db, [schoolA1], (tx) => tx.select().from(academicYear));
    expect(await app.db.select().from(academicYear)).toHaveLength(0);
  });

  it('peran platform melihat semua tenant', async () => {
    const all = await platform.db.select().from(academicYear);
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});
