import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  createDb,
  foundation,
  guardian,
  reportCardResponse,
  reportCardSection,
  reportSetting,
  reportSubjectNarrative,
  school,
  schoolLevel,
  semester,
  student,
  withTenant,
} from './index';

/**
 * Migrasi 0097 (rancangan fase 3, tahap 3.2): bawaan kolom = perilaku lama, CHECK, FK komposit lintas sekolah, dan RLS.
 */

const platformUrl = process.env.DATABASE_PLATFORM_URL;
const appUrl = process.env.DATABASE_URL;
if (!platformUrl || !appUrl) throw new Error('DATABASE_PLATFORM_URL dan DATABASE_URL wajib diisi');
const platform = createDb(platformUrl);
const tenantDb = createDb(appUrl);
const run = Math.random().toString(36).slice(2, 8);

let foundationId = '';
const schoolIds: string[] = [];
const W: Record<string, { schoolId: string; sem: string; stu: string; guardian: string }> = {};

async function makeSchool(tag: string) {
  const [s] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `${tag}-${run}`, name: tag })
    .returning();
  const schoolId = s!.id;
  schoolIds.push(schoolId);
  const [y] = await platform.db
    .insert(academicYear)
    .values({ schoolId, name: 'TA', startsOn: '2026-07-01', endsOn: '2027-06-30' })
    .returning();
  const [sem] = await platform.db
    .insert(semester)
    .values({ schoolId, academicYearId: y!.id, name: 'Ganjil', startsOn: '2026-07-01', endsOn: '2026-12-31' })
    .returning();
  const [stu] = await platform.db
    .insert(student)
    .values({ schoolId, name: `Siswa ${tag}`, gender: 'L', status: 'active' })
    .returning();
  const [g] = await platform.db
    .insert(guardian)
    .values({ schoolId, name: `Wali ${tag}` })
    .returning();
  W[tag] = { schoolId, sem: sem!.id, stu: stu!.id, guardian: g!.id };
}

beforeAll(async () => {
  const [f] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan 0097', slug: `y97-${run}` })
    .returning();
  foundationId = f!.id;
  await makeSchool('a');
  await makeSchool('b');
});

afterAll(async () => {
  for (const sid of schoolIds) {
    await platform.db.delete(reportCardResponse).where(eq(reportCardResponse.schoolId, sid));
    await platform.db.delete(reportCardSection).where(eq(reportCardSection.schoolId, sid));
    await platform.db.delete(reportSubjectNarrative).where(eq(reportSubjectNarrative.schoolId, sid));
    await platform.db.delete(reportSetting).where(eq(reportSetting.schoolId, sid));
    await platform.db.delete(schoolLevel).where(eq(schoolLevel.schoolId, sid));
    await platform.db.delete(guardian).where(eq(guardian.schoolId, sid));
    await platform.db.delete(student).where(eq(student.schoolId, sid));
    await platform.db.delete(semester).where(eq(semester.schoolId, sid));
    await platform.db.delete(academicYear).where(eq(academicYear.schoolId, sid));
    await platform.db.delete(school).where(eq(school.id, sid));
  }
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await platform.pool.end();
  await tenantDb.pool.end();
});

describe('migrasi 0097', () => {
  it('bawaan kolom baru = perilaku lama', async () => {
    const a = W.a!;
    await platform.db.insert(reportSetting).values({ schoolId: a.schoolId });
    const [setting] = await platform.db
      .select()
      .from(reportSetting)
      .where(eq(reportSetting.schoolId, a.schoolId));
    expect(setting).toMatchObject({
      showCocurricular: false,
      showGuardianResponse: false,
      responseWindowDays: 30,
    });
    const [lv] = await platform.db
      .insert(schoolLevel)
      .values({ schoolId: a.schoolId, code: '7', label: '7' })
      .returning();
    expect(lv!.reportMode).toBeNull();
  });

  it('CHECK menolak nilai di luar daftar', async () => {
    const a = W.a!;
    await expect(
      platform.db
        .insert(schoolLevel)
        .values({ schoolId: a.schoolId, code: '8', label: '8', reportMode: 'x' as never }),
    ).rejects.toThrow();
    await expect(
      platform.db
        .update(reportSetting)
        .set({ responseWindowDays: 0 })
        .where(eq(reportSetting.schoolId, a.schoolId)),
    ).rejects.toThrow();
    const base = {
      schoolId: a.schoolId,
      semesterId: a.sem,
      studentId: a.stu,
      guardianId: a.guardian,
      recordedBy: 'u',
    };
    await expect(
      platform.db.insert(reportCardResponse).values({ ...base, text: '', recordedByKind: 'staff' }),
    ).rejects.toThrow();
    await expect(
      platform.db.insert(reportCardResponse).values({ ...base, text: 'x', recordedByKind: 'orang' as never }),
    ).rejects.toThrow();
  });

  it('FK komposit menolak wali, siswa, dan semester sekolah lain; hapus wali bertanggapan ditolak', async () => {
    const a = W.a!;
    const b = W.b!;
    const base = { text: 'x', recordedBy: 'u', recordedByKind: 'staff' as const, schoolId: a.schoolId };
    await expect(
      platform.db
        .insert(reportCardResponse)
        .values({ ...base, semesterId: a.sem, studentId: a.stu, guardianId: b.guardian }),
    ).rejects.toThrow();
    await expect(
      platform.db
        .insert(reportCardResponse)
        .values({ ...base, semesterId: a.sem, studentId: b.stu, guardianId: a.guardian }),
    ).rejects.toThrow();
    await expect(
      platform.db.insert(reportCardSection).values({
        schoolId: a.schoolId,
        semesterId: b.sem,
        studentId: a.stu,
        cocurricularNote: 'x',
        updatedBy: 'u',
      }),
    ).rejects.toThrow();
    await platform.db
      .insert(reportCardResponse)
      .values({ ...base, semesterId: a.sem, studentId: a.stu, guardianId: a.guardian });
    await expect(platform.db.delete(guardian).where(eq(guardian.id, a.guardian))).rejects.toThrow();
  });

  it('RLS: tenant B tidak melihat atau menyisipkan baris tenant A', async () => {
    const a = W.a!;
    const b = W.b!;
    const seen = await withTenant(tenantDb.db, [b.schoolId], (tx) => tx.select().from(reportCardResponse));
    expect(seen).toEqual([]);
    const own = await withTenant(tenantDb.db, [a.schoolId], (tx) =>
      tx
        .select()
        .from(reportCardResponse)
        .where(and(eq(reportCardResponse.schoolId, a.schoolId))),
    );
    expect(own).toHaveLength(1);
    await expect(
      withTenant(tenantDb.db, [b.schoolId], (tx) =>
        tx.insert(reportCardSection).values({
          schoolId: a.schoolId,
          semesterId: a.sem,
          studentId: a.stu,
          cocurricularNote: 'x',
          updatedBy: 'u',
        }),
      ),
    ).rejects.toThrow();
  });
});
