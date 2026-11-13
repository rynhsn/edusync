import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  createDb,
  foundation,
  freezeSemesterGradingConfig,
  gradeComponent,
  readFrozenGradingConfig,
  school,
  semester,
  semesterGradingConfig,
} from './index';

/**
 * Pembaca salinan beku lintas versi (rancangan fase 3, tahap 3.0): `config_version` 1 dan 2 terbaca, kunci yang hilang = bawaan,
 * dan penulisan salinan sekarang tidak berubah (tetap versi 1, komponen tanpa kunci baru).
 */

const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!platformUrl) throw new Error('DATABASE_PLATFORM_URL wajib diisi');
const platform = createDb(platformUrl);
const run = Math.random().toString(36).slice(2, 8);

let foundationId = '';
const schoolIds: string[] = [];

async function makeSchool(tag: string) {
  const [s] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `${tag}-${run}`, name: tag })
    .returning();
  const schoolId = s!.id;
  schoolIds.push(schoolId);
  const [y] = await platform.db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30' })
    .returning();
  const [sem] = await platform.db
    .insert(semester)
    .values({ schoolId, academicYearId: y!.id, name: 'Ganjil', startsOn: '2026-07-13', endsOn: '2026-12-20' })
    .returning();
  await platform.db.insert(gradeComponent).values([
    { schoolId, name: 'Tugas', weight: 40, sort: 0 },
    { schoolId, name: 'UAS', weight: 60, sort: 1 },
  ]);
  return { schoolId, semesterId: sem!.id };
}

const freeze = (f: { schoolId: string; semesterId: string }) =>
  freezeSemesterGradingConfig(platform.db, { ...f, origin: 'manual', actorId: null, overwrite: false });
const rowOf = async (semesterId: string) =>
  (
    await platform.db
      .select()
      .from(semesterGradingConfig)
      .where(eq(semesterGradingConfig.semesterId, semesterId))
  )[0]!;

beforeAll(async () => {
  const [f] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan Pembaca', slug: `ypembaca-${run}` })
    .returning();
  foundationId = f!.id;
});

afterAll(async () => {
  for (const id of schoolIds) {
    await platform.db.delete(semesterGradingConfig).where(eq(semesterGradingConfig.schoolId, id));
    await platform.db.delete(gradeComponent).where(eq(gradeComponent.schoolId, id));
    await platform.db.delete(semester).where(eq(semester.schoolId, id));
    await platform.db.delete(academicYear).where(eq(academicYear.schoolId, id));
    await platform.db.delete(school).where(eq(school.id, id));
  }
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await platform.pool.end();
});

describe('readFrozenGradingConfig', () => {
  it('null bila semester belum beku, dan tidak membaca salinan sekolah lain', async () => {
    const a = await makeSchool('pembaca-a');
    const b = await makeSchool('pembaca-b');
    expect(await readFrozenGradingConfig(platform.db, a.schoolId, a.semesterId)).toBeNull();
    await freeze(a);
    expect(await readFrozenGradingConfig(platform.db, a.schoolId, a.semesterId)).not.toBeNull();
    // Semester sekolah A dengan school_id sekolah B tidak terbaca.
    expect(await readFrozenGradingConfig(platform.db, b.schoolId, a.semesterId)).toBeNull();
  });

  it('penulisan sekarang tidak berubah: versi 1, komponen hanya empat kunci lama; terbaca dengan nilai bawaan', async () => {
    const w = await makeSchool('pembaca-v1');
    expect(await freeze(w)).toBe(true);
    const row = await rowOf(w.semesterId);
    expect(row.configVersion).toBe(1);
    expect((row.components as object[]).map((c) => Object.keys(c).sort())).toEqual([
      ['id', 'name', 'sort', 'weight'],
      ['id', 'name', 'sort', 'weight'],
    ]);
    const cfg = await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId);
    expect(cfg).toMatchObject({
      configVersion: 1,
      kkm: 75,
      calculationMode: 'weighted_average',
      objectiveAggregation: 'mean',
      remedialPolicy: 'record_only',
      objectiveCriteria: [],
    });
    expect(cfg!.components.map((c) => [c.name, c.weight, c.category, c.includeInFinal])).toEqual([
      ['Tugas', 40, 'summative', true],
      ['UAS', 60, 'summative', true],
    ]);
  });

  it('salinan config_version 2 dengan kategori terbaca tanpa gagal; versi tak dikenal ditolak', async () => {
    const w = await makeSchool('pembaca-v2');
    await freeze(w);
    const row = await rowOf(w.semesterId);
    const comps = row.components as { id: string; name: string; weight: number; sort: number }[];
    await platform.db
      .update(semesterGradingConfig)
      .set({
        configVersion: 2,
        components: [comps[0], { ...comps[1], weight: 0, category: 'formative', includeInFinal: false }],
      })
      .where(eq(semesterGradingConfig.semesterId, w.semesterId));
    const cfg = await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId);
    expect(cfg!.configVersion).toBe(2);
    expect(cfg!.components.map((c) => [c.name, c.category, c.includeInFinal])).toEqual([
      ['Tugas', 'summative', true],
      ['UAS', 'formative', false],
    ]);

    await platform.db
      .update(semesterGradingConfig)
      .set({ configVersion: 3 })
      .where(eq(semesterGradingConfig.semesterId, w.semesterId));
    await expect(readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId)).rejects.toThrow(
      /tidak dikenali/,
    );
  });
});
