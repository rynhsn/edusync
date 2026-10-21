import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

interface MailMessage {
  to: string;
  name: string;
  role: 'platform_admin' | 'platform_read_only';
  url: string;
  expiresAt: Date;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

function smtpConfig(): SmtpConfig | null {
  const { PLATFORM_SMTP_USER, PLATFORM_SMTP_PASSWORD } = process.env;
  if (!PLATFORM_SMTP_USER || !PLATFORM_SMTP_PASSWORD) return null;
  const port = Number(process.env.PLATFORM_SMTP_PORT ?? 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const from = process.env.PLATFORM_EMAIL_FROM ?? 'EduSync Platform <hi.edusync@gmail.com>';
  const email = from.match(/<([^<>]+)>/)?.[1] ?? from;
  if (email.toLowerCase() !== 'hi.edusync@gmail.com') return null;
  // Support both implicit TLS (port 465, secure=true) and STARTTLS (port 587, secure=false)
  const isSecure = port === 465 || process.env.PLATFORM_SMTP_SECURE !== 'false';
  if (port === 587 && process.env.PLATFORM_SMTP_SECURE !== 'false') return null;
  // Never send credentials over plaintext
  if (port !== 465 && port !== 587 && process.env.PLATFORM_SMTP_SECURE !== 'true') return null;
  const host = process.env.PLATFORM_SMTP_HOST ?? 'smtp.gmail.com';
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) return null;
  const address = from.match(/^EduSync Platform <([^<>\s@]+@[^<>\s@]+)>$/)?.[1];
  if (address?.toLowerCase() !== 'hi.edusync@gmail.com' || /[\r\n]/.test(PLATFORM_SMTP_USER)) return null;
  return {
    host,
    port,
    user: PLATFORM_SMTP_USER,
    password: PLATFORM_SMTP_PASSWORD,
    from: 'EduSync Platform <hi.edusync@gmail.com>',
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

interface PasswordResetOtpMessage {
  to: string;
  otp: string;
  expiresAt: Date;
}

export async function sendPasswordResetOtp(message: PasswordResetOtpMessage): Promise<boolean> {
  const config = smtpConfig();
  if (!config) return false;
  const otp = escapeHtml(message.otp);
  const date = message.expiresAt.toUTCString();
  const text = `Your EduSync Platform password reset code is: ${message.otp}\n\nThis code expires ${date}. Do not share this code with anyone. If you did not request a password reset, ignore this email.`;
  const html = `<p>Your EduSync Platform password reset code is:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${otp}</p><p>This code expires ${escapeHtml(date)}. Do not share this code with anyone.</p><p>If you did not request a password reset, ignore this email.</p>`;
  return deliver(config, message.to, 'Your EduSync Platform password reset code', text, html);
}

export async function sendOperatorInvitation(message: MailMessage): Promise<boolean> {
  const config = smtpConfig();
  const publicUrl = process.env.PLATFORM_PUBLIC_URL;
  if (!config || !publicUrl) return false;
  let base: URL;
  try {
    base = new URL(publicUrl);
    const isLocal = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
    if (base.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && isLocal && base.protocol === 'http:')) return false;
  } catch {
    return false;
  }
  // The Platform app serves the accept form at /invite/:token (see README and App.tsx).
  // A query-string URL like /accept-operator-invite?token=… matches no route, so it falls
  // through to the authenticated catch-all and the invitee never reaches the form.
  const link = new URL(`/invite/${encodeURIComponent(message.url)}`, base);
  const roleLabel = message.role === 'platform_admin' ? 'Platform admin' : 'Read-only';
  const date = message.expiresAt.toUTCString();
  const greeting = escapeHtml(message.name);
  const text = `Hello ${message.name},\n\nYou have been invited to EduSync Platform as ${roleLabel}. Set your password using this single-use link:\n${link.toString()}\n\nThe invitation expires ${date}. If you were not expecting this email, ignore it.`;
  const html = `<p>Hello ${greeting},</p><p>You have been invited to EduSync Platform as <strong>${roleLabel}</strong>.</p><p><a href="${escapeHtml(link.toString())}">Set your password</a></p><p>This single-use invitation expires ${escapeHtml(date)}. If you were not expecting this email, ignore it.</p>`;
  return deliver(config, message.to, 'You are invited to EduSync Platform', text, html);
}

// The subject is a parameter because both messages share this function. It used to be a constant
// here, so every password reset code arrived titled "You are invited to EduSync Platform" — which
// reads like a phishing attempt and hides the code the recipient is actually looking for.
async function deliver(config: SmtpConfig, to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (/[\r\n]/.test(to) || !/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(to)) return false;

  const isImplicitTls = config.port === 465;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: isImplicitTls,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: config.host, minVersion: 'TLSv1.2' },
  });
  try {
    const result = await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
    });
    return result.accepted.some((recipient) => String(recipient).toLowerCase() === to.toLowerCase());
  } catch {
    return false;
  } finally {
    transporter.close();
  }
}

