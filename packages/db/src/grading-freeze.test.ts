import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  achievementCriteria,
  achievementRubricLevel,
  createDb,
  foundation,
  freezeSemesterGradingConfig,
  gradeComponent,
  gradingSetting,
  school,
  semester,
  semesterGradingConfig,
  subject,
  withTenant,
} from './index';

const appUrl = process.env.DATABASE_URL;
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!appUrl || !platformUrl) throw new Error('DATABASE_URL dan DATABASE_PLATFORM_URL wajib diisi');

const app = createDb(appUrl);
const platform = createDb(platformUrl);
const run = Math.random().toString(36).slice(2, 8);

interface Fx {
  schoolId: string;
  semesterId: string;
  componentIds: string[];
  subjectId: string;
  criteriaId: string;
}
let foundationId = '';
let A: Fx;
let B: Fx;

/** Satu sekolah dengan pengaturan, dua komponen, mapel, satu KKTP rubrik aktif, satu KKTP nonaktif, dan satu semester. */
async function makeSchool(tag: string, kkm: number): Promise<Fx> {
  const [s] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `${tag}-${run}`, name: tag })
    .returning();
  const schoolId = s!.id;
  const [y] = await platform.db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30' })
    .returning();
  const [sem] = await platform.db
    .insert(semester)
    .values({ schoolId, academicYearId: y!.id, name: 'Ganjil', startsOn: '2026-07-13', endsOn: '2026-12-20' })
    .returning();
  await platform.db
    .insert(gradingSetting)
    .values({ schoolId, kkm, predicateA: 91, predicateB: 81, predicateC: 71, calculationMode: 'percentage' });
  const comps = await platform.db
    .insert(gradeComponent)
    .values([
      { schoolId, name: `UAS ${tag}`, weight: 60, sort: 1 },
      { schoolId, name: `Tugas ${tag}`, weight: 40, sort: 0 },
    ])
    .returning();
  const [sub] = await platform.db
    .insert(subject)
    .values({ schoolId, code: `MTK-${tag}`, name: `Matematika ${tag}` })
    .returning();
  const [crit] = await platform.db
    .insert(achievementCriteria)
    .values({ schoolId, subjectId: sub!.id, mode: 'interval', levelCode: '7' })
    .returning();
  await platform.db.insert(achievementRubricLevel).values([
    {
      schoolId,
      criteriaId: crit!.id,
      label: 'Tuntas',
      minScore: 80,
      maxScore: 100,
      isAchieved: true,
      sortOrder: 0,
    },
    {
      schoolId,
      criteriaId: crit!.id,
      label: 'Belum',
      minScore: 0,
      maxScore: 79.5,
      isAchieved: false,
      sortOrder: 1,
    },
  ]);
  // Kriteria nonaktif tidak ikut disalin.
  await platform.db
    .insert(achievementCriteria)
    .values({ schoolId, subjectId: sub!.id, mode: 'numeric', threshold: 50, active: false });
  return {
    schoolId,
    semesterId: sem!.id,
    componentIds: comps.map((c) => c.id),
    subjectId: sub!.id,
    criteriaId: crit!.id,
  };
}

async function cleanup(f: Fx | undefined) {
  if (!f) return;
  const id = f.schoolId;
  await platform.db.delete(semesterGradingConfig).where(eq(semesterGradingConfig.schoolId, id));
  await platform.db.delete(achievementRubricLevel).where(eq(achievementRubricLevel.schoolId, id));
  await platform.db.delete(achievementCriteria).where(eq(achievementCriteria.schoolId, id));
  await platform.db.delete(subject).where(eq(subject.schoolId, id));
  await platform.db.delete(gradeComponent).where(eq(gradeComponent.schoolId, id));
  await platform.db.delete(gradingSetting).where(eq(gradingSetting.schoolId, id));
  await platform.db.delete(semester).where(eq(semester.schoolId, id));
  await platform.db.delete(academicYear).where(eq(academicYear.schoolId, id));
  await platform.db.delete(school).where(eq(school.id, id));
}

beforeAll(async () => {
  const [f] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan Beku', slug: `ybeku-${run}` })
    .returning();
  foundationId = f!.id;
  A = await makeSchool('sekolah-a', 78);
  B = await makeSchool('sekolah-b', 66);
});

afterAll(async () => {
  await cleanup(A);
  await cleanup(B);
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await app.pool.end();
  await platform.pool.end();
});

const rowOf = async (semesterId: string) =>
  (
    await platform.db
      .select()
      .from(semesterGradingConfig)
      .where(eq(semesterGradingConfig.semesterId, semesterId))
  )[0];

describe('freezeSemesterGradingConfig', () => {
  it('menyalin pengaturan, komponen (urut sort), dan hanya kriteria aktif beserta levelnya', async () => {
    const created = await freezeSemesterGradingConfig(platform.db, {
      schoolId: A.schoolId,
      semesterId: A.semesterId,
      origin: 'backfill',
      actorId: null,
      overwrite: false,
    });
    expect(created).toBe(true);
    const r = await rowOf(A.semesterId);
    expect(r).toMatchObject({
      schoolId: A.schoolId,
      kkm: 78,
      predicateA: 91,
      predicateB: 81,
      predicateC: 71,
      calculationMode: 'percentage',
      origin: 'backfill',
      frozenBy: null,
      configVersion: 1,
    });
    const comps = r!.components as { id: string; name: string; weight: number; sort: number }[];
    expect(comps.map((c) => c.name)).toEqual(['Tugas sekolah-a', 'UAS sekolah-a']);
    expect(comps.map((c) => c.weight)).toEqual([40, 60]);
    const crit = r!.criteria as {
      id: string;
      subjectId: string;
      mode: string;
      levelCode: string;
      objectiveId: null;
      active: true;
      levels: { label: string; minScore: number; isAchieved: boolean }[];
    }[];
    expect(crit).toHaveLength(1);
    expect(crit[0]).toMatchObject({
      id: A.criteriaId,
      subjectId: A.subjectId,
      mode: 'interval',
      levelCode: '7',
      objectiveId: null,
      active: true,
    });
    expect(crit[0]!.levels.map((l) => [l.label, l.minScore, l.isAchieved])).toEqual([
      ['Tuntas', 80, true],
      ['Belum', 0, false],
    ]);
  });

  it('memfilter school_id: salinan sekolah A tidak memuat komponen atau kriteria sekolah B walau dibuat lewat koneksi BYPASSRLS', async () => {
    const r = await rowOf(A.semesterId);
    const text = JSON.stringify([r!.components, r!.criteria]);
    for (const id of [...B.componentIds, B.subjectId, B.criteriaId]) expect(text).not.toContain(id);
    expect(r!.kkm).not.toBe(66);
  });

  it('tanpa overwrite baris yang ada dibiarkan; dengan overwrite ditimpa dan asalnya berganti', async () => {
    await platform.db.update(gradingSetting).set({ kkm: 90 }).where(eq(gradingSetting.schoolId, A.schoolId));
    const again = await freezeSemesterGradingConfig(platform.db, {
      schoolId: A.schoolId,
      semesterId: A.semesterId,
      origin: 'finalize',
      actorId: 'user-x',
      overwrite: false,
    });
    expect(again).toBe(false);
    expect((await rowOf(A.semesterId))!.kkm).toBe(78);
    expect((await rowOf(A.semesterId))!.origin).toBe('backfill');

    const replaced = await freezeSemesterGradingConfig(platform.db, {
      schoolId: A.schoolId,
      semesterId: A.semesterId,
      origin: 'sync',
      actorId: 'user-x',
      overwrite: true,
    });
    expect(replaced).toBe(true);
    const r = await rowOf(A.semesterId);
    expect(r).toMatchObject({ kkm: 90, origin: 'sync', frozenBy: 'user-x' });
  });

  it('sekolah tanpa baris pengaturan memakai nilai bawaan', async () => {
    await platform.db.delete(gradingSetting).where(eq(gradingSetting.schoolId, B.schoolId));
    await freezeSemesterGradingConfig(platform.db, {
      schoolId: B.schoolId,
      semesterId: B.semesterId,
      origin: 'manual',
      actorId: null,
      overwrite: true,
    });
    expect(await rowOf(B.semesterId)).toMatchObject({
      kkm: 75,
      predicateA: 90,
      predicateB: 80,
      predicateC: 70,
      calculationMode: 'weighted_average',
      origin: 'manual',
    });
  });

  it('semester sekolah lain: ditolak FK komposit bila belum ada baris, dan tidak menimpa baris sekolah lain', async () => {
    const [other] = await platform.db
      .insert(semester)
      .values({
        schoolId: B.schoolId,
        academicYearId: (
          await platform.db.select().from(academicYear).where(eq(academicYear.schoolId, B.schoolId))
        )[0]!.id,
        name: 'Genap',
        startsOn: '2027-01-05',
        endsOn: '2027-06-20',
      })
      .returning();
    await expect(
      freezeSemesterGradingConfig(platform.db, {
        schoolId: A.schoolId,
        semesterId: other!.id,
        origin: 'sync',
        actorId: null,
        overwrite: true,
      }),
    ).rejects.toThrow();
    // Baris sekolah B yang sudah ada tidak boleh ditimpa dengan konfigurasi sekolah A.
    const written = await freezeSemesterGradingConfig(platform.db, {
      schoolId: A.schoolId,
      semesterId: B.semesterId,
      origin: 'sync',
      actorId: null,
      overwrite: true,
    });
    expect(written).toBe(false);
    expect(await rowOf(other!.id)).toBeUndefined();
    expect(await rowOf(B.semesterId)).toMatchObject({ schoolId: B.schoolId, origin: 'manual', kkm: 75 });
  });
});

describe('RLS semester_grading_config', () => {
  it('peran aplikasi hanya melihat baris sekolahnya', async () => {
    const a = await withTenant(app.db, [A.schoolId], (tx) => tx.select().from(semesterGradingConfig));
    expect(a.map((r) => r.semesterId)).toEqual([A.semesterId]);
    expect(await app.db.select().from(semesterGradingConfig)).toHaveLength(0);
  });

  it('tidak bisa menulis baris dengan school_id sekolah lain (WITH CHECK)', async () => {
    await expect(
      withTenant(app.db, [A.schoolId], (tx) =>
        tx.insert(semesterGradingConfig).values({
          schoolId: B.schoolId,
          semesterId: crypto.randomUUID(),
          kkm: 70,
          predicateA: 90,
          predicateB: 80,
          predicateC: 70,
          calculationMode: 'weighted_average',
          components: [],
          origin: 'manual',
        }),
      ),
    ).rejects.toThrow();
  });

  it('tidak bisa menautkan salinan ke semester sekolah lain (FK komposit)', async () => {
    await expect(
      withTenant(app.db, [A.schoolId], (tx) =>
        tx.insert(semesterGradingConfig).values({
          schoolId: A.schoolId,
          semesterId: B.semesterId,
          kkm: 70,
          predicateA: 90,
          predicateB: 80,
          predicateC: 70,
          calculationMode: 'weighted_average',
          components: [],
          origin: 'manual',
        }),
      ),
    ).rejects.toThrow();
  });

  it('tidak bisa mengubah atau menghapus baris sekolah lain', async () => {
    const upd = await withTenant(app.db, [A.schoolId], (tx) =>
      tx
        .update(semesterGradingConfig)
        .set({ kkm: 1 })
        .where(eq(semesterGradingConfig.semesterId, B.semesterId))
        .returning(),
    );
    expect(upd).toHaveLength(0);
    const del = await withTenant(app.db, [A.schoolId], (tx) =>
      tx.delete(semesterGradingConfig).where(eq(semesterGradingConfig.semesterId, B.semesterId)).returning(),
    );
    expect(del).toHaveLength(0);
    expect((await rowOf(B.semesterId))!.kkm).toBe(75);
  });

  it('menghapus semester membawa salinannya (CASCADE)', async () => {
    await platform.db.delete(semester).where(eq(semester.id, B.semesterId));
    expect(await rowOf(B.semesterId)).toBeUndefined();
  });
});
