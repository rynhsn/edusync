import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  assessment,
  classRoom,
  createDb,
  foundation,
  freezeSemesterGradingConfig,
  gradeComponent,
  readFrozenGradingConfig,
  readLiveGradingConfig,
  school,
  semester,
  semesterGradingConfig,
  subject,
} from './index';

/**
 * Pembekuan kategori komponen (rancangan fase 3, tahap 3.1): field kategori ditulis SPARSE, `config_version` naik ke 2 hanya
 * bila ada isi v2, salinan tidak mencampur sekolah, dan CHECK migrasi 0096 menjaga nilai yang sah.
 */

const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!platformUrl) throw new Error('DATABASE_PLATFORM_URL wajib diisi');
const platform = createDb(platformUrl);
const run = Math.random().toString(36).slice(2, 8);

let foundationId = '';
const schoolIds: string[] = [];

async function makeSchool(tag: string, withFormative: boolean) {
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
  const comps = await platform.db
    .insert(gradeComponent)
    .values([
      { schoolId, name: 'Tugas', weight: 40, sort: 0 },
      { schoolId, name: 'UAS', weight: 60, sort: 1 },
      ...(withFormative
        ? [{ schoolId, name: 'Kuis', weight: 0, sort: 2, category: 'formative', includeInFinal: false }]
        : []),
    ])
    .returning();
  return { schoolId, semesterId: sem!.id, yearId: y!.id, comps };
}

const freeze = (f: { schoolId: string; semesterId: string }, overwrite = false) =>
  freezeSemesterGradingConfig(platform.db, { ...f, origin: 'manual', actorId: null, overwrite });
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
    .values({ name: 'Yayasan Kategori Db', slug: `ykatdb-${run}` })
    .returning();
  foundationId = f!.id;
});

afterAll(async () => {
  for (const id of schoolIds) {
    await platform.db.delete(assessment).where(eq(assessment.schoolId, id));
    await platform.db.delete(semesterGradingConfig).where(eq(semesterGradingConfig.schoolId, id));
    await platform.db.delete(gradeComponent).where(eq(gradeComponent.schoolId, id));
    await platform.db.delete(subject).where(eq(subject.schoolId, id));
    await platform.db.delete(classRoom).where(eq(classRoom.schoolId, id));
    await platform.db.delete(semester).where(eq(semester.schoolId, id));
    await platform.db.delete(academicYear).where(eq(academicYear.schoolId, id));
    await platform.db.delete(school).where(eq(school.id, id));
  }
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await platform.pool.end();
});

describe('penulisan sparse', () => {
  it('tanpa formatif: versi 1 dan komponen tanpa kunci kategori; konfigurasi hidup sama dengan salinan', async () => {
    const w = await makeSchool('kat-v1', false);
    expect(await freeze(w)).toBe(true);
    const row = await rowOf(w.semesterId);
    expect(row.configVersion).toBe(1);
    expect((row.components as object[]).map((c) => Object.keys(c).sort())).toEqual([
      ['id', 'name', 'sort', 'weight'],
      ['id', 'name', 'sort', 'weight'],
    ]);
    const live = await readLiveGradingConfig(platform.db, w.schoolId);
    expect(JSON.parse(JSON.stringify(live.components))).toEqual(row.components);
  });

  it('dengan formatif: versi 2; hanya komponen formatif membawa kategori; terbaca lintas versi', async () => {
    const w = await makeSchool('kat-v2', true);
    await freeze(w);
    const row = await rowOf(w.semesterId);
    expect(row.configVersion).toBe(2);
    const comps = row.components as Record<string, unknown>[];
    expect(comps.map((c) => Object.keys(c).sort())).toEqual([
      ['id', 'name', 'sort', 'weight'],
      ['id', 'name', 'sort', 'weight'],
      ['category', 'id', 'includeInFinal', 'name', 'sort', 'weight'],
    ]);
    expect(comps[2]).toMatchObject({ name: 'Kuis', weight: 0, category: 'formative', includeInFinal: false });
    const cfg = await readFrozenGradingConfig(platform.db, w.schoolId, w.semesterId);
    expect(cfg!.components.map((c) => [c.name, c.category, c.includeInFinal])).toEqual([
      ['Tugas', 'summative', true],
      ['UAS', 'summative', true],
      ['Kuis', 'formative', false],
    ]);
    // Menimpa setelah formatif dihapus: kembali versi 1 tanpa kunci kategori.
    await platform.db
      .delete(gradeComponent)
      .where(eq(gradeComponent.id, w.comps.find((c) => c.name === 'Kuis')!.id));
    await freeze(w, true);
    const after = await rowOf(w.semesterId);
    expect(after.configVersion).toBe(1);
    expect((after.components as object[]).every((c) => !('category' in c))).toBe(true);
  });

  it('T14: salinan tidak mencampur komponen antar sekolah', async () => {
    const a = await makeSchool('kat-a', true);
    const b = await makeSchool('kat-b', false);
    await freeze(a);
    await freeze(b);
    const rowA = await rowOf(a.semesterId);
    const rowB = await rowOf(b.semesterId);
    const idsA = new Set(a.comps.map((c) => c.id));
    expect((rowA.components as { id: string }[]).every((c) => idsA.has(c.id))).toBe(true);
    expect((rowB.components as { id: string }[]).every((c) => !idsA.has(c.id))).toBe(true);
    expect(rowB.configVersion).toBe(1);
    expect(rowA.configVersion).toBe(2);
  });
});

describe('CHECK migrasi 0096', () => {
  it('formatif tidak boleh ikut nilai akhir; kategori dan tanda di luar daftar ditolak; teknik bebas', async () => {
    const w = await makeSchool('kat-ck', false);
    const bad = (values: Partial<typeof gradeComponent.$inferInsert>) =>
      platform.db
        .insert(gradeComponent)
        .values({ schoolId: w.schoolId, name: `x${Math.random()}`, weight: 1, ...values });
    await expect(bad({ category: 'formative', includeInFinal: true })).rejects.toThrow();
    await expect(bad({ category: 'lain' })).rejects.toThrow();
    await expect(bad({ category: 'summative', includeInFinal: false })).resolves.toBeDefined();
    await expect(bad({ category: 'formative', includeInFinal: false })).resolves.toBeDefined();

    const [cls] = await platform.db
      .insert(classRoom)
      .values({ schoolId: w.schoolId, academicYearId: w.yearId, name: '7A', level: '7' })
      .returning();
    const [sub] = await platform.db
      .insert(subject)
      .values({ schoolId: w.schoolId, code: 'MAT', name: 'Mat' })
      .returning();
    const base = {
      schoolId: w.schoolId,
      semesterId: w.semesterId,
      classId: cls!.id,
      subjectId: sub!.id,
      componentId: w.comps[0]!.id,
      title: 'T',
      date: '2026-08-01',
    };
    const [plain] = await platform.db.insert(assessment).values(base).returning();
    expect([plain!.purpose, plain!.summativeScope, plain!.technique]).toEqual([null, null, null]);
    await expect(platform.db.insert(assessment).values({ ...base, purpose: 'regular' })).rejects.toThrow();
    await expect(
      platform.db.insert(assessment).values({ ...base, summativeScope: 'topic' }),
    ).rejects.toThrow();
    const [ok] = await platform.db
      .insert(assessment)
      .values({
        ...base,
        purpose: 'initial',
        summativeScope: 'material',
        technique: 'teknik-baru-masa-depan',
      })
      .returning();
    expect(ok!.technique).toBe('teknik-baru-masa-depan');
  });
});
