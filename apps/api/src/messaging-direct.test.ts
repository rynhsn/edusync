import { createHash } from 'node:crypto';
import {
  academicYear,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  guardian,
  member,
  msgAttachment,
  msgBatch,
  msgDirectTemplate,
  msgMessage,
  msgSetting,
  platformSetting,
  school,
  seedSchoolRoles,
  sql,
  student,
  studentGuardian,
  subscription,
  teacher,
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
let otherId = '';
let noModuleId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let operatorCookie = '';
let principalCookie = '';
let teacherCookie = '';
let otherCookie = '';
let noModuleCookie = '';
let savedGlobal: Record<string, unknown> | null = null;

const ids = { ani: '', budi: '', cici: '', dedi: '', eko: '', kelas: '', g1: '', g2: '', t1: '', t2: '' };

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
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return login(email);
}
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid: string = schoolId,
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
const setGlobal = (value: Record<string, unknown> | null) =>
  value
    ? app.platformDb
        .insert(platformSetting)
        .values({ key: 'messaging', value })
        .onConflictDoUpdate({ target: platformSetting.key, set: { value } })
    : app.platformDb.delete(platformSetting).where(eq(platformSetting.key, 'messaging'));
const settings = (over: object = {}) => ({
  enabled: true,
  delayMinSeconds: 5,
  delayMaxSeconds: 15,
  windowStart: '06:00',
  windowEnd: '20:00',
  absentNoticeAt: '09:00',
  ...over,
});
const messagesOf = (batchId: string) =>
  app.platformDb.select().from(msgMessage).where(eq(msgMessage.batchId, batchId));
const clearBatches = async () => {
  await app.platformDb.delete(msgMessage).where(eq(msgMessage.schoolId, schoolId));
  await app.platformDb.delete(msgBatch).where(eq(msgBatch.schoolId, schoolId));
};
const preview = (cookie: string, selection: object, body?: string) =>
  call('POST', '/v1/messaging/recipients/preview', cookie, { selection, ...(body ? { body } : {}) });
const create = (
  cookie: string,
  selection: object,
  expectedTotal: number,
  body = 'Yth. {{guardian}}, {{student}}',
) => call('POST', '/v1/messaging/batches', cookie, { selection, body, expectedTotal });

const TABLES = [
  'msg_message',
  'msg_batch',
  'msg_attachment',
  'msg_direct_template',
  'msg_template',
  'msg_setting',
  'wa_account',
  'audit_log',
  'student_guardian',
  'guardian',
  'enrollment',
  'student',
  'teacher',
  'class_room',
  'academic_year',
  'member',
  'role',
  'entitlement',
];

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MESSAGING_PROVIDER: undefined }),
  );
  await app.ready();
  const db = app.platformDb;
  const [prev] = await db.select().from(platformSetting).where(eq(platformSetting.key, 'messaging'));
  savedGlobal = prev?.value ?? null;
  await setGlobal(null);
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Langsung', slug: `ylangsung-${run}` })
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
      .values({ foundationId, slug, name: `SMP ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`lgs-${run}`, ['messaging']);
  otherId = await make(`lgs-lain-${run}`, ['messaging']);
  noModuleId = await make(`lgs-nomod-${run}`, []);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2099-06-30', isActive: true })
    .returning();
  const [k] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: y!.id, name: '7A', level: '7' })
    .returning();
  ids.kelas = k!.id;
  const addStudent = async (name: string, status: 'active' | 'transferred' = 'active') => {
    const [s] = await db.insert(student).values({ schoolId, name, gender: 'L', status }).returning();
    await db
      .insert(enrollment)
      .values({ schoolId, studentId: s!.id, classId: ids.kelas, academicYearId: y!.id });
    return s!.id;
  };
  const addGuardian = async (name: string, phone: string | null) => {
    const [g] = await db.insert(guardian).values({ schoolId, name, phone }).returning();
    return g!.id;
  };
  const link = (studentId: string, guardianId: string, isPrimary = true) =>
    db.insert(studentGuardian).values({ schoolId, studentId, guardianId, relation: 'mother', isPrimary });
  ids.ani = await addStudent('Ani');
  ids.budi = await addStudent('Budi');
  ids.cici = await addStudent('Cici');
  ids.dedi = await addStudent('Dedi');
  ids.eko = await addStudent('Eko');
  const pindah = await addStudent('Pindah', 'transferred');
  ids.g1 = await addGuardian('Bu Sari', '081234500001');
  ids.g2 = await addGuardian('Pak Joko', '0812-3450-0002');
  const gNoPhone = await addGuardian('Tanpa Nomor', null);
  const gBad = await addGuardian('Nomor Rusak', '12345');
  await link(ids.ani, ids.g1); // kakak-adik berbagi satu wali dan satu nomor
  await link(ids.budi, ids.g1);
  await link(ids.cici, ids.g2);
  await link(ids.dedi, gNoPhone);
  await link(ids.eko, gBad);
  await link(pindah, ids.g2);
  const [t1] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Guru', phone: '081234500003' })
    .returning();
  const [t2] = await db.insert(teacher).values({ schoolId, name: 'Bu Tanpa Nomor' }).returning();
  ids.t1 = t1!.id;
  ids.t2 = t2!.id;

  adminCookie = await join('admin-lgs', schoolId, ['school_admin']);
  operatorCookie = await join('operator-lgs', schoolId, ['operator']);
  principalCookie = await join('kepsek-lgs', schoolId, ['principal']);
  teacherCookie = await join('guru-lgs', schoolId, ['teacher']);
  otherCookie = await join('admin-lain-lgs', otherId, ['school_admin']);
  noModuleCookie = await join('admin-tanpa-modul-lgs', noModuleId, ['school_admin']);
  expect((await call('PUT', '/v1/messaging/settings', adminCookie, settings())).statusCode).toBe(200);
});

afterAll(async () => {
  const db = app.platformDb;
  await setGlobal(savedGlobal);
  for (const sid of [schoolId, otherId, noModuleId]) {
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

describe('izin dan modul', () => {
  it('admin, operator, kepala sekolah boleh; guru dan sekolah tanpa modul tidak', async () => {
    const sel = { students: [ids.cici] };
    for (const cookie of [adminCookie, operatorCookie, principalCookie]) {
      expect((await preview(cookie, sel)).statusCode).toBe(200);
    }
    expect((await preview(teacherCookie, sel)).statusCode).toBe(403);
    const blocked = await call(
      'POST',
      '/v1/messaging/recipients/preview',
      noModuleCookie,
      { selection: sel },
      noModuleId,
    );
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('module_disabled');
    expect((await app.inject({ method: 'POST', url: '/v1/messaging/recipients/preview' })).statusCode).toBe(
      401,
    );
    // Hanya message:read: boleh melihat riwayat, tidak boleh mengirim.
    expect((await call('GET', '/v1/messaging/batches', principalCookie)).statusCode).toBe(200);
    expect((await call('GET', '/v1/messaging/batches', teacherCookie)).statusCode).toBe(403);
    // Templat: baca message:read, tulis message:manage.
    expect(
      (await call('POST', '/v1/messaging/direct-templates', principalCookie, { name: 'x', body: 'y' }))
        .statusCode,
    ).toBe(403);
  });

  it('kepala sekolah (tanpa message:broadcast) ditolak untuk rombel dan > 30 penerima; operator boleh', async () => {
    const klas = { classes: [ids.kelas] };
    expect((await create(principalCookie, klas, 3)).statusCode).toBe(403);
    expect((await create(principalCookie, { students: [ids.ani] }, 31)).statusCode).toBe(403);
    expect((await preview(principalCookie, klas)).json()).toMatchObject({
      requiresBroadcast: true,
      canSend: false,
    });
    expect((await preview(operatorCookie, klas)).json()).toMatchObject({
      requiresBroadcast: true,
      canSend: true,
    });
    expect((await preview(principalCookie, { students: [ids.ani] })).json()).toMatchObject({
      requiresBroadcast: false,
      canSend: true,
    });
  });
});

describe('pratinjau penerima', () => {
  it('menggabungkan nomor ganda, menghitung tanpa nomor/tidak valid, mengabaikan murid pindah, tanpa efek', async () => {
    const res = await preview(
      adminCookie,
      { classes: [ids.kelas] },
      'Yth. {{guardian}}, {{student}} ({{class}}) di {{school}}',
    );
    expect(res.statusCode).toBe(200);
    const j = res.json();
    // Ani+Budi (satu wali), Cici: 2 penerima; Dedi tanpa nomor; Eko nomor rusak; murid pindah tidak ikut.
    expect(j).toMatchObject({
      total: 2,
      excluded: { noPhone: 1, invalid: 1, duplicate: 1, optedOut: 0 },
      enabled: true,
      accountReady: false,
      requiresBroadcast: true,
      confirmTyping: false,
    });
    const sari = j.sample.find((s: { name: string }) => s.name === 'Bu Sari');
    expect(sari.message).toBe(`Yth. Bu Sari, Ani dan Budi (7A) di SMP lgs-${run}`);
    expect(sari.phone).toMatch(/^6281\*+001$/);
    expect(JSON.stringify(j)).not.toContain('081234500001');
    expect(
      await app.platformDb.select().from(msgMessage).where(eq(msgMessage.schoolId, schoolId)),
    ).toHaveLength(0);
  });

  it('staf: aktif bernomor saja; wali + staf; wali dipilih langsung memakai anak aktifnya', async () => {
    const staff = (await preview(adminCookie, { allStaff: true })).json();
    expect(staff).toMatchObject({ total: 1, excluded: { noPhone: 1 } });
    expect(staff.sample[0]).toMatchObject({ name: 'Pak Guru', recipientType: 'teacher' });
    const g = (
      await preview(
        adminCookie,
        { guardians: [ids.g1], teachers: [ids.t1] },
        '{{student}}|{{teacher}}|{{guardian}}',
      )
    ).json();
    expect(g.total).toBe(2);
    expect(g.sample.map((s: { message: string }) => s.message)).toEqual([
      'Ani dan Budi||Bu Sari',
      '|Pak Guru|',
    ]);
    // Satu nomor dipilih dua kali (via murid dan via wali) tetap satu penerima.
    const dup = (await preview(adminCookie, { students: [ids.ani], guardians: [ids.g1] })).json();
    expect(dup).toMatchObject({ total: 1, excluded: { duplicate: 1 } });
  });

  it('wali semua (guardianScope all) dan validasi isi', async () => {
    await app.platformDb.insert(studentGuardian).values({
      schoolId,
      studentId: ids.cici,
      guardianId: ids.g1,
      relation: 'father',
      isPrimary: false,
    });
    expect((await preview(adminCookie, { students: [ids.cici] })).json().total).toBe(1);
    expect((await preview(adminCookie, { students: [ids.cici], guardianScope: 'all' })).json().total).toBe(2);
    await app.platformDb
      .delete(studentGuardian)
      .where(sql`school_id = ${schoolId} and student_id = ${ids.cici} and guardian_id = ${ids.g1}`);
    const bad = await preview(adminCookie, { students: [ids.ani] }, 'Halo {{amount}}');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('unknown_placeholder');
    const nik = await preview(adminCookie, { students: [ids.ani] }, 'NIK 3201234567890123');
    expect(nik.json().error.code).toBe('sensitive_content');
    // Pemilih tidak sah: id bukan uuid.
    expect((await preview(adminCookie, { students: ['x'] })).statusCode).toBe(400);
  });
});

describe('buat batch', () => {
  it('antre per penerima dengan prioritas 1, isi dirender, body asli di batch, audit tercatat', async () => {
    await clearBatches();
    const res = await create(adminCookie, { students: [ids.ani, ids.budi, ids.cici] }, 2);
    expect(res.statusCode).toBe(200);
    const { id, total, excluded } = res.json();
    expect(total).toBe(2);
    expect(excluded.duplicate).toBe(1);
    const msgs = await messagesOf(id);
    expect(msgs.map((m) => m.body).sort()).toEqual(['Yth. Bu Sari, Ani dan Budi', 'Yth. Pak Joko, Cici']);
    for (const m of msgs) {
      expect(m).toMatchObject({ eventKey: 'direct', priority: 1, status: 'queued', teacherId: null });
      expect(m.dedupeKey).toBe(`batch:${id}:${m.toPhone}`);
      expect(m.batchId).toBe(id);
    }
    expect(msgs.map((m) => m.toPhone).sort()).toEqual(['6281234500001', '6281234500002']);
    const [batch] = await app.platformDb.select().from(msgBatch).where(eq(msgBatch.id, id));
    expect(batch).toMatchObject({
      kind: 'direct',
      bodyTemplate: 'Yth. {{guardian}}, {{student}}',
      recipientCount: 2,
      title: 'Yth. {{guardian}}, {{student}}',
    });
    const audits = await app.platformDb.execute<{ details: { total: number; kind: string } }>(
      sql`select details from audit_log where school_id = ${schoolId} and action = 'messaging.batch.create' and entity_id = ${id}`,
    );
    expect(audits.rows[0]?.details).toMatchObject({ kind: 'direct', total: 2 });
  });

  it('staf menerima pesan dengan teacher_id', async () => {
    await clearBatches();
    const res = await create(adminCookie, { teachers: [ids.t1] }, 1, 'Halo {{teacher}}');
    expect(res.statusCode).toBe(200);
    const [m] = await messagesOf(res.json().id);
    expect(m).toMatchObject({ body: 'Halo Pak Guru', teacherId: ids.t1, guardianId: null, studentId: null });
  });

  it('galat eksplisit: count_changed, unknown_placeholder, sensitive_content, no_recipients, duplicate_batch', async () => {
    await clearBatches();
    const stale = await create(adminCookie, { students: [ids.ani, ids.cici] }, 3);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('count_changed');
    expect((await create(adminCookie, { students: [ids.ani] }, 1, 'Halo {{nik}}')).json().error.code).toBe(
      'unknown_placeholder',
    );
    expect(
      (await create(adminCookie, { students: [ids.ani] }, 1, 'No 3201 2345 6789 0123')).json().error.code,
    ).toBe('sensitive_content');
    expect((await create(adminCookie, {}, 0)).json().error.code).toBe('no_recipients');
    expect((await create(adminCookie, { students: [ids.dedi] }, 0)).json().error.code).toBe('no_recipients');
    expect(
      await app.platformDb.select().from(msgMessage).where(eq(msgMessage.schoolId, schoolId)),
    ).toHaveLength(0);
    // Klik ganda: isi dan penerima sama oleh pengguna sama dalam 30 detik.
    expect((await create(adminCookie, { students: [ids.cici] }, 1)).statusCode).toBe(200);
    const again = await create(adminCookie, { students: [ids.cici] }, 1);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('duplicate_batch');
    expect(
      await app.platformDb.select().from(msgMessage).where(eq(msgMessage.schoolId, schoolId)),
    ).toHaveLength(1);
  });

  it('sakelar mati, batas harian, dan antrean penuh ditolak tanpa membuat pesan', async () => {
    await clearBatches();
    const sel = { students: [ids.ani, ids.cici] };
    expect(
      (await call('PUT', '/v1/messaging/settings', adminCookie, settings({ enabled: false }))).statusCode,
    ).toBe(200);
    expect((await preview(adminCookie, sel)).json().enabled).toBe(false);
    const off = await create(adminCookie, sel, 2);
    expect(off.statusCode).toBe(409);
    expect(off.json().error.code).toBe('messaging_disabled');
    expect(
      (await call('PUT', '/v1/messaging/settings', adminCookie, settings({ dailyLimit: 1 }))).json()
        .dailyLimit,
    ).toBe(1);

    const limited = await create(adminCookie, sel, 2);
    expect(limited.statusCode).toBe(409);
    expect(limited.json().error.code).toBe('daily_limit');
    expect((await preview(adminCookie, sel)).json()).toMatchObject({
      dailyLimit: 1,
      dailyUsed: 0,
      dailyRemaining: 1,
    });
    // Satu penerima masih muat; yang dibatalkan tidak dihitung ke batas harian.
    const one = await create(adminCookie, { students: [ids.cici] }, 1);
    expect(one.statusCode).toBe(200);
    expect((await preview(adminCookie, sel)).json().dailyRemaining).toBe(0);
    expect((await call('POST', `/v1/messaging/batches/${one.json().id}/cancel`, adminCookie)).json()).toEqual(
      { cancelled: 1 },
    );
    expect((await preview(adminCookie, sel)).json().dailyRemaining).toBe(1);

    // Antrean: 100 slot dicadangkan untuk pesan peristiwa.
    await call('PUT', '/v1/messaging/settings', adminCookie, settings({ dailyLimit: 200 }));
    await setGlobal({ enabled: true, provider: 'log', maxQueuedPerSchool: 101 });
    const full = await create(adminCookie, sel, 2);
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('queue_full');
    await setGlobal(null);
    expect((await create(adminCookie, sel, 2)).statusCode).toBe(200);
  });

  it('batas harian di atas batas platform ditolak; pesan otomatis tidak ikut dihitung', async () => {
    const over = await call('PUT', '/v1/messaging/settings', adminCookie, settings({ dailyLimit: 501 }));
    expect(over.statusCode).toBe(400);
    expect(over.json().error.code).toBe('invalid_daily_limit');
    await setGlobal({ enabled: true, provider: 'log', maxQueuedPerSchool: 500, dailyLimitMax: 900 });
    expect(
      (await call('PUT', '/v1/messaging/settings', adminCookie, settings({ dailyLimit: 501 }))).statusCode,
    ).toBe(200);
    // Nomor yang belum 7 hari dipakai dibatasi 50 walau batas sekolah lebih besar.
    expect((await preview(adminCookie, { students: [ids.ani] })).json()).toMatchObject({
      dailyLimit: 50,
      newNumber: true,
    });
    await app.platformDb.insert(msgMessage).values({
      schoolId,
      eventKey: 'sent-lama',
      toPhone: '6281200000009',
      body: 'x',
      status: 'sent',
      sentAt: new Date(Date.now() - 8 * 86_400_000),
    });
    expect((await preview(adminCookie, { students: [ids.ani] })).json()).toMatchObject({
      dailyLimit: 501,
      newNumber: false,
    });
    await setGlobal(null);
    await call('PUT', '/v1/messaging/settings', adminCookie, settings({ dailyLimit: 200 }));
  });
});

describe('riwayat, batal, kirim ulang', () => {
  it('daftar, rincian (nomor disamarkan), batalkan, kirim ulang yang gagal', async () => {
    await clearBatches();
    const made = await create(
      adminCookie,
      { students: [ids.ani, ids.cici], teachers: [ids.t1] },
      3,
      'Halo {{guardian}}{{teacher}}',
    );
    expect(made.statusCode).toBe(200);
    const id = made.json().id;
    const list = (await call('GET', '/v1/messaging/batches', principalCookie)).json();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      id,
      kind: 'direct',
      status: 'sending',
      recipientCount: 3,
      counts: { queued: 3, sent: 0, failed: 0, skipped: 0 },
      cancelledAt: null,
    });
    expect(list.items[0].createdBy).toBe('admin-lgs');
    const detail = (await call('GET', `/v1/messaging/batches/${id}`, principalCookie)).json();
    expect(detail.body).toBe('Halo {{guardian}}{{teacher}}');
    expect(detail.recipients.map((r: { name: string }) => r.name)).toEqual([
      'Bu Sari',
      'Pak Guru',
      'Pak Joko',
    ]);
    expect(detail.recipients.map((r: { recipientType: string }) => r.recipientType)).toEqual([
      'guardian',
      'teacher',
      'guardian',
    ]);
    expect(JSON.stringify(detail)).not.toMatch(/6281234500001/);

    // Atur status: satu terkirim, satu gagal biasa, satu bukan WhatsApp.
    const msgs = await messagesOf(id);
    const by = (phone: string) => msgs.find((m) => m.toPhone === phone)!;
    await app.platformDb
      .update(msgMessage)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(msgMessage.id, by('6281234500001').id));
    await app.platformDb
      .update(msgMessage)
      .set({ status: 'failed', detail: 'timeout', attempts: 5 })
      .where(eq(msgMessage.id, by('6281234500002').id));
    await app.platformDb
      .update(msgMessage)
      .set({ status: 'failed', detail: 'not_on_whatsapp', attempts: 1 })
      .where(eq(msgMessage.id, by('6281234500003').id));
    const retry = await call('POST', `/v1/messaging/batches/${id}/retry-failed`, operatorCookie);
    expect(retry.json()).toEqual({ requeued: 1 });
    const [again] = await app.platformDb
      .select()
      .from(msgMessage)
      .where(eq(msgMessage.id, by('6281234500002').id));
    expect(again).toMatchObject({ status: 'queued', attempts: 0, detail: null });
    expect(
      (
        await app.platformDb
          .select()
          .from(msgMessage)
          .where(eq(msgMessage.id, by('6281234500003').id))
      )[0]?.status,
    ).toBe('failed');
    expect((await call('GET', '/v1/messaging/batches', adminCookie)).json().items[0]).toMatchObject({
      counts: { queued: 1, sent: 1, failed: 1, skipped: 0 },
    });

    // Batalkan: hanya yang masih antre; yang terkirim/gagal tidak disentuh.
    expect((await call('POST', `/v1/messaging/batches/${id}/cancel`, teacherCookie)).statusCode).toBe(403);
    expect((await call('POST', `/v1/messaging/batches/${id}/cancel`, operatorCookie)).json()).toEqual({
      cancelled: 1,
    });
    expect((await call('POST', `/v1/messaging/batches/${id}/cancel`, operatorCookie)).json()).toEqual({
      cancelled: 0,
    });
    const after = (await call('GET', `/v1/messaging/batches/${id}`, adminCookie)).json();
    expect(after).toMatchObject({ status: 'done', counts: { queued: 0, sent: 1, failed: 1, skipped: 1 } });
    expect(after.cancelledAt).not.toBeNull();
    expect(after.recipients.find((r: { status: string }) => r.status === 'skipped').detail).toBe('cancelled');
    const blocked = await call('POST', `/v1/messaging/batches/${id}/retry-failed`, adminCookie);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('batch_cancelled');
  });

  it('batch sekolah lain tidak terlihat (404) dan tidak muncul di daftar', async () => {
    const [b] = await app.platformDb.select().from(msgBatch).where(eq(msgBatch.schoolId, schoolId));
    for (const path of [`/v1/messaging/batches/${b!.id}`]) {
      expect((await call('GET', path, otherCookie, undefined, otherId)).statusCode).toBe(404);
    }
    expect(
      (await call('POST', `/v1/messaging/batches/${b!.id}/cancel`, otherCookie, undefined, otherId))
        .statusCode,
    ).toBe(404);
    expect((await call('GET', '/v1/messaging/batches', otherCookie, undefined, otherId)).json().total).toBe(
      0,
    );
    expect(
      (await call('GET', `/v1/messaging/batches/00000000-0000-7000-8000-000000000000`, adminCookie))
        .statusCode,
    ).toBe(404);
  });
});

describe('templat pesan langsung dan pencarian', () => {
  it('CRUD templat, nama unik, pengganti divalidasi', async () => {
    const make = (cookie: string, name: string, body: string) =>
      call('POST', '/v1/messaging/direct-templates', cookie, { name, body });
    const created = await make(operatorCookie, 'Panggilan', 'Yth. {{guardian}}, mohon hadir.');
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    expect((await make(adminCookie, 'Panggilan', 'lain')).statusCode).toBe(409);
    expect((await make(adminCookie, 'Salah', 'Halo {{amount}}')).json().error.code).toBe(
      'unknown_placeholder',
    );
    expect((await call('GET', '/v1/messaging/direct-templates', principalCookie)).json()).toHaveLength(1);
    expect(
      (await call('GET', '/v1/messaging/direct-templates', otherCookie, undefined, otherId)).json(),
    ).toHaveLength(0);
    const upd = await call('PUT', `/v1/messaging/direct-templates/${id}`, adminCookie, {
      name: 'Panggilan 2',
      body: 'Baru {{student}}',
    });
    expect(upd.json()).toMatchObject({ name: 'Panggilan 2', body: 'Baru {{student}}' });
    expect(
      (
        await call(
          'PUT',
          `/v1/messaging/direct-templates/${id}`,
          otherCookie,
          { name: 'x', body: 'y' },
          otherId,
        )
      ).statusCode,
    ).toBe(404);
    expect((await call('DELETE', `/v1/messaging/direct-templates/${id}`, adminCookie)).json()).toEqual({
      ok: true,
    });
    expect((await call('DELETE', `/v1/messaging/direct-templates/${id}`, adminCookie)).statusCode).toBe(404);
    expect(
      await app.platformDb.select().from(msgDirectTemplate).where(eq(msgDirectTemplate.schoolId, schoolId)),
    ).toHaveLength(0);
  });

  it('pencarian murid, rombel, wali, staf; wali butuh 2 karakter; hanya yang aktif', async () => {
    const find = async (kind: string, q: string, cookie = adminCookie) =>
      (await call('GET', `/v1/messaging/recipients/search?kind=${kind}&q=${q}`, cookie)).json() as {
        id: string;
        label: string;
        hint: string | null;
      }[];
    expect((await find('student', 'an')).map((s) => s.label)).toEqual(['Ani']);
    expect((await find('student', '')).map((s) => s.label)).toEqual(['Ani', 'Budi', 'Cici', 'Dedi', 'Eko']);
    expect((await find('student', 'Ani'))[0]?.hint).toBe('7A');
    expect((await find('class', '7')).map((c) => c.label)).toEqual(['7A']);
    expect(await find('guardian', 'S')).toEqual([]);
    expect((await find('guardian', 'Sari'))[0]).toMatchObject({ label: 'Bu Sari' });
    expect((await find('guardian', 'Sari'))[0]?.hint).toMatch(/\*/);
    expect((await find('teacher', 'Guru')).map((t) => t.label)).toEqual(['Pak Guru']);
    expect(
      (await call('GET', '/v1/messaging/recipients/search?kind=student&q=Ani', teacherCookie)).statusCode,
    ).toBe(403);
    // Sekolah lain tidak melihat data kita.
    expect(
      (
        await call('GET', '/v1/messaging/recipients/search?kind=student&q=', otherCookie, undefined, otherId)
      ).json(),
    ).toEqual([]);
  });
});

describe('pesan otomatis tidak berubah', () => {
  it('pesan uji tetap prioritas 0 tanpa batch', async () => {
    expect(
      (await call('POST', '/v1/messaging/test', adminCookie, { phone: '081234567890', text: 'uji' }))
        .statusCode,
    ).toBe(200);
    const [m] = await app.platformDb.select().from(msgMessage).where(eq(msgMessage.eventKey, 'test'));
    expect(m).toMatchObject({ priority: 0, batchId: null, teacherId: null });
    const s = (await call('GET', '/v1/messaging/settings', adminCookie)).json();
    expect(s.dailyLimit).toBe(200);
    expect(
      (await app.platformDb.select().from(msgSetting).where(eq(msgSetting.schoolId, schoolId)))[0]
        ?.dailyLimit,
    ).toBe(200);
  });
});

describe('lampiran pesan langsung (tahap B)', () => {
  const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 1)]);
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(50, 2),
  ]);
  const upload = (
    cookie: string,
    bytes: Buffer,
    mime = 'application/pdf',
    fileName = 'surat.pdf',
    sid: string = schoolId,
  ) =>
    call(
      'POST',
      '/v1/messaging/attachments',
      cookie,
      { fileName, mime, dataBase64: bytes.toString('base64') },
      sid,
    );

  it('unggah PDF valid: metadata kembali, isi bisa diunduh pengirim, audit tercatat', async () => {
    const res = await upload(adminCookie, PDF, 'application/pdf', 'Surat Panggilan.pdf');
    expect(res.statusCode).toBe(200);
    const meta = res.json();
    expect(meta).toMatchObject({
      fileName: 'Surat Panggilan.pdf',
      mime: 'application/pdf',
      size: PDF.length,
      purged: false,
    });
    expect(meta.data).toBeUndefined();
    const [row] = await app.platformDb.select().from(msgAttachment).where(eq(msgAttachment.id, meta.id));
    expect(row?.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
    const dl = await call('GET', `/v1/messaging/attachments/${meta.id}/content`, operatorCookie);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.rawPayload.equals(PDF)).toBe(true);
    const audits = await app.platformDb.execute(
      sql`select 1 from audit_log where school_id = ${schoolId} and action = 'messaging.attachment.upload' and entity_id = ${meta.id}`,
    );
    expect(audits.rows).toHaveLength(1);
    // PNG juga diterima.
    expect((await upload(adminCookie, PNG, 'image/png', 'foto.png')).statusCode).toBe(200);
  });

  it('menolak: jenis tidak diizinkan, mime tidak cocok dengan isi, lebih dari 2 MB, base64 rusak', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect((await upload(adminCookie, html, 'application/pdf')).json().error.code).toBe('attachment_type');
    expect((await upload(adminCookie, PNG, 'application/pdf')).json().error.code).toBe('attachment_type');
    expect((await upload(adminCookie, PDF, 'text/html')).statusCode).toBe(400);
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(2 * 1024 * 1024)]);
    const tooBig = await upload(adminCookie, big);
    expect(tooBig.statusCode).toBe(400);
    expect(tooBig.json().error.code).toBe('attachment_too_large');
    const bad = await call('POST', '/v1/messaging/attachments', adminCookie, {
      fileName: 'a.pdf',
      mime: 'application/pdf',
      dataBase64: '###',
    });
    expect(bad.json().error.code).toBe('invalid_base64');
    // Tepat 2 MB lolos.
    const exact = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(2 * 1024 * 1024 - 5)]);
    expect((await upload(adminCookie, exact)).statusCode).toBe(200);
  });

  it('izin message:send dan modul; sekolah lain tidak bisa melihat lampiran; nama berkas dibersihkan', async () => {
    expect((await upload(teacherCookie, PDF)).statusCode).toBe(403);
    expect((await upload(noModuleCookie, PDF, 'application/pdf', 'a.pdf', noModuleId)).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/v1/messaging/attachments', payload: {} })).statusCode,
    ).toBe(401);
    const id = (await upload(principalCookie, PDF)).json().id;
    expect((await call('GET', `/v1/messaging/attachments/${id}/content`, teacherCookie)).statusCode).toBe(
      403,
    );
    const other = await call(
      'GET',
      `/v1/messaging/attachments/${id}/content`,
      otherCookie,
      undefined,
      otherId,
    );
    expect(other.statusCode).toBe(404);
    const named = await upload(adminCookie, PDF, 'application/pdf', '..\\..\\etc/pass?wd.pdf');
    expect(named.json().fileName).toBe('pass_wd.pdf');
  });

  it('batch dengan lampiran: tersimpan di batch, tampil di riwayat, audit attachment true, lalu kedaluwarsa', async () => {
    await clearBatches();
    const att = (await upload(adminCookie, PDF)).json();
    const res = await call('POST', '/v1/messaging/batches', adminCookie, {
      selection: { students: [ids.cici] },
      body: 'Terlampir untuk {{student}}',
      expectedTotal: 1,
      attachmentId: att.id,
    });
    expect(res.statusCode).toBe(200);
    const { id } = res.json();
    const [batch] = await app.platformDb.select().from(msgBatch).where(eq(msgBatch.id, id));
    expect(batch?.attachmentId).toBe(att.id);
    expect((await messagesOf(id))[0]?.body).toBe('Terlampir untuk Cici');
    const detail = (await call('GET', `/v1/messaging/batches/${id}`, principalCookie)).json();
    expect(detail.attachment).toEqual({
      id: att.id,
      fileName: 'surat.pdf',
      mime: 'application/pdf',
      size: PDF.length,
      purged: false,
    });
    const list = (await call('GET', '/v1/messaging/batches', principalCookie)).json();
    expect(list.items.find((b: { id: string }) => b.id === id).attachment.id).toBe(att.id);
    const audits = await app.platformDb.execute<{ details: { attachment: boolean } }>(
      sql`select details from audit_log where school_id = ${schoolId} and action = 'messaging.batch.create' and entity_id = ${id}`,
    );
    expect(audits.rows[0]?.details.attachment).toBe(true);
    // Isi dihapus: metadata tampil purged, unduh 410, batch baru dengan lampiran itu ditolak.
    await app.platformDb.execute(
      sql`update msg_attachment set data = null, purged_at = now() where id = ${att.id}`,
    );
    expect((await call('GET', `/v1/messaging/batches/${id}`, principalCookie)).json().attachment.purged).toBe(
      true,
    );
    const gone = await call('GET', `/v1/messaging/attachments/${att.id}/content`, adminCookie);
    expect(gone.statusCode).toBe(410);
    expect(gone.json().error.code).toBe('attachment_expired');
    const again = await call('POST', '/v1/messaging/batches', adminCookie, {
      selection: { students: [ids.cici] },
      body: 'Lagi',
      expectedTotal: 1,
      attachmentId: att.id,
    });
    expect(again.json().error.code).toBe('attachment_invalid');
  });

  it('lampiran sekolah lain atau tak dikenal ditolak; tanpa lampiran perilaku lama (attachment null)', async () => {
    await clearBatches();
    const foreign = (await upload(otherCookie, PDF, 'application/pdf', 'x.pdf', otherId)).json().id;
    for (const attachmentId of [foreign, '019a0000-0000-7000-8000-000000000000']) {
      const res = await call('POST', '/v1/messaging/batches', adminCookie, {
        selection: { students: [ids.cici] },
        body: 'x',
        expectedTotal: 1,
        attachmentId,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('attachment_invalid');
    }
    const plain = await create(adminCookie, { students: [ids.cici] }, 1);
    expect(plain.statusCode).toBe(200);
    const detail = (await call('GET', `/v1/messaging/batches/${plain.json().id}`, adminCookie)).json();
    expect(detail.attachment).toBeNull();
  });

  it('duplicate_batch membedakan lampiran: isi sama dengan lampiran lain boleh', async () => {
    await clearBatches();
    const a = (await upload(adminCookie, PDF)).json().id;
    const b = (await upload(adminCookie, PNG, 'image/png', 'f.png')).json().id;
    const send = (attachmentId: string) =>
      call('POST', '/v1/messaging/batches', adminCookie, {
        selection: { students: [ids.cici] },
        body: 'sama',
        expectedTotal: 1,
        attachmentId,
      });
    expect((await send(a)).statusCode).toBe(200);
    expect((await send(a)).json().error.code).toBe('duplicate_batch');
    expect((await send(b)).statusCode).toBe(200);
  });
});
