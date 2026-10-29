import nodemailer from 'nodemailer';

export interface SchoolAdminActivationMailMessage {
  to: string;
  name: string;
  schoolName: string;
  token: string;
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
  const user = process.env.SCHOOL_SMTP_USER ?? process.env.PLATFORM_SMTP_USER;
  const password = process.env.SCHOOL_SMTP_PASSWORD ?? process.env.PLATFORM_SMTP_PASSWORD;
  if (!user || !password) return null;
  const port = Number(process.env.SCHOOL_SMTP_PORT ?? process.env.PLATFORM_SMTP_PORT ?? 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const from = process.env.SCHOOL_EMAIL_FROM ?? 'EduSync School <hi.edusync@gmail.com>';
  const email = from.match(/<([^<>]+)>/)?.[1] ?? from;
  if (email.toLowerCase() !== 'hi.edusync@gmail.com') return null;
  const secureEnv = process.env.SCHOOL_SMTP_SECURE ?? process.env.PLATFORM_SMTP_SECURE;
  if (port === 587 && secureEnv !== 'false') return null;
  if (port !== 465 && port !== 587 && secureEnv !== 'true') return null;
  const host = process.env.SCHOOL_SMTP_HOST ?? process.env.PLATFORM_SMTP_HOST ?? 'smtp.gmail.com';
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) return null;
  const address = from.match(/^EduSync (?:School|Platform) <([^<>\s@]+@[^<>\s@]+)>$/)?.[1];
  if (address?.toLowerCase() !== 'hi.edusync@gmail.com' || /[\r\n]/.test(user)) return null;
  return {
    host,
    port,
    user,
    password,
    from: 'EduSync School <hi.edusync@gmail.com>',
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export async function sendSchoolAdminActivation(message: SchoolAdminActivationMailMessage): Promise<boolean> {
  const config = smtpConfig();
  const publicUrl = process.env.SCHOOL_PUBLIC_URL;
  if (!config || !publicUrl) return false;
  let base: URL;
  try {
    base = new URL(publicUrl);
    const isLocal = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
    if (base.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && isLocal && base.protocol === 'http:')) return false;
  } catch {
    return false;
  }

  const link = new URL(`/activate/${encodeURIComponent(message.token)}`, base);
  const date = message.expiresAt.toUTCString();
  const greeting = escapeHtml(message.name);
  const school = escapeHtml(message.schoolName);
  const text = `Hello ${message.name},\n\nYour school workspace (${message.schoolName}) is ready on EduSync School. Activate your School Admin account and set your password using this single-use link:\n${link.toString()}\n\nThis activation link expires ${date}. If you were not expecting this email, ignore it.`;
  const html = `<p>Hello ${greeting},</p><p>Your school workspace (<strong>${school}</strong>) is ready on EduSync School.</p><p><a href="${escapeHtml(link.toString())}">Activate your School Admin account</a></p><p>This single-use activation link expires ${escapeHtml(date)}. If you were not expecting this email, ignore it.</p>`;
  return deliver(config, message.to, `Activate your EduSync School admin account for ${message.schoolName}`, text, html);
}

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
