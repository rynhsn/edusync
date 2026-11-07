import {
  assignRoles,
  auditLog,
  eq,
  foundation,
  foundationOwner,
  member,
  outbox,
  platformStaff,
  school,
  seedSchoolRoles,
  sql,
  supportTicket,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { schoolOrigin } from './origins';
import { escapeHtml, excerpt, selectRecipients, supportEmail } from './support-lib';

// Admin platform sungguhan ada di basis data pengembangan; email mereka dialihkan ke alamat uji
// agar menjalankan tes ini tidak pernah mengirim surel ke orang sungguhan.
vi.mock('@edusync/jobs', async (orig) => {
  const actual = await orig<typeof import('@edusync/jobs')>();
  let n = 0;
  return {
    ...actual,
    enqueue: ((tx: never, queue: never, payload: { to: string }, opts: never) => {
      const safe = payload.to.endsWith('@example.test')
        ? payload.to
        : `dialihkan-${++n}-${process.env.SUPPORT_TEST_RUN}@example.test`;
      return (actual.enqueue as (...a: unknown[]) => unknown)(tx, queue, { ...payload, to: safe }, opts);
    }) as typeof actual.enqueue,
  };
});

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
process.env.SUPPORT_TEST_RUN = run;
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const env = loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev' });
const scheme = new URL(env.AUTH_URL).protocol as 'http:' | 'https:';

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
let ip = 10;
let schoolA = '';
let schoolB = '';
let foundationId = '';
let foundationB = '';
const slugA = `spa-${run}`;

interface Person {
  id: string;
  email: string;
  cookie: string;
}

async function makeUser(label: string): Promise<Person> {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: `Uji ${label}`, email, password } });
  userIds.push(res.user.id);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { id: res.user.id, email, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

async function makeStaff(label: string, role: 'admin' | 'read_only') {
  const p = await makeUser(label);
  await app.platformDb.insert(platformStaff).values({ userId: p.id, role });
  return p;
}

async function makeMember(label: string, schoolId: string, roleKey: string) {
  const p = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: p.id, schoolId }).returning();
  await assignRoles(app.platformDb, m!.id, schoolId, [roleKey]);
  return p;
}

const call = (
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  who: Person | null,
  payload?: object,
  schoolId?: string,
) =>
  app.inject({
    method,
    url,
    remoteAddress: `10.8.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}`,
    headers: {
      origin,
      ...(who ? { cookie: who.cookie } : {}),
      ...(schoolId ? { 'x-school-id': schoolId } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const mailsTo = async (email: string) =>
  (
    await app.platformDb
      .select()
      .from(outbox)
      .where(sql`${outbox.payload}->>'to' = ${email}`)
      .orderBy(outbox.id)
  ).map((r) => r.payload as { to: string; subject: string; text: string; html: string });

const resetThrottle = (ticketId: string) =>
  app.platformDb.execute(sql`delete from support_email_throttle where ticket_id = ${ticketId}`);

const auditsOf = async (ticketId: string) =>
  (await app.platformDb.select().from(auditLog).where(eq(auditLog.entityId, ticketId))).map((a) => a.action);

let staffAdmin: Person;
let staffAdmin2: Person;
let staffViewer: Person;
let adminA: Person;
let adminA2: Person;
let teacherA: Person;
let adminB: Person;
let owner: Person;
let stranger: Person;

async function newTicket(who: Person, over: Record<string, unknown> = {}, schoolId = schoolA) {
  const res = await call(
    'POST',
    '/v1/support/tickets',
    who,
    {
      subject: 'Absensi QR tidak terbaca',
      category: 'bug',
      priority: 'normal',
      body: 'Pemindai gerbang tidak membaca kartu siswa sejak pagi.',
      page: '/gate/scan',
      ...over,
    },
    schoolId,
  );
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; ticketNo: string; status: string; messages: { body: string }[] };
}

beforeAll(async () => {
  app = await buildApp(env);
  await app.ready();
  const db = app.platformDb;
  const [fa] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Lapor A', slug: `yla-${run}` })
    .returning();
  const [fb] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Lapor B', slug: `ylb-${run}` })
    .returning();
  foundationId = fa!.id;
  foundationB = fb!.id;
  const [sa] = await db
    .insert(school)
    .values({ foundationId, slug: slugA, name: 'Sekolah Lapor A' })
    .returning();
  const [sb] = await db
    .insert(school)
    .values({ foundationId: foundationB, slug: `spb-${run}`, name: 'Sekolah Lapor B' })
    .returning();
  schoolA = sa!.id;
  schoolB = sb!.id;
  await seedSchoolRoles(db, schoolA);
  await seedSchoolRoles(db, schoolB);

  staffAdmin = await makeStaff('lap-staf1', 'admin');
  staffAdmin2 = await makeStaff('lap-staf2', 'admin');
  staffViewer = await makeStaff('lap-baca', 'read_only');
  adminA = await makeMember('lap-adm-a', schoolA, 'school_admin');
  adminA2 = await makeMember('lap-adm-a2', schoolA, 'school_admin');
  teacherA = await makeMember('lap-guru-a', schoolA, 'teacher');
  adminB = await makeMember('lap-adm-b', schoolB, 'school_admin');
  owner = await makeUser('lap-pemilik');
  await db.insert(foundationOwner).values({ foundationId, userId: owner.id });
  stranger = await makeUser('lap-asing');
}, 120_000);

afterAll(async () => {
  const db = app.platformDb;
  const ids = sql.join(
    userIds.map((u) => sql`${u}`),
    sql`, `,
  );
  const like = `%-${run}@example.test`;
  await db.execute(sql`delete from outbox where payload->>'to' like ${like}`);
  await db.execute(sql`delete from support_ticket where created_by in (${ids})`);
  await db.execute(sql`delete from audit_log where actor_id in (${ids})`);
  await db.execute(sql`delete from platform_staff where user_id in (${ids})`);
  await db.execute(
    sql`delete from foundation_owner where foundation_id in (${foundationId}, ${foundationB})`,
  );
  for (const sid of [schoolA, schoolB]) {
    for (const t of ['member_role', 'role_permission', 'member', 'role']) {
      await db.execute(sql`delete from ${sql.identifier(t)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from foundation where id in (${foundationId}, ${foundationB})`);
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('fungsi murni', () => {
  it('cuplikan: dipotong 300 karakter, spasi dirapatkan, karakter kontrol dibuang', () => {
    expect(excerpt('a'.repeat(400))).toBe(`${'a'.repeat(300)}…`);
    expect(excerpt('a'.repeat(300))).toBe('a'.repeat(300));
    expect(excerpt('  halo\n\n  dunia\t\u0000x ')).toBe('halo dunia x');
  });

  it('escape HTML: tanda kutip, kurung, dan ampersand', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('pemilihan penerima: pembuat dulu, tanpa kembar (huruf besar/kecil), maksimal 5', () => {
    const p = (email: string) => ({ email, name: email });
    const out = selectRecipients(
      [p('Pembuat@x.id')],
      [p('pembuat@x.id'), p('b@x.id'), p('c@x.id'), p('d@x.id'), p('e@x.id'), p('f@x.id'), p('b@x.id')],
    );
    expect(out.map((r) => r.email)).toEqual(['pembuat@x.id', 'b@x.id', 'c@x.id', 'd@x.id', 'e@x.id']);
    expect(selectRecipients([], [p(''), p('  ')])).toEqual([]);
  });

  it('isi email: nomor, judul, cuplikan ter-escape, tautan, catatan tanpa balasan email', () => {
    const m = supportEmail({
      kind: 'reply',
      recipientName: 'Budi',
      ticketNo: 'TKT-000123',
      subject: 'Judul\nbaris dua',
      who: 'Tim <b>Edusync</b>',
      body: '<script>alert(1)</script> & lainnya',
      link: 'https://x.id/support/1',
    });
    expect(m.subject).toBe('[TKT-000123] Balasan: Judul baris dua');
    expect(m.text).toContain('Balas lewat tautan di atas');
    expect(m.text).toContain('https://x.id/support/1');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('Tim &lt;b&gt;Edusync&lt;/b&gt; membalas laporan.');
  });
});

describe('laporan: alur sekolah dan platform', () => {
  let ticketId = '';
  let ticketNo = '';

  it('admin sekolah membuat laporan: 201, kode TKT, konteks otomatis, email ke admin platform saja', async () => {
    const t = await newTicket(adminA);
    ticketId = t.id;
    ticketNo = t.ticketNo;
    expect(t.ticketNo).toMatch(/^TKT-\d{6,}$/);
    expect(t.status).toBe('open');
    expect(t.messages).toHaveLength(1);

    const [row] = await app.platformDb.select().from(supportTicket).where(eq(supportTicket.id, ticketId));
    expect(row?.origin).toBe('school');
    expect(row?.schoolId).toBe(schoolA);
    expect(row?.platformUnread).toBe(true);
    expect(row?.schoolUnread).toBe(false);
    expect(row?.context).toMatchObject({
      schoolName: 'Sekolah Lapor A',
      schoolSlug: slugA,
      page: '/gate/scan',
    });
    expect((row?.context as { roles?: string[] } | undefined)?.roles).toContain('school_admin');

    for (const staff of [staffAdmin, staffAdmin2]) {
      const mails = await mailsTo(staff.email);
      expect(mails).toHaveLength(1);
      expect(mails[0]?.subject).toContain(ticketNo);
      expect(mails[0]?.text).toContain(`${env.WEB_URL.replace(/\/$/, '')}/platform/support/${ticketId}`);
      expect(mails[0]?.text).toContain('Balas lewat tautan di atas');
    }
    expect(await mailsTo(staffViewer.email)).toHaveLength(0);
    expect(await mailsTo(adminA.email)).toHaveLength(0);
  });

  it('validasi dan izin: judul pendek 400, guru 403, tanpa header sekolah 400, tanpa login 401', async () => {
    const bad = await call(
      'POST',
      '/v1/support/tickets',
      adminA,
      { subject: 'ab', category: 'bug', body: 'isi laporan' },
      schoolA,
    );
    expect(bad.statusCode).toBe(400);
    const long = await call(
      'POST',
      '/v1/support/tickets',
      adminA,
      { subject: 'x'.repeat(151), category: 'bug', body: 'isi laporan' },
      schoolA,
    );
    expect(long.statusCode).toBe(400);
    const cat = await call(
      'POST',
      '/v1/support/tickets',
      adminA,
      { subject: 'Judul', category: 'lain', body: 'isi laporan' },
      schoolA,
    );
    expect(cat.statusCode).toBe(400);
    const teacher = await call('GET', '/v1/support/tickets', teacherA, undefined, schoolA);
    expect(teacher.statusCode).toBe(403);
    expect((await call('GET', '/v1/support/unread-count', teacherA, undefined, schoolA)).statusCode).toBe(
      403,
    );
    expect((await call('GET', '/v1/support/tickets', adminA)).statusCode).toBe(400);
    expect((await call('GET', '/v1/support/tickets', null, undefined, schoolA)).statusCode).toBe(401);
    // Admin sekolah A tidak bisa memakai konteks sekolah B.
    expect((await call('GET', '/v1/support/tickets', adminA, undefined, schoolB)).statusCode).toBe(403);
  });

  it('isolasi sekolah: sekolah B tidak melihat, membalas, atau menutup laporan sekolah A', async () => {
    const list = await call('GET', '/v1/support/tickets', adminB, undefined, schoolB);
    expect(list.statusCode).toBe(200);
    expect(list.json().tickets).toEqual([]);
    expect(
      (await call('GET', `/v1/support/tickets/${ticketId}`, adminB, undefined, schoolB)).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/v1/support/tickets/${ticketId}/messages`, adminB, { body: 'halo' }, schoolB))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/v1/support/tickets/${ticketId}/close`, adminB, undefined, schoolB)).statusCode,
    ).toBe(404);
    // Pemilik yayasan A bukan anggota sekolah: ditolak di rute sekolah, dan laporan sekolah tak muncul di portal pemilik.
    expect((await call('GET', '/v1/support/tickets', owner, undefined, schoolA)).statusCode).toBe(403);
    const own = await call('GET', '/v1/account/support/tickets', owner);
    expect(own.json().tickets).toEqual([]);
    expect((await call('GET', `/v1/account/support/tickets/${ticketId}`, owner)).statusCode).toBe(404);
  });

  it('daftar sekolah memuat laporan; filter status bekerja', async () => {
    const list = await call('GET', '/v1/support/tickets', adminA2, undefined, schoolA);
    expect(list.json().tickets.map((t: { id: string }) => t.id)).toContain(ticketId);
    const open = await call('GET', '/v1/support/tickets?status=open', adminA, undefined, schoolA);
    expect(open.json().tickets.some((t: { id: string }) => t.id === ticketId)).toBe(true);
    const closed = await call('GET', '/v1/support/tickets?status=closed', adminA, undefined, schoolA);
    expect(closed.json().tickets).toEqual([]);
  });

  it('platform: baca boleh, ubah hanya admin; peran sekolah ditolak; membuka laporan menghapus tanda baru', async () => {
    expect((await call('GET', '/v1/platform/support/tickets', adminA)).statusCode).toBe(403);
    expect((await call('GET', '/v1/platform/support/unread-count', adminA)).statusCode).toBe(403);
    const count = await call('GET', '/v1/platform/support/unread-count', staffViewer);
    expect(count.json().count).toBeGreaterThanOrEqual(1);

    const list = await call('GET', `/v1/platform/support/tickets?q=${ticketNo}`, staffViewer);
    expect(list.statusCode).toBe(200);
    expect(list.json().tickets).toHaveLength(1);
    expect(list.json().tickets[0]).toMatchObject({
      id: ticketId,
      unread: true,
      schoolName: 'Sekolah Lapor A',
    });
    expect(list.json().counts.open).toBeGreaterThanOrEqual(1);

    expect(
      (await call('POST', `/v1/platform/support/tickets/${ticketId}/messages`, staffViewer, { body: 'x' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('PATCH', `/v1/platform/support/tickets/${ticketId}`, staffViewer, { priority: 'high' }))
        .statusCode,
    ).toBe(403);

    const detail = await call('GET', `/v1/platform/support/tickets/${ticketId}`, staffViewer);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().context.schoolName).toBe('Sekolah Lapor A');
    const [row] = await app.platformDb.select().from(supportTicket).where(eq(supportTicket.id, ticketId));
    expect(row?.platformUnread).toBe(false);
    expect((await call('GET', `/v1/platform/support/tickets/${ticketId}?`, staffViewer)).statusCode).toBe(
      200,
    );
  });

  it('catatan internal: tersembunyi dari sekolah, tanpa email dan tanpa lencana', async () => {
    const before = (await mailsTo(adminA.email)).length;
    const note = await call('POST', `/v1/platform/support/tickets/${ticketId}/messages`, staffAdmin, {
      body: 'Catatan rahasia: cek log gerbang',
      internal: true,
    });
    expect(note.statusCode).toBe(201);
    expect(note.json().messages.some((m: { internal: boolean }) => m.internal)).toBe(true);

    const school = await call('GET', `/v1/support/tickets/${ticketId}`, adminA, undefined, schoolA);
    expect(JSON.stringify(school.json())).not.toContain('rahasia');
    expect(school.json().messages).toHaveLength(1);
    expect((await mailsTo(adminA.email)).length).toBe(before);
    expect((await mailsTo(adminA2.email)).length).toBe(0);
    const unread = await call('GET', '/v1/support/unread-count', adminA, undefined, schoolA);
    expect(unread.json().count).toBe(0);
    const [row] = await app.platformDb.select().from(supportTicket).where(eq(supportTicket.id, ticketId));
    expect(row?.schoolUnread).toBe(false);
    expect(row?.status).toBe('open');
  });

  it('balasan publik staf: status diproses, lencana sekolah, email ke pembuat dan admin lain, bukan guru', async () => {
    const reply = await call('POST', `/v1/platform/support/tickets/${ticketId}/messages`, staffAdmin, {
      body: `<b>Coba</b> ${'x'.repeat(400)}`,
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().status).toBe('in_progress');

    const unread = await call('GET', '/v1/support/unread-count', adminA2, undefined, schoolA);
    expect(unread.json().count).toBe(1);
    const list = await call('GET', '/v1/support/tickets', adminA, undefined, schoolA);
    expect(list.json().tickets.find((t: { id: string }) => t.id === ticketId).unread).toBe(true);

    const link = `${schoolOrigin(scheme, env.APP_DOMAIN, slugA)}/support/${ticketId}`;
    for (const p of [adminA, adminA2]) {
      const mails = await mailsTo(p.email);
      expect(mails).toHaveLength(1);
      expect(mails[0]?.subject).toContain(ticketNo);
      expect(mails[0]?.text).toContain(link);
      expect(mails[0]?.text).toContain('Uji lap-staf1');
      // Cuplikan 300 karakter: "<b>Coba</b> " (12) + 288 huruf x.
      expect(mails[0]?.text).toContain(`<b>Coba</b> ${'x'.repeat(288)}…`);
      expect(mails[0]?.text).not.toContain('x'.repeat(289));
      expect(mails[0]?.html).toContain('&lt;b&gt;Coba&lt;/b&gt;');
      expect(mails[0]?.html).not.toContain('<b>Coba</b>');
    }
    expect(await mailsTo(teacherA.email)).toHaveLength(0);
    expect(await mailsTo(owner.email)).toHaveLength(0);

    // Membuka laporan menandai terbaca bagi seluruh sisi sekolah.
    const detail = await call('GET', `/v1/support/tickets/${ticketId}`, adminA, undefined, schoolA);
    expect(detail.json().messages).toHaveLength(2);
    expect(detail.json().messages[1]).toMatchObject({ authorSide: 'platform', mine: false });
    const after = await call('GET', '/v1/support/unread-count', adminA2, undefined, schoolA);
    expect(after.json().count).toBe(0);
  });

  it('pembatas email: balasan kedua dalam 2 menit tidak mengirim ulang; setelah jendela, kirim lagi', async () => {
    const sendReply = () =>
      call('POST', `/v1/platform/support/tickets/${ticketId}/messages`, staffAdmin2, {
        body: 'Balasan lanjutan',
      });
    expect((await sendReply()).statusCode).toBe(201);
    expect(await mailsTo(adminA.email)).toHaveLength(1);
    expect(await mailsTo(adminA2.email)).toHaveLength(1);
    // Balasan tetap tersimpan dan lencana tetap menyala walau email dilewati.
    expect((await call('GET', '/v1/support/unread-count', adminA, undefined, schoolA)).json().count).toBe(1);

    await app.platformDb.execute(
      sql`update support_email_throttle set sent_at = now() - interval '3 minutes' where ticket_id = ${ticketId}`,
    );
    expect((await sendReply()).statusCode).toBe(201);
    expect(await mailsTo(adminA.email)).toHaveLength(2);
    expect(await mailsTo(adminA2.email)).toHaveLength(2);
  });

  it('balasan sekolah: ke semua admin bila belum ada petugas, hanya petugas bila sudah ditugaskan', async () => {
    const t = await newTicket(adminA, { subject: 'Rapor tidak muncul' });
    const staff1 = (await mailsTo(staffAdmin.email)).length;
    const staff2 = (await mailsTo(staffAdmin2.email)).length;
    await resetThrottle(t.id);

    const r1 = await call(
      'POST',
      `/v1/support/tickets/${t.id}/messages`,
      adminA,
      { body: 'Mohon dicek lagi' },
      schoolA,
    );
    expect(r1.statusCode).toBe(201);
    expect(r1.json().messages).toHaveLength(2);
    expect((await mailsTo(staffAdmin.email)).length).toBe(staff1 + 1);
    expect((await mailsTo(staffAdmin2.email)).length).toBe(staff2 + 1);

    const assign = await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, {
      assignedStaffId: staffAdmin2.id,
    });
    expect(assign.statusCode).toBe(200);
    expect(assign.json().assignedStaffId).toBe(staffAdmin2.id);
    await resetThrottle(t.id);
    const r2 = await call(
      'POST',
      `/v1/support/tickets/${t.id}/messages`,
      adminA2,
      { body: 'Masih bermasalah' },
      schoolA,
    );
    expect(r2.statusCode).toBe(201);
    expect((await mailsTo(staffAdmin.email)).length).toBe(staff1 + 1);
    expect((await mailsTo(staffAdmin2.email)).length).toBe(staff2 + 2);
    const last = (await mailsTo(staffAdmin2.email)).at(-1);
    expect(last?.text).toContain('Uji lap-adm-a2');
    expect(last?.text).toContain('Masih bermasalah');
    const [row] = await app.platformDb.select().from(supportTicket).where(eq(supportTicket.id, t.id));
    expect(row?.platformUnread).toBe(true);
  });

  it('status: selesai memberi tahu pembuat; balasan membuka kembali; ditutup tidak bisa dibalas', async () => {
    const t = await newTicket(adminA, { subject: 'Cetak kartu gagal' });
    const before = (await mailsTo(adminA.email)).length;
    await resetThrottle(t.id);

    const resolved = await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, {
      status: 'resolved',
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().status).toBe('resolved');
    expect(resolved.json().resolvedAt).not.toBeNull();
    const mails = await mailsTo(adminA.email);
    expect(mails.length).toBe(before + 1);
    expect(mails.at(-1)?.subject).toContain('Selesai');
    expect(mails.at(-1)?.subject).toContain(t.ticketNo);
    // Anggota lain tidak dikirimi email status, tetapi lencana menyala.
    expect((await mailsTo(adminA2.email)).length).toBe(2);
    expect(
      (await call('GET', '/v1/support/unread-count', adminA, undefined, schoolA)).json().count,
    ).toBeGreaterThanOrEqual(1);

    // Mengulang status yang sama tidak mengirim email lagi.
    await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, { status: 'resolved' });
    expect((await mailsTo(adminA.email)).length).toBe(before + 1);

    const reopen = await call(
      'POST',
      `/v1/support/tickets/${t.id}/messages`,
      adminA,
      { body: 'Ternyata masih gagal' },
      schoolA,
    );
    expect(reopen.statusCode).toBe(201);
    expect(reopen.json().status).toBe('open');
    expect(reopen.json().resolvedAt).toBeNull();

    await resetThrottle(t.id);
    const closed = await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, {
      status: 'closed',
    });
    expect(closed.json().status).toBe('closed');
    expect(closed.json().closedAt).not.toBeNull();
    expect((await mailsTo(adminA.email)).at(-1)?.subject).toContain('Ditutup');

    const blocked = await call(
      'POST',
      `/v1/support/tickets/${t.id}/messages`,
      adminA,
      { body: 'Masih bisa?' },
      schoolA,
    );
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('ticket_closed');
    const staffBlocked = await call('POST', `/v1/platform/support/tickets/${t.id}/messages`, staffAdmin, {
      body: 'Halo',
    });
    expect(staffBlocked.statusCode).toBe(409);
    // Catatan internal tetap boleh pada laporan ditutup.
    const note = await call('POST', `/v1/platform/support/tickets/${t.id}/messages`, staffAdmin, {
      body: 'Arsip',
      internal: true,
    });
    expect(note.statusCode).toBe(201);
    expect(
      (await call('GET', `/v1/support/tickets/${t.id}`, adminA, undefined, schoolA)).json().canReply,
    ).toBe(false);

    // Staf bisa membuka kembali lewat status.
    const reopened = await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, {
      status: 'in_progress',
    });
    expect(reopened.json().status).toBe('in_progress');
    expect(reopened.json().closedAt).toBeNull();
  });

  it('pelapor menutup sendiri: status ditutup, platform diberi tanda, tanpa email', async () => {
    const t = await newTicket(adminA2, { subject: 'Sudah beres sendiri' });
    const staffMails = (await mailsTo(staffAdmin.email)).length;
    await call('GET', `/v1/platform/support/tickets/${t.id}`, staffAdmin);
    const res = await call('POST', `/v1/support/tickets/${t.id}/close`, adminA2, undefined, schoolA);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('closed');
    expect((await mailsTo(staffAdmin.email)).length).toBe(staffMails);
    const [row] = await app.platformDb.select().from(supportTicket).where(eq(supportTicket.id, t.id));
    expect(row?.platformUnread).toBe(true);
    expect(row?.closedAt).not.toBeNull();
  });

  it('ubah prioritas, kategori, petugas: tercatat di audit; petugas harus staf', async () => {
    const t = await newTicket(adminA, { subject: 'Ubah atribut' });
    const res = await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, {
      priority: 'urgent',
      category: 'billing',
      assignedStaffId: staffViewer.id,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      priority: 'urgent',
      category: 'billing',
      assignedStaffId: staffViewer.id,
    });
    expect(res.json().assignedStaffName).toBe('Uji lap-baca');
    const bad = await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, {
      assignedStaffId: adminA.id,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_assignee');
    const lepas = await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, {
      assignedStaffId: null,
    });
    expect(lepas.json().assignedStaffId).toBeNull();
    expect(
      (await call('PATCH', `/v1/platform/support/tickets/${t.id}`, staffAdmin, { priority: 'sangat' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('GET', '/v1/platform/support/tickets/019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', staffAdmin))
        .statusCode,
    ).toBe(404);

    // Balasan, catatan, dan perubahan staf semuanya masuk audit atas nama pelaku.
    await call('POST', `/v1/platform/support/tickets/${t.id}/messages`, staffAdmin, { body: 'balas' });
    await call('POST', `/v1/platform/support/tickets/${t.id}/messages`, staffAdmin, {
      body: 'catat',
      internal: true,
    });
    const actions = await auditsOf(t.id);
    expect(actions.filter((a) => a === 'support.update').length).toBe(2);
    expect(actions).toContain('support.reply');
    expect(actions).toContain('support.note');
    const [entry] = (await app.platformDb.select().from(auditLog).where(eq(auditLog.entityId, t.id))).filter(
      (a) => a.action === 'support.update',
    );
    expect(entry?.actorId).toBe(staffAdmin.id);
    expect(entry?.details).toMatchObject({ ticketNo: t.ticketNo });
  });

  it('daftar platform: filter kategori, prioritas, petugas, sekolah, belum dibaca, dan hitungan status', async () => {
    const list = (qs: string) => call('GET', `/v1/platform/support/tickets?${qs}`, staffViewer);
    const billing = await list(`category=billing&schoolId=${schoolA}`);
    expect(billing.json().tickets.length).toBeGreaterThanOrEqual(1);
    expect(billing.json().tickets.every((t: { category: string }) => t.category === 'billing')).toBe(true);
    const urgent = await list('priority=urgent');
    expect(urgent.json().tickets.every((t: { priority: string }) => t.priority === 'urgent')).toBe(true);
    const mine = await call('GET', '/v1/platform/support/tickets?assignee=me&q=Ubah', staffViewer);
    expect(mine.json().tickets).toEqual([]);
    const none = await list(`assignee=none&schoolId=${schoolA}`);
    expect(
      none.json().tickets.every((t: { assignedStaffId: string | null }) => t.assignedStaffId === null),
    ).toBe(true);
    const unread = await list(`unread=true&schoolId=${schoolA}`);
    expect(unread.json().tickets.every((t: { unread: boolean }) => t.unread)).toBe(true);
    const other = await list(`schoolId=${schoolB}`);
    expect(other.json().tickets).toEqual([]);
    const all = await list(`schoolId=${schoolA}&limit=2`);
    expect(all.json().tickets.length).toBe(2);
    expect(all.json().total).toBeGreaterThan(2);
    // Urut aktivitas terbaru.
    const times = all.json().tickets.map((t: { lastMessageAt: string }) => t.lastMessageAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect((await list('limit=500')).statusCode).toBe(400);
  });

  it('batas pembuatan: 10 laporan per pengguna per jam, ke-11 ditolak 429', async () => {
    for (let i = 0; i < 10; i++) await newTicket(adminB, { subject: `Batas ${i}` }, schoolB);
    const res = await call(
      'POST',
      '/v1/support/tickets',
      adminB,
      { subject: 'Kesebelas', category: 'other', body: 'isi laporan' },
      schoolB,
    );
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('rate_limited');
  });
});

describe('laporan: portal pemilik yayasan', () => {
  let ownerTicket = '';
  const create = (who: Person, payload: object) => call('POST', '/v1/account/support/tickets', who, payload);

  it('pemilik membuat laporan; yayasan yang bukan miliknya 404; unit harus milik yayasan itu', async () => {
    const ok = await create(owner, {
      foundationId,
      schoolId: schoolA,
      subject: 'Tagihan ganda',
      category: 'billing',
      body: 'Ada dua tagihan untuk bulan yang sama.',
      page: '/account/billing',
    });
    expect(ok.statusCode, ok.body).toBe(201);
    ownerTicket = ok.json().id;
    const [row] = await app.platformDb.select().from(supportTicket).where(eq(supportTicket.id, ownerTicket));
    expect(row).toMatchObject({ origin: 'owner', foundationId, schoolId: schoolA });
    expect(row?.context).toMatchObject({ foundationName: 'Yayasan Lapor A', page: '/account/billing' });

    const foreign = await create(owner, {
      foundationId: foundationB,
      subject: 'Bukan milik saya',
      category: 'other',
      body: 'isi laporan',
    });
    expect(foreign.statusCode).toBe(404);
    const wrongUnit = await create(owner, {
      foundationId,
      schoolId: schoolB,
      subject: 'Unit lain',
      category: 'other',
      body: 'isi laporan',
    });
    expect(wrongUnit.statusCode).toBe(404);
    const asStranger = await create(stranger, {
      foundationId,
      subject: 'Penyusup',
      category: 'other',
      body: 'isi laporan',
    });
    expect(asStranger.statusCode).toBe(404);
    expect(
      (await create(owner, { foundationId, subject: 'ab', category: 'other', body: 'isi laporan' }))
        .statusCode,
    ).toBe(400);
    expect((await call('GET', '/v1/account/support/tickets', null)).statusCode).toBe(401);
  });

  it('cakupan pemilik: hanya laporan pemilik; admin sekolah dan orang asing tidak melihatnya', async () => {
    const mine = await call('GET', '/v1/account/support/tickets', owner);
    expect(mine.json().tickets.map((t: { id: string }) => t.id)).toEqual([ownerTicket]);
    const adminList = await call('GET', '/v1/support/tickets', adminA, undefined, schoolA);
    expect(adminList.json().tickets.some((t: { id: string }) => t.id === ownerTicket)).toBe(false);
    expect(
      (await call('GET', `/v1/support/tickets/${ownerTicket}`, adminA, undefined, schoolA)).statusCode,
    ).toBe(404);
    const strangerList = await call('GET', '/v1/account/support/tickets', stranger);
    expect(strangerList.json().tickets).toEqual([]);
    expect((await call('GET', `/v1/account/support/tickets/${ownerTicket}`, stranger)).statusCode).toBe(404);
    expect(
      (await call('POST', `/v1/account/support/tickets/${ownerTicket}/messages`, stranger, { body: 'halo' }))
        .statusCode,
    ).toBe(404);
  });

  it('balasan staf: email ke pemilik dengan tautan portal, lencana, dan catatan internal tersembunyi', async () => {
    await call('POST', `/v1/platform/support/tickets/${ownerTicket}/messages`, staffAdmin, {
      body: 'Kami cek tagihannya.',
    });
    await call('POST', `/v1/platform/support/tickets/${ownerTicket}/messages`, staffAdmin, {
      body: 'Internal: tagihan memang ganda',
      internal: true,
    });
    const mails = await mailsTo(owner.email);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.text).toContain(`${env.WEB_URL.replace(/\/$/, '')}/account/support/${ownerTicket}`);
    expect((await call('GET', '/v1/account/support/unread-count', owner)).json().count).toBe(1);
    const detail = await call('GET', `/v1/account/support/tickets/${ownerTicket}`, owner);
    expect(detail.json().messages).toHaveLength(2);
    expect(JSON.stringify(detail.json())).not.toContain('Internal');
    expect((await call('GET', '/v1/account/support/unread-count', owner)).json().count).toBe(0);
    // Admin sekolah A tidak menerima email laporan pemilik.
    const reply = await call('POST', `/v1/account/support/tickets/${ownerTicket}/messages`, owner, {
      body: 'Terima kasih',
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().messages).toHaveLength(3);
    const closed = await call('POST', `/v1/account/support/tickets/${ownerTicket}/close`, owner);
    expect(closed.json().status).toBe('closed');
    expect(
      (await call('POST', `/v1/account/support/tickets/${ownerTicket}/messages`, owner, { body: 'lagi' }))
        .statusCode,
    ).toBe(409);
  });
});
