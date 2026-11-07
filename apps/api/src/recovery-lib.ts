import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import {
  maskEmail,
  maskPhoneClue,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_SECONDS,
  OTP_TTL_SECONDS,
  type RecoveryChannel,
} from '@edusync/contracts';
import { and, type Db, eq, gt, loadPlatformMessaging, lt, passwordResetOtp, sql } from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import { phoneFor, type ResolvedUser } from './account-lookup';
import type { Auth } from './auth';
import type { Env } from './env';
import { effectiveProvider } from './messaging-lib';

export interface ChannelOption {
  channel: RecoveryChannel;
  /** Email disamarkan (ri***@gmail.com) atau petunjuk nomor (6281****789). */
  hint: string;
}

/**
 * WhatsApp ditawarkan bila saklar pesan platform menyala dan penyedianya `whatsapp`, atau `log` di luar produksi
 * (supaya alurnya bisa diuji; kodenya ditulis ke log/outbox, bukan dikirim).
 */
export async function whatsappAvailable(db: Db, env: Pick<Env, 'MESSAGING_PROVIDER' | 'NODE_ENV'>) {
  const platform = await loadPlatformMessaging(db);
  if (!platform.enabled) return false;
  const provider = effectiveProvider(env, platform);
  return provider === 'whatsapp' || (provider === 'log' && env.NODE_ENV !== 'production');
}

/** Saluran pemulihan yang tersedia untuk pengguna ini, beserta petunjuk yang aman ditampilkan. */
export async function channelsFor(
  db: Db,
  env: Pick<Env, 'MESSAGING_PROVIDER' | 'NODE_ENV'>,
  found: ResolvedUser,
): Promise<{ options: ChannelOption[]; phone: string | null }> {
  const options: ChannelOption[] = [{ channel: 'email', hint: maskEmail(found.email) }];
  let phone: string | null = null;
  if (await whatsappAvailable(db, env)) {
    phone = await phoneFor(db, found);
    if (phone) options.push({ channel: 'whatsapp', hint: maskPhoneClue(phone) });
  }
  return { options, phone };
}

export const generateOtp = () => String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');

/** HMAC berkunci rahasia aplikasi dan terikat pengguna + saluran, sehingga hash satu kode tidak bisa dipakai di tempat lain. */
export function hashOtp(secret: string, userId: string, channel: RecoveryChannel, code: string): string {
  return createHmac('sha256', secret).update(`${userId}:${channel}:${code}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function otpMessage(channel: RecoveryChannel, code: string) {
  const minutes = OTP_TTL_SECONDS / 60;
  if (channel === 'whatsapp') {
    return (
      `Kode untuk mengatur ulang kata sandi Edusync Anda: ${code}\n` +
      `Berlaku ${minutes} menit. Jangan bagikan kode ini kepada siapa pun.`
    );
  }
  return {
    subject: 'Kode reset kata sandi Edusync',
    text:
      `Kode untuk mengatur ulang kata sandi Anda: ${code}\n\n` +
      `Berlaku ${minutes} menit dan hanya bisa dipakai sekali. Jangan bagikan kode ini kepada siapa pun.\n` +
      'Bila Anda tidak memintanya, abaikan email ini; kata sandi Anda tidak berubah.',
  };
}

/**
 * Buat kode baru untuk pengguna + saluran (menggantikan yang lama: satu kode aktif) dan antrekan pengirimannya.
 * Mengembalikan sisa detik jeda bila kode sebelumnya baru dikirim (kurang dari 60 detik), tanpa mengirim apa pun.
 * Penggantian dilakukan atomik di database sehingga permintaan bersamaan tidak melewati jeda.
 */
export async function issueOtp(
  db: Db,
  secret: string,
  target: { userId: string; email: string; phone: string | null },
  channel: RecoveryChannel,
): Promise<{ sent: true } | { sent: false; retryAfter: number }> {
  const code = generateOtp();
  const now = new Date();
  const cutoff = new Date(now.getTime() - OTP_RESEND_SECONDS * 1000);
  const values = {
    codeHash: hashOtp(secret, target.userId, channel, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    attempts: 0,
    sentAt: now,
  };
  const written = await db
    .insert(passwordResetOtp)
    .values({ userId: target.userId, channel, ...values })
    .onConflictDoUpdate({
      target: [passwordResetOtp.userId, passwordResetOtp.channel],
      set: values,
      setWhere: sql`${passwordResetOtp.sentAt} <= ${cutoff}`,
    })
    .returning({ id: passwordResetOtp.id });
  if (written.length === 0) {
    const [row] = await db
      .select({ sentAt: passwordResetOtp.sentAt })
      .from(passwordResetOtp)
      .where(and(eq(passwordResetOtp.userId, target.userId), eq(passwordResetOtp.channel, channel)));
    const left = row ? OTP_RESEND_SECONDS - Math.floor((now.getTime() - row.sentAt.getTime()) / 1000) : 1;
    return { sent: false, retryAfter: Math.max(left, 1) };
  }
  if (channel === 'email') {
    const mail = otpMessage('email', code) as { subject: string; text: string };
    await db.transaction((tx) => enqueue(tx, QUEUES.emailSend, { to: target.email, ...mail }));
  } else if (target.phone) {
    await db.transaction((tx) =>
      enqueue(tx, QUEUES.whatsappOtp, {
        phone: target.phone as string,
        text: otpMessage('whatsapp', code) as string,
      }),
    );
  }
  return { sent: true };
}

/**
 * Periksa kode. Setiap pemeriksaan menghabiskan satu percobaan lebih dulu (atomik), jadi tebakan paralel tidak
 * melewati batas 5 kali; percobaan dikembalikan bila kodenya benar dan hanya diperiksa (`consume: false`).
 * Kode benar dengan `consume: true` dihapus (sekali pakai). Kode salah ke-5 menghanguskan kode. Kedaluwarsa,
 * tidak ada, dan habis percobaan semuanya mengembalikan false tanpa dibedakan.
 */
export async function checkOtp(
  db: Db,
  secret: string,
  userId: string,
  channel: RecoveryChannel,
  code: string,
  consume: boolean,
): Promise<boolean> {
  const [row] = await db
    .update(passwordResetOtp)
    .set({ attempts: sql`${passwordResetOtp.attempts} + 1` })
    .where(
      and(
        eq(passwordResetOtp.userId, userId),
        eq(passwordResetOtp.channel, channel),
        gt(passwordResetOtp.expiresAt, new Date()),
        lt(passwordResetOtp.attempts, OTP_MAX_ATTEMPTS),
      ),
    )
    .returning();
  if (!row) return false;
  const ok = safeEqual(row.codeHash, hashOtp(secret, userId, channel, code));
  if (ok && consume) {
    await db.delete(passwordResetOtp).where(eq(passwordResetOtp.id, row.id));
  } else if (ok) {
    await db
      .update(passwordResetOtp)
      .set({ attempts: sql`greatest(${passwordResetOtp.attempts} - 1, 0)` })
      .where(eq(passwordResetOtp.id, row.id));
  } else if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await db.delete(passwordResetOtp).where(eq(passwordResetOtp.id, row.id));
  }
  return ok;
}

/** Ganti kata sandi akun, keluarkan semua sesi, dan hapus semua kode pemulihan pengguna ini. */
export async function setPasswordAndRevoke(auth: Auth, db: Db, userId: string, password: string) {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  await ctx.internalAdapter.deleteUserSessions(userId);
  if (await ctx.internalAdapter.findCredentialAccount(userId)) {
    await ctx.internalAdapter.updatePassword(userId, hash);
  } else {
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: 'credential',
      accountId: userId,
      password: hash,
    });
  }
  await db.delete(passwordResetOtp).where(eq(passwordResetOtp.userId, userId));
}
