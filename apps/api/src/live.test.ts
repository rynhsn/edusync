import {
  academicYear,
  assignRoles,
  calendarEvent,
  classRoom,
  dailyAttendance,
  enrollment,
  entitlement,
  eq,
  extracurricular,
  extracurricularSession,
  finFeeType,
  finInvoice,
  finPayment,
  finPaymentItem,
  foundation,
  lessonAttendance,
  lessonPeriod,
  member,
  msgMessage,
  scheduleEntry,
  school,
  seedSchoolRoles,
  sql,
  student,
  subject,
  subscription,
  tapEvent,
  teacher,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { jakarta, weekdayOf } from './gate';
import { periodState, startOfJakartaDay } from './live-lib';

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
let noModuleId = '';
let otherId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let treasurerCookie = '';
let teacherCookie = '';
let noModuleCookie = '';
let otherCookie = '';

const ids = {
  year: '',
  cls: '',
  subject: '',
  teacher: '',
  entry1: '',
  ani: '',
  budi: '',
  citra: '',
  dedi: '',
};
/** Waktu tap, dihitung dari "sekarang" saat tes dimulai. */
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms);
const tapIds: Record<string, string> = {};

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
async function join(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return login(u.email);
}

const get = (url: string, cookie: string, sid = schoolId) =>
  app.inject({ method: 'GET', url, headers: { cookie, 'x-school-id': sid, origin } });
const snapshot = async (cookie: string, sid = schoolId) =>
  (await get('/v1/live/snapshot', cookie, sid)).json();
const events = async (qs: string, cookie = adminCookie, sid = schoolId) =>
  (await get(`/v1/live/events${qs}`, cookie, sid)).json() as {
    events: { id: string; kind: string; at: string; className: string | null; studentName: string | null }[];
    cursor: string;
  };
const names = (r: { events: { studentName: string | null }[] }) => r.events.map((e) => e.studentName);

const today = jakarta(new Date()).date;
const weekday = weekdayOf(today);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Hidup', slug: `yh-${run}` })
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
  const make = async (slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`live-${run}`, ['attendance', 'schedule', 'finance', 'messaging', 'extracurricular']);
  noModuleId = await make(`live-nomod-${run}`, []);
  otherId = await make(`live-lain-${run}`, ['attendance']);

  const mkYear = async (sid: string) => {
    const [y] = await db
      .insert(academicYear)
      .values({
        schoolId: sid,
        name: '2000-2099',
        startsOn: '2000-01-01',
        endsOn: '2099-12-31',
        isActive: true,
      })
      .returning();
    return y!.id;
  };
  ids.year = await mkYear(schoolId);
  const otherYear = await mkYear(otherId);
  const mkClass = async (sid: string, yearId: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name: '7A', level: '7' })
      .returning();
    return c!.id;
  };
  ids.cls = await mkClass(schoolId, ids.year);
  const otherCls = await mkClass(otherId, otherYear);
  const mkStudent = async (
    sid: string,
    yearId: string,
    classId: string,
    name: string,
    status: 'active' | 'graduated' = 'active',
  ) => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, gender: 'L', status }).returning();
    await db.insert(enrollment).values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yearId });
    return s!.id;
  };
  ids.ani = await mkStudent(schoolId, ids.year, ids.cls, 'Ani');
  ids.budi = await mkStudent(schoolId, ids.year, ids.cls, 'Budi');
  ids.citra = await mkStudent(schoolId, ids.year, ids.cls, 'Citra');
  ids.dedi = await mkStudent(schoolId, ids.year, ids.cls, 'Dedi');
  await mkStudent(schoolId, ids.year, ids.cls, 'Alumni', 'graduated');
  const otherStudent = await mkStudent(otherId, otherYear, otherCls, 'Siswa Lain');

  /* Absensi harian hari ini: Ani hadir, Budi terlambat, Citra sakit, Dedi belum ada catatan. */
  for (const [studentId, status] of [
    [ids.ani, 'present'],
    [ids.budi, 'late'],
    [ids.citra, 'sick'],
  ] as const) {
    await db.insert(dailyAttendance).values({ schoolId, studentId, date: today, status });
  }

  /* Tap: tiga dalam 10 menit terakhir, satu 15 menit lalu, satu kemarin, satu di sekolah lain. */
  const tap = async (key: string, sid: string, studentId: string, direction: 'in' | 'out', at: Date) => {
    const [row] = await db
      .insert(tapEvent)
      .values({ schoolId: sid, studentId, direction, source: 'rfid', at })
      .returning({ id: tapEvent.id });
    tapIds[key] = row!.id;
  };
  await tap('dedi', schoolId, ids.dedi, 'in', ago(15 * 60_000));
  await tap('ani', schoolId, ids.ani, 'in', ago(120_000));
  await tap('budi', schoolId, ids.budi, 'in', ago(90_000));
  await tap('citra', schoolId, ids.citra, 'out', ago(60_000));
  await tap('kemarin', schoolId, ids.ani, 'in', ago(36 * 3_600_000));
  await tap('lain', otherId, otherStudent, 'in', ago(30_000));

  /* Keuangan: A sisa 60.000 lewat tempo, B sisa 50.000 belum tempo, C lunas, D batal. */
  const [fee] = await db.insert(finFeeType).values({ schoolId, name: 'SPP', kind: 'monthly' }).returning();
  const inv = async (
    studentId: string,
    title: string,
    amount: number,
    discount: number,
    dueDate: string,
    status: 'open' | 'void' = 'open',
  ) => {
    const [i] = await db
      .insert(finInvoice)
      .values({
        schoolId,
        studentId,
        academicYearId: ids.year,
        feeTypeId: fee!.id,
        title,
        amount,
        discount,
        dueDate,
        status,
        createdBy: 'tes',
      })
      .returning({ id: finInvoice.id });
    return i!.id;
  };
  const invA = await inv(ids.ani, 'A', 100_000, 10_000, '2000-01-01');
  const invB = await inv(ids.budi, 'B', 50_000, 0, '2099-01-01');
  const invC = await inv(ids.citra, 'C', 40_000, 0, '2000-01-01');
  await inv(ids.dedi, 'D', 99_999, 0, '2000-01-01', 'void');
  const pay = async (
    receiptNo: string,
    studentId: string,
    invoiceId: string,
    amount: number,
    paidAt: Date,
    voided = false,
  ) => {
    const [p] = await db
      .insert(finPayment)
      .values({
        schoolId,
        receiptNo,
        studentId,
        paidAt,
        method: 'cash',
        total: amount,
        recordedBy: 'tes',
        ...(voided ? { voidedAt: new Date(), voidedBy: 'tes', voidReason: 'salah' } : {}),
      })
      .returning({ id: finPayment.id });
    await db.insert(finPaymentItem).values({ schoolId, paymentId: p!.id, invoiceId, amount });
  };
  await pay('LV-1', ids.ani, invA, 30_000, new Date());
  await pay('LV-2', ids.citra, invC, 25_000, new Date());
  await pay('LV-3', ids.citra, invC, 15_000, ago(3 * 86_400_000));
  await pay('LV-4', ids.budi, invB, 5_000, new Date(), true);

  /* Pesan: 3 antre/sedang kirim, 1 gagal baru, 1 gagal 30 jam lalu, 1 terkirim. */
  const msg = async (status: 'queued' | 'sending' | 'sent' | 'failed', createdAt = new Date()) => {
    // notBefore jauh di depan agar worker pesan yang mungkin jalan di DB dev tidak mengambil baris uji.
    await db.insert(msgMessage).values({
      schoolId,
      eventKey: 'tes',
      toPhone: '628111',
      body: 'tes',
      status,
      createdAt,
      notBefore: new Date('2099-01-01T00:00:00Z'),
    });
  };
  await msg('queued');
  await msg('queued');
  await msg('sending');
  await msg('failed');
  await msg('failed', ago(30 * 3_600_000));
  await msg('sent');

  /* Ekstrakurikuler: satu pertemuan hari ini, satu kemarin. */
  const [ex] = await db.insert(extracurricular).values({ schoolId, name: 'Pramuka' }).returning();
  await db
    .insert(extracurricularSession)
    .values({ schoolId, extracurricularId: ex!.id, date: today, recordedBy: 'tes' });
  await db.insert(extracurricularSession).values({
    schoolId,
    extracurricularId: ex!.id,
    date: jakarta(ago(86_400_000)).date,
    recordedBy: 'tes',
  });

  /* Jadwal: jam 1 sepanjang hari (00:00-23:59) selalu mencakup "sekarang" kecuali tepat 23:59; jam 2 mulai 23:59. */
  const [subj] = await db.insert(subject).values({ schoolId, code: 'MTK', name: 'Matematika' }).returning();
  ids.subject = subj!.id;
  const [tch] = await db.insert(teacher).values({ schoolId, name: 'Guru Tes' }).returning();
  ids.teacher = tch!.id;
  const [p1] = await db
    .insert(lessonPeriod)
    .values({ schoolId, number: 1, startsAt: '00:00', endsAt: '23:59' })
    .returning();
  const [p2] = await db
    .insert(lessonPeriod)
    .values({ schoolId, number: 2, startsAt: '23:59', endsAt: '23:59' })
    .returning();
  if (weekday <= 6) {
    const [e1] = await db
      .insert(scheduleEntry)
      .values({
        schoolId,
        academicYearId: ids.year,
        classId: ids.cls,
        subjectId: ids.subject,
        teacherId: ids.teacher,
        weekday,
        periodId: p1!.id,
      })
      .returning();
    ids.entry1 = e1!.id;
    await db.insert(scheduleEntry).values({
      schoolId,
      academicYearId: ids.year,
      classId: ids.cls,
      subjectId: ids.subject,
      teacherId: ids.teacher,
      weekday,
      periodId: p2!.id,
    });
  }

  adminCookie = await join('admin-live', schoolId, ['school_admin']);
  treasurerCookie = await join('bendahara-live', schoolId, ['treasurer']);
  teacherCookie = await join('guru-live', schoolId, ['teacher']);
  noModuleCookie = await join('admin-tanpa-modul-live', noModuleId, ['school_admin']);
  otherCookie = await join('admin-live-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of [
      'audit_log',
      'msg_message',
      'fin_payment_item',
      'fin_payment',
      'fin_invoice',
      'fin_fee_type',
      'fin_counter',
      'extracurricular_session',
      'extracurricular',
      'lesson_attendance',
      'tap_event',
      'daily_attendance',
      'schedule_entry',
      'calendar_event',
      'lesson_period',
      'enrollment',
      'student',
      'teacher',
      'subject',
      'class_room',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('periodState (murni, jam disuntik)', () => {
  const periods = [
    { number: 2, startsAt: '08:20', endsAt: '09:00' },
    { number: 1, startsAt: '07:00', endsAt: '07:40' },
    { number: 3, startsAt: '09:00', endsAt: '09:40' },
  ];
  it('menentukan jam berjalan dan jam berikutnya dengan batas awal inklusif dan akhir eksklusif', () => {
    expect(periodState(periods, '06:59')).toEqual({ currentPeriod: null, nextPeriodStartsAt: '07:00' });
    expect(periodState(periods, '07:00')).toEqual({ currentPeriod: 1, nextPeriodStartsAt: '08:20' });
    expect(periodState(periods, '07:39')).toEqual({ currentPeriod: 1, nextPeriodStartsAt: '08:20' });
    expect(periodState(periods, '07:40')).toEqual({ currentPeriod: null, nextPeriodStartsAt: '08:20' });
    expect(periodState(periods, '09:00')).toEqual({ currentPeriod: 3, nextPeriodStartsAt: null });
    expect(periodState(periods, '12:00')).toEqual({ currentPeriod: null, nextPeriodStartsAt: null });
    expect(periodState([], '10:00')).toEqual({ currentPeriod: null, nextPeriodStartsAt: null });
  });
  it('awal hari Jakarta adalah 17:00 UTC hari sebelumnya', () => {
    expect(startOfJakartaDay('2026-10-30').toISOString()).toBe('2026-10-29T17:00:00.000Z');
  });
});

describe('/v1/live/snapshot', () => {
  it('admin sekolah dengan semua modul mendapat semua bagian dengan angka yang benar', async () => {
    const s = await snapshot(adminCookie);
    expect(s.date).toBe(today);
    expect(s.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(s.closed).toBeNull();
    expect(s.attendance).toEqual({
      total: 4,
      present: 1,
      late: 1,
      excused: 0,
      sick: 1,
      absent: 0,
      notYet: 1,
    });
    expect(s.finance).toEqual({
      openInvoices: 2,
      outstanding: 110_000,
      overdueOutstanding: 60_000,
      paidToday: 55_000,
    });
    expect(s.messaging).toEqual({ queued: 3, failed24h: 1 });
    expect(s.extracurricular).toEqual({ sessionsToday: 1 });
  });

  it('jam pelajaran berjalan memakai jadwal hari ini dan hitungan yang belum terisi', async () => {
    const s = await snapshot(adminCookie);
    const next = s.time < '23:59' ? '23:59' : null;
    if (weekday > 6) {
      expect(s.lessons).toEqual({ running: [], currentPeriod: null, nextPeriodStartsAt: null, unfilled: 0 });
      return;
    }
    // Jam 1 (00:00-23:59) mencakup sekarang kecuali tepat pada 23:59.
    const inPeriod1 = s.time < '23:59';
    expect(s.lessons.running).toEqual(
      inPeriod1
        ? [
            {
              className: '7A',
              subjectName: 'Matematika',
              periodNumber: 1,
              startsAt: '00:00',
              endsAt: '23:59',
            },
          ]
        : [],
    );
    expect(s.lessons.currentPeriod).toBe(inPeriod1 ? 1 : null);
    expect(s.lessons.nextPeriodStartsAt).toBe(next);
    // Jam 1 sudah mulai dan kosong; jam 2 (23:59) belum mulai kecuali sekarang 23:59.
    expect(s.lessons.unfilled).toBe(s.time < '23:59' ? 1 : 2);

    // Setelah satu baris absensi jam 1 tersimpan, jam itu tidak lagi dihitung belum terisi.
    await app.platformDb.insert(lessonAttendance).values({
      schoolId,
      scheduleEntryId: ids.entry1,
      studentId: ids.ani,
      date: today,
      status: 'present',
      recordedBy: 'tes',
    });
    const after = await snapshot(adminCookie);
    expect(after.lessons.unfilled).toBe(s.time < '23:59' ? 0 : 1);
  });

  it('bagian disembunyikan menurut izin: bendahara hanya keuangan, guru tanpa keuangan dan pesan', async () => {
    const t = await snapshot(treasurerCookie);
    expect(t.attendance).toBeNull();
    expect(t.lessons).toBeNull();
    expect(t.messaging).toBeNull();
    expect(t.extracurricular).toBeNull();
    expect(t.finance).toMatchObject({ openInvoices: 2, outstanding: 110_000 });

    const g = await snapshot(teacherCookie);
    expect(g.attendance).toMatchObject({ total: 4 });
    expect(g.lessons).not.toBeNull();
    expect(g.extracurricular).toEqual({ sessionsToday: 1 });
    expect(g.finance).toBeNull();
    expect(g.messaging).toBeNull();
  });

  it('sekolah tanpa modul semua null, sekolah lain hanya melihat datanya sendiri', async () => {
    const n = await snapshot(noModuleCookie, noModuleId);
    expect(n).toMatchObject({
      attendance: null,
      lessons: null,
      finance: null,
      messaging: null,
      extracurricular: null,
    });
    expect(n.date).toBe(today);

    const o = await snapshot(otherCookie, otherId);
    expect(o.attendance).toEqual({
      total: 1,
      present: 0,
      late: 0,
      excused: 0,
      sick: 0,
      absent: 0,
      notYet: 1,
    });
    expect(o.lessons).toEqual({ running: [], currentPeriod: null, nextPeriodStartsAt: null, unfilled: 0 });
    expect(o.finance).toBeNull();
    expect(o.messaging).toBeNull();
    expect(o.extracurricular).toBeNull();
  });

  it('tanpa sesi 401, bukan anggota 403', async () => {
    expect((await app.inject('/v1/live/snapshot')).statusCode).toBe(401);
    expect((await get('/v1/live/snapshot', adminCookie, otherId)).statusCode).toBe(403);
  });
});

describe('/v1/live/events', () => {
  it('tanpa after: tap 10 menit terakhir, urut naik, dengan kelas dan arah', async () => {
    const r = await events('');
    expect(names(r)).toEqual(['Ani', 'Budi', 'Citra']);
    expect(r.events.map((e) => e.kind)).toEqual(['arrival', 'arrival', 'departure']);
    expect(r.events.every((e) => e.className === '7A')).toBe(true);
    expect(r.events.map((e) => e.id)).toEqual([tapIds.ani, tapIds.budi, tapIds.citra]);
    expect(r.cursor).toBe(r.events[2]?.at);
  });

  it('after bersifat eksklusif dan kursor yang sama mengembalikan kosong dengan kursor tetap', async () => {
    const first = await events('');
    const r = await events(`?after=${encodeURIComponent(first.events[0]?.at ?? '')}`);
    expect(names(r)).toEqual(['Budi', 'Citra']);
    const empty = await events(`?after=${encodeURIComponent(first.cursor)}`);
    expect(empty.events).toEqual([]);
    expect(empty.cursor).toBe(first.cursor);
  });

  it('limit: tanpa after yang terbaru, dengan after yang paling awal; after lama tetap dibatasi hari ini', async () => {
    expect(names(await events('?limit=2'))).toEqual(['Budi', 'Citra']);
    const early = ago(20 * 60_000).toISOString();
    expect(names(await events(`?after=${encodeURIComponent(early)}&limit=2`))).toEqual(['Dedi', 'Ani']);
    const old = ago(40 * 3_600_000).toISOString();
    const all = await events(`?after=${encodeURIComponent(old)}&limit=50`);
    // Tap kemarin tidak ikut meski after lebih lama.
    expect(all.events.map((e) => e.id)).not.toContain(tapIds.kemarin);
    expect(names(all)).toEqual(['Dedi', 'Ani', 'Budi', 'Citra']);
    expect((await get('/v1/live/events?limit=51', adminCookie)).statusCode).toBe(400);
    expect((await get('/v1/live/events?after=bukan-tanggal', adminCookie)).statusCode).toBe(400);
  });

  it('lintas sekolah tidak bocor', async () => {
    const o = await events('', otherCookie, otherId);
    expect(names(o)).toEqual(['Siswa Lain']);
    expect(o.events.map((e) => e.id)).not.toContain(tapIds.ani);
    expect(JSON.stringify(await events('')).includes('Siswa Lain')).toBe(false);
  });

  it('tanpa modul atau tanpa attendance:read: kosong dengan kursor', async () => {
    const after = ago(60_000).toISOString();
    const n = await events(`?after=${encodeURIComponent(after)}`, noModuleCookie, noModuleId);
    expect(n).toEqual({ events: [], cursor: after });
    const b = await events('', treasurerCookie);
    expect(b.events).toEqual([]);
    expect(Number.isNaN(Date.parse(b.cursor))).toBe(false);
  });
});

describe('hari libur', () => {
  it('closed terisi dan jam pelajaran tidak dianggap berjalan', async () => {
    await app.platformDb.insert(calendarEvent).values({
      schoolId,
      academicYearId: ids.year,
      type: 'holiday',
      scope: 'school',
      title: 'Libur Uji',
      startsOn: today,
      endsOn: today,
    });
    const s = await snapshot(adminCookie);
    expect(s.closed).toEqual({ type: 'holiday', title: 'Libur Uji' });
    expect(s.lessons).toEqual({ running: [], currentPeriod: null, nextPeriodStartsAt: null, unfilled: 0 });
  });
});
