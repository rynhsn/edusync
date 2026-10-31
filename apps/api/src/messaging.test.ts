import {
  academicYear,
  assignRoles,
  dailyAttendance,
  entitlement,
  eq,
  finFeeType,
  finInvoice,
  foundation,
  guardian,
  lessonPeriod,
  loadPlatformMessaging,
  member,
  msgMessage,
  platformSetting,
  platformStaff,
  scheduleEntry,
  school,
  seedSchoolRoles,
  semester,
  sql,
  studentGuardian,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { jakarta, weekdayOf } from './gate';

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
let yearId = '';
let semesterId = '';
const userIds: string[] = [];
let adminCookie = '';
let operatorCookie = '';
let principalCookie = '';
let teacherCookie = '';
let noModuleCookie = '';
let otherCookie = '';
let staffAdminCookie = '';
let staffReadCookie = '';
let savedGlobal: Record<string, unknown> | null = null;

const ids = {
  kelas: '',
  mapel: '',
  guru: '',
  entry: '',
  key: '',
  siswa: [] as string[],
};

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
async function staff(label: string, role: 'admin' | 'read_only') {
  const u = await makeUser(label);
  await app.platformDb.insert(platformStaff).values({ userId: u.id, role });
  return login(u.email);
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid: string | null = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      ...(sid ? { 'x-school-id': sid } : {}),
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });
const kiosk = (url: string, key: string, payload: object) =>
  app.inject({
    method: 'POST',
    url,
    headers: { 'x-device-key': key, 'content-type': 'application/json' },
    payload,
  });

function lastSchoolDay() {
  for (let back = 1; back < 8; back++) {
    const d = jakarta(new Date(Date.now() - back * 86_400_000)).date;
    if (weekdayOf(d) <= 6) return d;
  }
  throw new Error('tidak mungkin');
}

const settings = (over: object = {}) => ({
  enabled: true,
  delayMinSeconds: 5,
  delayMaxSeconds: 15,
  windowStart: '06:00',
  windowEnd: '20:00',
  absentNoticeAt: '09:00',
  ...over,
});
const messagesFor = (studentId?: string) =>
  app.platformDb
    .select()
    .from(msgMessage)
    .where(eq(msgMessage.schoolId, schoolId))
    .then((rows) => (studentId ? rows.filter((r) => r.studentId === studentId) : rows));
const clearMessages = () => app.platformDb.delete(msgMessage).where(eq(msgMessage.schoolId, schoolId));
const setGlobal = (value: Record<string, unknown> | null) =>
  value
    ? app.platformDb
        .insert(platformSetting)
        .values({ key: 'messaging', value })
        .onConflictDoUpdate({ target: platformSetting.key, set: { value } })
    : app.platformDb.delete(platformSetting).where(eq(platformSetting.key, 'messaging'));

const TABLES = [
  'msg_message',
  'msg_template',
  'msg_setting',
  'wa_account',
  'audit_log',
  'fin_payment_item',
  'fin_payment',
  'fin_payment_method',
  'fin_counter',
  'fin_invoice',
  'fin_fee_type',
  'report_card',
  'lesson_attendance',
  'tap_event',
  'daily_attendance',
  'attendance_card',
  'attendance_device',
  'attendance_policy',
  'schedule_entry',
  'lesson_period',
  'student_guardian',
  'guardian',
  'enrollment',
  'student',
  'teacher',
  'subject',
  'class_room',
  'semester',
  'academic_year',
  'member',
  'role',
  'entitlement',
];

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [prev] = await db.select().from(platformSetting).where(eq(platformSetting.key, 'messaging'));
  savedGlobal = prev?.value ?? null;
  await setGlobal(null);
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Pesan', slug: `ypesan-${run}` })
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
  schoolId = await make(`psn-${run}`, ['messaging', 'attendance', 'schedule', 'finance', 'grades']);
  noModuleId = await make(`psn-nomod-${run}`, []);
  otherId = await make(`psn-lain-${run}`, ['messaging']);
  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2099-06-30', isActive: true })
    .returning();
  yearId = y!.id;
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: yearId,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2099-12-31',
      isActive: true,
    })
    .returning();
  semesterId = sem!.id;
  adminCookie = await join('admin-pesan', schoolId, ['school_admin']);
  operatorCookie = await join('operator-pesan', schoolId, ['operator']);
  principalCookie = await join('kepsek-pesan', schoolId, ['principal']);
  teacherCookie = await join('guru-pesan', schoolId, ['teacher']);
  noModuleCookie = await join('admin-tanpa-modul-pesan', noModuleId, ['school_admin']);
  otherCookie = await join('admin-lain-pesan', otherId, ['school_admin']);
  staffAdminCookie = await staff('staf-admin-pesan', 'admin');
  staffReadCookie = await staff('staf-baca-pesan', 'read_only');
});

afterAll(async () => {
  const db = app.platformDb;
  await setGlobal(savedGlobal);
  for (const sid of [schoolId, noModuleId, otherId]) {
    for (const table of TABLES) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('modul dan izin', () => {
  it('modul harus aktif, tanpa sesi 401, izin dibagi sesuai peran', async () => {
    const blocked = await call('GET', '/v1/messaging/settings', noModuleCookie, undefined, noModuleId);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');
    expect((await app.inject('/v1/messaging/settings')).statusCode).toBe(401);
    expect((await call('GET', '/v1/messaging/settings', teacherCookie)).statusCode).toBe(403);
    for (const cookie of [adminCookie, operatorCookie, principalCookie]) {
      expect((await call('GET', '/v1/messaging/settings', cookie)).statusCode).toBe(200);
    }
    // Kepala sekolah hanya membaca.
    expect((await call('PUT', '/v1/messaging/settings', principalCookie, settings())).statusCode).toBe(403);
    expect((await call('POST', '/v1/messaging/account/connect', principalCookie)).statusCode).toBe(403);
    expect(
      (await call('POST', '/v1/messaging/test', principalCookie, { phone: '081234567890', text: 'x' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('PUT', '/v1/messaging/settings', operatorCookie, settings({ enabled: false }))).statusCode,
    ).toBe(200);
  });
});

describe('pengaturan dan templat', () => {
  it('nilai bawaan mati, validasi jeda dan jendela', async () => {
    const def = (await call('GET', '/v1/messaging/settings', adminCookie)).json();
    expect(def).toMatchObject({
      enabled: false,
      delayMinSeconds: 5,
      delayMaxSeconds: 15,
      windowStart: '06:00',
    });
    const bad1 = await call(
      'PUT',
      '/v1/messaging/settings',
      adminCookie,
      settings({ delayMinSeconds: 20, delayMaxSeconds: 10 }),
    );
    expect(bad1.statusCode).toBe(400);
    expect(bad1.json().error.code).toBe('invalid_delay');
    const bad2 = await call(
      'PUT',
      '/v1/messaging/settings',
      adminCookie,
      settings({ windowStart: '20:00', windowEnd: '06:00' }),
    );
    expect(bad2.json().error.code).toBe('invalid_window');
    expect(
      (await call('PUT', '/v1/messaging/settings', adminCookie, settings({ delayMaxSeconds: 301 })))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('PUT', '/v1/messaging/settings', adminCookie, settings({ windowStart: '6:00' })))
        .statusCode,
    ).toBe(400);
  });

  it('templat awal bawaan dan mati; mengaktifkan pertama kali membuat semua templat bawaan', async () => {
    const before = (await call('GET', '/v1/messaging/templates', teacherCookie)).statusCode;
    expect(before).toBe(403);
    const list = (await call('GET', '/v1/messaging/templates', principalCookie)).json();
    expect(list.map((t: { eventKey: string }) => t.eventKey)).toEqual([
      'arrival',
      'departure',
      'absent',
      'skipped_class',
      'payment',
      'overdue',
      'report_card',
    ]);
    expect(list.every((t: { enabled: boolean; isDefault: boolean }) => !t.enabled && t.isDefault)).toBe(true);

    const on = await call('PUT', '/v1/messaging/settings', adminCookie, settings());
    expect(on.statusCode).toBe(200);
    const after = (await call('GET', '/v1/messaging/templates', adminCookie)).json();
    expect(after.every((t: { enabled: boolean; isDefault: boolean }) => t.enabled && t.isDefault)).toBe(true);
    expect(after[0].placeholders).toContain('student');
  });

  it('placeholder tak dikenal ditolak, simpan dan reset', async () => {
    const put = (body: object) => call('PUT', '/v1/messaging/templates', adminCookie, body);
    const bad = await put({ eventKey: 'arrival', body: 'Halo {{student}} {{receipt}}', enabled: true });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_placeholder');
    expect((await put({ eventKey: 'arrival', body: '', enabled: true })).statusCode).toBe(400);
    expect((await put({ eventKey: 'arrival', body: 'x'.repeat(1001), enabled: true })).statusCode).toBe(400);
    expect((await put({ eventKey: 'nope', body: 'x', enabled: true })).statusCode).toBe(400);
    const ok = await put({ eventKey: 'arrival', body: '{{student}} tiba {{time}}', enabled: true });
    expect(ok.json()).toMatchObject({ body: '{{student}} tiba {{time}}', isDefault: false, enabled: true });
    expect((await call('POST', '/v1/messaging/templates/arrival/reset', principalCookie)).statusCode).toBe(
      403,
    );
    const reset = (await call('POST', '/v1/messaging/templates/arrival/reset', adminCookie)).json();
    expect(reset).toMatchObject({ isDefault: true, enabled: true });
    expect(reset.body).toBe(reset.defaultBody);
    expect((await call('POST', '/v1/messaging/templates/bukan/reset', adminCookie)).statusCode).toBe(400);
  });

  it('mengaktifkan ulang tidak menimpa templat yang sudah ada', async () => {
    await call('PUT', '/v1/messaging/templates', adminCookie, {
      eventKey: 'payment',
      body: 'Bayar {{amount}}',
      enabled: true,
    });
    await call('PUT', '/v1/messaging/settings', adminCookie, settings({ enabled: false }));
    await call('PUT', '/v1/messaging/settings', adminCookie, settings());
    const t = (await call('GET', '/v1/messaging/templates', adminCookie)).json();
    expect(t.find((x: { eventKey: string }) => x.eventKey === 'payment').body).toBe('Bayar {{amount}}');
    await call('POST', '/v1/messaging/templates/payment/reset', adminCookie);
  });
});

describe('sambungan WhatsApp', () => {
  it('connect dan disconnect hanya mengubah desiredState', async () => {
    const initial = (await call('GET', '/v1/messaging/account', principalCookie)).json();
    expect(initial).toMatchObject({
      desiredState: 'off',
      status: 'disconnected',
      qr: null,
      phone: null,
      providerActive: false,
    });
    const on = (await call('POST', '/v1/messaging/account/connect', adminCookie)).json();
    expect(on).toMatchObject({ desiredState: 'on', status: 'disconnected' });
    // Worker menulis QR; disconnect harus mengosongkannya tanpa menyentuh status.
    await app.platformDb.execute(
      sql`update wa_account set status = 'qr', qr = 'QR-DATA' where school_id = ${schoolId}`,
    );
    expect((await call('GET', '/v1/messaging/account', adminCookie)).json()).toMatchObject({
      status: 'qr',
      qr: 'QR-DATA',
    });
    const off = (await call('POST', '/v1/messaging/account/disconnect', adminCookie)).json();
    expect(off).toMatchObject({ desiredState: 'off', status: 'qr', qr: null });
    // Sekolah lain tidak melihat sambungan ini.
    expect(
      (await call('GET', '/v1/messaging/account', otherCookie, undefined, otherId)).json().desiredState,
    ).toBe('off');
  });
});

describe('pesan uji, riwayat, dan kirim ulang', () => {
  it('pesan uji: nomor dinormalisasi, nomor salah ditolak, riwayat disamarkan', async () => {
    await clearMessages();
    const bad = await call('POST', '/v1/messaging/test', adminCookie, { phone: '12345', text: 'Halo' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_phone');
    expect(
      (await call('POST', '/v1/messaging/test', adminCookie, { phone: '0812', text: 'x'.repeat(501) }))
        .statusCode,
    ).toBe(400);
    const res = await call('POST', '/v1/messaging/test', adminCookie, {
      phone: '0812-3456-7890',
      text: 'Halo uji',
    });
    expect(res.json()).toEqual({ queued: true });
    const rows = await messagesFor();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      toPhone: '6281234567890',
      eventKey: 'test',
      status: 'queued',
      body: 'Halo uji',
    });

    const list = (await call('GET', '/v1/messaging/messages', principalCookie)).json();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      eventKey: 'test',
      toPhone: '6281****890',
      studentName: null,
      status: 'queued',
    });
    expect(JSON.stringify(list)).not.toContain('6281234567890');
    expect(list.counts).toEqual({ queued: 1, sent: 0, failed: 0, skipped: 0 });
  });

  it('filter, paginasi, retry hanya untuk failed/skipped, dan lintas-sekolah tidak bocor', async () => {
    await clearMessages();
    const mk = (status: string, n: number) =>
      app.platformDb
        .insert(msgMessage)
        .values({
          schoolId,
          eventKey: 'payment',
          toPhone: `62811100000${n}`,
          body: 'x',
          status: status as 'queued',
          attempts: 3,
          detail: 'galat',
          dedupeKey: `t:${status}:${n}`,
        })
        .returning();
    const [failed] = await mk('failed', 1);
    const [skipped] = await mk('skipped', 2);
    const [sent] = await mk('sent', 3);
    await mk('queued', 4);
    const list = (path = '', cookie = principalCookie, sid = schoolId) =>
      call('GET', `/v1/messaging/messages${path}`, cookie, undefined, sid).then((r) => r.json());
    expect((await list()).counts).toEqual({ queued: 1, sent: 1, failed: 1, skipped: 1 });
    expect((await list('?status=failed')).items.map((i: { id: string }) => i.id)).toEqual([failed!.id]);
    expect((await list('?status=failed')).counts.sent).toBe(1);
    expect((await list('?limit=2')).items).toHaveLength(2);
    expect((await list('?limit=2&offset=3')).items).toHaveLength(1);
    expect((await call('GET', '/v1/messaging/messages?limit=101', adminCookie)).statusCode).toBe(400);
    expect((await list('', otherCookie, otherId)).total).toBe(0);

    expect(
      (await call('POST', `/v1/messaging/messages/${failed!.id}/retry`, principalCookie)).statusCode,
    ).toBe(403);
    expect((await call('POST', `/v1/messaging/messages/${failed!.id}/retry`, adminCookie)).json()).toEqual({
      ok: true,
    });
    expect((await call('POST', `/v1/messaging/messages/${skipped!.id}/retry`, adminCookie)).statusCode).toBe(
      200,
    );
    const retried = (await messagesFor()).find((m) => m.id === failed!.id)!;
    expect(retried).toMatchObject({ status: 'queued', attempts: 0, detail: null });
    const again = await call('POST', `/v1/messaging/messages/${failed!.id}/retry`, adminCookie);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('not_retryable');
    expect((await call('POST', `/v1/messaging/messages/${sent!.id}/retry`, adminCookie)).statusCode).toBe(
      409,
    );
    // Sekolah lain tidak bisa menyentuh pesan ini.
    const foreign = await call(
      'POST',
      `/v1/messaging/messages/${sent!.id}/retry`,
      otherCookie,
      undefined,
      otherId,
    );
    expect(foreign.statusCode).toBe(404);
  });
});

describe('data dasar pemicu', () => {
  it('menyiapkan kelas, siswa berwali, guru, jadwal, dan perangkat', async () => {
    const db = app.platformDb;
    const mk = async (url: string, body: object) => (await call('POST', url, adminCookie, body)).json();
    ids.kelas = (await mk('/v1/classes', { academicYearId: yearId, name: '7A', level: '7' })).id;
    ids.mapel = (await mk('/v1/subjects', { code: 'MTK', name: 'Matematika' })).id;
    // Ani: dua wali satu nomor + satu nomor salah; Budi: satu wali valid; Citra: tanpa wali; Dewi: wali valid.
    const phones: Record<string, string[]> = {
      Ani: ['081234560001', '+6281234560001', '123'],
      Budi: ['081234560002'],
      Citra: [],
      Dewi: ['081234560004'],
    };
    for (const [name, list] of Object.entries(phones)) {
      const s = await mk('/v1/students', { name, gender: 'P', classId: ids.kelas });
      expect(s.id).toBeTruthy();
      ids.siswa.push(s.id);
      for (const [i, phone] of list.entries()) {
        const [g] = await db
          .insert(guardian)
          .values({ schoolId, name: `Wali ${name} ${i}`, phone })
          .returning();
        await db
          .insert(studentGuardian)
          .values({ schoolId, studentId: s.id, guardianId: g!.id, relation: 'father' });
      }
      const card = await call('POST', '/v1/attendance/cards', adminCookie, {
        studentId: s.id,
        code: `CARD000${ids.siswa.length}`,
      });
      expect(card.statusCode).toBe(201);
    }
    ids.guru = (await mk('/v1/teachers', { name: 'Guru Pesan' })).id;
    const [period] = await db
      .insert(lessonPeriod)
      .values({ schoolId, number: 1, startsAt: '07:00', endsAt: '07:40' })
      .returning();
    const [entry] = await db
      .insert(scheduleEntry)
      .values({
        schoolId,
        academicYearId: yearId,
        classId: ids.kelas,
        subjectId: ids.mapel,
        teacherId: ids.guru,
        weekday: weekdayOf(lastSchoolDay()),
        periodId: period!.id,
      })
      .returning();
    ids.entry = entry!.id;
    const device = await call('POST', '/v1/attendance/devices', adminCookie, { name: 'Gerbang' });
    expect(device.statusCode).toBe(201);
    ids.key = device.json().key;
  });
});

describe('pemicu: tap kiosk', () => {
  const policy = (lateAfter: string, departureFrom: string) =>
    call('PUT', '/v1/attendance/policy', adminCookie, { lateAfter, departureFrom, debounceSeconds: 0 });
  const tap = (n: number) => kiosk('/v1/kiosk/tap', ids.key, { code: `CARD000${n}` });

  it('tap masuk mengantrekan arrival ke wali bernomor valid saja', async () => {
    await clearMessages();
    expect((await policy('23:00', '23:59')).statusCode).toBe(200);
    expect((await tap(1)).json().result).toBe('in');
    const ani = await messagesFor(ids.siswa[0]);
    // Dua wali satu nomor + satu nomor salah = satu pesan.
    expect(ani).toHaveLength(1);
    expect(ani[0]).toMatchObject({ eventKey: 'arrival', toPhone: '6281234560001', status: 'queued' });
    expect(ani[0]!.body).toContain('Ani');
    expect(ani[0]!.body).toContain('7A');
    expect(ani[0]!.body).toContain('Sekolah psn-');
    expect(ani[0]!.body).toMatch(/pukul \d{2}:\d{2}/);
    expect(ani[0]!.body).not.toContain('{{');
    // Tap kembali (already_in) tidak menambah pesan.
    expect((await tap(1)).json().result).toBe('already_in');
    expect(await messagesFor(ids.siswa[0])).toHaveLength(1);
    expect((await tap(2)).json().result).toBe('in');
    expect(await messagesFor(ids.siswa[1])).toHaveLength(1);
    // Tanpa wali: tap tetap berhasil, tak ada pesan.
    expect((await tap(3)).json().result).toBe('in');
    expect(await messagesFor(ids.siswa[2])).toHaveLength(0);
  });

  it('tap pulang: tidak ada pesan bila setting mati atau templat mati; dedupe per hari', async () => {
    await clearMessages();
    expect((await policy('00:00', '00:01')).statusCode).toBe(200);
    await call('PUT', '/v1/messaging/settings', adminCookie, settings({ enabled: false }));
    expect((await tap(1)).json().result).toBe('out');
    expect(await messagesFor()).toHaveLength(0);
    await call('PUT', '/v1/messaging/settings', adminCookie, settings());
    const tpl = (enabled: boolean) =>
      call('PUT', '/v1/messaging/templates', adminCookie, {
        eventKey: 'departure',
        body: 'Pulang {{student}}',
        enabled,
      });
    await tpl(false);
    expect((await tap(2)).json().result).toBe('out');
    expect(await messagesFor()).toHaveLength(0);
    await tpl(true);
    expect((await tap(2)).json().result).toBe('out');
    const budi = await messagesFor(ids.siswa[1]);
    expect(budi).toHaveLength(1);
    expect(budi[0]).toMatchObject({ eventKey: 'departure', body: 'Pulang Budi' });
    expect((await tap(2)).json().result).toBe('out');
    expect(await messagesFor(ids.siswa[1])).toHaveLength(1);
    await call('POST', '/v1/messaging/templates/departure/reset', adminCookie);
  });
});

describe('pemicu: pembayaran', () => {
  const invoice = async (title: string, amount: number) => {
    const db = app.platformDb;
    let [fee] = await db.select().from(finFeeType).where(eq(finFeeType.schoolId, schoolId));
    if (!fee)
      [fee] = await db.insert(finFeeType).values({ schoolId, name: 'SPP', kind: 'one_time' }).returning();
    const [inv] = await db
      .insert(finInvoice)
      .values({
        schoolId,
        studentId: ids.siswa[1]!,
        academicYearId: yearId,
        feeTypeId: fee!.id,
        period: title,
        title,
        amount,
        dueDate: '2099-01-01',
        createdBy: 'uji',
      })
      .returning();
    return inv!.id;
  };
  const pay = (invoiceId: string, amount: number) =>
    call('POST', '/v1/finance/payments', adminCookie, {
      studentId: ids.siswa[1],
      method: 'cash',
      items: [{ invoiceId, amount }],
    });

  it('kwitansi mengantrekan payment dengan jumlah, nomor kwitansi, dan judul tagihan', async () => {
    await clearMessages();
    const inv = await invoice('SPP Oktober', 250_000);
    const res = await pay(inv, 250_000);
    expect(res.statusCode).toBe(201);
    const rows = (await messagesFor(ids.siswa[1])).filter((m) => m.eventKey === 'payment');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain('Rp 250.000');
    expect(rows[0]!.body).toContain(res.json().receiptNo);
    expect(rows[0]!.body).toContain('SPP Oktober');
    expect(rows[0]!.dedupeKey).toBe(`payment:${res.json().id}:6281234560002`);
  });

  it('saklar global platform mematikan pembuatan pesan dan memengaruhi providerActive', async () => {
    await clearMessages();
    const put = (body: object, cookie = staffAdminCookie) =>
      call('PUT', '/v1/platform/messaging', cookie, body, null);
    expect((await put({ enabled: false, provider: 'whatsapp', maxQueuedPerSchool: 500 })).statusCode).toBe(
      200,
    );
    const inv = await invoice('Gedung', 100_000);
    expect((await pay(inv, 100_000)).statusCode).toBe(201);
    expect(await messagesFor()).toHaveLength(0);
    expect((await call('GET', '/v1/messaging/account', adminCookie)).json()).toMatchObject({
      providerActive: false,
      provider: 'disabled',
    });

    expect((await put({ enabled: true, provider: 'whatsapp', maxQueuedPerSchool: 500 })).statusCode).toBe(
      200,
    );
    expect((await call('GET', '/v1/messaging/account', adminCookie)).json()).toMatchObject({
      providerActive: true,
      provider: 'whatsapp',
    });
    const inv2 = await invoice('Seragam', 50_000);
    expect((await pay(inv2, 50_000)).statusCode).toBe(201);
    expect(await messagesFor()).toHaveLength(1);

    // Batas antrean per sekolah.
    expect((await put({ enabled: true, provider: 'log', maxQueuedPerSchool: 1 })).statusCode).toBe(200);
    const inv3 = await invoice('Buku', 10_000);
    expect((await pay(inv3, 10_000)).statusCode).toBe(201);
    expect(await messagesFor()).toHaveLength(1);
    expect((await call('GET', '/v1/messaging/account', adminCookie)).json()).toMatchObject({
      providerActive: false,
      provider: 'log',
    });
    await put({ enabled: true, provider: 'log', maxQueuedPerSchool: 500 });
  });
});

describe('pemicu: rapor', () => {
  it('finalisasi mengantrekan report_card per siswa berwali dan tidak ganda', async () => {
    await clearMessages();
    const body = { semesterId, classId: ids.kelas, force: true };
    const res = await call('POST', '/v1/report-cards/finalize', adminCookie, body);
    expect(res.statusCode).toBe(200);
    const rows = await messagesFor();
    expect(rows.every((m) => m.eventKey === 'report_card')).toBe(true);
    // Ani, Budi, dan Dewi punya wali bernomor valid; Citra tidak.
    expect(rows.map((m) => m.studentId).sort()).toEqual([ids.siswa[0], ids.siswa[1], ids.siswa[3]].sort());
    expect(rows[0]!.body).toContain('Ganjil');
    expect(rows[0]!.body).toContain('7A');
    expect((await call('POST', '/v1/report-cards/finalize', adminCookie, body)).statusCode).toBe(200);
    expect(await messagesFor()).toHaveLength(3);
  });
});

describe('pemicu: bolos pelajaran', () => {
  it('absen di kelas padahal hadir di gerbang -> skipped_class; tanpa catatan gerbang tidak', async () => {
    await clearMessages();
    const day = lastSchoolDay();
    const db = app.platformDb;
    const at = new Date(`${day}T07:00:00+07:00`);
    await db.insert(dailyAttendance).values([
      { schoolId, studentId: ids.siswa[0]!, date: day, checkInAt: at, status: 'present' },
      { schoolId, studentId: ids.siswa[1]!, date: day, checkInAt: at, status: 'late' },
    ]);
    const put = (records: { studentId: string | undefined; status: string }[]) =>
      call('PUT', '/v1/lesson-attendance', adminCookie, { scheduleEntryId: ids.entry, date: day, records });
    const res = await put([
      { studentId: ids.siswa[0], status: 'absent' },
      { studentId: ids.siswa[1], status: 'absent' },
      { studentId: ids.siswa[2], status: 'absent' },
      { studentId: ids.siswa[3], status: 'absent' },
    ]);
    expect(res.statusCode).toBe(200);
    const rows = await messagesFor();
    expect(rows.every((m) => m.eventKey === 'skipped_class')).toBe(true);
    expect(rows.map((m) => m.studentId).sort()).toEqual([ids.siswa[0], ids.siswa[1]].sort());
    expect(rows[0]!.body).toContain('Matematika');
    expect(rows[0]!.body).toContain('07:00-07:40');
    // Simpan ulang tidak menggandakan; status hadir tidak memicu.
    expect((await put([{ studentId: ids.siswa[0], status: 'absent' }])).statusCode).toBe(200);
    expect(await messagesFor()).toHaveLength(2);
    expect((await put([{ studentId: ids.siswa[0], status: 'present' }])).statusCode).toBe(200);
    expect(await messagesFor()).toHaveLength(2);
  });
});

describe('pengaturan platform', () => {
  it('staf membaca, hanya admin mengubah, pengguna sekolah ditolak', async () => {
    const get = (cookie: string) => call('GET', '/v1/platform/messaging', cookie, undefined, null);
    expect((await get(adminCookie)).statusCode).toBe(403);
    expect((await app.inject('/v1/platform/messaging')).statusCode).toBe(401);
    const view = (await get(staffReadCookie)).json();
    expect(view).toMatchObject({
      enabled: true,
      messages24h: {
        queued: expect.any(Number),
        sent: expect.any(Number),
        failed: expect.any(Number),
        skipped: expect.any(Number),
      },
      accounts: {
        ready: expect.any(Number),
        qr: expect.any(Number),
        connecting: expect.any(Number),
        failed: expect.any(Number),
        disconnected: expect.any(Number),
      },
    });
    const body = { enabled: true, provider: 'log', maxQueuedPerSchool: 500 };
    expect((await call('PUT', '/v1/platform/messaging', staffReadCookie, body, null)).statusCode).toBe(403);
    const invalid = await call(
      'PUT',
      '/v1/platform/messaging',
      staffAdminCookie,
      { ...body, maxQueuedPerSchool: 0 },
      null,
    );
    expect(invalid.statusCode).toBe(400);
    const saved = await call(
      'PUT',
      '/v1/platform/messaging',
      staffAdminCookie,
      { ...body, maxQueuedPerSchool: 123 },
      null,
    );
    expect(saved.json()).toMatchObject({ enabled: true, provider: 'log', maxQueuedPerSchool: 123 });
    expect((await get(staffReadCookie)).json().maxQueuedPerSchool).toBe(123);
  });

  it('aturan kirim ulang: bawaan, validasi, tersimpan, dan dipertahankan bila tidak dikirim', async () => {
    const get = (cookie: string) => call('GET', '/v1/platform/messaging', cookie, undefined, null);
    const put = (payload: object) => call('PUT', '/v1/platform/messaging', staffAdminCookie, payload, null);
    const base = { enabled: true, provider: 'log', maxQueuedPerSchool: 500 };
    const originalRow = (
      await app.platformDb.execute<{ value: unknown }>(
        sql`select value from platform_setting where key = 'messaging'`,
      )
    ).rows[0]?.value;
    try {
      await app.platformDb.execute(sql`delete from platform_setting where key = 'messaging'`);
      expect((await get(staffReadCookie)).json().retry).toEqual({
        backoffMinutes: [1, 5, 30, 120, 360],
        maxAttempts: 5,
        expiryHours: 24,
        staleTapHours: 6,
      });

      const retry = { backoffMinutes: [2, 10], maxAttempts: 3, expiryHours: 12, staleTapHours: 2 };
      for (const bad of [
        { ...retry, backoffMinutes: [] },
        { ...retry, backoffMinutes: [0] },
        { ...retry, backoffMinutes: Array.from({ length: 11 }, () => 5) },
        { ...retry, maxAttempts: 0 },
        { ...retry, maxAttempts: 21 },
        { ...retry, expiryHours: 0 },
        { ...retry, staleTapHours: 73 },
      ]) {
        expect((await put({ ...base, retry: bad })).statusCode).toBe(400);
      }
      const saved = await put({ ...base, retry });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().retry).toEqual(retry);
      // Tanpa bidang retry, aturan tersimpan tidak berubah.
      const kept = await put({ ...base, maxQueuedPerSchool: 77 });
      expect(kept.json()).toMatchObject({ maxQueuedPerSchool: 77, retry });
      expect((await loadPlatformMessaging(app.platformDb)).retry).toEqual(retry);
    } finally {
      await app.platformDb.execute(sql`delete from platform_setting where key = 'messaging'`);
      if (originalRow) {
        await app.platformDb.execute(
          sql`insert into platform_setting (key, value) values ('messaging', ${JSON.stringify(originalRow)}::jsonb)`,
        );
      }
    }
  });

  it('status runtime worker (Chrome) tampil di konsol; null bila belum pernah melapor', async () => {
    const get = () => call('GET', '/v1/platform/messaging', staffReadCookie, undefined, null);
    const originalRow = (
      await app.platformDb.execute<{ value: unknown }>(
        sql`select value from platform_setting where key = 'messaging_runtime'`,
      )
    ).rows[0]?.value;
    try {
      await app.platformDb.execute(sql`delete from platform_setting where key = 'messaging_runtime'`);
      expect((await get()).json().runtime).toBeNull();
      const report = {
        chrome: { status: 'not_configured', path: null },
        provider: 'whatsapp',
        checkedAt: '2026-11-04T03:00:00.000Z',
      };
      await app.platformDb.execute(
        sql`insert into platform_setting (key, value) values ('messaging_runtime', ${JSON.stringify(report)}::jsonb)`,
      );
      expect((await get()).json().runtime).toEqual(report);
      // Nilai rusak tidak merusak halaman.
      await app.platformDb.execute(
        sql`update platform_setting set value = '{"chrome": 5}'::jsonb where key = 'messaging_runtime'`,
      );
      expect((await get()).json().runtime).toBeNull();
    } finally {
      await app.platformDb.execute(sql`delete from platform_setting where key = 'messaging_runtime'`);
      if (originalRow) {
        await app.platformDb.execute(
          sql`insert into platform_setting (key, value) values ('messaging_runtime', ${JSON.stringify(originalRow)}::jsonb)`,
        );
      }
    }
  });
});
