import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  announcement,
  classRoom,
  cocurricularAssessment,
  cocurricularEvidence,
  cocurricularFacilitator,
  cocurricularProgram,
  cocurricularProgramClass,
  cocurricularProgramTarget,
  cocurricularRubricLevel,
  createDb,
  enrollment,
  examParticipantNumber,
  examType,
  foundation,
  guardian,
  learningObjective,
  learningOutcome,
  learningPlan,
  learningPlanObjective,
  learningPlanSetting,
  learningProcessReview,
  lessonJournal,
  lessonJournalObjective,
  lessonPeriod,
  msgAttachment,
  msgBatch,
  msgDirectTemplate,
  msgMessage,
  msgOptOut,
  pklPartner,
  pklPeriod,
  pklPlacement,
  program,
  programConcentration,
  scheduleEntry,
  school,
  schoolIdentifier,
  schoolProfileItem,
  semester,
  student,
  subject,
  teacher,
  ukkAssessor,
  ukkEvent,
  ukkResult,
  vocationalConcentration,
  vocationalField,
  vocationalProgram,
  vocationalSetting,
  withTenant,
} from './index';

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

describe('setiap tabel bersekolah dijaga RLS', () => {
  it('semua tabel dengan kolom school_id mengaktifkan dan memaksa RLS, dan punya kebijakan atau tanpa akses aplikasi', async () => {
    const res = await platform.db.execute<{
      table_name: string;
      rls: boolean;
      forced: boolean;
      policies: number;
      app_can_select: boolean;
    }>(sql`
      select c.relname as table_name, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies,
             has_table_privilege('edusync_app', c.oid, 'SELECT') as app_can_select
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'school_id' and not a.attisdropped
      where c.relkind = 'r'
    `);
    expect(res.rows.length).toBeGreaterThan(10);
    for (const t of res.rows) {
      expect(t.rls, `${t.table_name}: RLS belum aktif`).toBe(true);
      expect(t.forced, `${t.table_name}: RLS belum dipaksa`).toBe(true);
      // Tabel yang bisa dibaca peran aplikasi wajib punya kebijakan; bila tidak, hasilnya selalu kosong tetapi tetap salah arah.
      if (t.app_can_select) expect(t.policies, `${t.table_name}: tanpa kebijakan`).toBeGreaterThan(0);
    }
  });
});

describe('tabel tenant kerangka profil (tahap 4.1)', () => {
  it('butir kerangka dan rubrik kokurikuler terisolasi per sekolah, tulis lintas sekolah ditolak', async () => {
    const mk = (sid: string, n: number) => [
      platform.db.insert(schoolProfileItem).values({
        schoolId: sid,
        frameworkKey: 'profil_lulusan_2025',
        code: `x${n}`,
        label: `Butir ${n}`,
      }),
      platform.db
        .insert(cocurricularRubricLevel)
        .values({ schoolId: sid, code: `L${n}`, label: `Tingkat ${n}`, sort: n }),
    ];
    await Promise.all([...mk(schoolA1, 1), ...mk(schoolB, 2)]);
    try {
      const items = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(schoolProfileItem));
      const levels = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(cocurricularRubricLevel));
      expect(items.map((r) => r.schoolId)).toEqual([schoolA1]);
      expect(levels.map((r) => r.schoolId)).toEqual([schoolA1]);
      expect(await app.db.select().from(schoolProfileItem)).toHaveLength(0);
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx
            .insert(cocurricularRubricLevel)
            .values({ schoolId: schoolB, code: 'Z', label: 'sisipan', sort: 1 }),
        ),
      ).rejects.toThrow();
      const hit = await withTenant(app.db, [schoolA1], (tx) =>
        tx.delete(schoolProfileItem).where(eq(schoolProfileItem.schoolId, schoolB)).returning(),
      );
      expect(hit).toHaveLength(0);
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(schoolProfileItem).where(eq(schoolProfileItem.schoolId, sid));
        await platform.db.delete(cocurricularRubricLevel).where(eq(cocurricularRubricLevel.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant program kokurikuler (tahap 4.2)', () => {
  it('program, sasaran, rombel, dan fasilitator terisolasi; FK komposit menolak rujukan lintas sekolah', async () => {
    const seed = async (sid: string, n: number) => {
      const [year] = await platform.db.select().from(academicYear).where(eq(academicYear.schoolId, sid));
      const [cls] = await platform.db
        .insert(classRoom)
        .values({ schoolId: sid, academicYearId: year!.id, name: `K${n}`, level: '7' })
        .returning();
      const [tch] = await platform.db
        .insert(teacher)
        .values({ schoolId: sid, name: `Guru ${n}` })
        .returning();
      const [item] = await platform.db
        .insert(schoolProfileItem)
        .values({ schoolId: sid, frameworkKey: 'profil_lulusan_2025', code: `p${n}`, label: `Butir ${n}` })
        .returning();
      const [prog] = await platform.db
        .insert(cocurricularProgram)
        .values({
          schoolId: sid,
          academicYearId: year!.id,
          form: 'other',
          title: `Program ${n}`,
          createdBy: 'uji',
        })
        .returning();
      await platform.db
        .insert(cocurricularProgramClass)
        .values({ schoolId: sid, programId: prog!.id, classId: cls!.id });
      await platform.db
        .insert(cocurricularProgramTarget)
        .values({ schoolId: sid, programId: prog!.id, profileItemId: item!.id });
      await platform.db
        .insert(cocurricularFacilitator)
        .values({ schoolId: sid, programId: prog!.id, teacherId: tch!.id, role: 'coordinator' });
      return { year: year!.id, cls: cls!.id, prog: prog!.id };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    try {
      const tables = [
        cocurricularProgram,
        cocurricularProgramClass,
        cocurricularProgramTarget,
        cocurricularFacilitator,
      ] as const;
      for (const t of tables) {
        const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(t));
        expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
        expect(await app.db.select().from(t)).toHaveLength(0);
      }
      // Tulis lintas sekolah ditolak RLS.
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.insert(cocurricularProgram).values({
            schoolId: schoolB,
            academicYearId: b.year,
            form: 'other',
            title: 'x',
            createdBy: 'uji',
          }),
        ),
      ).rejects.toThrow();
      // FK komposit: rombel sekolah B tidak boleh dipakai program sekolah A walau id valid.
      await expect(
        platform.db
          .insert(cocurricularProgramClass)
          .values({ schoolId: schoolA1, programId: a.prog, classId: b.cls }),
      ).rejects.toThrow();
      // Fasilitator tanpa rombel melanggar CHECK (hanya koordinator boleh class_id NULL).
      await expect(
        platform.db.execute(
          sql`insert into cocurricular_facilitator (school_id, program_id, teacher_id, role)
              select ${schoolA1}, ${a.prog}, id, 'facilitator' from teacher where school_id = ${schoolA1} limit 1`,
        ),
      ).rejects.toThrow();
      // Hapus program menyapu anaknya (ON DELETE CASCADE).
      await platform.db.delete(cocurricularProgram).where(eq(cocurricularProgram.id, a.prog));
      for (const t of [
        cocurricularProgramClass,
        cocurricularProgramTarget,
        cocurricularFacilitator,
      ] as const) {
        expect(await platform.db.select().from(t).where(eq(t.programId, a.prog))).toHaveLength(0);
      }
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(cocurricularFacilitator).where(eq(cocurricularFacilitator.schoolId, sid));
        await platform.db
          .delete(cocurricularProgramTarget)
          .where(eq(cocurricularProgramTarget.schoolId, sid));
        await platform.db.delete(cocurricularProgramClass).where(eq(cocurricularProgramClass.schoolId, sid));
        await platform.db.delete(cocurricularProgram).where(eq(cocurricularProgram.schoolId, sid));
        await platform.db.delete(schoolProfileItem).where(eq(schoolProfileItem.schoolId, sid));
        await platform.db.delete(classRoom).where(eq(classRoom.schoolId, sid));
        await platform.db.delete(teacher).where(eq(teacher.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant penilaian kokurikuler (tahap 4.3)', () => {
  it('penilaian dan bukti terisolasi; FK komposit dan CHECK menolak data tidak sah', async () => {
    const seed = async (sid: string, n: number) => {
      const [year] = await platform.db.select().from(academicYear).where(eq(academicYear.schoolId, sid));
      const [sem] = await platform.db
        .insert(semester)
        .values({
          schoolId: sid,
          academicYearId: year!.id,
          name: `S${n}`,
          startsOn: '2026-07-13',
          endsOn: '2026-12-20',
        })
        .returning();
      const [stu] = await platform.db
        .insert(student)
        .values({ schoolId: sid, name: `Murid ${n}`, gender: 'L' })
        .returning();
      const [item] = await platform.db
        .insert(schoolProfileItem)
        .values({ schoolId: sid, frameworkKey: 'profil_lulusan_2025', code: `q${n}`, label: `Butir ${n}` })
        .returning();
      const [level] = await platform.db
        .insert(cocurricularRubricLevel)
        .values({ schoolId: sid, code: `L${n}`, label: `Tingkat ${n}`, sort: 1 })
        .returning();
      const [prog] = await platform.db
        .insert(cocurricularProgram)
        .values({
          schoolId: sid,
          academicYearId: year!.id,
          form: 'other',
          title: `Program ${n}`,
          createdBy: 'uji',
        })
        .returning();
      await platform.db.insert(cocurricularAssessment).values({
        schoolId: sid,
        programId: prog!.id,
        profileItemId: item!.id,
        studentId: stu!.id,
        semesterId: sem!.id,
        rubricLevelId: level!.id,
        updatedBy: 'uji',
      });
      await platform.db.insert(cocurricularEvidence).values({
        schoolId: sid,
        programId: prog!.id,
        studentId: stu!.id,
        title: 'Foto',
        url: 'https://contoh.id/a',
        createdBy: 'uji',
      });
      return { prog: prog!.id, item: item!.id, stu: stu!.id, sem: sem!.id, level: level!.id };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    try {
      for (const t of [cocurricularAssessment, cocurricularEvidence] as const) {
        const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(t));
        expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
        expect(await app.db.select().from(t)).toHaveLength(0);
      }
      // Tulis lintas sekolah ditolak RLS.
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.insert(cocurricularEvidence).values({
            schoolId: schoolB,
            programId: b.prog,
            title: 'x',
            url: 'https://contoh.id/x',
            createdBy: 'uji',
          }),
        ),
      ).rejects.toThrow();
      // FK komposit: murid sekolah B tidak boleh dinilai pada program sekolah A walau id valid.
      await expect(
        platform.db.insert(cocurricularAssessment).values({
          schoolId: schoolA1,
          programId: a.prog,
          profileItemId: a.item,
          studentId: b.stu,
          semesterId: a.sem,
          rubricLevelId: a.level,
          updatedBy: 'uji',
        }),
      ).rejects.toThrow();
      // CHECK: tingkat atau catatan harus terisi; bukti hanya https.
      await expect(
        platform.db.insert(cocurricularAssessment).values({
          schoolId: schoolA1,
          programId: a.prog,
          profileItemId: a.item,
          studentId: a.stu,
          semesterId: a.sem,
          updatedBy: 'uji',
        }),
      ).rejects.toThrow();
      await expect(
        platform.db.insert(cocurricularEvidence).values({
          schoolId: schoolA1,
          programId: a.prog,
          title: 'x',
          url: 'http://contoh.id/x',
          createdBy: 'uji',
        }),
      ).rejects.toThrow();
      // Program yang sudah dinilai tidak terhapus (FK NO ACTION); tanpa penilaian, bukti ikut terhapus.
      await expect(
        platform.db.delete(cocurricularProgram).where(eq(cocurricularProgram.id, a.prog)),
      ).rejects.toThrow();
      await platform.db.delete(cocurricularAssessment).where(eq(cocurricularAssessment.programId, a.prog));
      await platform.db.delete(cocurricularProgram).where(eq(cocurricularProgram.id, a.prog));
      expect(
        await platform.db
          .select()
          .from(cocurricularEvidence)
          .where(eq(cocurricularEvidence.programId, a.prog)),
      ).toHaveLength(0);
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(cocurricularEvidence).where(eq(cocurricularEvidence.schoolId, sid));
        await platform.db.delete(cocurricularAssessment).where(eq(cocurricularAssessment.schoolId, sid));
        await platform.db.delete(cocurricularProgram).where(eq(cocurricularProgram.schoolId, sid));
        await platform.db.delete(cocurricularRubricLevel).where(eq(cocurricularRubricLevel.schoolId, sid));
        await platform.db.delete(schoolProfileItem).where(eq(schoolProfileItem.schoolId, sid));
        await platform.db.delete(student).where(eq(student.schoolId, sid));
        await platform.db.delete(semester).where(eq(semester.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant identitas madrasah (tahap 4.5)', () => {
  it('NSM terisolasi per sekolah, tulis lintas sekolah ditolak, CHECK 8-16 digit, unik lintas sekolah', async () => {
    const nsm = `${Date.now()}`.slice(-12).padStart(12, '1');
    await platform.db.insert(schoolIdentifier).values({ schoolId: schoolA1, nsm, updatedBy: 'uji' });
    await platform.db.insert(schoolIdentifier).values({ schoolId: schoolB, nsm: null, updatedBy: 'uji' });
    try {
      const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(schoolIdentifier));
      expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
      expect(await app.db.select().from(schoolIdentifier)).toHaveLength(0);
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.update(schoolIdentifier).set({ nsm: '99999999' }).where(eq(schoolIdentifier.schoolId, schoolB)),
        ),
      ).resolves.toBeDefined(); // RLS menyaring baris sekolah lain: tidak ada yang terubah
      expect(
        (await platform.db.select().from(schoolIdentifier).where(eq(schoolIdentifier.schoolId, schoolB)))[0]
          ?.nsm,
      ).toBeNull();
      // CHECK longgar: 7 dan 17 digit, atau huruf, ditolak; NULL boleh (banyak baris NULL tidak bentrok).
      for (const bad of ['1234567', '12345678901234567', '1234567a']) {
        await expect(
          platform.db
            .update(schoolIdentifier)
            .set({ nsm: bad })
            .where(eq(schoolIdentifier.schoolId, schoolB)),
        ).rejects.toThrow();
      }
      // Unik lintas sekolah.
      await expect(
        platform.db.update(schoolIdentifier).set({ nsm }).where(eq(schoolIdentifier.schoolId, schoolB)),
      ).rejects.toThrow();
    } finally {
      for (const sid of [schoolA1, schoolB])
        await platform.db.delete(schoolIdentifier).where(eq(schoolIdentifier.schoolId, sid));
    }
  });
});

describe('tabel tenant struktur keahlian SMK (tahap 5.1)', () => {
  it('bidang, program, konsentrasi, tautan, dan pengaturan terisolasi; FK komposit, unik, dan CASCADE tautan', async () => {
    const seed = async (sid: string, n: number) => {
      const [field] = await platform.db
        .insert(vocationalField)
        .values({ schoolId: sid, code: `B${n}`, name: `Bidang ${n}` })
        .returning();
      const [vp] = await platform.db
        .insert(vocationalProgram)
        .values({ schoolId: sid, fieldId: field!.id, code: `P${n}`, name: `Program ${n}` })
        .returning();
      const [conc] = await platform.db
        .insert(vocationalConcentration)
        .values({ schoolId: sid, vocationalProgramId: vp!.id, code: `K${n}`, name: `Konsentrasi ${n}` })
        .returning();
      const [prog] = await platform.db
        .insert(program)
        .values({ schoolId: sid, code: `J${n}`, name: `Jurusan ${n}` })
        .returning();
      await platform.db
        .insert(programConcentration)
        .values({ schoolId: sid, programId: prog!.id, concentrationId: conc!.id });
      await platform.db.insert(vocationalSetting).values({ schoolId: sid, updatedBy: 'uji' });
      return { field: field!.id, vp: vp!.id, conc: conc!.id, prog: prog!.id };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    try {
      const tables = [
        vocationalField,
        vocationalProgram,
        vocationalConcentration,
        programConcentration,
        vocationalSetting,
      ] as const;
      for (const t of tables) {
        const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(t));
        expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
        expect(await app.db.select().from(t)).toHaveLength(0);
      }
      // Tulis lintas sekolah ditolak RLS.
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.insert(vocationalField).values({ schoolId: schoolB, code: 'X', name: 'x' }),
        ),
      ).rejects.toThrow();
      // FK komposit: konsentrasi sekolah B tidak boleh ditautkan ke program sekolah A walau id valid.
      await expect(
        platform.db
          .insert(vocationalProgram)
          .values({ schoolId: schoolA1, fieldId: b.field, code: 'Y', name: 'y' }),
      ).rejects.toThrow();
      await expect(
        platform.db
          .update(programConcentration)
          .set({ concentrationId: b.conc })
          .where(eq(programConcentration.programId, a.prog)),
      ).rejects.toThrow();
      // Kode unik per sekolah; sekolah lain boleh memakai kode yang sama.
      await expect(
        platform.db.insert(vocationalField).values({ schoolId: schoolA1, code: 'B1', name: 'dobel' }),
      ).rejects.toThrow();
      await platform.db.insert(vocationalField).values({ schoolId: schoolB, code: 'B1', name: 'sama' });
      // Bidang yang masih punya program tidak bisa dihapus (NO ACTION).
      await expect(
        platform.db.delete(vocationalField).where(eq(vocationalField.id, a.field)),
      ).rejects.toThrow();
      // Hapus `program` menyapu tautannya (ON DELETE CASCADE).
      await platform.db.delete(program).where(eq(program.id, a.prog));
      expect(
        await platform.db
          .select()
          .from(programConcentration)
          .where(eq(programConcentration.programId, a.prog)),
      ).toHaveLength(0);
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(vocationalSetting).where(eq(vocationalSetting.schoolId, sid));
        await platform.db.delete(programConcentration).where(eq(programConcentration.schoolId, sid));
        await platform.db.delete(program).where(eq(program.schoolId, sid));
        await platform.db.delete(vocationalConcentration).where(eq(vocationalConcentration.schoolId, sid));
        await platform.db.delete(vocationalProgram).where(eq(vocationalProgram.schoolId, sid));
        await platform.db.delete(vocationalField).where(eq(vocationalField.schoolId, sid));
      }
    }
  });
});

describe('tautan PKL ke rapor (tahap 5.3, migrasi 0111)', () => {
  it('FK komposit semester dan mapel, CHECK tertaut penuh, nomor sertifikat unik per sekolah, CHECK bobot', async () => {
    const seed = async (sid: string, n: number) => {
      const [y] = await platform.db.select().from(academicYear).where(eq(academicYear.schoolId, sid));
      const [sem] = await platform.db
        .insert(semester)
        .values({
          schoolId: sid,
          academicYearId: y!.id,
          name: `Ganjil ${n}`,
          startsOn: '2026-07-13',
          endsOn: '2026-12-20',
        })
        .returning();
      const [sub] = await platform.db
        .insert(subject)
        .values({ schoolId: sid, code: `PKL${n}`, name: 'PKL', kind: 'internship' })
        .returning();
      const [stu] = await platform.db
        .insert(student)
        .values({ schoolId: sid, name: `Murid ${n}`, gender: 'L' })
        .returning();
      const [partner] = await platform.db
        .insert(pklPartner)
        .values({ schoolId: sid, name: `Mitra ${n}` })
        .returning();
      return { year: y!.id, sem: sem!.id, sub: sub!.id, stu: stu!.id, partner: partner!.id };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    const periodOf = (
      sid: string,
      year: string,
      name: string,
      extra: Partial<typeof pklPeriod.$inferInsert> = {},
    ) =>
      platform.db
        .insert(pklPeriod)
        .values({
          schoolId: sid,
          academicYearId: year,
          name,
          startsOn: '2026-09-01',
          endsOn: '2026-12-01',
          ...extra,
        })
        .returning();
    try {
      // Tanpa tautan (kedua NULL) sah; tertaut penuh sah.
      const [free] = await periodOf(schoolA1, a.year, 'bebas');
      expect(free).toMatchObject({ semesterId: null, subjectId: null });
      const [linked] = await periodOf(schoolA1, a.year, 'tertaut', { semesterId: a.sem, subjectId: a.sub });
      expect(linked).toMatchObject({ semesterId: a.sem, subjectId: a.sub });
      // Setengah tertaut ditolak CHECK.
      await expect(periodOf(schoolA1, a.year, 'setengah', { semesterId: a.sem })).rejects.toThrow();
      await expect(periodOf(schoolA1, a.year, 'setengah2', { subjectId: a.sub })).rejects.toThrow();
      // FK komposit: semester atau mapel sekolah lain ditolak walau id valid.
      await expect(
        periodOf(schoolA1, a.year, 'silang1', { semesterId: b.sem, subjectId: a.sub }),
      ).rejects.toThrow();
      await expect(
        periodOf(schoolA1, a.year, 'silang2', { semesterId: a.sem, subjectId: b.sub }),
      ).rejects.toThrow();
      // Isolasi: sekolah A hanya melihat periodenya.
      const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(pklPeriod));
      expect(rows.every((r) => r.schoolId === schoolA1)).toBe(true);
      // Nomor sertifikat unik per sekolah; sekolah lain boleh memakai nomor yang sama; NULL berganda sah.
      const [pb] = await periodOf(schoolB, b.year, 'periode b');
      const place = (
        sid: string,
        periodId: string,
        studentId: string,
        partnerId: string,
        no: string | null,
      ) =>
        platform.db
          .insert(pklPlacement)
          .values({ schoolId: sid, periodId, studentId, partnerId, certificateNo: no })
          .returning();
      await place(schoolA1, free!.id, a.stu, a.partner, 'NO-1');
      await expect(place(schoolA1, linked!.id, a.stu, a.partner, 'NO-1')).rejects.toThrow();
      await place(schoolA1, linked!.id, a.stu, a.partner, null);
      await place(schoolB, pb!.id, b.stu, b.partner, 'NO-1');
      // CHECK nomor kosong dan bobot (vocational_setting): keduanya NULL atau jumlah 100.
      await expect(
        platform.db.update(pklPlacement).set({ certificateNo: '' }).where(eq(pklPlacement.studentId, b.stu)),
      ).rejects.toThrow();
      await platform.db.insert(vocationalSetting).values({ schoolId: schoolA1, updatedBy: 'uji' });
      const setW = (w: number | null, i: number | null) =>
        platform.db
          .update(vocationalSetting)
          .set({ pklSchoolWeight: w, pklIndustryWeight: i })
          .where(eq(vocationalSetting.schoolId, schoolA1));
      await setW(70, 30);
      await setW(100, 0);
      await setW(null, null);
      await expect(setW(60, 30)).rejects.toThrow();
      await expect(setW(70, null)).rejects.toThrow();
      await expect(setW(110, -10)).rejects.toThrow();
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(vocationalSetting).where(eq(vocationalSetting.schoolId, sid));
        await platform.db.delete(pklPlacement).where(eq(pklPlacement.schoolId, sid));
        await platform.db.delete(pklPeriod).where(eq(pklPeriod.schoolId, sid));
        await platform.db.delete(pklPartner).where(eq(pklPartner.schoolId, sid));
        await platform.db.delete(student).where(eq(student.schoolId, sid));
        await platform.db.delete(subject).where(eq(subject.schoolId, sid));
        await platform.db.delete(semester).where(eq(semester.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant UKK (tahap 5.5, migrasi 0112)', () => {
  it('kegiatan, penguji, dan hasil terisolasi; FK komposit, CHECK, unik percobaan dan nomor, CASCADE penguji', async () => {
    const seed = async (sid: string, n: number) => {
      const [y] = await platform.db.select().from(academicYear).where(eq(academicYear.schoolId, sid));
      const [sem] = await platform.db
        .insert(semester)
        .values({
          schoolId: sid,
          academicYearId: y!.id,
          name: `Ganjil ${n}`,
          startsOn: '2026-07-13',
          endsOn: '2026-12-20',
        })
        .returning();
      const [field] = await platform.db
        .insert(vocationalField)
        .values({ schoolId: sid, code: `B${n}`, name: `Bidang ${n}` })
        .returning();
      const [vp] = await platform.db
        .insert(vocationalProgram)
        .values({ schoolId: sid, fieldId: field!.id, code: `P${n}`, name: `Program ${n}` })
        .returning();
      const [conc] = await platform.db
        .insert(vocationalConcentration)
        .values({ schoolId: sid, vocationalProgramId: vp!.id, code: `K${n}`, name: `Konsentrasi ${n}` })
        .returning();
      const [stu] = await platform.db
        .insert(student)
        .values({ schoolId: sid, name: `Murid ${n}`, gender: 'L' })
        .returning();
      const [tch] = await platform.db
        .insert(teacher)
        .values({ schoolId: sid, name: `Guru ${n}` })
        .returning();
      const [partner] = await platform.db
        .insert(pklPartner)
        .values({ schoolId: sid, name: `Mitra ${n}` })
        .returning();
      return { year: y!.id, sem: sem!.id, conc: conc!.id, stu: stu!.id, tch: tch!.id, partner: partner!.id };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    const eventOf = (
      sid: string,
      x: typeof a,
      title: string,
      extra: Partial<typeof ukkEvent.$inferInsert> = {},
    ) =>
      platform.db
        .insert(ukkEvent)
        .values({
          schoolId: sid,
          academicYearId: x.year,
          semesterId: x.sem,
          concentrationId: x.conc,
          pattern: 'lsp',
          title,
          createdBy: 'uji',
          ...extra,
        })
        .returning();
    const resultOf = (
      sid: string,
      eventId: string,
      studentId: string,
      extra: Partial<typeof ukkResult.$inferInsert> = {},
    ) =>
      platform.db
        .insert(ukkResult)
        .values({ schoolId: sid, eventId, studentId, updatedBy: 'uji', ...extra })
        .returning();
    const assessorOf = (eventId: string, extra: Partial<typeof ukkAssessor.$inferInsert>) =>
      platform.db
        .insert(ukkAssessor)
        .values({ schoolId: schoolA1, eventId, ...(extra as { kind: 'internal' | 'external' }) });
    try {
      const [ea] = await eventOf(schoolA1, a, 'UKK A', { partnerId: a.partner });
      const [eb] = await eventOf(schoolB, b, 'UKK B');
      expect(ea).toMatchObject({ status: 'draft', reportedToDinasAt: null, pushedToEraporAt: null });
      await assessorOf(ea!.id, { kind: 'internal', teacherId: a.tch });
      await assessorOf(ea!.id, { kind: 'external', name: 'Penguji LSP' });
      await resultOf(schoolA1, ea!.id, a.stu, {
        finalScore: 80,
        competent: true,
        certificateNo: 'UKK-1',
      });
      await resultOf(schoolB, eb!.id, b.stu);
      // Isolasi: aplikasi hanya melihat sekolahnya; tanpa konteks tidak melihat apa pun.
      for (const t of [ukkEvent, ukkAssessor, ukkResult] as const) {
        const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(t));
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.schoolId === schoolA1)).toBe(true);
        expect(await app.db.select().from(t)).toHaveLength(0);
      }
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.insert(ukkResult).values({
            schoolId: schoolB,
            eventId: eb!.id,
            studentId: b.stu,
            attemptNo: 2,
            updatedBy: 'uji',
          }),
        ),
      ).rejects.toThrow();
      // CHECK: pola, status, KKNI, tanggal, skor, percobaan, sertifikat hanya untuk yang kompeten, penguji internal wajib guru.
      await expect(eventOf(schoolA1, a, 'x', { pattern: 'lain' as never })).rejects.toThrow();
      await expect(eventOf(schoolA1, a, 'x', { status: 'lain' as never })).rejects.toThrow();
      await expect(eventOf(schoolA1, a, 'x', { kkniLevel: 4 })).rejects.toThrow();
      await expect(
        eventOf(schoolA1, a, 'x', { startsOn: '2026-12-02', endsOn: '2026-12-01' }),
      ).rejects.toThrow();
      await expect(resultOf(schoolA1, ea!.id, a.stu, { attemptNo: 6 })).rejects.toThrow();
      await expect(resultOf(schoolA1, ea!.id, a.stu, { attemptNo: 2, finalScore: 101 })).rejects.toThrow();
      await expect(
        resultOf(schoolA1, ea!.id, a.stu, { attemptNo: 2, competent: false, certificateNo: 'UKK-2' }),
      ).rejects.toThrow();
      await expect(assessorOf(ea!.id, { kind: 'internal' })).rejects.toThrow();
      // Unik: percobaan per (kegiatan, murid), nomor sertifikat per sekolah, penguji yang sama dua kali.
      await expect(resultOf(schoolA1, ea!.id, a.stu, { attemptNo: 1 })).rejects.toThrow();
      await resultOf(schoolB, eb!.id, b.stu, {
        attemptNo: 2,
        finalScore: 90,
        competent: true,
        certificateNo: 'UKK-1',
      });
      await expect(
        resultOf(schoolA1, ea!.id, a.stu, {
          attemptNo: 2,
          finalScore: 85,
          competent: true,
          certificateNo: 'UKK-1',
        }),
      ).rejects.toThrow();
      await expect(assessorOf(ea!.id, { kind: 'internal', teacherId: a.tch })).rejects.toThrow();
      await expect(assessorOf(ea!.id, { kind: 'external', name: 'Penguji LSP' })).rejects.toThrow();
      // FK komposit: semester, konsentrasi, mitra, murid, dan guru sekolah lain ditolak walau id valid.
      await expect(eventOf(schoolA1, a, 'silang1', { semesterId: b.sem })).rejects.toThrow();
      await expect(eventOf(schoolA1, a, 'silang2', { concentrationId: b.conc })).rejects.toThrow();
      await expect(eventOf(schoolA1, a, 'silang3', { partnerId: b.partner })).rejects.toThrow();
      await expect(resultOf(schoolA1, ea!.id, b.stu, { attemptNo: 3 })).rejects.toThrow();
      await expect(assessorOf(ea!.id, { kind: 'internal', teacherId: b.tch })).rejects.toThrow();
      // Bobot praktik:teori dan kolom pengaturan baru: keduanya NULL atau berjumlah 100.
      await platform.db.insert(vocationalSetting).values({ schoolId: schoolA1, updatedBy: 'uji' });
      const setW = (p: number | null, t: number | null) =>
        platform.db
          .update(vocationalSetting)
          .set({ ukkPracticeWeight: p, ukkTheoryWeight: t })
          .where(eq(vocationalSetting.schoolId, schoolA1));
      await setW(70, 30);
      await setW(null, null);
      await expect(setW(60, 30)).rejects.toThrow();
      await expect(setW(70, null)).rejects.toThrow();
      const [vs] = await platform.db
        .select()
        .from(vocationalSetting)
        .where(eq(vocationalSetting.schoolId, schoolA1));
      expect(vs).toMatchObject({ ukkBands: null, ukkInReport: false, ukkCertificatePattern: null });
      // Kegiatan yang punya hasil tidak bisa dihapus (NO ACTION); penguji ikut terhapus bersama kegiatan tanpa hasil.
      await expect(platform.db.delete(ukkEvent).where(eq(ukkEvent.id, ea!.id))).rejects.toThrow();
      const [free] = await eventOf(schoolA1, a, 'tanpa hasil');
      await assessorOf(free!.id, { kind: 'external', name: 'Eksternal' });
      await platform.db.delete(ukkEvent).where(eq(ukkEvent.id, free!.id));
      expect(
        await platform.db.select().from(ukkAssessor).where(eq(ukkAssessor.eventId, free!.id)),
      ).toHaveLength(0);
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(ukkResult).where(eq(ukkResult.schoolId, sid));
        await platform.db.delete(ukkAssessor).where(eq(ukkAssessor.schoolId, sid));
        await platform.db.delete(ukkEvent).where(eq(ukkEvent.schoolId, sid));
        await platform.db.delete(vocationalSetting).where(eq(vocationalSetting.schoolId, sid));
        await platform.db.delete(pklPartner).where(eq(pklPartner.schoolId, sid));
        await platform.db.delete(teacher).where(eq(teacher.schoolId, sid));
        await platform.db.delete(student).where(eq(student.schoolId, sid));
        await platform.db.delete(vocationalConcentration).where(eq(vocationalConcentration.schoolId, sid));
        await platform.db.delete(vocationalProgram).where(eq(vocationalProgram.schoolId, sid));
        await platform.db.delete(vocationalField).where(eq(vocationalField.schoolId, sid));
        await platform.db.delete(semester).where(eq(semester.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant pesan langsung (migrasi 0115)', () => {
  it('msg_batch dan msg_direct_template terisolasi; tulis lintas sekolah dan FK komposit ditolak', async () => {
    const batchOf = (sid: string, n: number) =>
      platform.db
        .insert(msgBatch)
        .values({
          schoolId: sid,
          kind: 'direct',
          title: `batch ${n}`,
          bodyTemplate: 'x',
          selection: {},
          recipientCount: 0,
          createdBy: 'uji',
        })
        .returning();
    const [a] = await batchOf(schoolA1, 1);
    const [b] = await batchOf(schoolB, 2);
    try {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db
          .insert(msgDirectTemplate)
          .values({ schoolId: sid, name: 'Panggilan', body: 'Halo' });
      }
      for (const t of [msgBatch, msgDirectTemplate] as const) {
        const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(t));
        expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
        expect(await app.db.select().from(t)).toHaveLength(0);
      }
      // Tulis lintas sekolah ditolak RLS.
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.insert(msgDirectTemplate).values({ schoolId: schoolB, name: 'Lain', body: 'x' }),
        ),
      ).rejects.toThrow();
      // Nama templat unik per sekolah.
      await expect(
        platform.db.insert(msgDirectTemplate).values({ schoolId: schoolA1, name: 'Panggilan', body: 'y' }),
      ).rejects.toThrow();
      // FK komposit: pesan sekolah A tidak boleh menunjuk batch sekolah B.
      await expect(
        platform.db.insert(msgMessage).values({
          schoolId: schoolA1,
          eventKey: 'direct',
          toPhone: '6281200000001',
          body: 'x',
          batchId: b!.id,
        }),
      ).rejects.toThrow();
      await platform.db.insert(msgMessage).values({
        schoolId: schoolA1,
        eventKey: 'direct',
        toPhone: '6281200000001',
        body: 'x',
        batchId: a!.id,
      });
      // Prioritas di luar 0..2 dan batas harian di luar 0..2000 ditolak CHECK.
      await expect(
        platform.db.insert(msgMessage).values({
          schoolId: schoolA1,
          eventKey: 'direct',
          toPhone: '6281200000002',
          body: 'x',
          priority: 3,
        }),
      ).rejects.toThrow();
      await expect(
        platform.db.execute(sql`insert into msg_setting (school_id, daily_limit) values (${schoolA1}, 2001)`),
      ).rejects.toThrow();
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(msgMessage).where(eq(msgMessage.schoolId, sid));
        await platform.db.delete(msgBatch).where(eq(msgBatch.schoolId, sid));
        await platform.db.delete(msgDirectTemplate).where(eq(msgDirectTemplate.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant lampiran pesan (migrasi 0116)', () => {
  it('msg_attachment terisolasi; tulis lintas sekolah, FK komposit batch, dan CHECK jenis/ukuran ditolak', async () => {
    const attach = (sid: string, over: Partial<typeof msgAttachment.$inferInsert> = {}) =>
      platform.db
        .insert(msgAttachment)
        .values({
          schoolId: sid,
          fileName: 'a.pdf',
          mime: 'application/pdf',
          size: 5,
          sha256: '0'.repeat(64),
          data: Buffer.from('%PDF-'),
          createdBy: 'uji',
          ...over,
        })
        .returning();
    const batchWith = (sid: string, attachmentId: string) =>
      platform.db.insert(msgBatch).values({
        schoolId: sid,
        kind: 'direct',
        title: 'b',
        bodyTemplate: 'x',
        selection: {},
        recipientCount: 0,
        createdBy: 'uji',
        attachmentId,
      });
    const [a] = await attach(schoolA1);
    const [b] = await attach(schoolB);
    try {
      const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(msgAttachment));
      expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
      expect(await app.db.select().from(msgAttachment)).toHaveLength(0);
      // Tulis lintas sekolah ditolak RLS.
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.insert(msgAttachment).values({
            schoolId: schoolB,
            fileName: 'x.pdf',
            mime: 'application/pdf',
            size: 1,
            sha256: '0'.repeat(64),
            data: Buffer.from('x'),
            createdBy: 'uji',
          }),
        ),
      ).rejects.toThrow();
      // FK komposit: batch sekolah A tidak boleh menunjuk lampiran sekolah B.
      await expect(batchWith(schoolA1, b!.id)).rejects.toThrow();
      await batchWith(schoolA1, a!.id);
      // CHECK: jenis di luar tiga jenis, ukuran > 2 MB.
      await expect(attach(schoolA1, { mime: 'text/html' as 'application/pdf' })).rejects.toThrow();
      await expect(attach(schoolA1, { size: 2 * 1024 * 1024 + 1 })).rejects.toThrow();
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(msgBatch).where(eq(msgBatch.schoolId, sid));
        await platform.db.delete(msgAttachment).where(eq(msgAttachment.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant siaran pengumuman (migrasi 0117)', () => {
  it('msg_opt_out terisolasi; PK per nomor, FK komposit wali/pengumuman, dan siaran unik per pengumuman', async () => {
    const guardianOf = async (sid: string) =>
      (
        await platform.db
          .insert(guardian)
          .values({ schoolId: sid, name: 'Wali Uji', phone: '081200000009' })
          .returning()
      )[0]!;
    const annOf = async (sid: string) =>
      (
        await platform.db
          .insert(announcement)
          .values({ schoolId: sid, title: 'T', body: 'b', createdBy: 'uji' })
          .returning()
      )[0]!;
    const batchOf = (sid: string, announcementId: string, kind: 'direct' | 'broadcast' = 'broadcast') =>
      platform.db.insert(msgBatch).values({
        schoolId: sid,
        kind,
        title: 'b',
        bodyTemplate: 'x',
        selection: {},
        recipientCount: 0,
        createdBy: 'uji',
        announcementId,
      });
    const gA = await guardianOf(schoolA1);
    const gB = await guardianOf(schoolB);
    const aA = await annOf(schoolA1);
    const aB = await annOf(schoolB);
    try {
      for (const [sid, g] of [
        [schoolA1, gA],
        [schoolB, gB],
      ] as const) {
        await platform.db
          .insert(msgOptOut)
          .values({ schoolId: sid, phone: '6281200000009', guardianId: g.id, createdBy: 'uji' });
      }
      const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(msgOptOut));
      expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
      expect(await app.db.select().from(msgOptOut)).toHaveLength(0);
      // Tulis lintas sekolah ditolak RLS; satu nomor satu baris per sekolah; sumber di luar staff/portal ditolak.
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.insert(msgOptOut).values({ schoolId: schoolB, phone: '6281200000010', createdBy: 'uji' }),
        ),
      ).rejects.toThrow();
      await expect(
        platform.db
          .insert(msgOptOut)
          .values({ schoolId: schoolA1, phone: '6281200000009', createdBy: 'uji' }),
      ).rejects.toThrow();
      await expect(
        platform.db
          .insert(msgOptOut)
          .values({ schoolId: schoolA1, phone: '6281200000011', source: 'sms' as 'staff', createdBy: 'uji' }),
      ).rejects.toThrow();
      // FK komposit: opt-out sekolah A tidak boleh merujuk wali sekolah B.
      await expect(
        platform.db
          .insert(msgOptOut)
          .values({ schoolId: schoolA1, phone: '6281200000012', guardianId: gB.id, createdBy: 'uji' }),
      ).rejects.toThrow();
      // FK komposit batch -> pengumuman, dan paling banyak satu siaran per pengumuman (pesan langsung tidak dibatasi).
      await expect(batchOf(schoolA1, aB.id)).rejects.toThrow();
      await batchOf(schoolA1, aA.id);
      await expect(batchOf(schoolA1, aA.id)).rejects.toThrow();
      await batchOf(schoolA1, aA.id, 'direct');
      // Hapus pengumuman: batch tetap, hanya announcement_id yang dikosongkan.
      await platform.db.delete(announcement).where(eq(announcement.id, aA.id));
      const left = await platform.db.select().from(msgBatch).where(eq(msgBatch.schoolId, schoolA1));
      expect(left.length).toBeGreaterThanOrEqual(2);
      expect(left.every((b) => b.announcementId === null)).toBe(true);
      // Hapus wali: opt-out tetap (kunci nomor), guardian_id dikosongkan.
      await platform.db.delete(guardian).where(eq(guardian.id, gA.id));
      const [kept] = await platform.db.select().from(msgOptOut).where(eq(msgOptOut.schoolId, schoolA1));
      expect(kept).toMatchObject({ phone: '6281200000009', guardianId: null });
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(msgBatch).where(eq(msgBatch.schoolId, sid));
        await platform.db.delete(msgOptOut).where(eq(msgOptOut.schoolId, sid));
        await platform.db.delete(announcement).where(eq(announcement.schoolId, sid));
        await platform.db.delete(guardian).where(eq(guardian.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant perencanaan pembelajaran (tahap 3.6.1, migrasi 0122)', () => {
  it('sakelar, perencanaan, dan relasi TP terisolasi; FK komposit, CHECK tautan, SET NULL guru, CASCADE', async () => {
    const seed = async (sid: string, n: number) => {
      const [year] = await platform.db.select().from(academicYear).where(eq(academicYear.schoolId, sid));
      const [subj] = await platform.db
        .insert(subject)
        .values({ schoolId: sid, code: `RP${n}`, name: `Mapel ${n}` })
        .returning();
      const [tch] = await platform.db
        .insert(teacher)
        .values({ schoolId: sid, name: `Guru ${n}` })
        .returning();
      const [cp] = await platform.db
        .insert(learningOutcome)
        .values({ schoolId: sid, subjectId: subj!.id, phase: 'D', description: 'CP' })
        .returning();
      const [tp] = await platform.db
        .insert(learningObjective)
        .values({ schoolId: sid, outcomeId: cp!.id, description: 'TP' })
        .returning();
      await platform.db.insert(learningPlanSetting).values({ schoolId: sid, planEnabled: true });
      const plan = (extra: Partial<typeof learningPlan.$inferInsert> = {}) => ({
        schoolId: sid,
        subjectId: subj!.id,
        academicYearId: year!.id,
        title: 'Rencana',
        goals: 'g',
        steps: 's',
        assessmentPlan: 'a',
        ...extra,
      });
      const [p] = await platform.db
        .insert(learningPlan)
        .values(plan({ teacherId: tch!.id }))
        .returning();
      await platform.db
        .insert(learningPlanObjective)
        .values({ schoolId: sid, planId: p!.id, objectiveId: tp!.id });
      return { year: year!.id, subj: subj!.id, tch: tch!.id, tp: tp!.id, plan: p!.id, make: plan };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    try {
      for (const t of [learningPlanSetting, learningPlan, learningPlanObjective] as const) {
        const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(t));
        expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
        expect(await app.db.select().from(t)).toHaveLength(0);
      }
      // Tulis lintas sekolah ditolak RLS.
      await expect(
        withTenant(app.db, [schoolA1], (tx) => tx.insert(learningPlan).values(b.make())),
      ).rejects.toThrow();
      await expect(
        withTenant(app.db, [schoolA1], (tx) => tx.insert(learningPlanSetting).values({ schoolId: schoolB })),
      ).rejects.toThrow();
      // FK komposit: mapel, tahun ajaran, guru, dan TP sekolah B tidak boleh dipakai perencanaan sekolah A walau id valid.
      await expect(
        platform.db.insert(learningPlan).values({ ...a.make(), subjectId: b.subj }),
      ).rejects.toThrow();
      await expect(
        platform.db.insert(learningPlan).values({ ...a.make(), academicYearId: b.year }),
      ).rejects.toThrow();
      await expect(
        platform.db.insert(learningPlan).values({ ...a.make(), teacherId: b.tch }),
      ).rejects.toThrow();
      await expect(
        platform.db
          .insert(learningPlanObjective)
          .values({ schoolId: schoolA1, planId: a.plan, objectiveId: b.tp }),
      ).rejects.toThrow();
      // CHECK: tautan hanya https, teks maksimal 8000, review_min 1..4.
      await expect(
        platform.db.insert(learningPlan).values(a.make({ linkUrl: 'http://x.example.com' })),
      ).rejects.toThrow();
      await expect(
        platform.db.insert(learningPlan).values(a.make({ goals: 'x'.repeat(8001) })),
      ).rejects.toThrow();
      await expect(
        platform.db
          .update(learningPlanSetting)
          .set({ reviewMinPerSemester: 5 })
          .where(eq(learningPlanSetting.schoolId, schoolA1)),
      ).rejects.toThrow();
      // Guru dihapus: perencanaan tetap, hanya teacher_id yang dikosongkan.
      await platform.db.delete(teacher).where(eq(teacher.id, a.tch));
      const [kept] = await platform.db.select().from(learningPlan).where(eq(learningPlan.id, a.plan));
      expect(kept).toMatchObject({ schoolId: schoolA1, teacherId: null });
      // Hapus perencanaan: relasi TP ikut terhapus; hapus tahun ajaran: perencanaan ikut terhapus.
      await platform.db.delete(learningPlan).where(eq(learningPlan.id, a.plan));
      expect(
        await platform.db
          .select()
          .from(learningPlanObjective)
          .where(eq(learningPlanObjective.schoolId, schoolA1)),
      ).toHaveLength(0);
      await platform.db.insert(learningPlan).values(a.make());
      await platform.db.delete(academicYear).where(eq(academicYear.id, a.year));
      expect(
        await platform.db.select().from(learningPlan).where(eq(learningPlan.schoolId, schoolA1)),
      ).toHaveLength(0);
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(learningPlanObjective).where(eq(learningPlanObjective.schoolId, sid));
        await platform.db.delete(learningPlan).where(eq(learningPlan.schoolId, sid));
        await platform.db.delete(learningPlanSetting).where(eq(learningPlanSetting.schoolId, sid));
        await platform.db.delete(learningObjective).where(eq(learningObjective.schoolId, sid));
        await platform.db.delete(learningOutcome).where(eq(learningOutcome.schoolId, sid));
        await platform.db.delete(teacher).where(eq(teacher.schoolId, sid));
        await platform.db.delete(subject).where(eq(subject.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant jurnal mengajar (tahap 3.6.2, migrasi 0123)', () => {
  it('jurnal dan relasi TP terisolasi; FK komposit, unik per sel+tanggal, SET NULL perencanaan, CASCADE sel', async () => {
    const seed = async (sid: string, n: number) => {
      const [year] = await platform.db
        .insert(academicYear)
        .values({ schoolId: sid, name: `Jurnal ${run}`, startsOn: '2026-07-13', endsOn: '2027-06-30' })
        .returning();
      const [subj] = await platform.db
        .insert(subject)
        .values({ schoolId: sid, code: `JR${n}`, name: `Mapel ${n}` })
        .returning();
      const [tch] = await platform.db
        .insert(teacher)
        .values({ schoolId: sid, name: `Guru ${n}` })
        .returning();
      const [cls] = await platform.db
        .insert(classRoom)
        .values({ schoolId: sid, academicYearId: year!.id, name: `7${n}`, level: '7' })
        .returning();
      const [per] = await platform.db
        .insert(lessonPeriod)
        .values({ schoolId: sid, number: 1, startsAt: '07:00', endsAt: '07:40' })
        .returning();
      const [ent] = await platform.db
        .insert(scheduleEntry)
        .values({
          schoolId: sid,
          academicYearId: year!.id,
          classId: cls!.id,
          subjectId: subj!.id,
          teacherId: tch!.id,
          weekday: 1,
          periodId: per!.id,
        })
        .returning();
      const [cp] = await platform.db
        .insert(learningOutcome)
        .values({ schoolId: sid, subjectId: subj!.id, phase: 'D', description: 'CP' })
        .returning();
      const [tp] = await platform.db
        .insert(learningObjective)
        .values({ schoolId: sid, outcomeId: cp!.id, description: 'TP' })
        .returning();
      const [pl] = await platform.db
        .insert(learningPlan)
        .values({
          schoolId: sid,
          subjectId: subj!.id,
          academicYearId: year!.id,
          title: 'Rencana',
          goals: 'g',
          steps: 's',
          assessmentPlan: 'a',
        })
        .returning();
      const journal = (extra: Partial<typeof lessonJournal.$inferInsert> = {}) => ({
        schoolId: sid,
        scheduleEntryId: ent!.id,
        date: '2026-10-12',
        topic: 'Materi',
        recordedBy: 'uji',
        ...extra,
      });
      const [j] = await platform.db
        .insert(lessonJournal)
        .values(journal({ planId: pl!.id }))
        .returning();
      await platform.db
        .insert(lessonJournalObjective)
        .values({ schoolId: sid, journalId: j!.id, objectiveId: tp!.id });
      return { ent: ent!.id, tch: tch!.id, tp: tp!.id, plan: pl!.id, j: j!.id, make: journal };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    try {
      for (const t of [lessonJournal, lessonJournalObjective] as const) {
        const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(t));
        expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
        expect(await app.db.select().from(t)).toHaveLength(0);
      }
      // Tulis lintas sekolah ditolak RLS.
      await expect(
        withTenant(app.db, [schoolA1], (tx) =>
          tx.insert(lessonJournal).values(b.make({ date: '2026-10-19' })),
        ),
      ).rejects.toThrow();
      // FK komposit: sel, perencanaan, guru pengganti, dan TP sekolah B tidak boleh dipakai jurnal sekolah A walau id valid.
      await expect(
        platform.db.insert(lessonJournal).values(a.make({ date: '2026-10-19', scheduleEntryId: b.ent })),
      ).rejects.toThrow();
      await expect(
        platform.db.insert(lessonJournal).values(a.make({ date: '2026-10-19', planId: b.plan })),
      ).rejects.toThrow();
      await expect(
        platform.db.insert(lessonJournal).values(a.make({ date: '2026-10-19', actualTeacherId: b.tch })),
      ).rejects.toThrow();
      await expect(
        platform.db
          .insert(lessonJournalObjective)
          .values({ schoolId: schoolA1, journalId: a.j, objectiveId: b.tp }),
      ).rejects.toThrow();
      // Unik per (sel, tanggal); CHECK topik kosong/terlalu panjang.
      await expect(platform.db.insert(lessonJournal).values(a.make())).rejects.toThrow();
      await expect(
        platform.db.insert(lessonJournal).values(a.make({ date: '2026-10-19', topic: '' })),
      ).rejects.toThrow();
      await expect(
        platform.db.insert(lessonJournal).values(a.make({ date: '2026-10-19', topic: 'x'.repeat(201) })),
      ).rejects.toThrow();
      // Perencanaan dihapus: jurnal tetap, hanya plan_id yang dikosongkan.
      await platform.db.delete(learningPlan).where(eq(learningPlan.id, a.plan));
      const [kept] = await platform.db.select().from(lessonJournal).where(eq(lessonJournal.id, a.j));
      expect(kept).toMatchObject({ schoolId: schoolA1, planId: null });
      // Sel jadwal dihapus: jurnal dan relasi TP ikut terhapus.
      await platform.db.delete(scheduleEntry).where(eq(scheduleEntry.id, a.ent));
      expect(
        await platform.db.select().from(lessonJournal).where(eq(lessonJournal.schoolId, schoolA1)),
      ).toHaveLength(0);
      expect(
        await platform.db
          .select()
          .from(lessonJournalObjective)
          .where(eq(lessonJournalObjective.schoolId, schoolA1)),
      ).toHaveLength(0);
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(lessonJournalObjective).where(eq(lessonJournalObjective.schoolId, sid));
        await platform.db.delete(lessonJournal).where(eq(lessonJournal.schoolId, sid));
        await platform.db.delete(learningPlan).where(eq(learningPlan.schoolId, sid));
        await platform.db.delete(scheduleEntry).where(eq(scheduleEntry.schoolId, sid));
        await platform.db.delete(lessonPeriod).where(eq(lessonPeriod.schoolId, sid));
        await platform.db.delete(learningObjective).where(eq(learningObjective.schoolId, sid));
        await platform.db.delete(learningOutcome).where(eq(learningOutcome.schoolId, sid));
        await platform.db.delete(classRoom).where(eq(classRoom.schoolId, sid));
        await platform.db.delete(teacher).where(eq(teacher.schoolId, sid));
        await platform.db.delete(subject).where(eq(subject.schoolId, sid));
        await platform.db.delete(academicYear).where(eq(academicYear.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant penilaian proses pembelajaran (tahap 3.6.3, migrasi 0124)', () => {
  it('tinjauan terisolasi; FK komposit, CHECK, CASCADE guru yang ditinjau, SET NULL guru penilai', async () => {
    const seed = async (sid: string, n: number) => {
      const [year] = await platform.db
        .insert(academicYear)
        .values({ schoolId: sid, name: `Tinjau ${run}`, startsOn: '2026-07-13', endsOn: '2027-06-30' })
        .returning();
      const [sem] = await platform.db
        .insert(semester)
        .values({
          schoolId: sid,
          academicYearId: year!.id,
          name: 'Ganjil',
          startsOn: '2026-07-13',
          endsOn: '2026-12-20',
        })
        .returning();
      const [tch] = await platform.db
        .insert(teacher)
        .values({ schoolId: sid, name: `Guru ${n}` })
        .returning();
      const [peer] = await platform.db
        .insert(teacher)
        .values({ schoolId: sid, name: `Sejawat ${n}` })
        .returning();
      const review = (extra: Partial<typeof learningProcessReview.$inferInsert> = {}) => ({
        schoolId: sid,
        semesterId: sem!.id,
        teacherId: tch!.id,
        reviewerKind: 'peer' as const,
        reviewerTeacherId: peer!.id,
        reviewedOn: '2026-10-12',
        ratings: { planning: 3 },
        recordedBy: 'uji',
        ...extra,
      });
      const [r] = await platform.db.insert(learningProcessReview).values(review()).returning();
      return { sem: sem!.id, tch: tch!.id, peer: peer!.id, r: r!.id, make: review };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    try {
      const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(learningProcessReview));
      expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
      expect(rows[0]?.sharedWithTeacher).toBe(false);
      expect(await app.db.select().from(learningProcessReview)).toHaveLength(0);
      // Tulis lintas sekolah ditolak RLS.
      await expect(
        withTenant(app.db, [schoolA1], (tx) => tx.insert(learningProcessReview).values(b.make())),
      ).rejects.toThrow();
      // FK komposit: semester, guru, dan guru penilai sekolah B tidak boleh dipakai walau id valid.
      for (const extra of [{ semesterId: b.sem }, { teacherId: b.tch }, { reviewerTeacherId: b.peer }]) {
        await expect(platform.db.insert(learningProcessReview).values(a.make(extra))).rejects.toThrow();
      }
      // CHECK: jenis penilai tidak dikenal, jumlah responden nol, catatan terlalu panjang.
      for (const extra of [
        { reviewerKind: 'parent' as never },
        { respondentCount: 0 },
        { note: 'x'.repeat(2001) },
      ]) {
        await expect(platform.db.insert(learningProcessReview).values(a.make(extra))).rejects.toThrow();
      }
      // Guru penilai dihapus: tinjauan tetap, penilai dikosongkan.
      await platform.db.delete(teacher).where(eq(teacher.id, a.peer));
      const [kept] = await platform.db
        .select()
        .from(learningProcessReview)
        .where(eq(learningProcessReview.id, a.r));
      expect(kept).toMatchObject({ schoolId: schoolA1, reviewerTeacherId: null });
      // Guru yang ditinjau dihapus: tinjauan ikut terhapus.
      await platform.db.delete(teacher).where(eq(teacher.id, a.tch));
      expect(
        await platform.db
          .select()
          .from(learningProcessReview)
          .where(eq(learningProcessReview.schoolId, schoolA1)),
      ).toHaveLength(0);
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(learningProcessReview).where(eq(learningProcessReview.schoolId, sid));
        await platform.db.delete(teacher).where(eq(teacher.schoolId, sid));
        await platform.db.delete(semester).where(eq(semester.schoolId, sid));
        await platform.db.delete(academicYear).where(eq(academicYear.schoolId, sid));
      }
    }
  });
});

describe('tabel tenant nomor peserta ujian (migrasi 0125)', () => {
  it('nomor terisolasi; FK komposit, unik, CHECK, CASCADE murid, SET NULL kelas; kolom format pada jenis ujian', async () => {
    const seed = async (sid: string, n: number) => {
      const [year] = await platform.db
        .insert(academicYear)
        .values({ schoolId: sid, name: `Nomor ${run}`, startsOn: '2026-07-13', endsOn: '2027-06-30' })
        .returning();
      const [sem] = await platform.db
        .insert(semester)
        .values({
          schoolId: sid,
          academicYearId: year!.id,
          name: 'Ganjil',
          startsOn: '2026-07-13',
          endsOn: '2026-12-20',
        })
        .returning();
      const [type] = await platform.db
        .insert(examType)
        .values({ schoolId: sid, name: `Jenis ${n}`, shortName: 'ASTS' })
        .returning();
      const [cls] = await platform.db
        .insert(classRoom)
        .values({ schoolId: sid, academicYearId: year!.id, name: `7${n}`, level: '7' })
        .returning();
      const [stu] = await platform.db
        .insert(student)
        .values({ schoolId: sid, name: `Murid ${n}`, gender: 'L' })
        .returning();
      const [stu2] = await platform.db
        .insert(student)
        .values({ schoolId: sid, name: `Murid dua ${n}`, gender: 'L' })
        .returning();
      const row = (extra: Partial<typeof examParticipantNumber.$inferInsert> = {}) => ({
        schoolId: sid,
        semesterId: sem!.id,
        examTypeId: type!.id,
        studentId: stu!.id,
        classId: cls!.id,
        seq: 1,
        number: 'ASTS-26-001',
        ...extra,
      });
      const [r] = await platform.db.insert(examParticipantNumber).values(row()).returning();
      return { sem: sem!.id, type: type!, cls: cls!.id, stu: stu!.id, stu2: stu2!.id, r: r!.id, make: row };
    };
    const a = await seed(schoolA1, 1);
    const b = await seed(schoolB, 2);
    try {
      expect(a.type).toMatchObject({
        participantNoFormat: null,
        participantNoSeqScope: 'class',
        participantNoSeqStart: 1,
      });
      const rows = await withTenant(app.db, [schoolA1], (tx) => tx.select().from(examParticipantNumber));
      expect(rows.map((r) => r.schoolId)).toEqual([schoolA1]);
      expect(await app.db.select().from(examParticipantNumber)).toHaveLength(0);
      await expect(
        withTenant(app.db, [schoolA1], (tx) => tx.insert(examParticipantNumber).values(b.make())),
      ).rejects.toThrow();
      // FK komposit: semester, jenis ujian, murid, dan kelas sekolah B tidak boleh dipakai.
      for (const extra of [
        { semesterId: b.sem },
        { examTypeId: b.type.id },
        { studentId: b.stu },
        { classId: b.cls },
      ]) {
        await expect(
          platform.db
            .insert(examParticipantNumber)
            .values(a.make({ studentId: a.stu2, number: 'X', ...extra })),
        ).rejects.toThrow();
      }
      // Unik: murid yang sama, nomor yang sama; CHECK: seq nol, nomor kosong.
      await expect(
        platform.db.insert(examParticipantNumber).values(a.make({ number: 'LAIN' })),
      ).rejects.toThrow();
      await expect(
        platform.db.insert(examParticipantNumber).values(a.make({ studentId: a.stu2 })),
      ).rejects.toThrow();
      for (const extra of [{ seq: 0 }, { number: '' }]) {
        await expect(
          platform.db.insert(examParticipantNumber).values(a.make({ studentId: a.stu2, ...extra })),
        ).rejects.toThrow();
      }
      // CHECK pada jenis ujian: lingkup tak dikenal, angka mulai nol, format kepanjangan.
      for (const set of [
        { participantNoSeqScope: 'room' as never },
        { participantNoSeqStart: 0 },
        { participantNoFormat: 'x'.repeat(41) },
      ]) {
        await expect(
          platform.db.update(examType).set(set).where(eq(examType.id, a.type.id)),
        ).rejects.toThrow();
      }
      // Kelas dihapus: nomor tetap, snapshot kelas dikosongkan.
      await platform.db.delete(classRoom).where(eq(classRoom.id, a.cls));
      const [kept] = await platform.db
        .select()
        .from(examParticipantNumber)
        .where(eq(examParticipantNumber.id, a.r));
      expect(kept).toMatchObject({ schoolId: schoolA1, classId: null, number: 'ASTS-26-001' });
      // Murid dihapus: nomor ikut terhapus.
      await platform.db.delete(student).where(eq(student.id, a.stu));
      expect(
        await platform.db
          .select()
          .from(examParticipantNumber)
          .where(eq(examParticipantNumber.schoolId, schoolA1)),
      ).toHaveLength(0);
    } finally {
      for (const sid of [schoolA1, schoolB]) {
        await platform.db.delete(examParticipantNumber).where(eq(examParticipantNumber.schoolId, sid));
        await platform.db.delete(enrollment).where(eq(enrollment.schoolId, sid));
        await platform.db.delete(student).where(eq(student.schoolId, sid));
        await platform.db.delete(examType).where(eq(examType.schoolId, sid));
        await platform.db.delete(classRoom).where(eq(classRoom.schoolId, sid));
        await platform.db.delete(semester).where(eq(semester.schoolId, sid));
        await platform.db.delete(academicYear).where(eq(academicYear.schoolId, sid));
      }
    }
  });
});
