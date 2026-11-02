import { emailSendPayload, QUEUES } from '@edusync/jobs';
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
