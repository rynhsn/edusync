import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  assertConnectionBypassesRls,
  assessment,
  backfillSemesterGradingConfigs,
  classRoom,
  createDb,
  foundation,
  gradeComponent,
  gradingSetting,
  reportCard,
  school,
  semester,
  semesterGradingConfig,
  student,
  subject,
} from './index';

const appUrl = process.env.DATABASE_URL;
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!appUrl || !platformUrl) throw new Error('DATABASE_URL dan DATABASE_PLATFORM_URL wajib diisi');

const app = createDb(appUrl);
const platform = createDb(platformUrl);
const run = Math.random().toString(36).slice(2, 8);

interface Fx {
  schoolId: string;
  componentIds: string[];
  /** Nonaktif, rapor final. */
  finalSem: string;
  /** Nonaktif, sudah lewat, punya penilaian, belum final. */
  pastGraded: string;
  /** Nonaktif, sudah lewat, tanpa penilaian. */
  pastEmpty: string;
  /** Nonaktif, belum lewat (2099), punya penilaian. */
  future: string;
  /** Aktif; penilaian ada atau tidak tergantung sekolah. */
  active: string;
}
let foundationId = '';
let A: Fx;
let B: Fx;

async function makeSchool(tag: string, kkm: number, activeGraded: boolean): Promise<Fx> {
  const [s] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `${tag}-${run}`, name: tag })
    .returning();
  const schoolId = s!.id;
  const [y] = await platform.db
    .insert(academicYear)
    .values({ schoolId, name: 'Tahun uji', startsOn: '2019-07-01', endsOn: '2099-12-31' })
    .returning();
  const mk = async (name: string, startsOn: string, endsOn: string, isActive = false) =>
    (
      await platform.db
        .insert(semester)
        .values({ schoolId, academicYearId: y!.id, name, startsOn, endsOn, isActive })
        .returning()
    )[0]!.id;
  const finalSem = await mk('Final', '2019-07-01', '2019-12-31');
  const pastGraded = await mk('Lewat bernilai', '2020-01-01', '2020-06-30');
  const pastEmpty = await mk('Lewat kosong', '2020-07-01', '2020-12-31');
  const future = await mk('Mendatang', '2098-01-01', '2098-12-31');
  const active = await mk('Aktif', '2026-07-01', '2026-12-31', true);

  await platform.db
    .insert(gradingSetting)
    .values({ schoolId, kkm, predicateA: 91, predicateB: 81, predicateC: 71 });
  const comps = await platform.db
    .insert(gradeComponent)
    .values([
      { schoolId, name: `Tugas ${tag}`, weight: 40, sort: 0 },
      { schoolId, name: `UAS ${tag}`, weight: 60, sort: 1 },
    ])
    .returning();
  const [sub] = await platform.db
    .insert(subject)
    .values({ schoolId, code: `MTK-${tag}`, name: `Matematika ${tag}` })
    .returning();
  const [cls] = await platform.db
    .insert(classRoom)
    .values({ schoolId, academicYearId: y!.id, name: '7A', level: '7' })
    .returning();
  const [stu] = await platform.db
    .insert(student)
    .values({ schoolId, name: 'Ani', gender: 'P', status: 'active' })
    .returning();
  const grade = (semesterId: string) =>
    platform.db.insert(assessment).values({
      schoolId,
      semesterId,
      classId: cls!.id,
      subjectId: sub!.id,
      componentId: comps[0]!.id,
      title: 'Uji',
      date: '2020-01-10',
    });
  await grade(pastGraded);
  await grade(future);
  await grade(finalSem);
  if (activeGraded) await grade(active);
  await platform.db.insert(reportCard).values({
    schoolId,
    semesterId: finalSem,
    studentId: stu!.id,
    classId: cls!.id,
    status: 'final',
    snapshot: { subjects: [] },
  });
  return { schoolId, componentIds: comps.map((c) => c.id), finalSem, pastGraded, pastEmpty, future, active };
}

async function cleanup(f: Fx | undefined) {
  if (!f) return;
  const id = f.schoolId;
  await platform.db.delete(semesterGradingConfig).where(eq(semesterGradingConfig.schoolId, id));
  await platform.db.delete(reportCard).where(eq(reportCard.schoolId, id));
  await platform.db.delete(assessment).where(eq(assessment.schoolId, id));
  await platform.db.delete(student).where(eq(student.schoolId, id));
  await platform.db.delete(classRoom).where(eq(classRoom.schoolId, id));
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
    .values({ name: 'Yayasan Backfill', slug: `ybf-${run}` })
    .returning();
  foundationId = f!.id;
  A = await makeSchool('bf-a', 78, true);
  B = await makeSchool('bf-b', 66, false);
});

afterAll(async () => {
  await cleanup(A);
  await cleanup(B);
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await app.pool.end();
  await platform.pool.end();
});

const rows = (schoolId: string) =>
  platform.db.select().from(semesterGradingConfig).where(eq(semesterGradingConfig.schoolId, schoolId));
const frozenIds = async (schoolId: string) => (await rows(schoolId)).map((r) => r.semesterId).sort();

describe('backfill konfigurasi beku', () => {
  it('koneksi yang tunduk RLS ditolak keras dengan pesan jelas dan tidak menulis apa pun', async () => {
    await expect(assertConnectionBypassesRls(app.db)).rejects.toThrow(/RLS/);
    await expect(backfillSemesterGradingConfigs(app.db, { schoolIds: [A.schoolId] })).rejects.toThrow(
      /BYPASSRLS/,
    );
    expect(await rows(A.schoolId)).toHaveLength(0);
    // Koneksi platform (BYPASSRLS) lolos.
    await expect(assertConnectionBypassesRls(platform.db)).resolves.toBeUndefined();
  });

  it('membekukan semester berfinal dan semester lewat yang bernilai; tidak menyentuh aktif, mendatang, atau kosong', async () => {
    const res = await backfillSemesterGradingConfigs(platform.db, { schoolIds: [A.schoolId, B.schoolId] });
    expect(res.schools).toBe(2);
    expect(res.created).toBe(4);
    expect(res.byReason).toEqual({ final: 2, pastGraded: 2 });
    for (const f of [A, B]) {
      expect(await frozenIds(f.schoolId)).toEqual([f.finalSem, f.pastGraded].sort());
      for (const r of await rows(f.schoolId)) {
        expect(r).toMatchObject({ origin: 'backfill', frozenBy: null, configVersion: 1 });
      }
    }
    // Semester aktif (bernilai di A, kosong di B), mendatang, dan lewat-kosong tidak dibekukan.
    expect(await frozenIds(A.schoolId)).not.toContain(A.active);
    expect(await frozenIds(B.schoolId)).not.toContain(B.active);
    expect(await frozenIds(A.schoolId)).not.toContain(A.future);
    expect(await frozenIds(A.schoolId)).not.toContain(A.pastEmpty);
  });

  it('isolasi antar sekolah: salinan memuat KKM dan komponen sekolahnya sendiri saja', async () => {
    const [ra] = await rows(A.schoolId);
    const [rb] = await rows(B.schoolId);
    expect(ra!.kkm).toBe(78);
    expect(rb!.kkm).toBe(66);
    const ta = JSON.stringify(ra!.components);
    const tb = JSON.stringify(rb!.components);
    for (const id of B.componentIds) expect(ta).not.toContain(id);
    for (const id of A.componentIds) expect(tb).not.toContain(id);
  });

  it('idempoten dan tidak menimpa: jalan kedua nol baris walau konfigurasi hidup sudah berubah', async () => {
    const before = await rows(A.schoolId);
    await platform.db.update(gradingSetting).set({ kkm: 55 }).where(eq(gradingSetting.schoolId, A.schoolId));
    const again = await backfillSemesterGradingConfigs(platform.db, { schoolIds: [A.schoolId, B.schoolId] });
    expect(again.created).toBe(0);
    expect(again.alreadyFrozen).toBe(4);
    const after = await rows(A.schoolId);
    expect(after.map((r) => [r.semesterId, r.kkm, r.frozenAt.getTime()]).sort()).toEqual(
      before.map((r) => [r.semesterId, r.kkm, r.frozenAt.getTime()]).sort(),
    );
    expect(after.every((r) => r.kkm === 78)).toBe(true);
  });

  it('hanya sekolah yang disebut yang diproses', async () => {
    await platform.db
      .delete(semesterGradingConfig)
      .where(and(eq(semesterGradingConfig.schoolId, B.schoolId)));
    const res = await backfillSemesterGradingConfigs(platform.db, { schoolIds: [A.schoolId] });
    expect(res.schools).toBe(1);
    expect(await rows(B.schoolId)).toHaveLength(0);
    expect(
      await platform.db
        .select({ id: semesterGradingConfig.semesterId })
        .from(semesterGradingConfig)
        .where(inArray(semesterGradingConfig.schoolId, [B.schoolId])),
    ).toHaveLength(0);
  });
});

describe('0095 FK arsip rapor', () => {
  it('ketiga FK report_card_snapshot_*_fk NO ACTION dan tidak ada FK CASCADE ke report_card atau report_card_snapshot', async () => {
    const res = await platform.db.execute(
      sql`select conname, confdeltype from pg_constraint where contype = 'f' and conname like 'report_card_snapshot\_%\_fk'`,
    );
    expect(res.rows.map((r) => (r as { conname: string }).conname).sort()).toEqual([
      'report_card_snapshot_class_fk',
      'report_card_snapshot_semester_fk',
      'report_card_snapshot_student_fk',
    ]);
    expect(res.rows.every((r) => (r as { confdeltype: string }).confdeltype === 'a')).toBe(true);
    const cascades = await platform.db.execute(
      sql`select conname from pg_constraint where contype = 'f' and confdeltype = 'c'
          and (conrelid in ('report_card'::regclass, 'report_card_snapshot'::regclass)
            or confrelid in ('report_card'::regclass, 'report_card_snapshot'::regclass))`,
    );
    expect(cascades.rows).toEqual([]);
  });
});
