import type { SmtpConfig, SmtpResolver } from '@edusync/billing';
import type { PayloadOf, QUEUES } from '@edusync/jobs';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from './env';

/** Konfigurasi SMTP dari variabel lingkungan: dasar yang ditimpa pengaturan di konsol platform. */
export const smtpBase = (env: Env): SmtpConfig => ({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  user: env.SMTP_USER,
  password: env.SMTP_PASSWORD,
  from: env.EMAIL_FROM,
});

export const createTransport = (c: SmtpConfig): Transporter =>
  nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    ...(c.user ? { auth: { user: c.user, pass: c.password ?? '' } } : {}),
  });

export interface Mailer {
  get(): Promise<{ transport: Transporter; from: string }>;
  close(): void;
}

/** Pengirim yang membangun ulang sambungan SMTP hanya saat pengaturan di konsol berubah. */
export function createMailer(smtp: SmtpResolver): Mailer {
  let current: { key: string; transport: Transporter } | null = null;
  return {
    async get() {
      const config = await smtp.get();
      const key = JSON.stringify(config);
      if (current?.key !== key) {
        current?.transport.close();
        current = { key, transport: createTransport(config) };
      }
      return { transport: current.transport, from: config.from };
    },
    close: () => current?.transport.close(),
  };
}

export async function sendEmail(
  transport: Transporter,
  from: string,
  mail: PayloadOf<typeof QUEUES.emailSend>,
) {
  await transport.sendMail({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    ...(mail.html ? { html: mail.html } : {}),
  });
}
