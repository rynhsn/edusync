import {
  eq,
  foundation,
  guardian,
  member,
  outbox,
  passwordResetOtp,
  portalLink,
  school,
  sql,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { hashOtp } from './recovery-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-lama-12345';
const newPassword = 'kata-sandi-baru-67890';
const origin = 'http://localhost:3000';
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

let app: Awaited<ReturnType<typeof buildApp>>;
let env: ReturnType<typeof loadEnv>;
let foundationId = '';
let schoolId = '';
const userIds: string[] = [];
const phones: string[] = [];
const emails: string[] = [];
let seq = 0;

const post = (url: string, payload: object) =>
  app.inject({ method: 'POST', url, headers: { origin, 'content-type': 'application/json' }, payload });
const lookup = (identifier: string) => post('/v1/auth/recovery/lookup', { identifier });
const send = (identifier: string, channel: 'email' | 'whatsapp') =>
  post('/v1/auth/recovery/send', { identifier, channel });
const verify = (identifier: string, channel: 'email' | 'whatsapp', code: string) =>
  post('/v1/auth/recovery/verify', { identifier, channel, code });
const reset = (identifier: string, channel: 'email' | 'whatsapp', code: string, pw = newPassword) =>
  post('/v1/auth/recovery/reset', { identifier, channel, code, password: pw });

/** Akun baru per tes (isian sendiri), opsional dengan nomor telepon di akun. */
async function newAccount(opts: { phone?: string } = {}) {
  const email = `pulih${++seq}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: 'Pulih', email, password } });
  userIds.push(res.user.id);
  emails.push(email);
  if (opts.phone) {
    phones.push(opts.phone);
    await app.platformDb.update(user).set({ phone: opts.phone }).where(eq(user.id, res.user.id));
  }
  return { id: res.user.id, email };
}

/** Kode terakhir di outbox untuk email atau nomor itu. */
async function sentCode(kind: 'email' | 'whatsapp', to: string) {
  const col = kind === 'email' ? 'to' : 'phone';
  const queue = kind === 'email' ? 'email.send' : 'otp.whatsapp';
  for (let i = 0; i < 20; i++) {
    const rows = await app.platformDb
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(sql`${outbox.queue} = ${queue} and ${outbox.payload}->>${col} = ${to}`)
      .orderBy(sql`${outbox.createdAt} desc`);
    const code = /(\d{6})/.exec(String(rows[0]?.payload.text))?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

/** Menggeser waktu kirim kode ke belakang supaya jeda 60 detik tidak menghalangi tes. */
const skipCooldown = (userId: string) =>
  app.platformDb.execute(
    sql`update password_reset_otp set sent_at = now() - interval '2 minutes' where user_id = ${userId}`,
  );
const otpRows = (userId: string) =>
  app.platformDb.select().from(passwordResetOtp).where(eq(passwordResetOtp.userId, userId));

beforeAll(async () => {
  env = loadEnv({ ...process.env, NODE_ENV: 'test', MESSAGING_PROVIDER: 'log' });
  app = await buildApp(env);
  await app.ready();
  const [f] = await app.platformDb
    .insert(foundation)
    .values({ name: 'Yayasan Pulih', slug: `pulih-${run}` })
    .returning();
  foundationId = f?.id as string;
  const [s] = await app.platformDb
    .insert(school)
    .values({ foundationId, slug: `pulih-${run}`, name: 'Sekolah Pulih' })
    .returning();
  schoolId = s?.id as string;
});

afterAll(async () => {
  for (const to of emails) await app.platformDb.delete(outbox).where(sql`${outbox.payload}->>'to' = ${to}`);
  for (const p of phones) await app.platformDb.delete(outbox).where(sql`${outbox.payload}->>'phone' = ${p}`);
  for (const table of ['portal_link', 'guardian', 'member']) {
    await app.platformDb.execute(sql.raw(`delete from ${table} where school_id = '${schoolId}'`));
  }
  await app.platformDb.delete(school).where(eq(school.id, schoolId));
  await app.platformDb.delete(foundation).where(eq(foundation.id, foundationId));
  for (const id of userIds) await app.platformDb.delete(user).where(eq(user.id, id));
  await app.close();
});

describe('pilihan saluran pemulihan', () => {
  it('tanpa nomor: hanya email, dengan alamat disamarkan dan tanpa membocorkan alamat penuh', async () => {
    const a = await newAccount();
    const res = await lookup(a.email);
    expect(res.statusCode).toBe(200);
    const { channels } = res.json() as { channels: { channel: string; hint: string }[] };
    expect(channels).toEqual([{ channel: 'email', hint: `pu***@example.test` }]);
    expect(res.body).not.toContain(a.email);
  });

  it('dengan nomor: WhatsApp ikut tampil dengan petunjuk 4 angka + **** + 3 angka, nomor penuh tidak bocor', async () => {
    const phone = `6281${digits(9)}`;
    const a = await newAccount({ phone });
    const res = await lookup(a.email);
    const { channels } = res.json() as { channels: { channel: string; hint: string }[] };
    expect(channels.map((c) => c.channel)).toEqual(['email', 'whatsapp']);
    expect(channels[1]?.hint).toBe(`${phone.slice(0, 4)}****${phone.slice(-3)}`);
    expect(res.body).not.toContain(phone);
    expect(res.body).not.toContain(a.email);
  });

  it('nomor diambil dari wali yang tertaut bila akun belum punya nomor', async () => {
    const a = await newAccount();
    const phone = `6285${digits(9)}`;
    phones.push(phone);
    const [g] = await app.platformDb
      .insert(guardian)
      .values({ schoolId, name: 'Wali Pulih', phone })
      .returning();
    const [m] = await app.platformDb.insert(member).values({ userId: a.id, schoolId }).returning();
    await app.platformDb
      .insert(portalLink)
      .values({ schoolId, memberId: m?.id as string, kind: 'guardian', guardianId: g?.id as string });
    const res = await lookup(a.email);
    const { channels } = res.json() as { channels: { channel: string; hint: string }[] };
    expect(channels.find((c) => c.channel === 'whatsapp')?.hint).toBe(
      `${phone.slice(0, 4)}****${phone.slice(-3)}`,
    );
  });

  it('isian tidak dikenal dan NIK ambigu dijawab sama bentuknya dengan daftar saluran kosong', async () => {
    const a = await lookup(`hantu-${run}@example.test`);
    const b = await lookup(`3201${digits(12)}`);
    const c = await lookup('dua kata');
    for (const res of [a, b, c]) {
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        channels: [],
        message: 'Jika data ditemukan, pilihan pengiriman akan tampil.',
      });
    }
  });

  it('pencarian dibatasi per isian: 5 per jam, lalu 429', async () => {
    const a = await newAccount();
    for (let i = 0; i < app.authLimits.lookupIdentifierPerHour; i++) {
      expect((await lookup(a.email)).statusCode).toBe(200);
    }
    expect((await lookup(a.email)).statusCode).toBe(429);
    // Isian lain tidak terpengaruh.
    expect((await lookup(`lain-${run}@example.test`)).statusCode).toBe(200);
  });
});

describe('kode lewat WhatsApp', () => {
  it('terkirim ke antrean dengan nomor penuh, kode hanya berlaku untuk salurannya, dan mengganti kata sandi', async () => {
    const phone = `6281${digits(9)}`;
    const a = await newAccount({ phone });
    expect((await send(a.email, 'whatsapp')).statusCode).toBe(200);
    const code = (await sentCode('whatsapp', phone)) as string;
    expect(code).toMatch(/^\d{6}$/);

    // Kode WhatsApp tidak berlaku di saluran email.
    expect((await verify(a.email, 'email', code)).statusCode).toBe(400);
    expect((await verify(a.email, 'whatsapp', code)).statusCode).toBe(200);
    expect((await reset(a.email, 'whatsapp', code)).statusCode).toBe(200);
    const login = await post('/api/auth/sign-in/email', { email: a.email, password: newPassword });
    expect(login.statusCode).toBe(200);
  });

  it('akun tanpa nomor: WhatsApp dijawab sukses semu dan tidak ada yang terkirim atau tersimpan', async () => {
    const a = await newAccount();
    const res = await send(a.email, 'whatsapp');
    expect(res.statusCode).toBe(200);
    expect(await otpRows(a.id)).toHaveLength(0);
  });

  it('kode akun lain tidak bisa dipakai untuk akun ini', async () => {
    const pa = `6281${digits(9)}`;
    const pb = `6281${digits(9)}`;
    const a = await newAccount({ phone: pa });
    const b = await newAccount({ phone: pb });
    await send(a.email, 'whatsapp');
    await send(b.email, 'whatsapp');
    const codeA = (await sentCode('whatsapp', pa)) as string;
    const codeB = (await sentCode('whatsapp', pb)) as string;
    if (codeA !== codeB) {
      expect((await reset(b.email, 'whatsapp', codeA)).statusCode).toBe(400);
    }
    expect((await reset(a.email, 'whatsapp', codeA)).statusCode).toBe(200);
  });
});

describe('aturan kode', () => {
  it('disimpan sebagai hash, satu kode aktif per akun dan saluran, berlaku 10 menit', async () => {
    const a = await newAccount();
    await send(a.email, 'email');
    const code = (await sentCode('email', a.email)) as string;
    const [row] = await otpRows(a.id);
    expect(row?.codeHash).toBe(hashOtp(env.AUTH_SECRET, a.id, 'email', code));
    expect(row?.codeHash).not.toContain(code);
    const ttl = (row?.expiresAt.getTime() ?? 0) - (row?.sentAt.getTime() ?? 0);
    expect(ttl).toBe(600_000);

    await skipCooldown(a.id);
    expect((await send(a.email, 'email')).statusCode).toBe(200);
    expect(await otpRows(a.id)).toHaveLength(1);
  });

  it('jeda kirim ulang 60 detik: 429 `cooldown`, lalu boleh dan kode baru menggantikan yang lama', async () => {
    const a = await newAccount();
    expect((await send(a.email, 'email')).statusCode).toBe(200);
    const first = (await sentCode('email', a.email)) as string;
    const again = await send(a.email, 'email');
    expect(again.statusCode).toBe(429);
    expect(again.json().error.code).toBe('cooldown');
    // Jeda tidak mengganti kode yang sudah ada.
    expect((await verify(a.email, 'email', first)).statusCode).toBe(200);

    await skipCooldown(a.id);
    expect((await send(a.email, 'email')).statusCode).toBe(200);
    const [row] = await otpRows(a.id);
    expect(row?.attempts).toBe(0);
    expect(row?.codeHash).not.toBe(hashOtp(env.AUTH_SECRET, a.id, 'email', first));
  });

  it('kedaluwarsa setelah 10 menit', async () => {
    const a = await newAccount();
    await send(a.email, 'email');
    const code = (await sentCode('email', a.email)) as string;
    await app.platformDb.execute(
      sql`update password_reset_otp set expires_at = now() - interval '1 second' where user_id = ${a.id}`,
    );
    expect((await verify(a.email, 'email', code)).statusCode).toBe(400);
    expect((await reset(a.email, 'email', code)).statusCode).toBe(400);
  });

  it('5 kali salah menghanguskan kode, walau kode yang benar dimasukkan sesudahnya', async () => {
    const a = await newAccount();
    await send(a.email, 'email');
    const code = (await sentCode('email', a.email)) as string;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify(a.email, 'email', wrong)).statusCode).toBe(400);
    expect(await otpRows(a.id)).toHaveLength(0);
    expect((await verify(a.email, 'email', code)).statusCode).toBe(400);
    expect((await reset(a.email, 'email', code)).statusCode).toBe(400);
  });

  it('4 kali salah lalu benar masih lolos, dan pemeriksaan benar tidak menghabiskan percobaan', async () => {
    const a = await newAccount();
    await send(a.email, 'email');
    const code = (await sentCode('email', a.email)) as string;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await verify(a.email, 'email', wrong);
    expect((await verify(a.email, 'email', code)).statusCode).toBe(200);
    expect((await verify(a.email, 'email', code)).statusCode).toBe(200);
    expect((await reset(a.email, 'email', code)).statusCode).toBe(200);
  });

  it('setelah reset, semua kode akun itu dihapus dan sesi lama keluar', async () => {
    const phone = `6281${digits(9)}`;
    const a = await newAccount({ phone });
    const session = (await post('/api/auth/sign-in/email', { email: a.email, password })).cookies
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    await send(a.email, 'email');
    await send(a.email, 'whatsapp');
    const code = (await sentCode('email', a.email)) as string;
    expect((await reset(a.email, 'email', code)).statusCode).toBe(200);
    expect(await otpRows(a.id)).toHaveLength(0);
    const stale = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: session, origin },
    });
    expect(stale.json()).toBeNull();
  });

  it('pengiriman dibatasi per isian: 5 per jam, lalu 429 rate_limited', async () => {
    const a = await newAccount();
    const results: number[] = [];
    for (let i = 0; i < app.authLimits.sendIdentifierPerHour + 1; i++) {
      await skipCooldown(a.id);
      results.push((await send(a.email, 'email')).statusCode);
    }
    expect(results.slice(0, -1).every((s) => s === 200)).toBe(true);
    const last = await send(a.email, 'email');
    expect(last.statusCode).toBe(429);
    expect(last.json().error.code).toBe('rate_limited');
  });
});
