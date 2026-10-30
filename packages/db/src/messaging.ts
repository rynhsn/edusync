import { type EventKey, normalizePhone, renderTemplate } from '@edusync/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db, Tx } from './client';
import { guardian, msgMessage, msgSetting, msgTemplate, platformSetting, studentGuardian } from './schema';

export const PLATFORM_MESSAGING_KEY = 'messaging';

export type MessagingProvider = 'whatsapp' | 'log';

/** Pengaturan global pesan dari konsol platform. */
export interface PlatformMessaging {
  /** Saklar global: mati = tak ada pesan dibuat maupun dikirim di seluruh platform. */
  enabled: boolean;
  /** `whatsapp` mengirim sungguhan; `log` hanya mencatat (pengembangan/uji). */
  provider: MessagingProvider;
  /** Batas pesan berstatus antre per sekolah; di atasnya pesan baru tidak dibuat. */
  maxQueuedPerSchool: number;
}

/** Penyedia bawaan: `whatsapp` di produksi, `log` di tempat lain. */
export function defaultMessagingProvider(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): MessagingProvider {
  return nodeEnv === 'production' ? 'whatsapp' : 'log';
}

export function defaultPlatformMessaging(): PlatformMessaging {
  return { enabled: true, provider: defaultMessagingProvider(), maxQueuedPerSchool: 500 };
}

/** Gabungkan nilai tersimpan (boleh sebagian/rusak) dengan nilai bawaan. */
export function parsePlatformMessaging(raw: unknown): PlatformMessaging {
  const base = defaultPlatformMessaging();
  if (!raw || typeof raw !== 'object') return base;
  const v = raw as Record<string, unknown>;
  const max = v.maxQueuedPerSchool;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : base.enabled,
    provider: v.provider === 'whatsapp' || v.provider === 'log' ? v.provider : base.provider,
    maxQueuedPerSchool:
      typeof max === 'number' && Number.isInteger(max) && max >= 1 ? max : base.maxQueuedPerSchool,
  };
}

/** Baca pengaturan global lewat pool platform (dipakai worker dan konsol platform). */
export async function loadPlatformMessaging(db: Db): Promise<PlatformMessaging> {
  const [row] = await db
    .select()
    .from(platformSetting)
    .where(eq(platformSetting.key, PLATFORM_MESSAGING_KEY));
  return parsePlatformMessaging(row?.value);
}

/**
 * Baca pengaturan global dari dalam transaksi tenant. Tabel platform_setting tertutup bagi peran aplikasi, jadi
 * dibaca lewat fungsi SECURITY DEFINER yang hanya membuka baris `messaging`.
 */
async function platformMessagingIn(tx: Tx): Promise<PlatformMessaging> {
  const res = await tx.execute<{ v: unknown }>(sql`select messaging_platform_config() as v`);
  return parsePlatformMessaging(res.rows[0]?.v);
}

export interface EnqueueInput {
  schoolId: string;
  eventKey: EventKey;
  studentId: string;
  /** Nilai pengganti templat (student, class, school, time, date, ...). */
  vars: Record<string, string | number | null | undefined>;
  /** Kunci peristiwa; dibuat unik per nomor tujuan (`${dedupeKey}:${nomor}`). */
  dedupeKey: string;
  /** Jangan dikirim sebelum waktu ini (bawaan: sekarang). */
  notBefore?: Date;
}

/**
 * Antrekan pesan peristiwa ke wali siswa. Pesan dibuat hanya bila saklar global platform, pengaturan sekolah
 * (`enabled`), dan templat peristiwa itu (baris ada dan `enabled`) semuanya aktif. Satu pesan per nomor unik
 * (nomor harus valid menurut `normalizePhone`). Idempoten pada (school_id, dedupe_key).
 */
export async function enqueueMessages(tx: Tx, input: EnqueueInput): Promise<{ queued: number }> {
  const none = { queued: 0 };
  const [setting] = await tx.select().from(msgSetting).where(eq(msgSetting.schoolId, input.schoolId));
  if (!setting?.enabled) return none;
  const [tpl] = await tx
    .select()
    .from(msgTemplate)
    .where(and(eq(msgTemplate.schoolId, input.schoolId), eq(msgTemplate.eventKey, input.eventKey)));
  if (!tpl?.enabled) return none;
  const platform = await platformMessagingIn(tx);
  if (!platform.enabled) return none;

  const guardians = await tx
    .select({ id: guardian.id, phone: guardian.phone })
    .from(studentGuardian)
    .innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId))
    .where(and(eq(studentGuardian.schoolId, input.schoolId), eq(studentGuardian.studentId, input.studentId)))
    .orderBy(sql`${studentGuardian.isPrimary} desc`, asc(guardian.createdAt), asc(guardian.id));
  const targets = new Map<string, string>();
  for (const g of guardians) {
    const phone = normalizePhone(g.phone);
    if (phone && !targets.has(phone)) targets.set(phone, g.id);
  }
  if (targets.size === 0) return none;

  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(msgMessage)
    .where(and(eq(msgMessage.schoolId, input.schoolId), eq(msgMessage.status, 'queued')));
  if (n >= platform.maxQueuedPerSchool) return none;

  const body = renderTemplate(tpl.body, input.vars);
  if (!body) return none;
  const inserted = await tx
    .insert(msgMessage)
    .values(
      [...targets].map(([phone, guardianId]) => ({
        schoolId: input.schoolId,
        eventKey: input.eventKey,
        studentId: input.studentId,
        guardianId,
        toPhone: phone,
        body,
        dedupeKey: `${input.dedupeKey}:${phone}`,
        ...(input.notBefore ? { notBefore: input.notBefore } : {}),
      })),
    )
    .onConflictDoNothing({ target: [msgMessage.schoolId, msgMessage.dedupeKey] })
    .returning({ id: msgMessage.id });
  return { queued: inserted.length };
}

/**
 * Seperti `enqueueMessages`, tetapi dibungkus savepoint dan try/catch: galat pesan tidak pernah menggagalkan
 * transaksi utama (absensi, pembayaran, rapor).
 */
export async function enqueueMessagesSafe(tx: Tx, input: EnqueueInput): Promise<{ queued: number }> {
  try {
    return await tx.transaction((sp) => enqueueMessages(sp, input));
  } catch (error) {
    console.error('[messaging] gagal mengantrekan pesan', input.eventKey, error);
    return { queued: 0 };
  }
}

export interface EnqueueRawInput {
  schoolId: string;
  /** Mis. `test` untuk pesan uji. */
  eventKey: string;
  /** Nomor yang sudah dinormalisasi (digit berawalan kode negara). */
  toPhone: string;
  body: string;
  dedupeKey?: string;
}

/** Antrekan satu pesan langsung ke sebuah nomor (pesan uji), tanpa memeriksa templat. */
export async function enqueueRaw(tx: Tx, input: EnqueueRawInput): Promise<{ queued: number }> {
  const inserted = await tx
    .insert(msgMessage)
    .values({
      schoolId: input.schoolId,
      eventKey: input.eventKey,
      toPhone: input.toPhone,
      body: input.body,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: [msgMessage.schoolId, msgMessage.dedupeKey] })
    .returning({ id: msgMessage.id });
  return { queued: inserted.length };
}
