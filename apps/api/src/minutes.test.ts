import {
  academicYear,
  assignRoles,
  classRoom,
  councilMeeting,
  councilMeetingAttendee,
  enrollment,
  eq,
  foundation,
  member,
  promotionDecision,
  school,
  schoolLevel,
  seedSchoolRoles,
  semester,
  sql,
  student,
  teacher,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { buildDigest, type DecisionRow } from './council-meeting-lib';
import { loadEnv } from './env';

/**
 * Berita acara musyawarah dewan pendidik dan tinggal kelas di tingkat akhir (fase 3C.3): CRUD, tautan keputusan,
 * rekap, finalisasi (pembekuan dan penguncian), izin, multi-tenant, FK komposit, dan kelas tujuan tinggal kelas tingkat akhir.
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const FAKE = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherSchoolId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let principalCookie = '';
let teacherCookie = '';
let otherCookie = '';

const years = {} as Record<'y1' | 'y2' | 'other', string>;
const cls = {} as Record<string, string>;
const stu = {} as Record<string, string>;
let sem1 = '';
let teacherId = '';
let otherTeacherId = '';
let otherMeetingId = '';

const db = () => app.platformDb;

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
  const [m] = await db().insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(db(), m!.id, sid, roles);
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

const decide = (decisions: object[], cookie = adminCookie, yearId = years.y1) =>
  call('PUT', `/v1/academic-years/${yearId}/promotions`, cookie, { decisions });
const rollover = (body: object) => call('POST', `/v1/academic-years/${years.y1}/rollover`, adminCookie, body);
const apply = (body: object) =>
  call('POST', `/v1/academic-years/${years.y1}/promotions/apply`, adminCookie, body);

const meetingBody = (over: Record<string, unknown> = {}) => ({
  academicYearId: years.y1,
  kind: 'promotion',
  title: 'Musyawarah kenaikan kelas',
  heldOn: '2027-06-20',
  location: 'Ruang guru',
  chairName: 'Kepala Sekolah',
  secretaryName: 'Wakil Kurikulum',
  agenda: 'Menetapkan kenaikan dan tinggal kelas.',
  summary: 'Disepakati.',
  attendees: [
    { teacherId, positionTitle: 'Wali kelas', role: 'member' },
    { name: 'Bapak Tamu', positionTitle: 'Pengawas', role: 'member' },
  ],
  ...over,
});

const createMeeting = async (over: Record<string, unknown> = {}) => {
  const res = await call('POST', '/v1/council-meetings', adminCookie, meetingBody(over));
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string };
};

const decisionRow = (studentKey: string) =>
  db()
    .select()
    .from(promotionDecision)
    .where(eq(promotionDecision.studentId, stu[studentKey]!))
    .then((r) => r[0]!);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Berita Acara', slug: `yba-${run}` })
    .returning();
  foundationId = f!.id;
  const ids: string[] = [];
  for (const slug of [`ba-${run}`, `ba2-${run}`]) {
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
  await mkYear('y1', '2026/2027', '2026-07-13', '2027-06-30');
  await mkYear('y2', '2027/2028', '2027-07-12', '2028-06-30');
  await mkYear('other', '2026/2027', '2026-07-13', '2027-06-30', otherSchoolId);
  const [sm] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: years.y1,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-31',
    })
    .returning();
  sem1 = sm!.id;

  const [t] = await db().insert(teacher).values({ schoolId, name: 'Guru Wali' }).returning();
  teacherId = t!.id;
  const [ot] = await db().insert(teacher).values({ schoolId: otherSchoolId, name: 'Guru Lain' }).returning();
  otherTeacherId = ot!.id;

  const mkClass = async (key: string, yearId: string, name: string, level: string, sid = schoolId) => {
    const [c] = await db()
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level })
      .returning();
    cls[key] = c!.id;
  };
  await mkClass('8A', years.y1, '8A', '8');
  await mkClass('9A', years.y1, '9A', '9');
  await mkClass('9B', years.y1, '9B', '9');
  await mkClass('otherC', years.other, '9A', '9', otherSchoolId);

  const mkStudent = async (key: string, classKey: string) => {
    const [s] = await db()
      .insert(student)
      .values({ schoolId, name: `Siswa ${key}`, gender: 'L', nis: `${key}-${run}` })
      .returning();
    stu[key] = s!.id;
    await db()
      .insert(enrollment)
      .values({ schoolId, studentId: s!.id, classId: cls[classKey]!, academicYearId: years.y1 });
  };
  await mkStudent('p1', '8A'); // naik
  await mkStudent('f1', '9A'); // tinggal di tingkat akhir
  await mkStudent('f2', '9A'); // tinggal di tingkat akhir
  await mkStudent('f3', '9A'); // lulus
  await mkStudent('b1', '9B'); // tingkat akhir, tanpa keputusan tinggal

  adminCookie = await member_('admin-ba', schoolId, ['school_admin']);
  principalCookie = await member_('kepsek-ba', schoolId, ['principal']);
  teacherCookie = await member_('guru-ba', schoolId, ['teacher']);
  otherCookie = await member_('admin-lain-ba', otherSchoolId, ['school_admin']);

  const [om] = await db()
    .insert(councilMeeting)
    .values({
      schoolId: otherSchoolId,
      academicYearId: years.other,
      kind: 'promotion',
      title: 'Rapat sekolah lain',
      heldOn: '2027-06-20',
      createdBy: 'uji',
    })
    .returning();
  otherMeetingId = om!.id;
});

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'promotion_decision',
      'council_meeting_attendee',
      'council_meeting',
      'report_card',
      'enrollment',
      'student',
      'class_room',
      'teacher',
      'semester',
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

describe('rekap keputusan (fungsi murni)', () => {
  const row = (over: Partial<DecisionRow>): DecisionRow => ({
    studentId: 's',
    studentName: 'Siswa',
    classId: 'c1',
    className: '9A',
    level: '9',
    decision: 'promote',
    reason: null,
    followUp: null,
    meetingDate: null,
    applied: false,
    ...over,
  });

  it('menghitung total dan per kelas, mengurutkan, dan mendaftar tinggal kelas beserta alasannya', () => {
    const d = buildDigest([
      row({ studentId: '1', studentName: 'Budi', decision: 'retain', reason: 'Nilai', followUp: 'Remedial' }),
      row({ studentId: '2', studentName: 'Ani', decision: 'retain', className: '9A' }),
      row({ studentId: '3', decision: 'graduate' }),
      row({ studentId: '4', classId: 'c0', className: '8A', level: '8', decision: 'promote' }),
    ]);
    expect(d.totals).toEqual({ total: 4, promote: 1, retain: 2, graduate: 1 });
    expect(d.classes.map((c) => [c.name, c.promote, c.retain, c.graduate])).toEqual([
      ['8A', 1, 0, 0],
      ['9A', 0, 2, 1],
    ]);
    expect(d.retained.map((r) => r.name)).toEqual(['Ani', 'Budi']);
    expect(d.retained[1]).toMatchObject({ reason: 'Nilai', followUp: 'Remedial' });
  });

  it('tanpa keputusan: rekap kosong', () => {
    expect(buildDigest([])).toEqual({
      totals: { total: 0, promote: 0, retain: 0, graduate: 0 },
      classes: [],
      retained: [],
    });
  });
});

describe('izin', () => {
  it('guru ditolak di semua rute; kepala sekolah hanya membaca; tanpa login 401', async () => {
    const m = await createMeeting({ title: 'Untuk izin' });
    for (const [method, url, body] of [
      ['GET', '/v1/council-meetings', undefined],
      ['GET', `/v1/council-meetings/${m.id}`, undefined],
      ['POST', '/v1/council-meetings', meetingBody()],
      ['PUT', `/v1/council-meetings/${m.id}`, meetingBody()],
      ['DELETE', `/v1/council-meetings/${m.id}`, undefined],
      ['POST', `/v1/council-meetings/${m.id}/finalize`, undefined],
      ['POST', `/v1/council-meetings/${m.id}/reopen`, undefined],
      ['PUT', `/v1/council-meetings/${m.id}/decisions`, { studentIds: [] }],
      ['GET', `/v1/academic-years/${years.y1}/promotions/summary`, undefined],
    ] as const) {
      expect((await call(method, url, teacherCookie, body)).statusCode, `guru ${method} ${url}`).toBe(403);
    }
    expect((await app.inject('/v1/council-meetings')).statusCode).toBe(401);
    // Kepala sekolah: baca boleh (report_card:read_all), tulis tidak (promotion:manage).
    expect((await call('GET', '/v1/council-meetings', principalCookie)).statusCode).toBe(200);
    expect((await call('GET', `/v1/council-meetings/${m.id}`, principalCookie)).statusCode).toBe(200);
    expect(
      (await call('GET', `/v1/academic-years/${years.y1}/promotions/summary`, principalCookie)).statusCode,
    ).toBe(200);
    expect((await call('POST', '/v1/council-meetings', principalCookie, meetingBody())).statusCode).toBe(403);
    expect((await call('DELETE', `/v1/council-meetings/${m.id}`, principalCookie)).statusCode).toBe(403);
    expect((await call('POST', `/v1/council-meetings/${m.id}/finalize`, principalCookie)).statusCode).toBe(
      403,
    );
    await call('DELETE', `/v1/council-meetings/${m.id}`, adminCookie);
  });
});

describe('CRUD berita acara', () => {
  let id = '';

  it('membuat berita acara draf dengan peserta (guru dan nama bebas) dan membacanya', async () => {
    const res = await call('POST', '/v1/council-meetings', adminCookie, meetingBody({ classId: cls['9A'] }));
    expect(res.statusCode).toBe(201);
    const body = res.json();
    id = body.id;
    expect(body).toMatchObject({
      academicYearId: years.y1,
      kind: 'promotion',
      status: 'draft',
      heldOn: '2027-06-20',
      classId: cls['9A'],
      className: '9A',
      attendeeCount: 2,
      linkedCount: 0,
      frozen: false,
      finalizedAt: null,
    });
    // Nama peserta guru diisi dari data guru bila `name` kosong.
    expect(body.attendees).toEqual([
      { teacherId, name: 'Guru Wali', positionTitle: 'Wali kelas', role: 'member' },
      { teacherId: null, name: 'Bapak Tamu', positionTitle: 'Pengawas', role: 'member' },
    ]);
    const list = (await call('GET', `/v1/council-meetings?academicYearId=${years.y1}`, adminCookie)).json();
    expect(list.items.map((i: { id: string }) => i.id)).toContain(id);
    expect(
      (await call('GET', `/v1/council-meetings?kind=graduation`, adminCookie)).json().items,
    ).toHaveLength(0);
    expect((await call('GET', `/v1/council-meetings?status=final`, adminCookie)).json().items).toHaveLength(
      0,
    );
  });

  it('mengubah isi dan mengganti peserta; peserta dihilangkan = tetap', async () => {
    const res = await call(
      'PUT',
      `/v1/council-meetings/${id}`,
      adminCookie,
      meetingBody({
        title: 'Judul baru',
        heldOn: '2027-06-22',
        attendees: [{ name: 'Satu Orang', role: 'chair' }],
        semesterId: sem1,
        classId: null,
      }),
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      title: 'Judul baru',
      heldOn: '2027-06-22',
      semesterId: sem1,
      classId: null,
    });
    expect(res.json().attendees).toEqual([
      { teacherId: null, name: 'Satu Orang', positionTitle: null, role: 'chair' },
    ]);
    const keep = await call('PUT', `/v1/council-meetings/${id}`, adminCookie, {
      ...meetingBody({ title: 'Judul baru', heldOn: '2027-06-22', semesterId: sem1 }),
      attendees: undefined,
    });
    expect(keep.json().attendees).toHaveLength(1);
  });

  it('menolak masukan tidak sah dan rujukan yang salah (400)', async () => {
    const bad = async (over: Record<string, unknown>, code: string) => {
      const res = await call('POST', '/v1/council-meetings', adminCookie, meetingBody(over));
      expect(res.statusCode, JSON.stringify(over)).toBe(400);
      if (code) expect(res.json().error.code).toBe(code);
    };
    await bad({ title: '' }, '');
    await bad({ heldOn: '20-06-2027' }, '');
    await bad({ kind: 'lain' }, '');
    await bad({ academicYearId: years.other }, 'invalid_reference');
    await bad({ classId: cls.otherC }, 'invalid_reference');
    await bad({ classId: FAKE }, 'invalid_reference');
    await bad({ semesterId: FAKE }, 'invalid_reference');
    await bad({ attendees: [{ teacherId: otherTeacherId, role: 'member' }] }, 'invalid_reference');
    await bad({ attendees: [{ role: 'member' }] }, 'invalid_reference');
    await bad({ attendees: [{ name: 'X', role: 'bendahara' }] }, '');
  });

  it('404 untuk id yang tidak ada; menghapus draf melepas tautan keputusan', async () => {
    expect((await call('GET', `/v1/council-meetings/${FAKE}`, adminCookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/council-meetings/${FAKE}`, adminCookie)).statusCode).toBe(404);
    await decide([{ studentId: stu.p1, decision: 'promote', meetingId: id }]);
    expect((await decisionRow('p1')).meetingId).toBe(id);
    const del = await call('DELETE', `/v1/council-meetings/${id}`, adminCookie);
    expect(del.statusCode).toBe(200);
    expect((await decisionRow('p1')).meetingId).toBeNull();
    expect((await call('GET', `/v1/council-meetings/${id}`, adminCookie)).statusCode).toBe(404);
    expect(
      await db().select().from(councilMeetingAttendee).where(eq(councilMeetingAttendee.meetingId, id)),
    ).toHaveLength(0);
    await db().delete(promotionDecision).where(eq(promotionDecision.studentId, stu.p1!));
  });
});

describe('tautan keputusan ke berita acara dan penguncian', () => {
  let m1 = '';
  let m2 = '';

  it('PUT promotions dengan meetingId menautkan, mengikuti tanggal berita acara, dan daftar mengembalikannya', async () => {
    m1 = (await createMeeting({ heldOn: '2027-06-21' })).id;
    m2 = (await createMeeting({ heldOn: '2027-06-25', title: 'Rapat kedua' })).id;
    const res = await decide([
      { studentId: stu.p1, decision: 'promote', meetingId: m1 },
      {
        studentId: stu.f1,
        decision: 'retain',
        reason: 'Nilai belum tuntas',
        followUp: 'Pendampingan wali kelas',
        meetingDate: '2027-01-01',
        meetingId: m1,
      },
      { studentId: stu.f2, decision: 'retain', reason: 'Kehadiran rendah', meetingId: m1 },
      { studentId: stu.f3, decision: 'graduate' },
      { studentId: stu.b1, decision: 'graduate' },
    ]);
    expect(res.statusCode, res.body).toBe(200);
    // meetingDate eksplisit ditimpa tanggal berita acara.
    const f1 = await decisionRow('f1');
    expect(f1).toMatchObject({ meetingId: m1, meetingDate: '2027-06-21' });
    expect((await decisionRow('f3')).meetingId).toBeNull();
    const list = (await call('GET', `/v1/academic-years/${years.y1}/promotions`, adminCookie)).json();
    const s9 = list.classes.find((c: { name: string }) => c.name === '9A').students;
    expect(s9.find((s: { studentId: string }) => s.studentId === stu.f1)).toMatchObject({ meetingId: m1 });
    // Sparse: murid tanpa tautan tidak membawa field.
    expect(s9.find((s: { studentId: string }) => s.studentId === stu.f3)).not.toHaveProperty('meetingId');
  });

  it('meetingId dihilangkan dipertahankan, null melepas, berita acara tahun lain atau tak ada ditolak 400', async () => {
    await decide([{ studentId: stu.f2, decision: 'retain', note: 'catatan' }]);
    expect((await decisionRow('f2')).meetingId).toBe(m1);
    for (const meetingId of [otherMeetingId, FAKE]) {
      const res = await decide([{ studentId: stu.f2, decision: 'retain', meetingId }]);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_reference');
    }
    await decide([{ studentId: stu.f2, decision: 'retain', meetingId: null }]);
    expect((await decisionRow('f2')).meetingId).toBeNull();
    await decide([{ studentId: stu.f2, decision: 'retain', meetingId: m1 }]);
  });

  it('PUT /:id/decisions mengganti himpunan tautan; murid tanpa keputusan ditolak', async () => {
    const res = await call('PUT', `/v1/council-meetings/${m2}/decisions`, adminCookie, {
      studentIds: [stu.f3],
    });
    expect(res.json()).toEqual({ linked: 1, unlinked: 0 });
    expect(await decisionRow('f3')).toMatchObject({ meetingId: m2, meetingDate: '2027-06-25' });
    const move = await call('PUT', `/v1/council-meetings/${m2}/decisions`, adminCookie, {
      studentIds: [stu.f3, stu.f2],
    });
    expect(move.json()).toEqual({ linked: 2, unlinked: 0 });
    expect((await decisionRow('f2')).meetingId).toBe(m2);
    const swap = await call('PUT', `/v1/council-meetings/${m2}/decisions`, adminCookie, {
      studentIds: [stu.f2],
    });
    expect(swap.json()).toEqual({ linked: 1, unlinked: 1 });
    expect((await decisionRow('f3')).meetingId).toBeNull();
    // b1 punya keputusan; sekolah lain/tanpa keputusan ditolak.
    const noDecision = await call('PUT', `/v1/council-meetings/${m2}/decisions`, adminCookie, {
      studentIds: [stu.f2, FAKE],
    });
    expect(noDecision.statusCode).toBe(400);
    expect(noDecision.json().error.code).toBe('invalid_reference');
    // Kembalikan f2 ke m1.
    await call('PUT', `/v1/council-meetings/${m1}/decisions`, adminCookie, {
      studentIds: [stu.p1, stu.f1, stu.f2],
    });
    expect((await decisionRow('f2')).meetingId).toBe(m1);
  });

  it('detail memuat rekap keputusan tertaut (jumlah dan daftar tinggal kelas dengan alasan)', async () => {
    const d = (await call('GET', `/v1/council-meetings/${m1}`, adminCookie)).json();
    expect(d.frozen).toBe(false);
    expect(d.linkedCount).toBe(3);
    expect(d.digest.totals).toEqual({ total: 3, promote: 1, retain: 2, graduate: 0 });
    expect(d.digest.retained).toEqual([
      expect.objectContaining({
        name: 'Siswa f1',
        className: '9A',
        reason: 'Nilai belum tuntas',
        followUp: 'Pendampingan wali kelas',
      }),
      expect.objectContaining({ name: 'Siswa f2', reason: 'Kehadiran rendah' }),
    ]);
    expect(d.linked).toHaveLength(3);
  });

  it('finalisasi membekukan rekap, mengunci berita acara dan keputusan tertaut; buka kembali memulihkan', async () => {
    const fin = await call('POST', `/v1/council-meetings/${m1}/finalize`, adminCookie);
    expect(fin.statusCode, fin.body).toBe(200);
    expect(fin.json()).toMatchObject({ status: 'final', frozen: true });
    expect(fin.json().finalizedAt).toBeTruthy();
    const [row] = await db().select().from(councilMeeting).where(eq(councilMeeting.id, m1));
    expect(row!.minutes).toMatchObject({ version: 1, digest: { totals: { retain: 2 } } });
    expect(row!.finalizedBy).toBeTruthy();

    // Berita acara terkunci.
    for (const [method, url, body] of [
      ['PUT', `/v1/council-meetings/${m1}`, meetingBody()],
      ['DELETE', `/v1/council-meetings/${m1}`, undefined],
      ['POST', `/v1/council-meetings/${m1}/finalize`, undefined],
      ['PUT', `/v1/council-meetings/${m1}/decisions`, { studentIds: [stu.f1] }],
    ] as const) {
      const res = await call(method, url, adminCookie, body);
      expect(res.statusCode, `${method} ${url}`).toBe(409);
      expect(res.json().error.code).toBe('meeting_final');
    }
    // Keputusan tertaut terkunci (mengubah alasan, keputusan, atau melepas tautan), yang tidak tertaut tetap bebas.
    for (const item of [
      { studentId: stu.f1, decision: 'retain', reason: 'Diubah diam-diam' },
      { studentId: stu.f1, decision: 'retain', meetingId: null },
      { studentId: stu.p1, decision: 'retain' },
    ]) {
      const res = await decide([item]);
      expect(res.statusCode, JSON.stringify(item)).toBe(409);
      expect(res.json().error.code).toBe('meeting_final');
    }
    expect((await decisionRow('f1')).reason).toBe('Nilai belum tuntas');
    expect((await decide([{ studentId: stu.f3, decision: 'graduate', reason: 'bebas' }])).statusCode).toBe(
      200,
    );
    // Menautkan keputusan ke berita acara final ditolak.
    const link = await decide([{ studentId: stu.f3, decision: 'graduate', meetingId: m1 }]);
    expect(link.statusCode).toBe(409);
    expect(link.json().error.code).toBe('meeting_final');
    // Memindah tautan keputusan yang kini di berita acara final ke berita acara lain juga ditolak.
    const steal = await call('PUT', `/v1/council-meetings/${m2}/decisions`, adminCookie, {
      studentIds: [stu.f1],
    });
    expect(steal.statusCode).toBe(409);

    // Rekap beku tidak ikut berubah walau data hidup berubah (mis. murid dihapus dari daftar oleh tindakan basis data).
    await db().execute(sql`update promotion_decision set reason = 'x' where student_id = ${stu.f1}`);
    const frozen = (await call('GET', `/v1/council-meetings/${m1}`, adminCookie)).json();
    expect(frozen.digest.retained[0].reason).toBe('Nilai belum tuntas');
    await db().execute(
      sql`update promotion_decision set reason = 'Nilai belum tuntas' where student_id = ${stu.f1}`,
    );

    const reopen = await call('POST', `/v1/council-meetings/${m1}/reopen`, adminCookie);
    expect(reopen.statusCode).toBe(200);
    expect(reopen.json()).toMatchObject({ status: 'draft', frozen: false, finalizedAt: null });
    const [after] = await db().select().from(councilMeeting).where(eq(councilMeeting.id, m1));
    expect(after!.minutes).toBeNull();
    expect(
      (await decide([{ studentId: stu.f1, decision: 'retain', reason: 'Boleh diubah' }])).statusCode,
    ).toBe(200);
    const again = await call('POST', `/v1/council-meetings/${m1}/reopen`, adminCookie);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('meeting_not_final');
  });

  it('CHECK basis data: berita acara final wajib punya minutes', async () => {
    await expect(
      db().execute(sql`update council_meeting set status = 'final' where id = ${m2}`),
    ).rejects.toThrow();
  });

  it('penerapan keputusan tetap jalan untuk keputusan tertaut ke berita acara final (hanya penanda terapan)', async () => {
    await call('POST', `/v1/council-meetings/${m1}/finalize`, adminCookie);
    const res = await apply({ targetYearId: years.y2, dryRun: true });
    expect(res.statusCode).toBe(200);
    await call('POST', `/v1/council-meetings/${m1}/reopen`, adminCookie);
  });
});

describe('laporan ringkas keputusan per tahun ajaran', () => {
  it('jumlah naik/tinggal/lulus per kelas, daftar tinggal kelas, filter kelas dan berita acara, dan yang belum diputuskan', async () => {
    const res = await call('GET', `/v1/academic-years/${years.y1}/promotions/summary`, adminCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.academicYear).toMatchObject({ id: years.y1, name: '2026/2027' });
    expect(body.digest.totals).toEqual({ total: 5, promote: 1, retain: 2, graduate: 2 });
    expect(body.digest.classes.map((c: { name: string }) => c.name)).toEqual(['8A', '9A', '9B']);
    expect(body.undecided).toBe(0);
    const only = (
      await call('GET', `/v1/academic-years/${years.y1}/promotions/summary?classId=${cls['9A']}`, adminCookie)
    ).json();
    expect(only.digest.totals).toEqual({ total: 3, promote: 0, retain: 2, graduate: 1 });
    expect(only.digest.retained).toHaveLength(2);
    const none = (
      await call('GET', `/v1/academic-years/${years.y1}/promotions/summary?meetingId=${FAKE}`, adminCookie)
    ).json();
    expect(none.digest.totals.total).toBe(0);
    expect((await call('GET', `/v1/academic-years/${FAKE}/promotions/summary`, adminCookie)).statusCode).toBe(
      404,
    );
  });
});

describe('multi-tenant dan FK komposit', () => {
  it('sekolah lain tidak melihat atau mengubah berita acara sekolah ini', async () => {
    const mine = await createMeeting({ title: 'Milik sekolah ini' });
    const list = (await call('GET', '/v1/council-meetings', otherCookie, undefined, otherSchoolId)).json();
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([otherMeetingId]);
    for (const [method, url, body] of [
      ['GET', `/v1/council-meetings/${mine.id}`, undefined],
      [
        'PUT',
        `/v1/council-meetings/${mine.id}`,
        { ...meetingBody({ academicYearId: undefined }), attendees: [] },
      ],
      ['DELETE', `/v1/council-meetings/${mine.id}`, undefined],
      ['POST', `/v1/council-meetings/${mine.id}/finalize`, undefined],
      ['PUT', `/v1/council-meetings/${mine.id}/decisions`, { studentIds: [] }],
    ] as const) {
      const res = await call(method, url, otherCookie, body, otherSchoolId);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    // Anggota sekolah ini tidak bisa memakai header sekolah lain.
    expect(
      (await call('GET', '/v1/council-meetings', adminCookie, undefined, otherSchoolId)).statusCode,
    ).toBe(403);
    await call('DELETE', `/v1/council-meetings/${mine.id}`, adminCookie);
  });

  it('FK komposit menolak rujukan silang sekolah (tahun, kelas, semester, guru, keputusan ke berita acara)', async () => {
    const base = {
      schoolId: otherSchoolId,
      academicYearId: years.other,
      kind: 'other' as const,
      title: 'X',
      heldOn: '2027-06-20',
      createdBy: 'uji',
    };
    await expect(
      db()
        .insert(councilMeeting)
        .values({ ...base, academicYearId: years.y1 }),
    ).rejects.toThrow();
    await expect(
      db()
        .insert(councilMeeting)
        .values({ ...base, classId: cls['9A'] }),
    ).rejects.toThrow();
    await expect(
      db()
        .insert(councilMeeting)
        .values({ ...base, semesterId: sem1 }),
    ).rejects.toThrow();
    await expect(
      db().insert(councilMeetingAttendee).values({
        schoolId: otherSchoolId,
        meetingId: otherMeetingId,
        teacherId,
        name: 'Silang',
      }),
    ).rejects.toThrow();
    await expect(
      db().insert(councilMeetingAttendee).values({
        schoolId: schoolId,
        meetingId: otherMeetingId,
        name: 'Silang',
      }),
    ).rejects.toThrow();
    // Keputusan sekolah ini tidak bisa menunjuk berita acara sekolah lain.
    await expect(
      db().execute(
        sql`update promotion_decision set meeting_id = ${otherMeetingId} where student_id = ${stu.f3}`,
      ),
    ).rejects.toThrow();
    // Sah.
    await expect(db().insert(councilMeeting).values(base)).resolves.toBeDefined();
  });

  it('CHECK dan RLS: panjang judul, jenis, status; dua tabel baru memakai RLS yang dipaksa dengan satu kebijakan', async () => {
    const base = {
      schoolId,
      academicYearId: years.y1,
      kind: 'promotion' as const,
      title: 'X',
      heldOn: '2027-06-20',
      createdBy: 'uji',
    };
    await expect(
      db()
        .insert(councilMeeting)
        .values({ ...base, title: '' }),
    ).rejects.toThrow();
    await expect(
      db()
        .insert(councilMeeting)
        .values({ ...base, title: 'x'.repeat(161) }),
    ).rejects.toThrow();
    await expect(
      db()
        .insert(councilMeeting)
        .values({ ...base, kind: 'lain' as never }),
    ).rejects.toThrow();
    await expect(
      db()
        .insert(councilMeetingAttendee)
        .values({ schoolId, meetingId: otherMeetingId, name: 'x', role: 'x' as never }),
    ).rejects.toThrow();
    const rls = await db().execute<{ relname: string; rls: boolean; forced: boolean; policies: number }>(sql`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c where c.relname in ('council_meeting', 'council_meeting_attendee') order by c.relname
    `);
    expect(rls.rows).toEqual([
      { relname: 'council_meeting', rls: true, forced: true, policies: 1 },
      { relname: 'council_meeting_attendee', rls: true, forced: true, policies: 1 },
    ]);
  });
});

describe('tinggal kelas di tingkat akhir', () => {
  const classesOf = (yearId: string) =>
    db().select().from(classRoom).where(eq(classRoom.academicYearId, yearId));
  const enrollmentsOf = (studentKey: string) =>
    db().select().from(enrollment).where(eq(enrollment.studentId, stu[studentKey]!));
  const codes = (res: { json: () => { warningItems: { code: string }[] } }) =>
    res.json().warningItems.map((w) => w.code);

  it('tanpa keputusan tinggal di kelas tingkat akhir itu, kelasnya tidak disalin (perilaku lama)', async () => {
    // f1 dan f2 tinggal di 9A (kelas sebaya hasil kenaikan 8A sudah ada: mereka bergabung di sana, tanpa salinan atau peringatan);
    // b1 lulus di 9B, jadi 9B tidak disalin.
    const res = await rollover({ targetYearId: years.y2, dryRun: true });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.classesCreated).toBe(1);
    expect(body.warningItems).toContainEqual({ code: 'final_level_not_copied', params: { count: 1 } });
    expect(codes(res)).not.toContain('final_level_copied_for_retained');
    expect(codes(res)).not.toContain('class_name_conflict');
  });

  it('b1 tinggal di 9B: rollover menyalin 9B (nama dan tingkat sama); dapat dimatikan; dryRun tidak menulis', async () => {
    await decide([{ studentId: stu.b1, decision: 'retain', reason: 'Belum lulus ujian' }]);
    const dry = await rollover({ targetYearId: years.y2, dryRun: true });
    expect(dry.json().classesCreated).toBe(2);
    expect(dry.json().warningItems).toContainEqual({
      code: 'final_level_copied_for_retained',
      params: { count: 1 },
    });
    expect(dry.json().warningItems.map((w: { code: string }) => w.code)).not.toContain(
      'final_level_not_copied',
    );
    const off = await rollover({ targetYearId: years.y2, dryRun: true, copyFinalLevelForRetained: false });
    expect(off.json().classesCreated).toBe(1);
    expect(codes(off)).toContain('final_level_not_copied');
    expect(await classesOf(years.y2)).toHaveLength(0);
    // Tanpa kelas tujuan, murid tingkat akhir yang tinggal tetap tidak tertempatkan seperti sebelumnya.
    const applyDry = await apply({ targetYearId: years.y2, dryRun: true });
    expect(applyDry.json().unplaced).toContainEqual(
      expect.objectContaining({ studentId: stu.b1, reasonCode: 'no_target_class' }),
    );
  });

  it('setelah rollover, penerapan menempatkan yang tinggal di kelas tingkat akhir tahun tujuan; enrollment lama utuh', async () => {
    const roll = await rollover({ targetYearId: years.y2 });
    expect(roll.statusCode).toBe(200);
    expect(roll.json().classesCreated).toBe(2);
    const created = await classesOf(years.y2);
    expect(created.map((c) => [c.name, c.level]).sort()).toEqual([
      ['9A', '9'],
      ['9B', '9'],
    ]);
    // Idempoten: ulang tidak menggandakan kelas.
    expect((await rollover({ targetYearId: years.y2 })).json().classesCreated).toBe(0);
    const sourceBefore = await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y1));

    const res = await apply({ targetYearId: years.y2 });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ placed: 1, retained: 3, graduated: 1, unplaced: [] });
    const byName = new Map(created.map((c) => [c.name, c.id]));
    expect((await enrollmentsOf('b1')).map((e) => [e.academicYearId, e.classId]).sort()).toEqual(
      [
        [years.y1, cls['9B']],
        [years.y2, byName.get('9B')],
      ].sort(),
    );
    for (const key of ['f1', 'f2']) {
      const rows = await enrollmentsOf(key);
      expect(rows).toHaveLength(2);
      expect(rows.find((e) => e.academicYearId === years.y2)?.classId).toBe(byName.get('9A'));
    }
    // Riwayat tahun sumber tidak berubah.
    const sourceAfter = await db().select().from(enrollment).where(eq(enrollment.academicYearId, years.y1));
    expect(sourceAfter.map((e) => e.id).sort()).toEqual(sourceBefore.map((e) => e.id).sort());
    expect((await decisionRow('b1')).appliedAt).not.toBeNull();
  });

  it('kelas tujuan eksplisit untuk yang tinggal di tingkat akhir dipakai apa adanya', async () => {
    const [extra] = await db()
      .insert(classRoom)
      .values({ schoolId, academicYearId: years.y2, name: 'IX Khusus', level: '9' })
      .returning();
    const [s] = await db()
      .insert(student)
      .values({ schoolId, name: 'Siswa eksplisit', gender: 'L', nis: `ex-${run}` })
      .returning();
    stu.ex = s!.id;
    await db()
      .insert(enrollment)
      .values({ schoolId, studentId: s!.id, classId: cls['9A']!, academicYearId: years.y1 });
    const put = await decide([{ studentId: s!.id, decision: 'retain', toClassId: extra!.id }]);
    expect(put.statusCode, put.body).toBe(200);
    const res = await apply({ targetYearId: years.y2 });
    expect(res.json()).toMatchObject({ retained: 1, unplaced: [] });
    expect((await enrollmentsOf('ex')).find((e) => e.academicYearId === years.y2)?.classId).toBe(extra!.id);
  });
});
