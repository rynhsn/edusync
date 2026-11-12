import {
  academicYear,
  assignRoles,
  calendarEvent,
  classRoom,
  enrollment,
  eq,
  foundation,
  homeroomAssignmentHistory,
  member,
  promotionDecision,
  reportCard,
  school,
  schoolLevel,
  seedSchoolRoles,
  semester,
  sql,
  student,
  subject,
  teacher,
  teachingAssignment,
  teachingAssignmentHistory,
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

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherSchoolId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let curriculumCookie = '';
let teacherCookie = '';
let otherCookie = '';

// Tahun ajaran: Y0 (lampau), Y1 (sumber), Y2 (tujuan), Y3 (kosong), Y4 (untuk kelas tujuan salah tahun).
const years = {} as Record<'y0' | 'y1' | 'y2' | 'y3' | 'y4' | 'other', string>;
const cls = {} as Record<string, string>;
const stu = {} as Record<string, string>;
const tch = {} as Record<string, string>;
const sub = {} as Record<string, string>;
let otherStudentId = '';

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
}

async function login(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function member_(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return login(u.email);
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const db = () => app.platformDb;

async function yearClasses(yearId: string) {
  return db().select().from(classRoom).where(eq(classRoom.academicYearId, yearId));
}

/** Potret data tahun sumber yang tidak boleh berubah oleh rollover dan penerapan. */
async function sourceSnapshot() {
  const byId = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => a.id.localeCompare(b.id));
  const classes = await yearClasses(years.y1);
  const classIds = classes.map((c) => c.id);
  const assignments = (await db().select().from(teachingAssignment)).filter(
    (a) => a.schoolId === schoolId && classIds.includes(a.classId),
  );
  const events = await db().select().from(calendarEvent).where(eq(calendarEvent.academicYearId, years.y1));
  const cards = await db().select().from(reportCard).where(eq(reportCard.schoolId, schoolId));
  const enrolls = await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y1));
  return JSON.stringify({
    classes: byId(classes),
    assignments: byId(assignments),
    events: byId(events),
    cards: byId(cards),
    enrolls: byId(enrolls),
  });
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Kenaikan', slug: `yk-${run}` })
    .returning();
  foundationId = f!.id;
  const ids: string[] = [];
  for (const slug of [`kn-${run}`, `kn2-${run}`]) {
    const [s] = await db().insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(db(), s!.id);
    ids.push(s!.id);
  }
  [schoolId, otherSchoolId] = ids as [string, string];

  await db()
    .insert(schoolLevel)
    .values(['7', '8', '9'].map((code, i) => ({ schoolId, code, label: `Kelas ${code}`, sort: i + 1 })));

  const mkYear = async (
    key: keyof typeof years,
    name: string,
    startsOn: string,
    endsOn: string,
    sid = schoolId,
  ) => {
    const [y] = await db()
      .insert(academicYear)
      .values({ schoolId: sid, name, startsOn, endsOn, isActive: key === 'y1' || key === 'other' })
      .returning();
    years[key] = y!.id;
  };
  await mkYear('y0', '2025/2026', '2025-07-14', '2026-06-30');
  await mkYear('y1', '2026/2027', '2026-07-13', '2027-06-30');
  await mkYear('y2', '2027/2028', '2027-07-12', '2028-06-30');
  await mkYear('y3', '2028/2029', '2028-07-17', '2029-06-30');
  await mkYear('y4', '2029/2030', '2029-07-16', '2030-06-30');
  await mkYear('other', '2026/2027', '2026-07-13', '2027-06-30', otherSchoolId);

  const mkTeacher = async (key: string, name: string, status: 'active' | 'inactive' = 'active') => {
    const [t] = await db().insert(teacher).values({ schoolId, name, status }).returning();
    tch[key] = t!.id;
  };
  await mkTeacher('t1', 'Guru Satu');
  await mkTeacher('t2', 'Guru Dua');
  await mkTeacher('tOff', 'Guru Nonaktif', 'inactive');
  for (const [key, code] of [
    ['mtk', 'MTK'],
    ['ipa', 'IPA'],
  ] as const) {
    const [s] = await db().insert(subject).values({ schoolId, code, name: code }).returning();
    sub[key] = s!.id;
  }

  const mkClass = async (key: string, yearId: string, name: string, level: string, homeroom?: string) => {
    const [c] = await db()
      .insert(classRoom)
      .values({
        schoolId,
        academicYearId: yearId,
        name,
        level,
        ...(homeroom ? { homeroomTeacherId: homeroom } : {}),
      })
      .returning();
    cls[key] = c!.id;
  };
  await mkClass('7A', years.y1, '7A', '7', tch.t1);
  await mkClass('7B', years.y1, '7B', '7');
  await mkClass('8A', years.y1, '8A', '8', tch.tOff);
  await mkClass('9A', years.y1, '9A', '9');
  await mkClass('y0_7Z', years.y0, '7Z', '7');
  await mkClass('y4_T', years.y4, 'T4A', '8');

  const assign = async (c: string, s: string, t: string) =>
    db()
      .insert(teachingAssignment)
      .values({ schoolId, classId: cls[c]!, subjectId: sub[s]!, teacherId: tch[t]! });
  await assign('7A', 'mtk', 't1');
  await assign('7A', 'ipa', 't2');
  await assign('8A', 'mtk', 't2');
  await assign('8A', 'ipa', 'tOff');
  await assign('9A', 'ipa', 't2');

  await db()
    .insert(calendarEvent)
    .values([
      {
        schoolId,
        academicYearId: years.y1,
        type: 'holiday',
        scope: 'school',
        title: 'Libur akhir tahun',
        startsOn: '2026-12-24',
        endsOn: '2027-01-02',
      },
      {
        schoolId,
        academicYearId: years.y1,
        type: 'exam',
        scope: 'class',
        classId: cls['7A']!,
        title: 'Ujian 7A',
        startsOn: '2026-12-01',
        endsOn: '2026-12-05',
      },
      {
        schoolId,
        academicYearId: years.y1,
        type: 'exam',
        scope: 'class',
        classId: cls['9A']!,
        title: 'Ujian 9A',
        startsOn: '2027-03-01',
        endsOn: '2027-03-05',
      },
    ]);

  const mkStudent = async (key: string, classKey: string | null, yearId = years.y1) => {
    const [s] = await db()
      .insert(student)
      .values({ schoolId, name: `Siswa ${key}`, gender: 'L', nis: `${key}-${run}` })
      .returning();
    stu[key] = s!.id;
    if (classKey) {
      await db()
        .insert(enrollment)
        .values({ schoolId, studentId: s!.id, classId: cls[classKey]!, academicYearId: yearId });
    }
  };
  await mkStudent('s1', '7A');
  await mkStudent('s2', '7B');
  await mkStudent('s3', '8A');
  await mkStudent('s4', '9A');
  await mkStudent('s5', '9A');
  await mkStudent('s6', '8A');
  await mkStudent('s7', '7A'); // tanpa keputusan
  await mkStudent('s8', '7A'); // kelas tujuan eksplisit
  await mkStudent('s9', '7B'); // sudah di-enroll manual di tahun tujuan
  await mkStudent('sz1', 'y0_7Z', years.y0);
  await mkStudent('sz2', 'y0_7Z', years.y0);
  await mkStudent('lepas', null); // tidak ter-enroll di mana pun

  const [other] = await db()
    .insert(student)
    .values({ schoolId: otherSchoolId, name: 'Siswa lain', gender: 'P' })
    .returning();
  otherStudentId = other!.id;

  // Rapor final di tahun sumber: tidak boleh berubah oleh rollover dan penerapan.
  const [sem] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: years.y1,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-31',
    })
    .returning();
  await db()
    .insert(reportCard)
    .values({
      schoolId,
      semesterId: sem!.id,
      studentId: stu.s1!,
      classId: cls['7A']!,
      status: 'final',
      finalizedAt: new Date('2026-12-20T00:00:00Z'),
      snapshot: { marker: 'beku' },
    });

  adminCookie = await member_('admin-naik', schoolId, ['school_admin']);
  curriculumCookie = await member_('kurikulum-naik', schoolId, ['curriculum']);
  teacherCookie = await member_('guru-naik', schoolId, ['teacher']);
  otherCookie = await member_('admin-lain-naik', otherSchoolId, ['school_admin']);
});

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'promotion_decision',
      'report_card_snapshot',
      'report_card',
      'homeroom_assignment_history',
      'teaching_assignment_history',
      'teaching_assignment',
      'calendar_event',
      'semester',
      'enrollment',
      'student',
      'class_room',
      'teacher',
      'subject',
      'school_level',
      'academic_year',
      'member',
      'role',
    ]) {
      await db().execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db().delete(school).where(eq(school.id, sid));
  }
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
});

const rollover = (cookie: string, from: string, body: object, sid = schoolId) =>
  call('POST', `/v1/academic-years/${from}/rollover`, cookie, body, sid);
const decide = (cookie: string, yearId: string, decisions: object[], sid = schoolId) =>
  call('PUT', `/v1/academic-years/${yearId}/promotions`, cookie, { decisions }, sid);
const apply = (cookie: string, from: string, body: object, sid = schoolId) =>
  call('POST', `/v1/academic-years/${from}/promotions/apply`, cookie, body, sid);

let before = '';

describe('izin promotion:manage', () => {
  it('guru ditolak, tanpa login ditolak, kurikulum dan admin diterima', async () => {
    const y = years.y1;
    expect((await call('GET', `/v1/academic-years/${y}/promotions`, teacherCookie)).statusCode).toBe(403);
    expect((await decide(teacherCookie, y, [{ studentId: stu.s1, decision: 'promote' }])).statusCode).toBe(
      403,
    );
    expect((await rollover(teacherCookie, y, { targetYearId: years.y2 })).statusCode).toBe(403);
    expect((await apply(teacherCookie, y, { targetYearId: years.y2 })).statusCode).toBe(403);
    expect((await app.inject(`/v1/academic-years/${y}/promotions`)).statusCode).toBe(401);
    expect((await call('GET', `/v1/academic-years/${y}/promotions`, curriculumCookie)).statusCode).toBe(200);
    expect((await call('GET', `/v1/academic-years/${y}/promotions`, adminCookie)).statusCode).toBe(200);
  });

  it('sekolah lain tidak bisa memakai tahun ajaran sekolah ini', async () => {
    const y = years.y1;
    // Admin sekolah lain, tetapi memakai tahun ajaran milik sekolah ini: tidak terlihat (RLS).
    expect(
      (await call('GET', `/v1/academic-years/${y}/promotions`, otherCookie, undefined, otherSchoolId))
        .statusCode,
    ).toBe(404);
    expect((await rollover(otherCookie, y, { targetYearId: years.other }, otherSchoolId)).statusCode).toBe(
      404,
    );
    expect((await apply(otherCookie, y, { targetYearId: years.other }, otherSchoolId)).statusCode).toBe(404);
    // Tahun tujuan milik sekolah lain dari sisi sekolah ini: tidak ditemukan.
    expect((await rollover(adminCookie, years.y1, { targetYearId: years.other })).statusCode).toBe(400);
    // Anggota sekolah lain tidak bisa memakai x-school-id sekolah ini.
    expect((await call('GET', `/v1/academic-years/${y}/promotions`, otherCookie)).statusCode).toBe(403);
  });
});

describe('rollover tahun ajaran', () => {
  it('menolak tahun tujuan yang sama, lebih awal, atau tidak ada', async () => {
    for (const targetYearId of [years.y1, years.y0, '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa']) {
      const res = await rollover(adminCookie, years.y1, { targetYearId });
      expect(res.statusCode, targetYearId).toBe(400);
      expect(res.json().error.code).toBe('invalid_target');
    }
  });

  it('dryRun menghitung tanpa menulis apa pun', async () => {
    before = await sourceSnapshot();
    const res = await rollover(adminCookie, years.y1, {
      targetYearId: years.y2,
      dryRun: true,
      copyCalendar: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      classesCreated: 5,
      classesSkipped: 0,
      assignmentsCreated: 5,
      eventsCreated: 2,
    });
    expect(await yearClasses(years.y2)).toHaveLength(0);
    expect(
      await db().select().from(calendarEvent).where(eq(calendarEvent.academicYearId, years.y2)),
    ).toHaveLength(0);
    const written = await db()
      .select()
      .from(teachingAssignmentHistory)
      .where(eq(teachingAssignmentHistory.schoolId, schoolId));
    expect(written).toHaveLength(0);
  });

  it('menyalin kelas, wali kelas, penugasan, dan kalender; tingkat akhir tidak disalin', async () => {
    const res = await rollover(adminCookie, years.y1, { targetYearId: years.y2, copyCalendar: true });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Peringatan terstruktur sejajar dengan teks, dengan kode stabil.
    expect(body.warningItems).toHaveLength(body.warnings.length);
    expect(body.warningItems).toEqual(
      expect.arrayContaining([
        { code: 'final_level_not_copied', params: { count: 1 } },
        { code: 'inactive_homeroom_skipped', params: { count: 1 } },
      ]),
    );
    expect(body).toMatchObject({
      classesCreated: 5,
      classesSkipped: 0,
      assignmentsCreated: 5,
      eventsCreated: 2,
    });
    expect(body.warnings.join('\n')).toContain('1 kelas tingkat akhir tidak disalin');
    expect(body.warnings.join('\n')).toContain('wali kelas nonaktif');

    const created = await yearClasses(years.y2);
    const byName = new Map(created.map((c) => [c.name, c]));
    expect([...byName.keys()].sort()).toEqual(['7A', '7B', '8A', '8B', '9A']);
    expect(byName.get('8A')?.level).toBe('8');
    expect(byName.get('7A')?.level).toBe('7');
    expect(byName.get('9A')?.level).toBe('9');
    // Wali kelas ikut; wali nonaktif tidak.
    expect(byName.get('8A')?.homeroomTeacherId).toBe(tch.t1);
    expect(byName.get('7A')?.homeroomTeacherId).toBe(tch.t1);
    expect(byName.get('9A')?.homeroomTeacherId).toBeNull();
    const homeroomHistory = await db()
      .select()
      .from(homeroomAssignmentHistory)
      .where(eq(homeroomAssignmentHistory.schoolId, schoolId));
    expect(homeroomHistory).toHaveLength(2);

    // Penugasan: 7A -> 8A dan 7A (baru); 8A -> 9A (guru nonaktif dilewati); 9A tingkat akhir tidak ikut.
    const assignments = await db().select().from(teachingAssignment);
    const forClass = (name: string) =>
      assignments
        .filter((a) => a.classId === byName.get(name)!.id)
        .map((a) => `${a.subjectId === sub.mtk ? 'mtk' : 'ipa'}:${a.teacherId}`);
    expect(forClass('8A').sort()).toEqual([`ipa:${tch.t2}`, `mtk:${tch.t1}`].sort());
    expect(forClass('7A').sort()).toEqual([`ipa:${tch.t2}`, `mtk:${tch.t1}`].sort());
    expect(forClass('9A')).toEqual([`mtk:${tch.t2}`]);
    expect(forClass('8B')).toEqual([]);
    const history = await db()
      .select()
      .from(teachingAssignmentHistory)
      .where(eq(teachingAssignmentHistory.schoolId, schoolId));
    expect(history).toHaveLength(5);
    expect(history.every((h) => h.action === 'assigned')).toBe(true);

    // Kalender: tanggal bergeser satu tahun; acara kelas 7A mengikuti 8A; acara 9A dilewati.
    const events = await db().select().from(calendarEvent).where(eq(calendarEvent.academicYearId, years.y2));
    const holiday = events.find((e) => e.title === 'Libur akhir tahun');
    expect(holiday).toMatchObject({ startsOn: '2027-12-24', endsOn: '2028-01-02', scope: 'school' });
    expect(events.find((e) => e.title === 'Ujian 7A')?.classId).toBe(byName.get('8A')!.id);
    expect(events.find((e) => e.title === 'Ujian 9A')).toBeUndefined();
  });

  it('idempoten: dijalankan ulang tidak menambah apa pun', async () => {
    const res = await rollover(adminCookie, years.y1, { targetYearId: years.y2, copyCalendar: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      classesCreated: 0,
      classesSkipped: 5,
      assignmentsCreated: 0,
      eventsCreated: 0,
    });
    expect(await yearClasses(years.y2)).toHaveLength(5);
    expect(
      await db().select().from(calendarEvent).where(eq(calendarEvent.academicYearId, years.y2)),
    ).toHaveLength(2);
  });

  it('kalender tidak disalin bila copyCalendar tidak dikirim (bawaan false)', async () => {
    const res = await rollover(adminCookie, years.y1, { targetYearId: years.y3, dryRun: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ classesCreated: 5, eventsCreated: 0 });
  });

  it('opsi copy* mematikan bagian yang tidak diminta', async () => {
    const res = await rollover(adminCookie, years.y1, {
      targetYearId: years.y3,
      copyClasses: false,
      copyAssignments: false,
      copyCalendar: false,
    });
    expect(res.json()).toMatchObject({ classesCreated: 0, assignmentsCreated: 0, eventsCreated: 0 });
    expect(await yearClasses(years.y3)).toHaveLength(0);
  });

  it('data tahun sumber tidak berubah', async () => {
    expect(await sourceSnapshot()).toBe(before);
  });
});

describe('keputusan kenaikan kelas', () => {
  it('daftar menampilkan siswa per kelas dengan saran bawaan', async () => {
    const res = await call('GET', `/v1/academic-years/${years.y1}/promotions`, adminCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.classes.map((c: { name: string }) => c.name)).toEqual(['7A', '7B', '8A', '9A']);
    const c7a = body.classes.find((c: { name: string }) => c.name === '7A');
    expect(c7a).toMatchObject({ level: '7', nextLevel: '8', isFinalLevel: false });
    expect(c7a.students).toHaveLength(3);
    expect(c7a.students[0]).toMatchObject({ decision: null, suggestedDecision: 'promote', applied: false });
    const c9a = body.classes.find((c: { name: string }) => c.name === '9A');
    expect(c9a).toMatchObject({ nextLevel: null, isFinalLevel: true });
    // Kelulusan ditetapkan sekolah: tidak ada saran otomatis di tingkat akhir.
    expect(c9a.students[0].suggestedDecision).toBeNull();
  });

  it('menolak keputusan yang tidak sah, dan tidak menyimpan sebagian', async () => {
    const y = years.y1;
    const err = (decisions: object[]) => decide(adminCookie, y, decisions);
    let res = await err([{ studentId: stu.s1, decision: 'graduate' }]);
    expect([res.statusCode, res.json().error.code]).toEqual([400, 'not_final_level']);
    res = await err([{ studentId: stu.s4, decision: 'promote' }]);
    expect([res.statusCode, res.json().error.code]).toEqual([400, 'not_final_level']);
    res = await err([{ studentId: stu.lepas, decision: 'promote' }]);
    expect([res.statusCode, res.json().error.code]).toEqual([400, 'student_not_enrolled']);
    res = await err([{ studentId: otherStudentId, decision: 'promote' }]);
    expect([res.statusCode, res.json().error.code]).toEqual([400, 'student_not_enrolled']);
    // Kelas tujuan: kelas tahun yang sama dengan sumber, dan kelas tahun lampau, bukan kelas tahun setelahnya.
    res = await err([{ studentId: stu.s1, decision: 'promote', toClassId: cls['7B'] }]);
    expect([res.statusCode, res.json().error.code]).toEqual([400, 'invalid_target_class']);
    res = await err([{ studentId: stu.s1, decision: 'promote', toClassId: cls.y0_7Z }]);
    expect([res.statusCode, res.json().error.code]).toEqual([400, 'invalid_target_class']);
    res = await err([
      { studentId: stu.s1, decision: 'promote', toClassId: '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' },
    ]);
    expect([res.statusCode, res.json().error.code]).toEqual([400, 'invalid_target_class']);
    // Satu butir salah di tengah membatalkan seluruh permintaan.
    res = await err([
      { studentId: stu.s1, decision: 'promote' },
      { studentId: stu.s2, decision: 'graduate' },
    ]);
    expect(res.statusCode).toBe(400);
    expect(
      await db().select().from(promotionDecision).where(eq(promotionDecision.schoolId, schoolId)),
    ).toHaveLength(0);
  });

  it('menyimpan dan memperbarui keputusan (upsert)', async () => {
    const y = years.y1;
    const y2Classes = await yearClasses(years.y2);
    const c8b = y2Classes.find((c) => c.name === '8B')!;
    const res = await decide(adminCookie, y, [
      { studentId: stu.s1, decision: 'retain' },
      { studentId: stu.s2, decision: 'retain', note: 'Nilai belum tuntas' },
      { studentId: stu.s3, decision: 'promote' },
      { studentId: stu.s4, decision: 'graduate' },
      { studentId: stu.s5, decision: 'retain' },
      { studentId: stu.s6, decision: 'retain' },
      { studentId: stu.s8, decision: 'promote', toClassId: c8b.id },
      { studentId: stu.s9, decision: 'promote' },
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ saved: 8 });
    // Ubah s1 menjadi naik kelas: tetap satu baris per siswa.
    expect((await decide(adminCookie, y, [{ studentId: stu.s1, decision: 'promote' }])).statusCode).toBe(200);
    const rows = await db().select().from(promotionDecision).where(eq(promotionDecision.schoolId, schoolId));
    expect(rows).toHaveLength(8);
    expect(rows.find((r) => r.studentId === stu.s1)).toMatchObject({
      decision: 'promote',
      fromClassId: cls['7A'],
      toClassId: null,
      appliedAt: null,
    });
    expect(rows.find((r) => r.studentId === stu.s8)?.toClassId).toBe(c8b.id);

    const list = (await call('GET', `/v1/academic-years/${y}/promotions`, curriculumCookie)).json();
    const s2 = list.classes
      .flatMap((c: { students: { studentId: string }[] }) => c.students)
      .find((s: { studentId: string }) => s.studentId === stu.s2);
    expect(s2).toMatchObject({ decision: 'retain', note: 'Nilai belum tuntas', applied: false });
  });
});

describe('penerapan keputusan', () => {
  it('menolak tahun tujuan yang tidak sah', async () => {
    for (const targetYearId of [years.y1, years.y0]) {
      const res = await apply(adminCookie, years.y1, { targetYearId });
      expect([res.statusCode, res.json().error.code]).toEqual([400, 'invalid_target']);
    }
  });

  it('dryRun menghitung tanpa menulis', async () => {
    // s9 sudah ditempatkan manual di tahun tujuan.
    const y2Classes = await yearClasses(years.y2);
    await db()
      .insert(enrollment)
      .values({
        schoolId,
        studentId: stu.s9!,
        classId: y2Classes.find((c) => c.name === '8B')!.id,
        academicYearId: years.y2,
      });
    const res = await apply(adminCookie, years.y1, { targetYearId: years.y2, dryRun: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ placed: 3, retained: 3, graduated: 1, skippedNoDecision: 1 });
    expect(res.json().alreadyEnrolled).toEqual([
      { studentId: stu.s9, classId: y2Classes.find((c) => c.name === '8B')!.id },
    ]);
    expect(await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y2))).toHaveLength(
      1,
    );
    const [s4] = await db().select().from(student).where(eq(student.id, stu.s4!));
    expect(s4?.status).toBe('active');
    const decisions = await db()
      .select()
      .from(promotionDecision)
      .where(eq(promotionDecision.schoolId, schoolId));
    expect(decisions.every((d) => d.appliedAt === null)).toBe(true);
  });

  it('menempatkan naik, tinggal, dan lulus; enrollment lama utuh; tahun aktif tidak berubah', async () => {
    const enrollBefore = await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y1));
    const res = await apply(adminCookie, years.y1, { targetYearId: years.y2 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      placed: 3,
      retained: 3,
      graduated: 1,
      unplaced: [],
      skippedNoDecision: 1,
    });

    const y2Classes = await yearClasses(years.y2);
    const nameOf = new Map(y2Classes.map((c) => [c.id, c.name]));
    const placed = new Map(
      (await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y2))).map((e) => [
        e.studentId,
        nameOf.get(e.classId),
      ]),
    );
    expect(placed.get(stu.s1!)).toBe('8A'); // naik, nama bagian sama
    expect(placed.get(stu.s3!)).toBe('9A');
    expect(placed.get(stu.s8!)).toBe('8B'); // kelas tujuan eksplisit
    expect(placed.get(stu.s2!)).toBe('7B'); // tinggal kelas
    expect(placed.get(stu.s6!)).toBe('8A');
    expect(placed.get(stu.s5!)).toBe('9A');
    expect(placed.get(stu.s9!)).toBe('8B'); // penempatan manual tidak disentuh
    expect(placed.has(stu.s4!)).toBe(false); // lulus: tidak punya kelas tahun tujuan
    expect(placed.has(stu.s7!)).toBe(false); // tanpa keputusan

    const [s4] = await db().select().from(student).where(eq(student.id, stu.s4!));
    expect(s4?.status).toBe('graduated');
    const [s1] = await db().select().from(student).where(eq(student.id, stu.s1!));
    expect(s1?.status).toBe('active');

    // Enrollment tahun sumber tidak dihapus.
    const enrollAfter = await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y1));
    expect(enrollAfter.map((e) => e.id).sort()).toEqual(enrollBefore.map((e) => e.id).sort());

    // Tahun aktif tetap Y1.
    const active = await db().select().from(academicYear).where(eq(academicYear.isActive, true));
    expect(active.filter((a) => a.schoolId === schoolId).map((a) => a.id)).toEqual([years.y1]);

    const decisions = await db()
      .select()
      .from(promotionDecision)
      .where(eq(promotionDecision.schoolId, schoolId));
    const applied = decisions.filter((d) => d.appliedAt !== null).map((d) => d.studentId);
    expect(applied.sort()).toEqual([stu.s1, stu.s2, stu.s3, stu.s4, stu.s5, stu.s6, stu.s8].sort());
    // Keputusan s9 menunggu karena sudah di-enroll manual.
    expect(decisions.find((d) => d.studentId === stu.s9)?.appliedAt).toBeNull();
  });

  it('idempoten: dijalankan ulang tidak menempatkan ulang', async () => {
    const res = await apply(adminCookie, years.y1, { targetYearId: years.y2 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      placed: 0,
      retained: 0,
      graduated: 0,
      unplaced: [],
      skippedNoDecision: 1,
    });
    expect(res.json().alreadyEnrolled).toHaveLength(1);
    expect(await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y2))).toHaveLength(
      7,
    );
  });

  it('keputusan yang sudah diterapkan tidak bisa diubah (409), yang belum bisa', async () => {
    const res = await decide(adminCookie, years.y1, [{ studentId: stu.s1, decision: 'retain' }]);
    expect([res.statusCode, res.json().error.code]).toEqual([409, 'promotion_applied']);
    expect(
      (await decide(adminCookie, years.y1, [{ studentId: stu.s9, decision: 'retain' }])).statusCode,
    ).toBe(200);
    const list = (await call('GET', `/v1/academic-years/${years.y1}/promotions`, adminCookie)).json();
    const flat = list.classes.flatMap(
      (c: { students: { studentId: string; applied: boolean }[] }) => c.students,
    );
    // Siswa lulus tetap tampil karena punya keputusan.
    expect(flat.find((s: { studentId: string }) => s.studentId === stu.s4)).toMatchObject({
      decision: 'graduate',
      applied: true,
    });
  });

  it('siswa tanpa kelas tujuan dilaporkan di unplaced, tanpa menggagalkan yang lain', async () => {
    // Y0: sz1 naik otomatis ke Y3 (belum punya kelas); sz2 dengan kelas tujuan eksplisit di Y4 (bukan tahun tujuan).
    expect(
      (
        await decide(adminCookie, years.y0, [
          { studentId: stu.sz1, decision: 'promote' },
          { studentId: stu.sz2, decision: 'promote', toClassId: cls.y4_T },
        ])
      ).statusCode,
    ).toBe(200);
    const res = await apply(adminCookie, years.y0, { targetYearId: years.y3 });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ placed: 0, retained: 0, graduated: 0 });
    expect(body.unplaced.map((u: { studentId: string }) => u.studentId).sort()).toEqual(
      [stu.sz1, stu.sz2].sort(),
    );
    expect(body.unplaced.find((u: { studentId: string }) => u.studentId === stu.sz1).reason).toContain(
      'belum punya kelas',
    );
    expect(body.unplaced.find((u: { studentId: string }) => u.studentId === stu.sz2).reason).toContain(
      'bukan kelas pada tahun ajaran tujuan',
    );
    expect(body.unplaced.find((u: { studentId: string }) => u.studentId === stu.sz1)).toMatchObject({
      reasonCode: 'no_target_class',
      reasonParams: { level: '8' },
    });
    expect(body.unplaced.find((u: { studentId: string }) => u.studentId === stu.sz2).reasonCode).toBe(
      'target_class_invalid',
    );
    const decisions = await db()
      .select()
      .from(promotionDecision)
      .where(eq(promotionDecision.academicYearId, years.y0));
    expect(decisions.every((d) => d.appliedAt === null)).toBe(true);
  });

  it('data tahun sumber tetap utuh setelah seluruh rangkaian', async () => {
    expect(await sourceSnapshot()).toBe(before);
    const [card] = await db().select().from(reportCard).where(eq(reportCard.schoolId, schoolId));
    expect(card).toMatchObject({ status: 'final', snapshot: { marker: 'beku' } });
  });
});
