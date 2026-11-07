import {
  academicYear,
  and,
  assignRoles,
  calendarEvent,
  classRoom,
  dailyAttendance,
  dutyRoster,
  enrollment,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  student,
  studentIdentityCode,
  subscription,
  tapEvent,
  teacher,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { jakarta } from './gate';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const QR_RE = /^ES1\.[0-9A-HJKMNP-TV-Z]{20}$/;

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherId = '';
let foundationId = '';
let yearId = '';
const userIds: string[] = [];
let adminCookie = '';
let waliCookie = '';
let waliUserId = '';
let lainCookie = '';
let piketCookie = '';
let otherCookie = '';
const ids = {
  c7A: '',
  c7B: '',
  ani: '',
  budi: '',
  citra: '',
  dina: '',
  sakit: '',
  asing: '',
  tPiket: '',
};

const today = () => jakarta(new Date()).date;
const yesterday = () => jakarta(new Date(Date.now() - 86_400_000)).date;

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
}
async function join(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email: u.email, password },
  });
  return { cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id, userId: u.id };
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

const scan = (cookie: string, body: object, sid = schoolId) =>
  call('POST', '/v1/gate/scan', cookie, body, sid);
const qrRows = (studentId: string) =>
  app.platformDb.select().from(studentIdentityCode).where(eq(studentIdentityCode.studentId, studentId));
const qrOf = async (studentId: string) => {
  const res = await call('GET', `/v1/cards/students?studentIds=${studentId}`, adminCookie);
  expect(res.statusCode).toBe(200);
  return res.json().items[0].qrCode as string;
};
const taps = (studentId: string) =>
  app.platformDb.select().from(tapEvent).where(eq(tapEvent.studentId, studentId));
const daily = async (studentId: string, date: string) => {
  const [r] = await app.platformDb
    .select()
    .from(dailyAttendance)
    .where(and(eq(dailyAttendance.studentId, studentId), eq(dailyAttendance.date, date)));
  return r;
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Pindai', slug: `yp-${run}` })
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
  const make = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    await db.insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'attendance',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    return s!.id;
  };
  schoolId = await make(`scan-${run}`);
  otherId = await make(`scan-lain-${run}`);
  const mkYear = async (sid: string) => {
    const [y] = await db
      .insert(academicYear)
      .values({
        schoolId: sid,
        name: '2026/2027',
        startsOn: '2026-07-13',
        endsOn: '2027-06-30',
        isActive: true,
      })
      .returning();
    return y!.id;
  };
  yearId = await mkYear(schoolId);
  const otherYear = await mkYear(otherId);

  adminCookie = (await join('admin-scan', schoolId, ['school_admin'])).cookie;
  const wali = await join('guru-wali-scan', schoolId, ['teacher']);
  waliCookie = wali.cookie;
  waliUserId = wali.userId;
  const lain = await join('guru-lain-scan', schoolId, ['teacher']);
  lainCookie = lain.cookie;
  const piket = await join('guru-piket-scan', schoolId, ['teacher']);
  piketCookie = piket.cookie;
  otherCookie = (await join('admin-scan-lain', otherId, ['school_admin'])).cookie;

  const [tw] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu Wali', memberId: wali.memberId })
    .returning();
  const [tp] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Piket', memberId: piket.memberId })
    .returning();
  ids.tPiket = tp!.id;
  await db.insert(teacher).values({ schoolId, name: 'Pak Lain', memberId: lain.memberId });

  const mkClass = async (name: string, homeroomTeacherId: string | null) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name, level: '7', homeroomTeacherId })
      .returning();
    return c!.id;
  };
  ids.c7A = await mkClass('7A', tw!.id);
  ids.c7B = await mkClass('7B', null);
  const mkStudent = async (name: string, classId: string, nis: string, sid = schoolId, yid = yearId) => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, nis, gender: 'P' }).returning();
    await db.insert(enrollment).values({ schoolId: sid, studentId: s!.id, classId, academicYearId: yid });
    return s!.id;
  };
  ids.ani = await mkStudent('Ani', ids.c7A, `S${run}1`);
  ids.budi = await mkStudent('Budi', ids.c7A, `S${run}2`);
  ids.citra = await mkStudent('Citra', ids.c7A, `S${run}3`);
  ids.sakit = await mkStudent('Sakit', ids.c7A, `S${run}4`);
  ids.dina = await mkStudent('Dina', ids.c7B, `S${run}5`);
  const [oc] = await db
    .insert(classRoom)
    .values({ schoolId: otherId, academicYearId: otherYear, name: '7A', level: '7' })
    .returning();
  ids.asing = await mkStudent('Asing', oc!.id, `S${run}9`, otherId, otherYear);
  await db
    .insert(dailyAttendance)
    .values({ schoolId, studentId: ids.sakit, date: yesterday(), status: 'sick' });
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherId]) {
    for (const table of [
      'audit_log',
      'tap_event',
      'attendance_device',
      'attendance_card',
      'student_identity_code',
      'daily_attendance',
      'duty_roster',
      'calendar_event',
      'enrollment',
      'student',
      'class_room',
      'teacher',
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

describe('QR identitas siswa di kartu', () => {
  it('GET /v1/cards/students membuat QR secara malas, idempoten, satu per siswa', async () => {
    const q = `studentIds=${ids.ani},${ids.budi}`;
    const first = await call('GET', `/v1/cards/students?${q}`, adminCookie);
    expect(first.statusCode).toBe(200);
    const items = first.json().items as { studentId: string; qrCode: string }[];
    expect(items).toHaveLength(2);
    for (const it2 of items) expect(it2.qrCode).toMatch(QR_RE);
    expect(new Set(items.map((i) => i.qrCode)).size).toBe(2);

    const second = await call('GET', `/v1/cards/students?${q}`, adminCookie);
    expect(
      second
        .json()
        .items.map((i: { qrCode: string }) => i.qrCode)
        .sort(),
    ).toEqual(items.map((i) => i.qrCode).sort());
    expect(await qrRows(ids.ani)).toHaveLength(1);

    // Permintaan serentak tidak membuat dua kode untuk siswa yang sama.
    await Promise.all(
      Array.from({ length: 5 }, () => call('GET', `/v1/cards/students?studentIds=${ids.citra}`, adminCookie)),
    );
    expect(await qrRows(ids.citra)).toHaveLength(1);
  });

  it('QR tidak tampak sebagai kartu RFID dan tidak mengganggu pendaftaran RFID', async () => {
    const qr = await qrOf(ids.ani);
    const code = qr.slice(4);
    const rfid = `RF${run}`.toUpperCase();
    expect(
      (await call('POST', '/v1/attendance/cards', adminCookie, { studentId: ids.ani, code: rfid }))
        .statusCode,
    ).toBe(201);
    const list = (await call('GET', `/v1/attendance/cards?studentId=${ids.ani}`, adminCookie)).json();
    expect(list.map((c: { code: string }) => c.code)).toEqual([rfid]);
    expect(JSON.stringify(list)).not.toContain(code);
    expect(list.every((c: { kind: string }) => c.kind === 'rfid')).toBe(true);

    // rfidCode di data cetak tetap kode RFID, bukan QR; QR dapat dihapus lewat kartu hanya bila bertipe rfid.
    const data = (await call('GET', `/v1/cards/students?studentIds=${ids.ani}`, adminCookie)).json();
    expect(data.items[0]).toMatchObject({ rfidCode: rfid, qrCode: qr });
    const [qrRow] = await qrRows(ids.ani);
    expect((await call('DELETE', `/v1/attendance/cards/${qrRow!.id}`, adminCookie)).statusCode).toBe(404);
    expect(await qrRows(ids.ani)).toHaveLength(1);

    // Impor massal: siswa yang hanya punya QR tetap boleh mendaftarkan RFID pertamanya.
    const bulk = await call('POST', '/v1/attendance/cards/bulk', adminCookie, {
      items: [{ nis: `S${run}2`, code: `BULK${run}`.toUpperCase() }],
    });
    expect(bulk.json()).toMatchObject({ created: 1, failed: [] });
  });

  it('kiosk menolak kode QR (dengan atau tanpa awalan)', async () => {
    const dev = await call('POST', '/v1/attendance/devices', adminCookie, { name: 'Kiosk uji QR' });
    const key = dev.json().key as string;
    const qr = await qrOf(ids.ani);
    for (const code of [qr, qr.slice(4)]) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/kiosk/tap',
        headers: { 'x-device-key': key, 'content-type': 'application/json' },
        payload: { code },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('unknown_card');
    }
    expect(await taps(ids.ani)).toHaveLength(0);
  });
});

describe('POST /v1/gate/scan', () => {
  it('wali kelas memindai datang lalu pulang: tap_event bersumber qr, absensi harian terisi', async () => {
    const qr = await qrOf(ids.ani);
    const res = await scan(waliCookie, { payload: qr, direction: 'in', clientId: `c-in-${run}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      result: 'in',
      replayed: false,
      student: { id: ids.ani, name: 'Ani', className: '7A', nis: `S${run}1` },
      warning: null,
    });
    const rows = await taps(ids.ani);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'qr',
      direction: 'in',
      recordedBy: waliUserId,
      clientId: `c-in-${run}`,
    });
    expect((await daily(ids.ani, today()))?.checkInAt).toBeTruthy();

    // Pindai datang lagi: tidak dobel.
    const again = await scan(waliCookie, { payload: qr, direction: 'in' });
    expect(again.json().result).toBe('already_in');
    expect(await taps(ids.ani)).toHaveLength(1);

    const out = await scan(waliCookie, { payload: qr, direction: 'out', clientId: `c-out-${run}` });
    expect(out.json()).toMatchObject({ result: 'out', replayed: false });
    expect((await daily(ids.ani, today()))?.checkOutAt).toBeTruthy();
  });

  it('clientId yang sama tidak dicatat dua kali dan mengembalikan hasil sebelumnya', async () => {
    const qr = await qrOf(ids.ani);
    const res = await scan(waliCookie, { payload: qr, direction: 'out', clientId: `c-out-${run}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: 'out', replayed: true });
    const same = (await taps(ids.ani)).filter((t) => t.clientId === `c-out-${run}`);
    expect(same).toHaveLength(1);
    // clientId yang sama untuk siswa lain ditolak.
    const other = await qrOf(ids.budi);
    const clash = await scan(waliCookie, { payload: other, direction: 'in', clientId: `c-out-${run}` });
    expect(clash.statusCode).toBe(409);
  });

  it('pindaian offline memakai jam asli: terlambat dihitung dari kebijakan; siswa izin dilewati', async () => {
    const y = yesterday();
    const budi = await scan(waliCookie, {
      payload: await qrOf(ids.budi),
      direction: 'in',
      at: `${y}T06:55:00+07:00`,
    });
    expect(budi.json()).toMatchObject({ result: 'in', status: 'present', late: false, date: y });
    const citra = await scan(waliCookie, {
      payload: await qrOf(ids.citra),
      direction: 'in',
      at: `${y}T07:30:00+07:00`,
    });
    expect(citra.json()).toMatchObject({ result: 'in', status: 'late', late: true });
    const sakit = await scan(waliCookie, {
      payload: await qrOf(ids.sakit),
      direction: 'in',
      at: `${y}T07:00:00+07:00`,
    });
    expect(sakit.json().result).toBe('skipped_status');
    const noIn = await scan(adminCookie, {
      payload: await qrOf(ids.dina),
      direction: 'out',
      at: `${y}T14:00:00+07:00`,
    });
    expect(noIn.json()).toMatchObject({ result: 'out', warning: 'no_check_in' });
  });

  it('waktu pindai: lebih dari 48 jam lalu atau di masa depan ditolak', async () => {
    const qr = await qrOf(ids.budi);
    const old = new Date(Date.now() - 49 * 3600_000).toISOString();
    const future = new Date(Date.now() + 3 * 3600_000).toISOString();
    for (const at of [old, future]) {
      const res = await scan(adminCookie, { payload: qr, direction: 'in', at });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_time');
    }
  });

  it('payload salah format 400 invalid_qr, kode tak terdaftar 404 unknown_qr', async () => {
    for (const payload of ['halo', `S${run}1`, 'https://contoh.id', 'ES1.ABC', `ES2.${'A'.repeat(20)}`]) {
      const res = await scan(adminCookie, { payload, direction: 'in' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_qr');
    }
    const unknown = await scan(adminCookie, { payload: `ES1.${'A'.repeat(20)}`, direction: 'in' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('unknown_qr');
  });

  it('guru bukan wali kelas dan tidak piket: 403 forbidden_class; piket hari ini boleh semua kelas', async () => {
    const dina = await qrOf(ids.dina); // kelas 7B tanpa wali
    const denied = await scan(lainCookie, { payload: dina, direction: 'in' });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('forbidden_class');
    expect((await scan(waliCookie, { payload: dina, direction: 'in' })).statusCode).toBe(403);
    expect((await scan(piketCookie, { payload: dina, direction: 'in' })).statusCode).toBe(403);

    await app.platformDb.insert(dutyRoster).values({ schoolId, date: today(), teacherId: ids.tPiket });
    const ok = await scan(piketCookie, { payload: dina, direction: 'in' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().result).toBe('in');
    const [row] = await taps(ids.dina).then((r) =>
      r.filter((t) => t.source === 'qr' && t.direction === 'in'),
    );
    expect(row?.source).toBe('qr');
  });

  it('hari libur: 409 school_closed kecuali force', async () => {
    const [ev] = await app.platformDb
      .insert(calendarEvent)
      .values({
        schoolId,
        academicYearId: yearId,
        type: 'holiday',
        scope: 'school',
        title: 'Libur uji pindai',
        startsOn: today(),
        endsOn: today(),
      })
      .returning();
    try {
      const qr = await qrOf(ids.budi);
      const closed = await scan(waliCookie, { payload: qr, direction: 'in' });
      expect(closed.statusCode).toBe(409);
      expect(closed.json().error.code).toBe('school_closed');
      const forced = await scan(waliCookie, { payload: qr, direction: 'in', force: true });
      expect(forced.statusCode).toBe(200);
      expect(forced.json().result).toBe('in');
    } finally {
      await app.platformDb.delete(calendarEvent).where(eq(calendarEvent.id, ev!.id));
    }
  });

  it('QR sekolah lain tidak dikenal; pengguna tanpa izin ditolak', async () => {
    // Admin sekolah lain memindai QR siswa sekolah ini.
    const qr = await qrOf(ids.ani);
    const res = await scan(otherCookie, { payload: qr, direction: 'in' }, otherId);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('unknown_qr');
    // QR siswa sekolah lain tidak terbaca oleh sekolah ini.
    const asingQr = (
      await call('GET', `/v1/cards/students?studentIds=${ids.asing}`, otherCookie, undefined, otherId)
    ).json().items[0].qrCode as string;
    expect(asingQr).toMatch(QR_RE);
    expect((await scan(adminCookie, { payload: asingQr, direction: 'in' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/v1/gate/scan', payload: {} })).statusCode).toBe(401);
  });
});

describe('buat ulang QR', () => {
  it('kode lama berhenti berlaku, kode baru berlaku, hanya pengurus kartu yang boleh', async () => {
    const before = await qrOf(ids.citra);
    expect(
      (await call('POST', `/v1/students/${ids.citra}/identity-code/rotate`, waliCookie)).statusCode,
    ).toBe(403);

    const res = await call('POST', `/v1/students/${ids.citra}/identity-code/rotate`, adminCookie);
    expect(res.statusCode).toBe(200);
    const next = res.json().qr as string;
    expect(next).toMatch(QR_RE);
    expect(next).not.toBe(before);
    expect(await qrRows(ids.citra)).toHaveLength(1);
    expect(await qrOf(ids.citra)).toBe(next);

    const old = await scan(waliCookie, { payload: before, direction: 'in' });
    expect(old.statusCode).toBe(404);
    expect(old.json().error.code).toBe('unknown_qr');
    expect((await scan(waliCookie, { payload: next, direction: 'in' })).statusCode).toBe(200);

    const logs = await app.platformDb.execute(
      sql`select details from audit_log where school_id = ${schoolId} and action = 'student.identity_code.rotate' and entity_id = ${ids.citra}`,
    );
    expect(logs.rows).toHaveLength(1);
    expect(JSON.stringify(logs.rows)).not.toContain(next.slice(4));

    expect(
      (await call('POST', `/v1/students/${crypto.randomUUID()}/identity-code/rotate`, adminCookie))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/v1/students/${ids.asing}/identity-code/rotate`, adminCookie)).statusCode,
    ).toBe(404);
  });

  it('GET /v1/students/:id/identity-code idempoten', async () => {
    const a = await call('GET', `/v1/students/${ids.dina}/identity-code`, adminCookie);
    const b = await call('GET', `/v1/students/${ids.dina}/identity-code`, adminCookie);
    expect(a.json().qr).toMatch(QR_RE);
    expect(b.json().qr).toBe(a.json().qr);
  });
});
