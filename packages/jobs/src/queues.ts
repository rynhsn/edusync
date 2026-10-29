import { z } from 'zod';

/**
 * Daftar antrean dan bentuk payload-nya. API menulis, worker membaca; keduanya memakai skema yang sama
 * sehingga payload yang salah ditolak saat dikirim, bukan saat diproses.
 */
export const QUEUES = {
  emailSend: 'email.send',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const emailSendPayload = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().optional(),
});

export const payloadSchemas = {
  [QUEUES.emailSend]: emailSendPayload,
} as const satisfies Record<QueueName, z.ZodType>;

export type PayloadOf<Q extends QueueName> = z.infer<(typeof payloadSchemas)[Q]>;

/** Kebijakan coba ulang per antrean. Percobaan berikutnya makin lama (backoff eksponensial). */
export const queueOptions = {
  [QUEUES.emailSend]: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 60 },
} as const satisfies Record<QueueName, object>;
