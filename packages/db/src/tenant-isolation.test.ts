import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  classRoom,
  cocurricularAssessment,
  cocurricularEvidence,
  cocurricularFacilitator,
  cocurricularProgram,
  cocurricularProgramClass,
  cocurricularProgramTarget,
  cocurricularRubricLevel,
  createDb,
  foundation,
  program,
  programConcentration,
  school,
  schoolIdentifier,
  schoolProfileItem,
  semester,
  student,
  teacher,
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
