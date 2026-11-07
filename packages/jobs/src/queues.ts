import { z } from 'zod';

/**
 * Daftar antrean dan bentuk payload-nya. API menulis, worker membaca; keduanya memakai skema yang sama
 * sehingga payload yang salah ditolak saat dikirim, bukan saat diproses.
 */
export const QUEUES = {
  emailSend: 'email.send',
  /** Kode sekali pakai lewat WhatsApp (pemulihan kata sandi); dikirim menurut penyedia pesan platform. */
  whatsappOtp: 'otp.whatsapp',
  /** Penagihan otomatis tagihan sekolah; dijadwalkan harian (cron) oleh worker. */
  financeAutoBilling: 'finance.auto-billing',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const emailSendPayload = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().optional(),
});

export const whatsappOtpPayload = z.object({
  /** Nomor tujuan: digit berawalan 62. */
  phone: z.string().regex(/^\d{10,15}$/),
  text: z.string().min(1).max(1000),
});

/** Pekerjaan terjadwal tanpa data: sapuan harian penagihan otomatis. */
export const financeAutoBillingPayload = z.object({});

export const payloadSchemas = {
  [QUEUES.emailSend]: emailSendPayload,
  [QUEUES.whatsappOtp]: whatsappOtpPayload,
  [QUEUES.financeAutoBilling]: financeAutoBillingPayload,
} as const satisfies Record<QueueName, z.ZodType>;

export type PayloadOf<Q extends QueueName> = z.infer<(typeof payloadSchemas)[Q]>;

/** Kebijakan coba ulang per antrean. Percobaan berikutnya makin lama (backoff eksponensial). */
export const queueOptions = {
  [QUEUES.emailSend]: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 60 },
  // Kode hanya berlaku 10 menit: percobaan ulang singkat, dan pekerjaan lama tidak berguna lagi.
  [QUEUES.whatsappOtp]: { retryLimit: 2, retryDelay: 15, retryBackoff: true, expireInSeconds: 120 },
  // Sapuan idempoten; kegagalan per aturan sudah tercatat di log run, jadi satu percobaan ulang cukup.
  [QUEUES.financeAutoBilling]: { retryLimit: 1, retryDelay: 300, expireInSeconds: 1800 },
} as const satisfies Record<QueueName, object>;
