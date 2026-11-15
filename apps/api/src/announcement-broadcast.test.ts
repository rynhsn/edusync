import { createHash } from 'node:crypto';
import {
  academicYear,
  announcement,
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
  msgMessage,
  msgOptOut,
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
let noMessagingId = '';
let noAnnouncementsId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let principalCookie = '';
let teacherCookie = '';
let otherCookie = '';
let noMessagingCookie = '';
let noAnnouncementsCookie = '';
let savedGlobal: Record<string, unknown> | null = null;

const ids = { ani: '', budi: '', cici: '', kelas: '', g1: '', g2: '', gNoPhone: '', t1: '' };

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
const settings = (over: object = {}) => ({
  enabled: true,
  delayMinSeconds: 5,
  delayMaxSeconds: 15,
  windowStart: '06:00',
  windowEnd: '20:00',
  absentNoticeAt: '09:00',
  dailyLimit: 200,
  ...over,
});
const setSettings = async (over: object = {}) =>
  expect((await call('PUT', '/v1/messaging/settings', adminCookie, settings(over))).statusCode).toBe(200);

/** Buat pengumuman lewat API; bawaan terbit, audiens `all`. */
async function makeAnnouncement(over: Record<string, unknown> = {}) {
  const res = await call('POST', '/v1/announcements', adminCookie, {
    title: 'Libur Semester',
    body: 'Sekolah libur mulai Senin {{x}}.',
    category: 'notice',
    audience: 'all',
    status: 'published',
    ...over,
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}
const preview = (id: string, payload: object = {}, cookie = adminCookie) =>
  call('POST', `/v1/announcements/${id}/broadcast/preview`, cookie, payload);
const broadcast = (id: string, expectedTotal: number, extra: object = {}, cookie = adminCookie) =>
  call('POST', `/v1/announcements/${id}/broadcast`, cookie, { expectedTotal, ...extra });
const messagesOf = (batchId: string) =>
  app.platformDb.select().from(msgMessage).where(eq(msgMessage.batchId, batchId));
const clearBatches = async () => {
  await app.platformDb.delete(msgMessage).where(eq(msgMessage.schoolId, schoolId));
  await app.platformDb.delete(msgBatch).where(eq(msgBatch.schoolId, schoolId));
  await app.platformDb.delete(announcement).where(eq(announcement.schoolId, schoolId));
  await app.platformDb.delete(msgOptOut).where(eq(msgOptOut.schoolId, schoolId));
};

const TABLES = [
  'msg_message',
  'msg_batch',
  'msg_opt_out',
  'msg_attachment',
  'msg_template',
  'msg_setting',
  'wa_account',
  'announcement',
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
  await db.delete(platformSetting).where(eq(platformSetting.key, 'messaging'));
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Siaran', slug: `ysiaran-${run}` })
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
  schoolId = await make(`sr-${run}`, ['messaging', 'announcements']);
  otherId = await make(`sr-lain-${run}`, ['messaging', 'announcements']);
  noMessagingId = await make(`sr-nomsg-${run}`, ['announcements']);
  noAnnouncementsId = await make(`sr-noann-${run}`, ['messaging']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2099-06-30', isActive: true })
    .returning();
  const [k] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: y!.id, name: '7A', level: '7' })
    .returning();
  ids.kelas = k!.id;
  const addStudent = async (name: string) => {
    const [s] = await db.insert(student).values({ schoolId, name, gender: 'L' }).returning();
    await db
      .insert(enrollment)
      .values({ schoolId, studentId: s!.id, classId: ids.kelas, academicYearId: y!.id });
    return s!.id;
  };
  const addGuardian = async (name: string, phone: string | null) => {
    const [g] = await db.insert(guardian).values({ schoolId, name, phone }).returning();
    return g!.id;
  };
  const link = (studentId: string, guardianId: string) =>
    db
      .insert(studentGuardian)
      .values({ schoolId, studentId, guardianId, relation: 'mother', isPrimary: true });
  ids.ani = await addStudent('Ani');
  ids.budi = await addStudent('Budi');
  ids.cici = await addStudent('Cici');
  const dedi = await addStudent('Dedi');
  ids.g1 = await addGuardian('Bu Sari', '081234500001');
  ids.g2 = await addGuardian('Pak Joko', '0812-3450-0002');
  ids.gNoPhone = await addGuardian('Tanpa Nomor', null);
  await link(ids.ani, ids.g1); // kakak-adik berbagi satu wali dan satu nomor
  await link(ids.budi, ids.g1);
  await link(ids.cici, ids.g2);
  await link(dedi, ids.gNoPhone);
  const [t1] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Guru', phone: '081234500003' })
    .returning();
  await db.insert(teacher).values({ schoolId, name: 'Bu Tanpa Nomor' });
  ids.t1 = t1!.id;

  adminCookie = await join('admin-sr', schoolId, ['school_admin']);
  principalCookie = await join('kepsek-sr', schoolId, ['principal']);
  teacherCookie = await join('guru-sr', schoolId, ['teacher']);
  otherCookie = await join('admin-lain-sr', otherId, ['school_admin']);
  noMessagingCookie = await join('admin-nomsg-sr', noMessagingId, ['school_admin']);
  noAnnouncementsCookie = await join('admin-noann-sr', noAnnouncementsId, ['school_admin']);
  await setSettings();
});

afterAll(async () => {
  const db = app.platformDb;
  if (savedGlobal) {
    await db
      .insert(platformSetting)
      .values({ key: 'messaging', value: savedGlobal })
      .onConflictDoUpdate({ target: platformSetting.key, set: { value: savedGlobal } });
  }
  for (const sid of [schoolId, otherId, noMessagingId, noAnnouncementsId]) {
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

describe('izin, modul, dan keadaan pengumuman', () => {
  it('butuh announcement:manage + message:broadcast dan kedua modul; sekolah lain tak melihat pengumuman', async () => {
    const id = await makeAnnouncement();
    expect((await preview(id)).statusCode).toBe(200);
    expect((await preview(id, {}, principalCookie)).statusCode).toBe(403);
    expect((await preview(id, {}, teacherCookie)).statusCode).toBe(403);
    expect((await broadcast(id, 2, {}, principalCookie)).statusCode).toBe(403);
    const noMsg = await call(
      'POST',
      `/v1/announcements/${id}/broadcast/preview`,
      noMessagingCookie,
      {},
      noMessagingId,
    );
    expect(noMsg.statusCode).toBe(403);
    expect(noMsg.json().error.code).toBe('module_disabled');
    const noAnn = await call(
      'POST',
      `/v1/announcements/${id}/broadcast/preview`,
      noAnnouncementsCookie,
      {},
      noAnnouncementsId,
    );
    expect(noAnn.statusCode).toBe(403);
    expect(
      (await call('POST', `/v1/announcements/${id}/broadcast/preview`, otherCookie, {}, otherId)).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/v1/announcements/${id}/broadcast` })).statusCode).toBe(
      401,
    );
    // Hanya message:read + announcement:read: boleh melihat status, tidak boleh menyiarkan.
    expect((await call('GET', `/v1/announcements/${id}/broadcast`, principalCookie)).statusCode).toBe(200);
    expect((await call('GET', `/v1/announcements/${id}/broadcast`, teacherCookie)).statusCode).toBe(403);
  });

  it('draf dan kedaluwarsa ditolak 409; id tak dikenal 404', async () => {
    const draft = await makeAnnouncement({ status: 'draft' });
    expect((await preview(draft)).json().error.code).toBe('not_published');
    expect((await broadcast(draft, 2)).json().error.code).toBe('not_published');
    const old = await makeAnnouncement({ expiresAt: new Date(Date.now() - 3_600_000).toISOString() });
    expect((await preview(old)).json().error.code).toBe('announcement_expired');
    expect((await preview('0198f000-0000-7000-8000-000000000000')).statusCode).toBe(404);
  });
});

describe('sasaran menurut audiens', () => {
  it('all dan public: wali saja bawaan, staf bila dicentang; portal: wali saja; staff: staf saja', async () => {
    for (const audience of ['all', 'public']) {
      const id = await makeAnnouncement({ audience });
      const j = (await preview(id)).json();
      // Ani+Budi (satu wali) dan Cici; wali Dedi tanpa nomor.
      expect(j).toMatchObject({
        total: 2,
        excluded: { noPhone: 1, duplicate: 1, optedOut: 0 },
        staffMode: 'optional',
        existingBatchId: null,
      });
      expect(j.sample.every((s: { recipientType: string }) => s.recipientType === 'guardian')).toBe(true);
      const withStaff = (await preview(id, { includeStaff: true })).json();
      expect(withStaff.total).toBe(3);
      expect(withStaff.sample.map((s: { recipientType: string }) => s.recipientType)).toContain('teacher');
    }
    const portal = await makeAnnouncement({ audience: 'portal' });
    expect((await preview(portal)).json()).toMatchObject({ total: 2, staffMode: 'none' });
    const bad = await preview(portal, { includeStaff: true });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('broadcast_target');
    const staff = await makeAnnouncement({ audience: 'staff' });
    expect((await preview(staff)).json()).toMatchObject({
      total: 1,
      excluded: { noPhone: 1 },
      staffMode: 'forced',
    });
    expect((await preview(staff, { classes: [ids.kelas] })).json().error.code).toBe('broadcast_target');
  });

  it('dipersempit per rombel/tingkat; tingkat tak cocok = tak ada penerima', async () => {
    const id = await makeAnnouncement();
    expect((await preview(id, { classes: [ids.kelas] })).json().total).toBe(2);
    expect((await preview(id, { gradeLevels: ['9'] })).json().total).toBe(0);
    const none = await broadcast(id, 0, { gradeLevels: ['9'] });
    expect(none.statusCode).toBe(400);
    expect(none.json().error.code).toBe('no_recipients');
  });
});

describe('membuat siaran', () => {
  it('antre prioritas 2 dengan isi polos; satu siaran per pengumuman; status dan audit', async () => {
    await clearBatches();
    const id = await makeAnnouncement();
    const res = await broadcast(id, 2);
    expect(res.statusCode).toBe(200);
    const { id: batchId, total } = res.json();
    expect(total).toBe(2);
    const rows = await messagesOf(batchId);
    expect(rows).toHaveLength(2);
    for (const m of rows) {
      expect(m).toMatchObject({ eventKey: 'broadcast', priority: 2, status: 'queued' });
      // Isi pengumuman dipakai apa adanya: {{x}} tidak diganti dan tidak ditolak.
      expect(m.body).toBe('*Libur Semester*\n\nSekolah libur mulai Senin {{x}}.');
    }
    const [batch] = await app.platformDb.select().from(msgBatch).where(eq(msgBatch.id, batchId));
    expect(batch).toMatchObject({
      kind: 'broadcast',
      announcementId: id,
      title: 'Libur Semester',
      recipientCount: 2,
      attachmentId: null,
    });
    // Siaran kedua: 409, juga lewat pratinjau.
    const again = await broadcast(id, 2);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('already_broadcast');
    expect((await preview(id)).json().existingBatchId).toBe(batchId);
    // Status.
    const st = (await call('GET', `/v1/announcements/${id}/broadcast`, adminCookie)).json();
    expect(st.batch).toMatchObject({ id: batchId, recipientCount: 2, status: 'sending', attachment: false });
    expect(st.batch.counts.queued).toBe(2);
    const none = await makeAnnouncement();
    expect((await call('GET', `/v1/announcements/${none}/broadcast`, adminCookie)).json()).toEqual({
      batch: null,
    });
    // Muncul di riwayat batch yang ada.
    const list = (await call('GET', '/v1/messaging/batches', adminCookie)).json();
    expect(list.items.find((b: { id: string }) => b.id === batchId)).toMatchObject({ kind: 'broadcast' });
    const logged = await app.platformDb.execute(
      sql`select count(*)::int as n from audit_log where school_id = ${schoolId} and action = 'announcement.broadcast'`,
    );
    expect((logged.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });

  it('count_changed, messaging_disabled, daily_limit, sensitive_content, dan pemotongan 1.000 karakter', async () => {
    await clearBatches();
    const id = await makeAnnouncement();
    const stale = await broadcast(id, 5);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('count_changed');
    await setSettings({ enabled: false });
    const off = await broadcast(id, 2);
    expect(off.statusCode).toBe(409);
    expect(off.json().error.code).toBe('messaging_disabled');
    await setSettings({ dailyLimit: 1 });
    const over = await broadcast(id, 2);
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe('daily_limit');
    await setSettings();
    // Tidak ada siaran yang tersisa dari percobaan gagal (semua atau tidak sama sekali).
    expect(await app.platformDb.select().from(msgBatch).where(eq(msgBatch.announcementId, id))).toHaveLength(
      0,
    );

    const nik = await makeAnnouncement({ body: 'Rekening 1234567890123456 atas nama sekolah.' });
    const sens = await broadcast(nik, 2);
    expect(sens.statusCode).toBe(400);
    expect(sens.json().error.code).toBe('sensitive_content');

    const long = await makeAnnouncement({ title: 'Panjang', body: 'x'.repeat(3000) });
    const j = (await preview(long)).json();
    expect(j.truncated).toBe(true);
    expect(j.message.endsWith('Selengkapnya di portal sekolah.')).toBe(true);
    const ok = await broadcast(long, 2);
    expect(ok.statusCode).toBe(200);
    const [m] = await messagesOf(ok.json().id);
    expect(m!.body.length).toBeLessThan(1100);
    expect(m!.body.endsWith('Selengkapnya di portal sekolah.')).toBe(true);
  });

  it('lampiran opsional: tak ada 400 attachment_invalid; ada ikut ke batch', async () => {
    await clearBatches();
    const id = await makeAnnouncement();
    const missing = await broadcast(id, 2, { attachmentId: '0198f000-0000-7000-8000-000000000000' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('attachment_invalid');
    const bytes = Buffer.from('%PDF-1.4 uji');
    const up = await call('POST', '/v1/messaging/attachments', adminCookie, {
      fileName: 'edaran.pdf',
      mime: 'application/pdf',
      dataBase64: bytes.toString('base64'),
    });
    expect(up.statusCode).toBe(200);
    const res = await broadcast(id, 2, { attachmentId: up.json().id });
    expect(res.statusCode).toBe(200);
    const [batch] = await app.platformDb.select().from(msgBatch).where(eq(msgBatch.id, res.json().id));
    expect(batch!.attachmentId).toBe(up.json().id);
    const [file] = await app.platformDb
      .select()
      .from(msgAttachment)
      .where(eq(msgAttachment.id, up.json().id));
    expect(file!.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('galat WhatsApp tak menggagalkan penerbitan: terbitkan tetap 200 saat pengiriman mati', async () => {
    await clearBatches();
    await setSettings({ enabled: false });
    const draft = await makeAnnouncement({ status: 'draft' });
    const pub = await call('POST', `/v1/announcements/${draft}/publish`, adminCookie);
    expect(pub.statusCode).toBe(200);
    expect(pub.json().status).toBe('published');
    expect((await broadcast(draft, 2)).json().error.code).toBe('messaging_disabled');
    await setSettings();
  });
});

describe('pembatalan saat pengumuman ditarik atau dihapus', () => {
  const sendOneAndQueue = async (id: string) => {
    const b = (await broadcast(id, 2)).json().id as string;
    const [first] = await messagesOf(b);
    await app.platformDb
      .update(msgMessage)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(msgMessage.id, first!.id));
    return b;
  };

  it('tarik ke draf: yang antre menjadi skipped/cancelled, yang sudah terkirim tidak disentuh', async () => {
    await clearBatches();
    const id = await makeAnnouncement();
    const b = await sendOneAndQueue(id);
    expect((await call('POST', `/v1/announcements/${id}/unpublish`, adminCookie)).statusCode).toBe(200);
    const rows = await messagesOf(b);
    expect(rows.map((r) => r.status).sort()).toEqual(['sent', 'skipped']);
    expect(rows.find((r) => r.status === 'skipped')?.detail).toBe('cancelled');
    const [batch] = await app.platformDb.select().from(msgBatch).where(eq(msgBatch.id, b));
    expect(batch!.cancelledAt).not.toBeNull();
    // Diterbitkan lagi tidak membuka siaran kedua.
    expect((await call('POST', `/v1/announcements/${id}/publish`, adminCookie)).statusCode).toBe(200);
    expect((await broadcast(id, 2)).json().error.code).toBe('already_broadcast');
  });

  it('PUT ke status draf membatalkan antrean; hapus pengumuman membatalkan dan melepas rujukan batch', async () => {
    await clearBatches();
    const a = await makeAnnouncement();
    const ba = (await broadcast(a, 2)).json().id as string;
    const put = await call('PUT', `/v1/announcements/${a}`, adminCookie, {
      title: 'Libur Semester',
      body: 'x',
      category: 'notice',
      audience: 'all',
      status: 'draft',
    });
    expect(put.statusCode).toBe(200);
    expect((await messagesOf(ba)).every((m) => m.status === 'skipped' && m.detail === 'cancelled')).toBe(
      true,
    );

    const d = await makeAnnouncement({ title: 'Akan dihapus' });
    const bd = (await broadcast(d, 2)).json().id as string;
    expect((await call('DELETE', `/v1/announcements/${d}`, adminCookie)).statusCode).toBe(200);
    expect((await messagesOf(bd)).every((m) => m.status === 'skipped' && m.detail === 'cancelled')).toBe(
      true,
    );
    const [batch] = await app.platformDb.select().from(msgBatch).where(eq(msgBatch.id, bd));
    expect(batch).toMatchObject({ announcementId: null });
    expect(batch!.schoolId).toBe(schoolId);
  });

  it('menarik atau menghapus pengumuman tanpa siaran berperilaku seperti biasa', async () => {
    const id = await makeAnnouncement();
    expect((await call('POST', `/v1/announcements/${id}/unpublish`, adminCookie)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/announcements/${id}`, adminCookie)).statusCode).toBe(200);
  });
});

describe('opt-out siaran', () => {
  it('staf menandai wali; siaran melewatinya, pesan langsung hanya peringatan; cabut mengembalikan', async () => {
    await clearBatches();
    const id = await makeAnnouncement();
    const put = await call('PUT', '/v1/messaging/opt-outs', adminCookie, { guardianId: ids.g1 });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ guardianId: ids.g1, guardianName: 'Bu Sari', source: 'staff' });
    expect(put.json().phone).toMatch(/\*/);
    // Aman diulang: tetap satu baris.
    expect(
      (await call('PUT', '/v1/messaging/opt-outs', adminCookie, { guardianId: ids.g1 })).statusCode,
    ).toBe(200);
    const list = (await call('GET', '/v1/messaging/opt-outs', adminCookie)).json();
    expect(list.total).toBe(1);
    expect(JSON.stringify(list)).not.toContain('6281234500001');

    expect((await preview(id)).json()).toMatchObject({ total: 1, excluded: { optedOut: 1 } });
    expect((await broadcast(id, 2)).json().error.code).toBe('count_changed');
    const res = await broadcast(id, 1);
    expect(res.statusCode).toBe(200);
    expect(res.json().excluded.optedOut).toBe(1);
    expect((await messagesOf(res.json().id)).map((m) => m.toPhone)).toEqual(['6281234500002']);

    // Pesan langsung: peringatan, penerima tetap ada dan boleh dikirim.
    const direct = await call('POST', '/v1/messaging/recipients/preview', adminCookie, {
      selection: { guardians: [ids.g1] },
    });
    expect(direct.json()).toMatchObject({ total: 1, optedOutWarning: 1, excluded: { optedOut: 0 } });
    const sent = await call('POST', '/v1/messaging/batches', adminCookie, {
      selection: { guardians: [ids.g1] },
      body: 'Yth. {{guardian}}',
      expectedTotal: 1,
    });
    expect(sent.statusCode).toBe(200);

    const removed = await call('DELETE', `/v1/messaging/opt-outs/${put.json().id}`, adminCookie);
    expect(removed.statusCode).toBe(200);
    expect((await call('DELETE', `/v1/messaging/opt-outs/${put.json().id}`, adminCookie)).statusCode).toBe(
      404,
    );
    expect((await call('GET', '/v1/messaging/opt-outs', adminCookie)).json().total).toBe(0);
  });

  it('izin message:manage; wali tanpa nomor 400; wali sekolah lain 404; daftar terisolasi', async () => {
    expect((await call('GET', '/v1/messaging/opt-outs', principalCookie)).statusCode).toBe(403);
    expect(
      (await call('PUT', '/v1/messaging/opt-outs', principalCookie, { guardianId: ids.g1 })).statusCode,
    ).toBe(403);
    const noPhone = await call('PUT', '/v1/messaging/opt-outs', adminCookie, { guardianId: ids.gNoPhone });
    expect(noPhone.statusCode).toBe(400);
    expect(noPhone.json().error.code).toBe('invalid_phone');
    expect(
      (await call('PUT', '/v1/messaging/opt-outs', otherCookie, { guardianId: ids.g1 }, otherId)).statusCode,
    ).toBe(404);
    await call('PUT', '/v1/messaging/opt-outs', adminCookie, { guardianId: ids.g2 });
    expect((await call('GET', '/v1/messaging/opt-outs', otherCookie, undefined, otherId)).json().total).toBe(
      0,
    );
    await app.platformDb.delete(msgOptOut).where(eq(msgOptOut.schoolId, schoolId));
  });
});
