import { auditLog, eq, outbox, platformStaff, sql, staffInvitation, user } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { assertAdminRemains, maskEmail, staffInvitationEmail } from './routes/platform-staff';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const json = { origin, 'content-type': 'application/json' };

let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
let ip = 10;

interface Person {
  id: string;
  email: string;
  cookie: string;
}

async function makeUser(label: string, role?: 'admin' | 'read_only'): Promise<Person> {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: `Uji ${label}`, email, password } });
  userIds.push(res.user.id);
  if (role) await app.platformDb.insert(platformStaff).values({ userId: res.user.id, role });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: json,
    payload: { email, password },
  });
  return { id: res.user.id, email, cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

/** Setiap panggilan memakai alamat IP unik supaya pembatas laju per-IP pada endpoint token tidak mengganggu. */
const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, cookie?: string, payload?: object) =>
  app.inject({
    method,
    url,
    remoteAddress: `10.9.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}`,
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const tokenOf = (inviteUrl: string) => inviteUrl.split('/platform-invite/')[1] as string;
const invite = (cookie: string, email: string, role: 'admin' | 'read_only' = 'read_only') =>
  call('POST', '/v1/platform/staff/invitations', cookie, { email, role });
const accept = (token: string, cookie?: string) =>
  call('POST', `/v1/platform/staff/invitations/by-token/${token}/accept`, cookie);
const lookup = (token: string) => call('GET', `/v1/platform/staff/invitations/by-token/${token}`);
const audits = async (action: string, actor: string) =>
  (await app.platformDb.select().from(auditLog).where(eq(auditLog.actorId, actor))).filter(
    (a) => a.action === action,
  );

let admin: Person;
let admin2: Person;
let viewer: Person;
let outsider: Person;

beforeAll(async () => {
  app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev' }));
  await app.ready();
  admin = await makeUser('stf-admin', 'admin');
  admin2 = await makeUser('stf-admin2', 'admin');
  viewer = await makeUser('stf-baca', 'read_only');
  outsider = await makeUser('stf-luar');
});

afterAll(async () => {
  const db = app.platformDb;
  const like = `%-${run}@example.test`;
  await db.execute(sql`delete from staff_invitation where email like ${like}`);
  await db.execute(sql`delete from outbox where payload->>'to' like ${like}`);
  const ids = sql.join(
    userIds.map((u) => sql`${u}`),
    sql`, `,
  );
  await db.execute(sql`delete from audit_log where actor_id in (${ids})`);
  await db.execute(sql`delete from platform_staff where user_id in (${ids})`);
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('undang pengelola platform: alur utama', () => {
  it('undang lalu terima: jadi staf, undangan sekali pakai, email dan audit tercatat', async () => {
    const invitee = await makeUser('stf-calon');
    const res = await invite(admin.cookie, invitee.email.toUpperCase(), 'read_only');
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.email).toBe(invitee.email);
    const token = tokenOf(body.inviteUrl);
    expect(body.inviteUrl).toBe(`http://localhost:3000/platform-invite/${token}`);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Email masuk antrean outbox dengan tautan, nama pengundang, teks dan HTML.
    const mails = await app.platformDb
      .select()
      .from(outbox)
      .where(sql`${outbox.payload}->>'to' = ${invitee.email}`);
    expect(mails).toHaveLength(1);
    const mail = mails[0]?.payload as { subject: string; text: string; html: string };
    expect(mail.text).toContain(body.inviteUrl);
    expect(mail.html).toContain(body.inviteUrl);
    expect(mail.text).toContain('Uji stf-admin');
    expect(mail.text).toContain('7 hari');

    // Hanya hash yang disimpan; token mentah tidak ada di baris mana pun.
    const [row] = await app.platformDb
      .select()
      .from(staffInvitation)
      .where(eq(staffInvitation.email, invitee.email));
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
    const days = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    // Daftar tidak memuat tautan atau token.
    const list = await call('GET', '/v1/platform/staff', admin.cookie);
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain(token);
    expect(list.body).not.toContain('inviteUrl');
    const pending = list.json().invitations.find((i: { email: string }) => i.email === invitee.email);
    expect(pending).toMatchObject({ role: 'read_only', invitedByName: 'Uji stf-admin', expired: false });

    // Pemegang tautan melihat ringkasan; email dimasker untuk tampilan.
    const info = (await lookup(token)).json();
    expect(info).toMatchObject({
      valid: true,
      role: 'read_only',
      accountExists: true,
      invitedByName: 'Uji stf-admin',
    });
    expect(info.emailMasked).toBe(maskEmail(invitee.email));

    expect((await accept(token, invitee.cookie)).json()).toEqual({ ok: true, role: 'read_only' });
    const [staff] = await app.platformDb
      .select()
      .from(platformStaff)
      .where(eq(platformStaff.userId, invitee.id));
    expect(staff?.role).toBe('read_only');
    const [after] = await app.platformDb
      .select()
      .from(staffInvitation)
      .where(eq(staffInvitation.email, invitee.email));
    expect(after).toMatchObject({ acceptedBy: invitee.id });
    expect(after?.acceptedAt).toBeInstanceOf(Date);

    // Sekali pakai: tautan yang sama sekarang tidak berlaku, dan pencarian menjawab seperti tautan tak dikenal.
    expect((await accept(token, invitee.cookie)).statusCode).toBe(410);
    expect((await lookup(token)).json()).toEqual((await lookup('x'.repeat(43))).json());

    // Staf baru muncul di daftar dan bisa membaca konsol.
    const list2 = (await call('GET', '/v1/platform/staff', invitee.cookie)).json();
    expect(list2.staff.some((s: { userId: string }) => s.userId === invitee.id)).toBe(true);
    expect(list2.invitations.some((i: { email: string }) => i.email === invitee.email)).toBe(false);

    expect(await audits('staff.invite', admin.id)).not.toHaveLength(0);
    expect(await audits('staff.invite_accept', invitee.id)).toHaveLength(1);
  });

  it('email berbeda ditolak (403 email_mismatch) dan undangan tetap bisa dipakai pemilik email', async () => {
    const invitee = await makeUser('stf-benar');
    const stranger = await makeUser('stf-asing');
    const token = tokenOf((await invite(admin.cookie, invitee.email, 'admin')).json().inviteUrl);
    const bad = await accept(token, stranger.cookie);
    expect(bad.statusCode).toBe(403);
    expect(bad.json().error.code).toBe('email_mismatch');
    expect(bad.json().error.message).toContain(maskEmail(invitee.email));
    expect(bad.json().error.message).not.toContain(invitee.email);
    const [none] = await app.platformDb
      .select()
      .from(platformStaff)
      .where(eq(platformStaff.userId, stranger.id));
    expect(none).toBeUndefined();
    expect((await accept(token, invitee.cookie)).json()).toEqual({ ok: true, role: 'admin' });
  });

  it('tanpa sesi 401, dan tanpa undangan tidak ada jalan menjadi staf', async () => {
    expect((await accept('a'.repeat(43))).statusCode).toBe(401);
    const res = await accept('a'.repeat(43), outsider.cookie);
    expect(res.statusCode).toBe(410);
    const [row] = await app.platformDb
      .select()
      .from(platformStaff)
      .where(eq(platformStaff.userId, outsider.id));
    expect(row).toBeUndefined();
  });

  it('undangan kedaluwarsa tidak bisa diterima dan pencarian menjawab tidak valid', async () => {
    const invitee = await makeUser('stf-lewat');
    const res = await invite(admin.cookie, invitee.email);
    const token = tokenOf(res.json().inviteUrl);
    await app.platformDb
      .update(staffInvitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(staffInvitation.id, res.json().id));
    expect((await lookup(token)).json().valid).toBe(false);
    expect((await accept(token, invitee.cookie)).statusCode).toBe(410);
    // Muncul di daftar sebagai kedaluwarsa, dan admin boleh mengundang ulang email itu (yang lama dicabut otomatis).
    const list = (await call('GET', '/v1/platform/staff', admin.cookie)).json();
    expect(list.invitations.find((i: { email: string }) => i.email === invitee.email).expired).toBe(true);
    const again = await invite(admin.cookie, invitee.email);
    expect(again.statusCode).toBe(201);
    expect((await accept(tokenOf(again.json().inviteUrl), invitee.cookie)).statusCode).toBe(200);
  });

  it('undangan dicabut tidak bisa diterima; mencabut dua kali 404', async () => {
    const invitee = await makeUser('stf-cabut');
    const res = await invite(admin.cookie, invitee.email);
    const token = tokenOf(res.json().inviteUrl);
    expect(
      (await call('DELETE', `/v1/platform/staff/invitations/${res.json().id}`, admin.cookie)).statusCode,
    ).toBe(200);
    expect((await lookup(token)).json().valid).toBe(false);
    expect((await accept(token, invitee.cookie)).statusCode).toBe(410);
    expect(
      (await call('DELETE', `/v1/platform/staff/invitations/${res.json().id}`, admin.cookie)).statusCode,
    ).toBe(404);
    expect(await audits('staff.invite_revoke', admin.id)).not.toHaveLength(0);
    // Setelah dicabut, email itu boleh diundang lagi.
    expect((await invite(admin.cookie, invitee.email)).statusCode).toBe(201);
  });

  it('kirim ulang membuat tautan baru dan mematikan yang lama', async () => {
    const invitee = await makeUser('stf-ulang');
    const first = await invite(admin.cookie, invitee.email);
    const oldToken = tokenOf(first.json().inviteUrl);
    const again = await call(
      'POST',
      `/v1/platform/staff/invitations/${first.json().id}/resend`,
      admin.cookie,
    );
    expect(again.statusCode).toBe(200);
    const newToken = tokenOf(again.json().inviteUrl);
    expect(newToken).not.toBe(oldToken);
    expect((await lookup(oldToken)).json().valid).toBe(false);
    expect((await accept(oldToken, invitee.cookie)).statusCode).toBe(410);
    expect((await lookup(newToken)).json().valid).toBe(true);
    const mails = await app.platformDb
      .select()
      .from(outbox)
      .where(sql`${outbox.payload}->>'to' = ${invitee.email}`);
    expect(mails).toHaveLength(2);
    expect((await accept(newToken, invitee.cookie)).statusCode).toBe(200);
    // Undangan yang sudah diterima tidak bisa dikirim ulang.
    expect(
      (await call('POST', `/v1/platform/staff/invitations/${first.json().id}/resend`, admin.cookie))
        .statusCode,
    ).toBe(404);
    expect(await audits('staff.invite_resend', admin.id)).not.toHaveLength(0);
  });

  it('dua penerimaan bersamaan: tepat satu berhasil', async () => {
    const invitee = await makeUser('stf-balap');
    const token = tokenOf((await invite(admin.cookie, invitee.email)).json().inviteUrl);
    const results = await Promise.all([accept(token, invitee.cookie), accept(token, invitee.cookie)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 410]);
    const rows = await app.platformDb
      .select()
      .from(platformStaff)
      .where(eq(platformStaff.userId, invitee.id));
    expect(rows).toHaveLength(1);
    expect(await audits('staff.invite_accept', invitee.id)).toHaveLength(1);
  });
});

describe('undang pengelola platform: validasi dan duplikat', () => {
  it('email tidak sah 400; undangan tertunda 409 invitation_pending; sudah staf 409 already_staff', async () => {
    expect((await invite(admin.cookie, 'bukan-email')).statusCode).toBe(400);
    expect(
      (
        await call('POST', '/v1/platform/staff/invitations', admin.cookie, {
          email: `a-${run}@example.test`,
          role: 'owner',
        })
      ).statusCode,
    ).toBe(400);

    const email = `stf-ganda-${run}@example.test`;
    expect((await invite(admin.cookie, email)).statusCode).toBe(201);
    const dup = await invite(admin.cookie, email.toUpperCase());
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('invitation_pending');

    const staffRes = await invite(admin.cookie, viewer.email.toUpperCase());
    expect(staffRes.statusCode).toBe(409);
    expect(staffRes.json().error.code).toBe('already_staff');
  });
});

describe('kelola staf: peran dan penghapusan', () => {
  it('ubah peran lalu hapus; akun pengguna tetap ada; audit tercatat', async () => {
    const member = await makeUser('stf-ubah', 'read_only');
    const up = await call('PATCH', `/v1/platform/staff/${member.id}`, admin.cookie, { role: 'admin' });
    expect(up.statusCode).toBe(200);
    expect(up.json()).toEqual({ ok: true, role: 'admin' });
    const [row] = await app.platformDb
      .select()
      .from(platformStaff)
      .where(eq(platformStaff.userId, member.id));
    expect(row?.role).toBe('admin');
    expect(await audits('staff.role_change', admin.id)).not.toHaveLength(0);

    const del = await call('DELETE', `/v1/platform/staff/${member.id}`, admin.cookie);
    expect(del.statusCode).toBe(200);
    const [gone] = await app.platformDb
      .select()
      .from(platformStaff)
      .where(eq(platformStaff.userId, member.id));
    expect(gone).toBeUndefined();
    const [account] = await app.platformDb.select({ id: user.id }).from(user).where(eq(user.id, member.id));
    expect(account?.id).toBe(member.id);
    expect(await audits('staff.remove', admin.id)).not.toHaveLength(0);
    expect((await call('DELETE', `/v1/platform/staff/${member.id}`, admin.cookie)).statusCode).toBe(404);
    expect(
      (await call('PATCH', `/v1/platform/staff/${member.id}`, admin.cookie, { role: 'admin' })).statusCode,
    ).toBe(404);
  });

  it('tidak bisa menurunkan atau menghapus diri sendiri (409 self_change)', async () => {
    const demote = await call('PATCH', `/v1/platform/staff/${admin.id}`, admin.cookie, { role: 'read_only' });
    expect(demote.statusCode).toBe(409);
    expect(demote.json().error.code).toBe('self_change');
    const remove = await call('DELETE', `/v1/platform/staff/${admin.id}`, admin.cookie);
    expect(remove.statusCode).toBe(409);
    expect(remove.json().error.code).toBe('self_change');
    const [row] = await app.platformDb.select().from(platformStaff).where(eq(platformStaff.userId, admin.id));
    expect(row?.role).toBe('admin');
  });

  it('penjaga admin terakhir: 409 last_admin hanya bila tidak ada admin lain', () => {
    expect(() => assertAdminRemains(['a'], 'a')).toThrowError(/sedikitnya satu admin/);
    try {
      assertAdminRemains(['a'], 'a');
    } catch (e) {
      expect(e).toMatchObject({ code: 'last_admin', status: 409 });
    }
    expect(() => assertAdminRemains(['a', 'b'], 'a')).not.toThrow();
  });
});

describe('hak akses', () => {
  it('read_only boleh melihat daftar tetapi tidak boleh menulis', async () => {
    expect((await call('GET', '/v1/platform/staff', viewer.cookie)).statusCode).toBe(200);
    const some = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
    const writes = [
      call('POST', '/v1/platform/staff/invitations', viewer.cookie, {
        email: `x-${run}@example.test`,
        role: 'admin',
      }),
      call('POST', `/v1/platform/staff/invitations/${some}/resend`, viewer.cookie),
      call('DELETE', `/v1/platform/staff/invitations/${some}`, viewer.cookie),
      call('PATCH', `/v1/platform/staff/${admin2.id}`, viewer.cookie, { role: 'read_only' }),
      call('DELETE', `/v1/platform/staff/${admin2.id}`, viewer.cookie),
    ];
    for (const res of await Promise.all(writes)) expect(res.statusCode).toBe(403);
    const [still] = await app.platformDb
      .select()
      .from(platformStaff)
      .where(eq(platformStaff.userId, admin2.id));
    expect(still?.role).toBe('admin');
  });

  it('bukan staf 403 dan tanpa sesi 401', async () => {
    expect((await call('GET', '/v1/platform/staff', outsider.cookie)).statusCode).toBe(403);
    expect((await invite(outsider.cookie, `y-${run}@example.test`)).statusCode).toBe(403);
    expect((await call('GET', '/v1/platform/staff')).statusCode).toBe(401);
  });

  it('tabel undangan tertutup bagi peran aplikasi (REVOKE)', async () => {
    const { rows } = await app.platformDb.execute<{ ok: boolean }>(
      sql`select has_table_privilege('edusync_app', 'staff_invitation', 'SELECT') as ok`,
    );
    expect((rows[0] as { ok: boolean }).ok).toBe(false);
  });
});

describe('isi email undangan', () => {
  it('memasukkan nama pengundang, peran, tautan, dan menghindari HTML berbahaya', () => {
    const mail = staffInvitationEmail({
      inviter: '<b>Budi</b>',
      role: 'admin',
      link: 'https://edusync.test/platform-invite/abc',
      days: 7,
    });
    expect(mail.text).toContain('https://edusync.test/platform-invite/abc');
    expect(mail.html).toContain('&lt;b&gt;Budi&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Budi</b>');
    expect(mail.subject).toMatch(/pengelola platform/);
  });
});
