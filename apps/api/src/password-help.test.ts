import { createHash } from 'node:crypto';
import {
  assignRoles,
  auditLog,
  eq,
  foundation,
  foundationOwner,
  inArray,
  member,
  outbox,
  passwordResetLink,
  passwordResetRequest,
  platformStaff,
  school,
  seedSchoolRoles,
  sql,
  subscription,
  user,
  withTenant,
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
const newPassword = 'kata-sandi-baru-67890';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolA = '';
let schoolB = '';
const slugA = `ph-a-${run}`;
const slugB = `ph-b-${run}`;
const userIds: string[] = [];
const cookies: Record<string, string> = {};
const people: Record<string, { id: string; email: string }> = {};
let ipCounter = 0;
let phoneCounter = Number.parseInt(run, 36) % 1_000_000;

const nextIp = () => {
  ipCounter++;
  return `10.77.${(ipCounter >> 8) & 255}.${(ipCounter & 255) + 1}`;
};
const nextPhone = () => `62813${String(1_000_000 + phoneCounter++).slice(-7)}`;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenOf = (url: string) => url.split('/reset/')[1] as string;

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: `${label} ${run}`, email, password } });
  userIds.push(res.user.id);
  people[label] = { id: res.user.id, email };
  return { id: res.user.id, email };
}
async function login(email: string, pw = password) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    remoteAddress: nextIp(),
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password: pw },
  });
  return { status: res.statusCode, cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}
async function join(label: string, sid: string, roles: string[], opts: { sign?: boolean } = {}) {
  const u = people[label] ?? (await makeUser(label));
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  if (opts.sign !== false && !cookies[label]) cookies[label] = (await login(u.email)).cookie;
  return m!.id;
}

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  cookie: string | null,
  payload?: object,
  sid = schoolA,
) =>
  app.inject({
    method,
    url,
    remoteAddress: nextIp(),
    headers: {
      ...(cookie ? { cookie } : {}),
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const report = (body: object, ip = nextIp()) =>
  app.inject({
    method: 'POST',
    url: '/v1/public/password-help',
    remoteAddress: ip,
    headers: { 'content-type': 'application/json' },
    payload: { slug: slugA, ...body },
  });

const publicCall = (method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    remoteAddress: nextIp(),
    headers: payload ? { 'content-type': 'application/json' } : {},
    ...(payload ? { payload } : {}),
  });

const rowsFor = (phone: string) =>
  app.platformDb.select().from(passwordResetRequest).where(eq(passwordResetRequest.contactPhone, phone));

async function adminCreatesLink(userId: string, cookie = cookies.admin as string, sid = schoolA) {
  return call('POST', '/v1/password-help/links', cookie, { userId }, sid);
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Bantuan Sandi', slug: `yph-${run}` })
    .returning();
  foundationId = f!.id;
  await db.insert(subscription).values({
    foundationId,
    period: 'monthly',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
  });
  const make = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    return s!.id;
  };
  schoolA = await make(slugA);
  schoolB = await make(slugB);

  await join('admin', schoolA, ['school_admin']);
  await join('admin2', schoolA, ['school_admin']);
  await join('operator', schoolA, ['operator']);
  await join('operator2', schoolA, ['operator']);
  await join('principal', schoolA, ['principal']);
  await join('teacher', schoolA, ['teacher']);
  await join('guardian', schoolA, ['guardian']);
  await join('guardian2', schoolA, ['guardian']);
  await join('student', schoolA, ['student']);
  await join('multi', schoolA, ['guardian']);
  await join('multi', schoolB, ['guardian'], { sign: false });
  await join('staff', schoolA, ['teacher']);
  await join('owner', schoolA, ['teacher']);
  await join('adminB', schoolB, ['school_admin']);
  const disabledId = await join('disabled', schoolA, ['guardian']);
  await db.update(member).set({ status: 'disabled' }).where(eq(member.id, disabledId));
  await db.insert(platformStaff).values({ userId: people.staff!.id, role: 'read_only' });
  await db.insert(foundationOwner).values({ foundationId, userId: people.owner!.id });
  await db.update(user).set({ phone: '6281299900001' }).where(eq(user.id, people.guardian!.id));
}, 60_000);

afterAll(async () => {
  const db = app.platformDb;
  await db.delete(platformStaff).where(eq(platformStaff.userId, people.staff!.id));
  await db.delete(foundationOwner).where(eq(foundationOwner.foundationId, foundationId));
  const tables = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'school_id' and table_name <> 'school'`,
  );
  for (let pass = 0; pass < 4; pass++) {
    for (const { table_name } of tables.rows) {
      await db
        .execute(sql`delete from ${sql.identifier(table_name)} where school_id in (${schoolA}, ${schoolB})`)
        .catch(() => undefined);
    }
  }
  await db.delete(school).where(inArray(school.id, [schoolA, schoolB]));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('laporan publik', () => {
  it('jawaban netral sama untuk akun cocok, tidak cocok, sekolah tak dikenal, dan honeypot', async () => {
    const matchPhone = nextPhone();
    const match = await report({
      claimedName: `guardian ${run}`,
      contactPhone: matchPhone,
      claimedInfo: 'Ibu dari Ani kelas 3A',
    });
    const none = await report({ claimedName: 'Orang Asing Sekali', contactPhone: nextPhone() });
    const unknownSchool = await report({
      slug: `tidak-ada-${run}`,
      claimedName: 'Siapa Saja',
      contactPhone: nextPhone(),
    });
    const trap = await report({
      claimedName: 'Bot Pengisi',
      contactPhone: nextPhone(),
      website: 'http://spam',
    });
    for (const res of [match, none, unknownSchool, trap]) {
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ ok: true });
    }
    expect(match.body).toBe(none.body);

    const [row] = await rowsFor(matchPhone);
    expect(row?.matchedUserId).toBe(people.guardian!.id);
    expect(row?.claimedInfo).toBe('Ibu dari Ani kelas 3A');
    // Laporan bot dan sekolah tak dikenal tidak membuat baris.
    const all = await app.platformDb
      .select()
      .from(passwordResetRequest)
      .where(eq(passwordResetRequest.schoolId, schoolA));
    expect(all.some((r) => r.claimedName === 'Bot Pengisi' || r.claimedName === 'Siapa Saja')).toBe(false);
    expect(all.find((r) => r.claimedName === 'Orang Asing Sekali')?.matchedUserId).toBeNull();
  });

  it('mencocokkan lewat email atau nomor akun; NIK hanya tersimpan tersamar', async () => {
    const byEmail = nextPhone();
    await report({
      claimedName: 'Siapa pun',
      contactPhone: byEmail,
      identifier: people.teacher!.email.toUpperCase(),
    });
    expect((await rowsFor(byEmail))[0]?.matchedUserId).toBe(people.teacher!.id);

    const byPhone = '6281299900001';
    await report({ claimedName: 'Nama Berbeda', contactPhone: byPhone });
    expect((await rowsFor(byPhone))[0]?.matchedUserId).toBe(people.guardian!.id);

    const nikPhone = nextPhone();
    await report({ claimedName: 'Pemilik NIK', contactPhone: nikPhone, identifier: '3201 0101 0101 0001' });
    const [row] = await rowsFor(nikPhone);
    expect(row?.identifierGiven).toBe('3201**********01');
    expect(JSON.stringify(row)).not.toContain('3201010101010001');
    // Dicek juga di audit: tak ada NIK utuh.
    const logs = await app.platformDb.select().from(auditLog).where(eq(auditLog.schoolId, schoolA));
    expect(JSON.stringify(logs)).not.toContain('3201010101010001');
  });

  it('satu laporan terbuka per nomor per sekolah; nomor tidak valid ditolak', async () => {
    const phone = nextPhone();
    await report({ claimedName: 'Pelapor Ganda', contactPhone: phone });
    const again = await report({ claimedName: 'Pelapor Ganda', contactPhone: phone });
    expect(again.statusCode).toBe(202);
    expect(await rowsFor(phone)).toHaveLength(1);
    const bad = await report({ claimedName: 'Pelapor Ganda', contactPhone: 'abc' });
    expect(bad.statusCode).toBe(400);
  });

  it('nomor yang sama tidak bisa membanjiri: lewat 5 laporan per jam diabaikan diam-diam', async () => {
    const phone = nextPhone();
    for (let i = 0; i < 5; i++) {
      await app.platformDb.insert(passwordResetRequest).values({
        schoolId: schoolB,
        claimedName: `Lama ${i}`,
        contactPhone: phone,
        status: 'done',
      });
    }
    const res = await report({ claimedName: 'Terlalu Sering', contactPhone: phone });
    expect(res.statusCode).toBe(202);
    expect((await rowsFor(phone)).some((r) => r.claimedName === 'Terlalu Sering')).toBe(false);
  });

  it('batas 5 laporan per jam per IP (429)', async () => {
    const ip = '10.99.99.99';
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await report({ claimedName: 'Uji Batas IP', contactPhone: nextPhone() }, ip)).statusCode);
    }
    expect(codes).toEqual([202, 202, 202, 202, 202, 429]);
  });
});

describe('gerbang izin admin', () => {
  it('hanya admin sekolah dan operator; peran lain dan tanpa login ditolak', async () => {
    for (const who of ['admin', 'operator']) {
      expect((await call('GET', '/v1/password-help/requests', cookies[who]!)).statusCode, who).toBe(200);
    }
    for (const who of ['principal', 'teacher', 'guardian', 'student']) {
      expect((await call('GET', '/v1/password-help/requests', cookies[who]!)).statusCode, who).toBe(403);
      expect(
        (await call('POST', '/v1/password-help/links', cookies[who]!, { userId: people.guardian!.id }))
          .statusCode,
        who,
      ).toBe(403);
    }
    expect((await call('GET', '/v1/password-help/requests', null)).statusCode).toBe(401);
  });
});

describe('daftar dan penanganan', () => {
  it('daftar memuat isian pelapor dan ringkasan akun cocok yang tersamar', async () => {
    const phone = nextPhone();
    await report({ claimedName: `guardian ${run}`, contactPhone: phone, claimedInfo: 'Wali kelas 2' });
    const res = await call('GET', '/v1/password-help/requests?status=new', cookies.operator!);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const item = body.items.find((i: { contactPhone: string }) => i.contactPhone === phone);
    expect(item.claimedInfo).toBe('Wali kelas 2');
    expect(item.matched.userId).toBe(people.guardian!.id);
    expect(item.matched.emailMasked).toMatch(/^gu\*\*\*@example\.test$/);
    expect(item.matched.emailMasked).not.toBe(people.guardian!.email);
    expect(item.matched.phoneMasked).toBe('6281*******01');
    expect(item.matched.roles).toEqual(['guardian']);
    expect(item.matched.resettable).toBe(true);
    expect(body.counts.new).toBeGreaterThan(0);
  });

  it('mengubah status dan catatan; menolak laporan mencabut tautannya', async () => {
    const phone = nextPhone();
    await report({ claimedName: `guardian2 ${run}`, contactPhone: phone });
    const [req] = await rowsFor(phone);
    const upd = await call('PATCH', `/v1/password-help/requests/${req!.id}`, cookies.admin!, {
      status: 'in_progress',
      note: 'Sudah ditelepon balik',
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ status: 'in_progress', note: 'Sudah ditelepon balik' });

    const link = await call('POST', `/v1/password-help/requests/${req!.id}/link`, cookies.admin!, {});
    expect(link.statusCode).toBe(201);
    const token = tokenOf(link.json().url);
    const rej = await call('PATCH', `/v1/password-help/requests/${req!.id}`, cookies.admin!, {
      status: 'rejected',
    });
    expect(rej.statusCode).toBe(200);
    expect((await publicCall('GET', `/v1/public/reset-links/${token}`)).statusCode).toBe(410);
    // Laporan ditolak tidak bisa dibuatkan tautan lagi.
    const again = await call('POST', `/v1/password-help/requests/${req!.id}/link`, cookies.admin!, {});
    expect(again.statusCode).toBe(409);
    expect(
      (await call('PATCH', `/v1/password-help/requests/${req!.id}`, cookies.admin!, {})).statusCode,
    ).toBe(400);
  });
});

describe('tautan reset: siklus lengkap', () => {
  it('buat, periksa, pakai sekali, sandi baru berfungsi, semua sesi dicabut, audit tanpa token', async () => {
    const phone = nextPhone();
    await report({ claimedName: `teacher ${run}`, contactPhone: phone });
    const [req] = await rowsFor(phone);
    expect(req?.matchedUserId).toBe(people.teacher!.id);

    const old = await login(people.teacher!.email);
    expect((await call('GET', '/v1/roles', old.cookie)).statusCode).toBe(403); // sesi sah (guru tanpa member:read)

    const created = await call('POST', `/v1/password-help/requests/${req!.id}/link`, cookies.operator!, {});
    expect(created.statusCode).toBe(201);
    const body = created.json();
    const token = tokenOf(body.url);
    expect(body.url).toBe(`http://${slugA}.localhost:3000/reset/${token}`);
    expect(body.token).toBe(token);
    expect(body.whatsappUrl).toContain(`https://wa.me/${phone}?text=`);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(24 * 3_600_000);

    // Token tidak pernah tersimpan polos.
    const [stored] = await app.platformDb
      .select()
      .from(passwordResetLink)
      .where(eq(passwordResetLink.id, body.id));
    expect(stored?.tokenHash).toBe(hash(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect((await rowsFor(phone))[0]?.status).toBe('in_progress');

    const check = await publicCall('GET', `/v1/public/reset-links/${token}`);
    expect(check.statusCode).toBe(200);
    expect(check.json().accountName).toMatch(/\*\*\*/);
    expect(check.json().accountName).not.toContain(run);

    expect(
      (await publicCall('POST', `/v1/public/reset-links/${token}`, { password: 'pendek' })).statusCode,
    ).toBe(400);
    const done = await publicCall('POST', `/v1/public/reset-links/${token}`, { password: newPassword });
    expect(done.statusCode).toBe(200);

    expect((await login(people.teacher!.email, password)).status).not.toBe(200);
    expect((await login(people.teacher!.email, newPassword)).status).toBe(200);
    // Sesi lama keluar semua.
    expect((await call('GET', '/v1/roles', old.cookie)).statusCode).toBe(401);

    // Sekali pakai.
    expect(
      (await publicCall('POST', `/v1/public/reset-links/${token}`, { password: newPassword })).statusCode,
    ).toBe(410);
    expect((await publicCall('GET', `/v1/public/reset-links/${token}`)).statusCode).toBe(410);
    expect((await rowsFor(phone))[0]?.status).toBe('done');

    const logs = await app.platformDb.select().from(auditLog).where(eq(auditLog.schoolId, schoolA));
    const actions = new Set(logs.map((l) => l.action));
    for (const a of ['password_help.request', 'password_help.link_create', 'password_help.link_used']) {
      expect(actions.has(a), a).toBe(true);
    }
    expect(JSON.stringify(logs)).not.toContain(token);
    // Sandi baru dipakai ulang oleh pengujian lain: kembalikan ke semula.
    cookies.teacher = (await login(people.teacher!.email, newPassword)).cookie;
  });

  it('tautan baru mencabut tautan lama; admin dapat mencabut; kedaluwarsa ditolak', async () => {
    const a = (await adminCreatesLink(people.guardian2!.id)).json();
    const b = (await adminCreatesLink(people.guardian2!.id)).json();
    expect((await publicCall('GET', `/v1/public/reset-links/${a.token}`)).statusCode).toBe(410);
    expect((await publicCall('GET', `/v1/public/reset-links/${b.token}`)).statusCode).toBe(200);

    const revoke = await call('DELETE', `/v1/password-help/links/${b.id}`, cookies.admin!);
    expect(revoke.statusCode).toBe(200);
    expect((await publicCall('GET', `/v1/public/reset-links/${b.token}`)).statusCode).toBe(410);
    expect((await call('DELETE', `/v1/password-help/links/${b.id}`, cookies.admin!)).statusCode).toBe(404);

    const c = (await adminCreatesLink(people.guardian2!.id)).json();
    await app.platformDb
      .update(passwordResetLink)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResetLink.id, c.id));
    expect((await publicCall('GET', `/v1/public/reset-links/${c.token}`)).statusCode).toBe(410);
    expect(
      (await publicCall('POST', `/v1/public/reset-links/${c.token}`, { password: newPassword })).statusCode,
    ).toBe(410);

    const logs = await app.platformDb.select().from(auditLog).where(eq(auditLog.schoolId, schoolA));
    expect(logs.some((l) => l.action === 'password_help.link_revoke')).toBe(true);
    expect(
      (await publicCall('GET', '/v1/public/reset-links/token-yang-tidak-ada-sama-sekali')).statusCode,
    ).toBe(410);
  });

  it('kirim lewat email masuk antrean ke alamat akun; WhatsApp mengembalikan tautan wa.me', async () => {
    const created = (await adminCreatesLink(people.student!.id, cookies.operator!)).json();
    const bad = await call('POST', `/v1/password-help/links/${created.id}/send`, cookies.operator!, {
      channel: 'email',
      token: 'x'.repeat(43),
    });
    expect(bad.statusCode).toBe(400);

    const mail = await call('POST', `/v1/password-help/links/${created.id}/send`, cookies.operator!, {
      channel: 'email',
      token: created.token,
    });
    expect(mail.statusCode).toBe(200);
    expect(mail.json().sentTo).toMatch(/\*\*\*@example\.test$/);
    const queued = await app.platformDb.select().from(outbox).where(eq(outbox.schoolId, schoolA));
    const mine = queued.find((o) => (o.payload as { to?: string }).to === people.student!.email);
    expect(mine).toBeTruthy();
    expect((mine!.payload as { text: string }).text).toContain(created.url);

    const wa = await call('POST', `/v1/password-help/links/${created.id}/send`, cookies.operator!, {
      channel: 'whatsapp',
      token: created.token,
      phone: '0812 3456 7890',
    });
    expect(wa.statusCode).toBe(200);
    expect(wa.json().whatsappUrl).toContain('https://wa.me/6281234567890?text=');
    const [row] = await app.platformDb
      .select()
      .from(passwordResetLink)
      .where(eq(passwordResetLink.id, created.id));
    expect(row?.channelSent).toBe('whatsapp');

    await call('DELETE', `/v1/password-help/links/${created.id}`, cookies.operator!);
    const afterRevoke = await call('POST', `/v1/password-help/links/${created.id}/send`, cookies.operator!, {
      channel: 'email',
      token: created.token,
    });
    expect(afterRevoke.statusCode).toBe(410);
  });
});

describe('pengaman akun sasaran', () => {
  it('menolak akun di banyak sekolah, staf platform, pemilik yayasan, admin, operator, diri sendiri, nonaktif', async () => {
    const expectBlocked = async (label: string, status: number, code: string, cookie = cookies.admin!) => {
      const res = await adminCreatesLink(people[label]!.id, cookie);
      expect(res.statusCode, label).toBe(status);
      expect(res.json().error.code, label).toBe(code);
    };
    await expectBlocked('multi', 409, 'multi_school_account');
    await expectBlocked('staff', 403, 'protected_account');
    await expectBlocked('owner', 403, 'protected_account');
    await expectBlocked('admin2', 403, 'protected_account');
    await expectBlocked('operator2', 403, 'protected_account');
    await expectBlocked('operator', 403, 'protected_account');
    await expectBlocked('disabled', 409, 'member_disabled');
    // Operator tidak dapat mereset dirinya sendiri maupun admin; admin sekolah juga tidak dapat mereset dirinya.
    await expectBlocked('admin', 403, 'protected_account');
    const outsider = await adminCreatesLink(people.adminB!.id);
    expect(outsider.statusCode).toBe(404);
    const unknown = await adminCreatesLink('tidak-ada-id');
    expect(unknown.statusCode).toBe(404);
  });

  it('tautan yang sudah dibuat ditolak bila akunnya kemudian punya hak pengelola', async () => {
    const created = (await adminCreatesLink(people.guardian!.id)).json();
    const [m] = await app.platformDb.select().from(member).where(eq(member.userId, people.guardian!.id));
    await assignRoles(app.platformDb, m!.id, schoolA, ['school_admin']);
    expect((await publicCall('GET', `/v1/public/reset-links/${created.token}`)).statusCode).toBe(410);
    expect(
      (await publicCall('POST', `/v1/public/reset-links/${created.token}`, { password: newPassword }))
        .statusCode,
    ).toBe(410);
  });

  it('laporan tanpa akun cocok perlu pilihan manual', async () => {
    const phone = nextPhone();
    await report({ claimedName: 'Tidak Dikenal Sama Sekali', contactPhone: phone });
    const [req] = await rowsFor(phone);
    const res = await call('POST', `/v1/password-help/requests/${req!.id}/link`, cookies.admin!, {});
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('no_match');
    const manual = await call('POST', `/v1/password-help/requests/${req!.id}/link`, cookies.admin!, {
      userId: people.guardian2!.id,
    });
    expect(manual.statusCode).toBe(201);
  });
});

describe('isolasi antar sekolah (RLS)', () => {
  it('admin sekolah lain tidak melihat atau menyentuh laporan dan tautan sekolah ini', async () => {
    const phone = nextPhone();
    await report({ claimedName: `guardian2 ${run}`, contactPhone: phone });
    const [req] = await rowsFor(phone);
    const link = (await adminCreatesLink(people.guardian2!.id)).json();

    const listB = await call('GET', '/v1/password-help/requests', cookies.adminB!, undefined, schoolB);
    expect(listB.statusCode).toBe(200);
    expect(listB.json().items.some((i: { id: string }) => i.id === req!.id)).toBe(false);
    expect(
      (await call('POST', `/v1/password-help/requests/${req!.id}/link`, cookies.adminB!, {}, schoolB))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('DELETE', `/v1/password-help/links/${link.id}`, cookies.adminB!, undefined, schoolB))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'PATCH',
          `/v1/password-help/requests/${req!.id}`,
          cookies.adminB!,
          { status: 'done' },
          schoolB,
        )
      ).statusCode,
    ).toBe(404);
    // Admin B tidak boleh memakai header sekolah A.
    expect(
      (await call('GET', '/v1/password-help/requests', cookies.adminB!, undefined, schoolA)).statusCode,
    ).toBe(403);

    // Langsung di basis data: konteks tenant B tidak melihat baris sekolah A.
    const seenB = await withTenant(app.tenantDb, [schoolB], (tx) =>
      tx.select({ id: passwordResetRequest.id }).from(passwordResetRequest),
    );
    expect(seenB.some((r) => r.id === req!.id)).toBe(false);
    const linksB = await withTenant(app.tenantDb, [schoolB], (tx) =>
      tx.select({ id: passwordResetLink.id }).from(passwordResetLink),
    );
    expect(linksB.some((r) => r.id === link.id)).toBe(false);
  });
});
