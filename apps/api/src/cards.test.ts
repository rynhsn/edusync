import {
  academicYear,
  assignRoles,
  attendanceCard,
  classRoom,
  enrollment,
  entitlement,
  eq,
  exam,
  examType,
  foundation,
  member,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
  subject,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
// PNG 1x1 valid.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolA = '';
let schoolB = '';
let adminA = '';
let adminB = '';
let teacherA = '';
let guardianA = '';
let classId = '';
let semesterId = '';
let examId = '';
const studentIds: Record<string, string> = {};
const userIds: string[] = [];
let ip = 0;

async function join(label: string, roles: string[], schoolId: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  schoolId = schoolA,
) => {
  ip++;
  return app.inject({
    method,
    url,
    remoteAddress: `10.9.${(ip >> 8) & 255}.${(ip & 255) + 1}`,
    headers: {
      cookie,
      'x-school-id': schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });
};

const layout = (extra: object[] = []) => ({
  widthMm: 86,
  heightMm: 54,
  elements: [{ type: 'field', field: 'name', x: 4, y: 4, w: 50, h: 6 }, ...extra],
});
const tpl = (name: string, kind: 'student' | 'exam' = 'student', extra: object = {}) => ({
  kind,
  name,
  layout: layout(),
  ...extra,
});

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Kartu', slug: `ykr-${run}` })
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
  const mk = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    await db.insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'exams',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    return s!.id;
  };
  schoolA = await mk(`kartu-a-${run}`);
  schoolB = await mk(`kartu-b-${run}`);
  adminA = await join('admin-kartu-a', ['school_admin'], schoolA);
  adminB = await join('admin-kartu-b', ['school_admin'], schoolB);
  teacherA = await join('guru-kartu', ['teacher'], schoolA);
  guardianA = await join('wali-kartu', ['guardian'], schoolA);

  const [year] = await db
    .insert(academicYear)
    .values({
      schoolId: schoolA,
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-26',
      isActive: true,
    })
    .returning();
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId: schoolA,
      academicYearId: year!.id,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-19',
      isActive: true,
    })
    .returning();
  semesterId = sem!.id;
  const [cls] = await db
    .insert(classRoom)
    .values({ schoolId: schoolA, academicYearId: year!.id, name: '7A', level: '7' })
    .returning();
  classId = cls!.id;
  const [other] = await db
    .insert(classRoom)
    .values({ schoolId: schoolA, academicYearId: year!.id, name: '7B', level: '7' })
    .returning();
  for (const [name, nis] of [
    ['Citra', '003'],
    ['Ani', '001'],
    ['Budi', '002'],
  ] as const) {
    const [s] = await db
      .insert(student)
      .values({
        schoolId: schoolA,
        name,
        nis,
        gender: 'P',
        birthPlace: 'Bandung',
        birthDate: '2012-10-05',
      })
      .returning();
    studentIds[name] = s!.id;
    await db.insert(enrollment).values({
      schoolId: schoolA,
      studentId: s!.id,
      classId,
      academicYearId: year!.id,
    });
  }
  await db.insert(attendanceCard).values([
    { schoolId: schoolA, studentId: studentIds.Ani!, kind: 'rfid', code: `OLD${run}`, active: false },
    { schoolId: schoolA, studentId: studentIds.Ani!, kind: 'rfid', code: `NEW${run}`, active: true },
  ]);
  const [mtk] = await db
    .insert(subject)
    .values({ schoolId: schoolA, code: 'MTK', name: 'Matematika' })
    .returning();
  const [ipa] = await db.insert(subject).values({ schoolId: schoolA, code: 'IPA', name: 'IPA' }).returning();
  const [type] = await db
    .insert(examType)
    .values({ schoolId: schoolA, name: 'Asesmen Tengah Semester', shortName: 'ASTS' })
    .returning();
  const base = {
    schoolId: schoolA,
    examTypeId: type!.id,
    typeName: 'Asesmen Tengah Semester',
    typeShort: 'ASTS',
    semesterId,
    durationMinutes: 90,
    createdBy: 'test',
  };
  const [e1] = await db
    .insert(exam)
    .values({
      ...base,
      title: 'MTK',
      subjectId: mtk!.id,
      classIds: [classId],
      examDate: '2026-10-05',
      startTime: '07:30',
    })
    .returning();
  examId = e1!.id;
  await db.insert(exam).values({
    ...base,
    title: 'IPA',
    subjectId: ipa!.id,
    classIds: [classId],
    examDate: '2026-10-06',
    startTime: '07:30',
  });
  await db.insert(exam).values({
    ...base,
    title: 'IPA 7B',
    subjectId: ipa!.id,
    classIds: [other!.id],
    examDate: '2026-10-09',
    startTime: '09:00',
  });
}, 60_000);

afterAll(async () => {
  const db = app.platformDb;
  const tables = [
    'audit_log',
    'card_template',
    'exam',
    'exam_type',
    'attendance_card',
    'enrollment',
    'student',
    'school_file',
    'semester',
    'class_room',
    'subject',
    'academic_year',
    'member',
    'role',
    'entitlement',
  ];
  for (let pass = 0; pass < 2; pass++) {
    for (const sid of [schoolA, schoolB]) {
      for (const t of tables) {
        await db
          .execute(sql`delete from ${sql.identifier(t)} where school_id = ${sid}`)
          .catch(() => undefined);
      }
    }
  }
  for (const sid of [schoolA, schoolB]) await db.delete(school).where(eq(school.id, sid));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('templat kartu', () => {
  it('bawaan sistem tersedia tanpa menyimpan apa pun', async () => {
    const res = await call('GET', '/v1/cards/templates/defaults', teacherA);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().student.layout).toMatchObject({ widthMm: 86, heightMm: 54 });
    expect(res.json().exam.layout).toMatchObject({ widthMm: 100, heightMm: 60 });
    expect((await call('GET', '/v1/cards/templates', teacherA)).json()).toEqual([]);
  });

  it('izin: guru boleh membaca, tidak boleh menulis; wali tidak boleh apa pun', async () => {
    expect((await call('GET', '/v1/cards/templates', teacherA)).statusCode).toBe(200);
    expect((await call('POST', '/v1/cards/templates', teacherA, tpl('X'))).statusCode).toBe(403);
    expect((await call('GET', '/v1/cards/templates', guardianA)).statusCode).toBe(403);
    expect(
      (await call('POST', '/v1/cards/backgrounds', teacherA, { mime: 'image/png', data: PNG })).statusCode,
    ).toBe(403);
  });

  it('CRUD: templat pertama otomatis bawaan, satu bawaan per jenis, hapus bawaan menggeser ke yang lain', async () => {
    const a = await call('POST', '/v1/cards/templates', adminA, tpl('Kartu A'));
    expect(a.statusCode, a.body).toBe(201);
    expect(a.json()).toMatchObject({ kind: 'student', isDefault: true, backgroundUrl: null });
    const b = await call('POST', '/v1/cards/templates', adminA, tpl('Kartu B'));
    expect(b.json().isDefault).toBe(false);
    // Jenis lain punya bawaan sendiri.
    const e = await call('POST', '/v1/cards/templates', adminA, {
      kind: 'exam',
      name: 'Ujian A',
      layout: {
        widthMm: 100,
        heightMm: 60,
        elements: [{ type: 'field', field: 'participantNo', x: 1, y: 1, w: 40, h: 6 }],
      },
    });
    expect(e.statusCode, e.body).toBe(201);
    expect(e.json().isDefault).toBe(true);

    // Nama kembar dalam satu jenis ditolak, jenis lain boleh.
    expect((await call('POST', '/v1/cards/templates', adminA, tpl('Kartu A'))).statusCode).toBe(409);

    // Jadikan B bawaan: A dilepas.
    const setB = await call('PUT', `/v1/cards/templates/${b.json().id}/default`, adminA);
    expect(setB.json().isDefault).toBe(true);
    const list = (await call('GET', '/v1/cards/templates?kind=student', adminA)).json();
    expect(list.map((t: { name: string; isDefault: boolean }) => [t.name, t.isDefault])).toEqual([
      ['Kartu B', true],
      ['Kartu A', false],
    ]);
    expect((await call('GET', '/v1/cards/templates', adminA)).json()).toHaveLength(3);

    // Ubah isi; kind tidak berubah.
    const upd = await call('PUT', `/v1/cards/templates/${a.json().id}`, adminA, {
      name: 'Kartu A2',
      layout: layout([{ type: 'text', text: 'KARTU', x: 2, y: 20, w: 30, h: 5 }]),
      isDefault: true,
    });
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json()).toMatchObject({ name: 'Kartu A2', isDefault: true, kind: 'student' });
    expect(upd.json().layout.elements).toHaveLength(2);
    const afterUpd = (await call('GET', '/v1/cards/templates?kind=student', adminA)).json();
    expect(afterUpd.filter((t: { isDefault: boolean }) => t.isDefault)).toHaveLength(1);

    // Gandakan.
    const dup = await call('POST', `/v1/cards/templates/${a.json().id}/duplicate`, adminA);
    expect(dup.statusCode, dup.body).toBe(201);
    expect(dup.json()).toMatchObject({ name: 'Kartu A2 (salinan)', isDefault: false });
    const dup2 = await call('POST', `/v1/cards/templates/${a.json().id}/duplicate`, adminA);
    expect(dup2.json().name).toBe('Kartu A2 (salinan 2)');

    // Hapus bawaan (A2): templat tertua yang tersisa (B) menjadi bawaan.
    expect((await call('DELETE', `/v1/cards/templates/${a.json().id}`, adminA)).statusCode).toBe(200);
    const left = (await call('GET', '/v1/cards/templates?kind=student', adminA)).json();
    expect(
      left.filter((t: { isDefault: boolean }) => t.isDefault).map((t: { name: string }) => t.name),
    ).toEqual(['Kartu B']);
    expect((await call('GET', `/v1/cards/templates/${a.json().id}`, adminA)).statusCode).toBe(404);
  });

  it('menolak tata letak tidak sah dengan 400', async () => {
    const outside = layout([{ type: 'text', text: 'X', x: 80, y: 0, w: 20, h: 5 }]);
    expect(
      (
        await call('POST', '/v1/cards/templates', adminA, {
          kind: 'student',
          name: 'Salah 1',
          layout: outside,
        })
      ).statusCode,
    ).toBe(400);
    const wrongKind = layout([{ type: 'field', field: 'participantNo', x: 0, y: 0, w: 20, h: 5 }]);
    const r = await call('POST', '/v1/cards/templates', adminA, {
      kind: 'student',
      name: 'Salah 2',
      layout: wrongKind,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('validation');
    const unknownField = layout([{ type: 'field', field: 'nik', x: 0, y: 0, w: 20, h: 5 }]);
    expect(
      (
        await call('POST', '/v1/cards/templates', adminA, {
          kind: 'student',
          name: 'Salah 3',
          layout: unknownField,
        })
      ).statusCode,
    ).toBe(400);
    const missingImage = layout([
      { type: 'image', fileId: '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', x: 0, y: 0, w: 10, h: 10 },
    ]);
    const bad = await call('POST', '/v1/cards/templates', adminA, {
      kind: 'student',
      name: 'Salah 4',
      layout: missingImage,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_reference');
    const tooMany = {
      widthMm: 86,
      heightMm: 54,
      elements: Array.from({ length: 61 }, () => ({ type: 'text', text: 'A', x: 0, y: 0, w: 5, h: 5 })),
    };
    expect(
      (
        await call('POST', '/v1/cards/templates', adminA, {
          kind: 'student',
          name: 'Salah 5',
          layout: tooMany,
        })
      ).statusCode,
    ).toBe(400);
  });

  it('latar: tolak bukan gambar, terima PNG, dipakai templat, dihapus saat tak dirujuk lagi', async () => {
    const fake = await call('POST', '/v1/cards/backgrounds', adminA, {
      mime: 'image/png',
      data: Buffer.from('bukan gambar').toString('base64'),
    });
    expect(fake.statusCode).toBe(400);
    const up = await call('POST', '/v1/cards/backgrounds', adminA, { mime: 'image/png', data: PNG });
    expect(up.statusCode, up.body).toBe(201);
    const { id, url } = up.json();
    expect(url).toBe(`/v1/public/school-files/${id}`);
    const t = await call(
      'POST',
      '/v1/cards/templates',
      adminA,
      tpl('Berlatar', 'student', { backgroundFileId: id }),
    );
    expect(t.statusCode, t.body).toBe(201);
    expect(t.json().backgroundUrl).toBe(url);
    // Sekolah lain tidak bisa memakai berkas ini.
    const other = await call(
      'POST',
      '/v1/cards/templates',
      adminB,
      tpl('Curian', 'student', { backgroundFileId: id }),
      schoolB,
    );
    expect(other.statusCode).toBe(400);
    // Lepas latar: berkas dihapus.
    await call('PUT', `/v1/cards/templates/${t.json().id}`, adminA, { name: 'Berlatar', layout: layout() });
    const gone = await app.inject({ method: 'GET', url: url });
    expect(gone.statusCode).toBe(404);
  });

  it('terisolasi antarsekolah', async () => {
    const mine = await call('POST', '/v1/cards/templates', adminA, tpl('Rahasia A'));
    const id = mine.json().id;
    expect((await call('GET', `/v1/cards/templates/${id}`, adminB, undefined, schoolB)).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/cards/templates/${id}`, adminB, undefined, schoolB)).statusCode).toBe(
      404,
    );
    expect(
      (await call('PUT', `/v1/cards/templates/${id}/default`, adminB, undefined, schoolB)).statusCode,
    ).toBe(404);
    expect((await call('GET', '/v1/cards/templates', adminB, undefined, schoolB)).json()).toEqual([]);
    // Header sekolah lain yang bukan keanggotaannya ditolak.
    expect((await call('GET', '/v1/cards/templates', adminB, undefined, schoolA)).statusCode).toBe(403);
  });
});

describe('foto siswa', () => {
  it('unggah, layani hanya ke staf berhak, ganti, dan hapus', async () => {
    const id = studentIds.Ani!;
    expect(
      (await call('POST', `/v1/students/${id}/photo`, teacherA, { mime: 'image/png', data: PNG })).statusCode,
    ).toBe(403);
    const fake = await call('POST', `/v1/students/${id}/photo`, adminA, {
      mime: 'image/jpeg',
      data: PNG,
    });
    expect(fake.statusCode).toBe(400);
    const up = await call('POST', `/v1/students/${id}/photo`, adminA, { mime: 'image/png', data: PNG });
    expect(up.statusCode, up.body).toBe(200);
    expect(up.json().photoUrl).toBe(`/v1/students/${id}/photo`);

    const got = await call('GET', `/v1/students/${id}/photo`, teacherA);
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['cache-control']).toContain('private');
    // Tidak publik: tanpa login ditolak, wali ditolak, sekolah lain tidak melihatnya.
    expect((await app.inject({ method: 'GET', url: `/v1/students/${id}/photo` })).statusCode).not.toBe(200);
    expect((await call('GET', `/v1/students/${id}/photo`, guardianA)).statusCode).toBe(403);
    expect((await call('GET', `/v1/students/${id}/photo`, adminB, undefined, schoolB)).statusCode).toBe(404);

    // Ganti: hanya satu berkas foto tersisa untuk siswa ini.
    await call('POST', `/v1/students/${id}/photo`, adminA, { mime: 'image/png', data: PNG });
    const [{ n }] = (
      await app.platformDb.execute<{ n: string }>(
        sql`select count(*)::text as n from school_file where school_id = ${schoolA} and kind = 'student_photo'`,
      )
    ).rows as [{ n: string }];
    expect(n).toBe('1');

    expect((await call('DELETE', `/v1/students/${id}/photo`, adminA)).statusCode).toBe(200);
    expect((await call('GET', `/v1/students/${id}/photo`, adminA)).statusCode).toBe(404);
    expect(
      (
        await call('POST', `/v1/students/${crypto.randomUUID()}/photo`, adminA, {
          mime: 'image/png',
          data: PNG,
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('data cetak', () => {
  it('kartu siswa: data terikat, kode RFID aktif pertama, foto, dan validasi parameter', async () => {
    await call('POST', `/v1/students/${studentIds.Budi!}/photo`, adminA, { mime: 'image/png', data: PNG });
    const res = await call('GET', `/v1/cards/students?classId=${classId}`, teacherA);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.truncated).toBe(false);
    expect(body.items.map((i: { name: string }) => i.name)).toEqual(['Ani', 'Budi', 'Citra']);
    const ani = body.items[0];
    expect(ani).toMatchObject({
      nis: '001',
      className: '7A',
      academicYear: '2026/2027',
      rfidCode: `NEW${run}`,
      birthPlaceDate: 'Bandung, 5 Oktober 2012',
      photoUrl: null,
      schoolName: `Sekolah kartu-a-${run}`,
    });
    expect(body.items[1].photoUrl).toBe(`/v1/students/${studentIds.Budi}/photo`);

    const byIds = await call('GET', `/v1/cards/students?studentIds=${studentIds.Citra!}`, teacherA);
    expect(byIds.json().items).toHaveLength(1);
    expect(byIds.json().items[0]).toMatchObject({ name: 'Citra', className: '7A', rfidCode: '' });

    expect((await call('GET', '/v1/cards/students', teacherA)).statusCode).toBe(400);
    expect((await call('GET', '/v1/cards/students?studentIds=bukan-uuid', teacherA)).statusCode).toBe(400);
    expect(
      (await call('GET', `/v1/cards/students?classId=${crypto.randomUUID()}`, teacherA)).statusCode,
    ).toBe(404);
    expect((await call('GET', `/v1/cards/students?classId=${classId}`, guardianA)).statusCode).toBe(403);
    // Sekolah lain tidak melihat siswa sekolah ini.
    expect(
      (
        await call('GET', `/v1/cards/students?studentIds=${studentIds.Citra!}`, adminB, undefined, schoolB)
      ).json().items,
    ).toEqual([]);
  });

  it('peserta ujian: nomor deterministik dan jadwal kelas', async () => {
    const res = await call('GET', `/v1/cards/exam-participants?examId=${examId}`, adminA);
    expect(res.statusCode, res.body).toBe(200);
    const { items } = res.json();
    expect(items.map((i: { name: string; participantNo: string }) => [i.name, i.participantNo])).toEqual([
      ['Ani', 'ASTS-26-001'],
      ['Budi', 'ASTS-26-002'],
      ['Citra', 'ASTS-26-003'],
    ]);
    const first = items[0];
    expect(first).toMatchObject({
      className: '7A',
      typeName: 'Asesmen Tengah Semester',
      examTitle: 'Asesmen Tengah Semester Ganjil 2026/2027',
      room: '',
      time: '07.30 - 09.00 WIB',
      date: '5 Oktober 2026 s.d. 6 Oktober 2026',
    });
    expect(first.schedule).toHaveLength(2);
    expect(first.subjectList[0]).toBe('Matematika: Senin, 5 Oktober 2026, 07.30 - 09.00 WIB');
    // Ujian kelas lain tidak ikut.
    expect(first.subjectList.join('|')).not.toContain('7B');

    // Cara kedua memberi hasil yang sama untuk kelas itu (nomor stabil).
    const byClass = await call(
      'GET',
      `/v1/cards/exam-participants?semesterId=${semesterId}&classId=${classId}`,
      adminA,
    );
    expect(byClass.statusCode, byClass.body).toBe(200);
    expect(byClass.json().items).toHaveLength(3);
    expect(byClass.json().items[0].participantNo).toBe('UJN-26-001');
    expect(byClass.json().items[0].schedule).toHaveLength(2);

    expect((await call('GET', '/v1/cards/exam-participants', adminA)).statusCode).toBe(400);
    expect(
      (await call('GET', `/v1/cards/exam-participants?examId=${crypto.randomUUID()}`, adminA)).statusCode,
    ).toBe(404);
    // Guru tidak punya exam:manage tetapi punya exam:read: boleh; wali tidak.
    expect((await call('GET', `/v1/cards/exam-participants?examId=${examId}`, teacherA)).statusCode).toBe(
      200,
    );
    expect((await call('GET', `/v1/cards/exam-participants?examId=${examId}`, guardianA)).statusCode).toBe(
      403,
    );
    expect(
      (await call('GET', `/v1/cards/exam-participants?examId=${examId}`, adminB, undefined, schoolB))
        .statusCode,
    ).toBe(404);
  });
});
