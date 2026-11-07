import { emailSendPayload, QUEUES, whatsappOtpPayload } from '@edusync/jobs';
import type { Job } from 'pg-boss';
import { type Mailer, sendEmail } from './mailer';

/**
 * Kegagalan dilempar ulang supaya pg-boss mencoba lagi sesuai kebijakan antrean.
 * Payload yang tidak sesuai skema adalah kesalahan permanen: dicatat lalu dibuang tanpa coba ulang.
 */
export function emailSendHandler(mailer: Pick<Mailer, 'get'>, log = console) {
  return async (jobs: Job<unknown>[]) => {
    for (const job of jobs) {
      const parsed = emailSendPayload.safeParse(job.data);
      if (!parsed.success) {
        log.error(`[worker] ${QUEUES.emailSend} ${job.id}: payload tidak valid, dibuang`);
        continue;
      }
      const { transport, from } = await mailer.get();
      await sendEmail(transport, from, parsed.data);
    }
  };
}

/**
 * Kode sekali pakai lewat WhatsApp (pemulihan kata sandi). Penyedia `log` hanya mencatat (pengembangan dan uji);
 * penyedia `whatsapp` untuk pesan tingkat platform (tanpa sekolah) belum disambungkan, jadi dicatat sebagai galat
 * dan dibuang tanpa coba ulang.
 */
export function whatsappOtpHandler(getProvider: () => Promise<'log' | 'whatsapp'>, log = console) {
  return async (jobs: Job<unknown>[]) => {
    for (const job of jobs) {
      const parsed = whatsappOtpPayload.safeParse(job.data);
      if (!parsed.success) {
        log.error(`[worker] ${QUEUES.whatsappOtp} ${job.id}: payload tidak valid, dibuang`);
        continue;
      }
      if ((await getProvider()) === 'log') {
        log.log(`[otp:log] ke=${parsed.data.phone} isi=${JSON.stringify(parsed.data.text)}`);
      } else {
        log.error(
          `[worker] ${QUEUES.whatsappOtp} ${job.id}: pengiriman WhatsApp tingkat platform belum tersedia`,
        );
      }
    }
  };
}
