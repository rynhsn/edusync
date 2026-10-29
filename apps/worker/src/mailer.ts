import type { PayloadOf, QUEUES } from '@edusync/jobs';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from './env';

export function createMailer(env: Env): Transporter {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } } : {}),
  });
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
