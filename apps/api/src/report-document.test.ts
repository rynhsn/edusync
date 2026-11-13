import { type ReportDocumentV2, reportDocumentSchema, reportDocumentV2Schema } from '@edusync/contracts';
import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  guardian,
  member,
  reportCard,
  school,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentGuardian,
  subject,
  subscription,
  user,
} from '@edusync/db';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Klaim R4 (docs/rancangan-fase-3-asesmen-rapor.md): serializer respons Fastify + zod membuang kunci yang tidak dideklarasikan
 * pada skema respons, jadi bagian dokumen rapor v2 yang tidak ditambahkan ke skema bersama hilang diam-diam dari API.
 * Tes ini membuktikan perilaku sebenarnya (bukan asumsi), baik pada serializer sendirian maupun pada kedua rute sungguhan
 * (`GET /v1/report-cards/:studentId` dan portal), supaya tahap 3.2 memperbarui skema di satu tempat dan tes ini menjaganya.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

const doc = {
  status: 'final' as const,
  school: { name: 'Sekolah Uji', address: null, city: null },
  semester: { id: '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', name: 'Ganjil', academicYear: '2026/2027' },
  student: {
    id: '019bbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb',
    name: 'Ani',
    nis: null,
    nisn: null,
    className: '7A',
    level: '7',
  },
  subjects: [
    {
      subjectId: '019ccccc-cccc-7ccc-8ccc-cccccccccccc',
      name: 'Matematika',
      kkm: 75,
      final: 86,
      predicate: 'B' as const,
      description: 'Baik.',
      belowKkm: false,
    },
  ],
  extracurriculars: [],
  attendance: { sick: 0, excused: 0, absent: 0, late: 0 },
  homeroomNote: null,
  homeroomTeacher: null,
  principal: null,
  rank: null,
  generatedAt: '2026-11-13T00:00:00.000Z',
};

/** Bagian v2 yang sah, ditulis jarang: yang tidak dipakai tidak hadir. */
const v2Doc: ReportDocumentV2 = {
  ...doc,
  reportMode: 'descriptive',
  cocurricularNote: 'Aktif dalam kegiatan kebersihan.',
  developmentNote: 'Mulai percaya diri.',
  subjects: [
    {
      ...doc.subjects[0]!,
      descriptionSource: 'objectives',
      objectives: {
        assessed: 2,
        achieved: 1,
        high: [{ id: '019ddddd-dddd-7ddd-8ddd-dddddddddddd', code: '7.1', text: 'Menghitung pecahan' }],
        low: [],
      },
    },
  ],
};

describe('serializer respons Fastify + zod (klaim R4)', () => {
  async function respond(
    schema: typeof reportDocumentSchema | typeof reportDocumentV2Schema,
    payload: object,
  ) {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app
      .withTypeProvider<ZodTypeProvider>()
      .get('/doc', { schema: { response: { 200: schema } } }, async () => payload as never);
    const res = await app.inject({ method: 'GET', url: '/doc' });
    await app.close();
    expect(res.statusCode).toBe(200);
    return res.json() as Record<string, unknown>;
  }

  it('skema v1 MEMBUANG kunci yang tidak dideklarasikan, di tingkat dokumen dan di dalam mapel', async () => {
    const out = await respond(reportDocumentSchema, {
      ...v2Doc,
      subjects: [{ ...v2Doc.subjects[0]!, kunciBaruMapel: 1 }],
      kunciBaru: 'x',
    });
    expect(out.kunciBaru).toBeUndefined();
    expect(out.reportMode).toBeUndefined();
    expect(out.cocurricularNote).toBeUndefined();
    expect(out.developmentNote).toBeUndefined();
    const subj = (out.subjects as Record<string, unknown>[])[0]!;
    expect(subj.kunciBaruMapel).toBeUndefined();
    expect(subj.descriptionSource).toBeUndefined();
    expect(subj.objectives).toBeUndefined();
    // Bentuk v1 utuh.
    expect(out).toEqual(doc);
  });

  it('skema v2 mempertahankan seluruh bagian v2 yang sah dan tetap membuang kunci tak dikenal', async () => {
    const out = await respond(reportDocumentV2Schema, {
      ...v2Doc,
      kunciBaru: 'x',
      subjects: [{ ...v2Doc.subjects[0]!, kunciBaruMapel: 1 }],
    });
    expect(out.kunciBaru).toBeUndefined();
    expect((out.subjects as Record<string, unknown>[])[0]!.kunciBaruMapel).toBeUndefined();
    const { subjects: outSubjects, ...rest } = out;
    const { subjects: v2Subjects, ...v2Rest } = v2Doc;
    expect(rest).toEqual(v2Rest);
    expect(outSubjects).toEqual(v2Subjects);
  });

  it('dokumen v1 melewati skema v2 tanpa ditambah satu kunci pun (sparse)', async () => {
    expect(await respond(reportDocumentV2Schema, doc)).toEqual(doc);
    expect(reportDocumentV2Schema.parse(doc)).toEqual(doc);
  });
});

describe('rute sungguhan membuang kunci snapshot yang tidak ada di skema respons', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let foundationId = '';
  let schoolId = '';
  let adminCookie = '';
  let guardianCookie = '';
  const userIds: string[] = [];
  const ids = { sem: '', cls: '', ani: '' };

  const call = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: {
        cookie,
        'x-school-id': schoolId,
        origin,
        ...(payload ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload ? { payload } : {}),
    });
  const login = async (email: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin, 'content-type': 'application/json' },
      payload: { email, password },
    });
    return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  };

  beforeAll(async () => {
    app = await buildApp(
      loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
    );
    await app.ready();
    const db = app.platformDb;
    const [f] = await db
      .insert(foundation)
      .values({ name: 'Yayasan Dokumen', slug: `yrd-${run}` })
      .returning();
    foundationId = f!.id;
    const [sub] = await db
      .insert(subscription)
      .values({
        foundationId,
        period: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      })
      .returning();
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `rd-${run}`, name: 'Sekolah Dokumen' })
      .returning();
    schoolId = s!.id;
    await seedSchoolRoles(db, schoolId);
    for (const moduleKey of ['grades', 'parent_portal']) {
      await db
        .insert(entitlement)
        .values({ schoolId, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    const adminEmail = `admin-${run}@example.test`;
    const adminUser = await app.auth.api.signUpEmail({
      body: { name: 'admin', email: adminEmail, password },
    });
    userIds.push(adminUser.user.id);
    const [m] = await db.insert(member).values({ userId: adminUser.user.id, schoolId }).returning();
    await assignRoles(db, m!.id, schoolId, ['school_admin']);
    adminCookie = await login(adminEmail);

    const [year] = await db
      .insert(academicYear)
      .values({ schoolId, name: '2000-2099', startsOn: '2000-01-01', endsOn: '2099-12-31', isActive: true })
      .returning();
    const [sem] = await db
      .insert(semester)
      .values({
        schoolId,
        academicYearId: year!.id,
        name: 'Ganjil',
        startsOn: '2026-07-01',
        endsOn: '2026-12-31',
        isActive: true,
      })
      .returning();
    ids.sem = sem!.id;
    const [cls] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: year!.id, name: '7A', level: '7' })
      .returning();
    ids.cls = cls!.id;
    const [mat] = await db.insert(subject).values({ schoolId, code: 'MAT', name: 'Matematika' }).returning();
    const [ani] = await db
      .insert(student)
      .values({ schoolId, name: 'Ani', nis: 'D1', gender: 'P', status: 'active' })
      .returning();
    ids.ani = ani!.id;
    await db
      .insert(enrollment)
      .values({ schoolId, studentId: ids.ani, classId: ids.cls, academicYearId: year!.id });
    const [comp] = await db
      .insert(gradeComponent)
      .values({ schoolId, name: 'Ulangan', weight: 100, sort: 0 })
      .returning();
    const [asm] = await db
      .insert(assessment)
      .values({
        schoolId,
        semesterId: ids.sem,
        classId: ids.cls,
        subjectId: mat!.id,
        componentId: comp!.id,
        title: 'UH 1',
        date: '2026-08-01',
      })
      .returning();
    await db
      .insert(score)
      .values({ schoolId, assessmentId: asm!.id, studentId: ids.ani, value: 86, updatedBy: 'uji' });
    const [g] = await db.insert(guardian).values({ schoolId, name: 'Ibu Ani' }).returning();
    await db
      .insert(studentGuardian)
      .values({ schoolId, studentId: ids.ani, guardianId: g!.id, relation: 'mother', isPrimary: true });

    const fin = await call('POST', '/v1/report-cards/finalize', adminCookie, {
      semesterId: ids.sem,
      classId: ids.cls,
    });
    expect(fin.statusCode).toBe(200);

    const invite = await call('POST', '/v1/portal/invites', adminCookie, {
      kind: 'guardian',
      guardianId: g!.id,
    });
    expect(invite.statusCode).toBe(201);
    const guardianEmail = `wali-${run}@example.test`;
    const accepted = await app.inject({
      method: 'POST',
      url: `/v1/public/portal-invites/${(invite.json() as { token: string }).token}/accept`,
      payload: { name: 'Ibu Ani', email: guardianEmail, password },
    });
    expect(accepted.statusCode).toBe(201);
    const [gu] = await db.select({ id: user.id }).from(user).where(eq(user.email, guardianEmail));
    userIds.push(gu!.id);
    guardianCookie = await login(guardianEmail);
  }, 120_000);

  afterAll(async () => {
    const db = app.platformDb;
    for (const table of [
      'audit_log',
      'portal_link',
      'portal_invite',
      'report_card_snapshot',
      'report_card',
      'report_setting',
      'semester_grading_config',
      'score',
      'assessment',
      'grade_component',
      'student_guardian',
      'guardian',
      'enrollment',
      'class_room',
      'subject',
      'student',
      'semester',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${schoolId}`);
    }
    await db.delete(school).where(eq(school.id, schoolId));
    await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
    await db.delete(foundation).where(eq(foundation.id, foundationId));
    for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
    await app.close();
  });

  const staffUrl = () => `/v1/report-cards/${ids.ani}?semesterId=${ids.sem}`;
  const portalUrl = () => `/v1/portal/children/${ids.ani}/report-cards/${ids.sem}`;

  it('snapshot v1 asli: kedua rute mengembalikan semua kunci v1 dan hanya itu', async () => {
    const [row] = await app.platformDb.select().from(reportCard).where(eq(reportCard.studentId, ids.ani));
    const snapshot = row!.snapshot as Record<string, unknown>;
    expect(Object.keys(snapshot).sort()).toEqual(Object.keys(doc).sort());
    expect(row!.schemaVersion).toBe(1);
    const staff = await call('GET', staffUrl(), adminCookie);
    const portal = await call('GET', portalUrl(), guardianCookie);
    expect(staff.statusCode).toBe(200);
    expect(portal.statusCode).toBe(200);
    expect(staff.json()).toEqual(snapshot);
    expect(portal.json()).toEqual(snapshot);
    expect(reportDocumentSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('kunci uji ditambahkan ke snapshot: kunci v2 bertahan di rute staf dan portal, kunci tak dikenal dibuang', async () => {
    const [row] = await app.platformDb.select().from(reportCard).where(eq(reportCard.studentId, ids.ani));
    const original = row!.snapshot as { subjects: Record<string, unknown>[] } & Record<string, unknown>;
    const tampered = {
      ...original,
      cocurricularNote: 'Kunci uji tingkat dokumen',
      kunciUji: { a: 1 },
      subjects: original.subjects.map((s) => ({ ...s, descriptionSource: 'manual', kunciUjiMapel: true })),
    };
    await app.platformDb
      .update(reportCard)
      .set({ snapshot: tampered })
      .where(eq(reportCard.studentId, ids.ani));
    try {
      const [raw] = await app.platformDb
        .select({ snapshot: reportCard.snapshot })
        .from(reportCard)
        .where(eq(reportCard.studentId, ids.ani));
      expect(raw!.snapshot).toMatchObject({
        cocurricularNote: 'Kunci uji tingkat dokumen',
        kunciUji: { a: 1 },
      });

      const staff = (await call('GET', staffUrl(), adminCookie)).json();
      const portal = (await call('GET', portalUrl(), guardianCookie)).json();
      for (const body of [staff, portal]) {
        // Sejak tahap 3.2 rute memakai skema yang mendeklarasikan bagian v2: kunci v2 BERTAHAN, kunci yang tidak
        // dideklarasikan tetap dibuang diam-diam oleh serializer.
        expect(body.cocurricularNote).toBe('Kunci uji tingkat dokumen');
        expect(body.subjects[0].descriptionSource).toBe('manual');
        expect(body.kunciUji).toBeUndefined();
        expect(body.subjects[0].kunciUjiMapel).toBeUndefined();
        expect(body).toEqual({
          ...original,
          cocurricularNote: 'Kunci uji tingkat dokumen',
          subjects: original.subjects.map((s) => ({ ...s, descriptionSource: 'manual' })),
        });
      }
    } finally {
      await app.platformDb
        .update(reportCard)
        .set({ snapshot: original })
        .where(eq(reportCard.studentId, ids.ani));
    }
  });
});
