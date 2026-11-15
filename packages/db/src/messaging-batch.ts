import {
  DEFAULT_DAILY_LIMIT,
  directBodyIssue,
  formatDateId,
  localParts,
  MESSAGE_PRIORITY,
  NEW_NUMBER_DAILY_LIMIT,
  NEW_NUMBER_DAYS,
  normalizePhone,
  QUEUE_RESERVE,
  type RecipientSelection,
  renderDirect,
  selectionIsEmpty,
  zonedTimeToDate,
} from '@edusync/contracts';
import { and, asc, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { Tx } from './client';
import { platformMessagingIn } from './messaging';
import {
  academicYear,
  classRoom,
  enrollment,
  guardian,
  msgBatch,
  msgMessage,
  msgSetting,
  school,
  student,
  studentGuardian,
  teacher,
  waAccount,
} from './schema';

/* ---------- Pesan langsung / siaran ke penerima terpilih (batch), rancangan §5 dan §7 ---------- */

export interface ExcludedCounts {
  /** Wali/staf tanpa nomor. */
  noPhone: number;
  /** Nomor ada tetapi tidak lolos `normalizePhone`. */
  invalid: number;
  /** Nomor yang sama sudah ada di daftar (mis. wali dua anak, wali yang juga staf). */
  duplicate: number;
  /** Nomor di daftar tolak siaran (tahap C; selalu 0 di tahap A). */
  optedOut: number;
}

export interface ResolvedRecipient {
  /** Nomor ternormalisasi. */
  phone: string;
  /** Wali didahulukan bila nomor yang sama juga milik staf. */
  kind: 'guardian' | 'teacher';
  name: string;
  guardianId: string | null;
  teacherId: string | null;
  /** Murid pertama sebagai konteks pesan; null untuk staf. */
  studentId: string | null;
  studentNames: string[];
  classNames: string[];
}

export interface Resolution {
  recipients: ResolvedRecipient[];
  excluded: ExcludedCounts;
}

const uniquePush = (list: string[], items: readonly string[]) => {
  for (const i of items) if (!list.includes(i)) list.push(i);
};

type GuardianLink = { guardianId: string; name: string; phone: string | null };

/**
 * Ubah pemilih menjadi daftar penerima unik per nomor. Murid/rombel hanya yang `active`, tidak dihapus, dan terdaftar di
 * tahun ajaran aktif; staf hanya guru `active`. Wali dipilih per `guardianScope` (bawaan `primary`: wali utama, jatuh ke
 * wali berikutnya bila nomornya tidak ada/tidak valid).
 */
export async function resolveRecipients(
  tx: Tx,
  schoolId: string,
  selection: RecipientSelection,
): Promise<Resolution> {
  const excluded: ExcludedCounts = { noPhone: 0, invalid: 0, duplicate: 0, optedOut: 0 };
  const byPhone = new Map<string, ResolvedRecipient>();
  const add = (r: ResolvedRecipient) => {
    const hit = byPhone.get(r.phone);
    if (!hit) {
      byPhone.set(r.phone, r);
      return;
    }
    excluded.duplicate++;
    uniquePush(hit.studentNames, r.studentNames);
    uniquePush(hit.classNames, r.classNames);
  };
  const countBad = (raw: string | null | undefined) => {
    if (raw?.trim()) excluded.invalid++;
    else excluded.noPhone++;
  };
  const [year] = await tx
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(and(eq(academicYear.schoolId, schoolId), eq(academicYear.isActive, true)));

  // Murid dari pemilih murid/rombel/tingkat/seluruh sekolah -> wali.
  const picks: SQL[] = [];
  if (selection.students?.length) picks.push(inArray(student.id, selection.students));
  if (selection.classes?.length) picks.push(inArray(classRoom.id, selection.classes));
  if (selection.gradeLevels?.length) picks.push(inArray(classRoom.level, selection.gradeLevels));
  const studs =
    year && (selection.wholeSchool || picks.length > 0)
      ? await tx
          .select({ id: student.id, name: student.name, className: classRoom.name })
          .from(student)
          .innerJoin(
            enrollment,
            and(eq(enrollment.studentId, student.id), eq(enrollment.academicYearId, year.id)),
          )
          .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
          .where(
            and(
              eq(student.schoolId, schoolId),
              eq(student.status, 'active'),
              isNull(student.deletedAt),
              selection.wholeSchool ? undefined : or(...picks),
            ),
          )
          .orderBy(asc(student.name), asc(student.id))
      : [];
  const scope = selection.guardianScope ?? 'primary';
  const linksOf = new Map<string, GuardianLink[]>();
  if (studs.length > 0) {
    const links = await tx
      .select({
        studentId: studentGuardian.studentId,
        guardianId: guardian.id,
        name: guardian.name,
        phone: guardian.phone,
      })
      .from(studentGuardian)
      .innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId))
      .where(
        and(
          eq(studentGuardian.schoolId, schoolId),
          inArray(
            studentGuardian.studentId,
            studs.map((s) => s.id),
          ),
        ),
      )
      .orderBy(desc(studentGuardian.isPrimary), asc(guardian.createdAt), asc(guardian.id));
    for (const l of links) linksOf.set(l.studentId, [...(linksOf.get(l.studentId) ?? []), l]);
  }
  const badGuardians = new Set<string>();
  const addGuardian = (g: GuardianLink, s: (typeof studs)[number]) => {
    const phone = normalizePhone(g.phone);
    if (!phone) return false;
    add({
      phone,
      kind: 'guardian',
      name: g.name,
      guardianId: g.guardianId,
      teacherId: null,
      studentId: s.id,
      studentNames: [s.name],
      classNames: [s.className],
    });
    return true;
  };
  for (const s of studs) {
    const links = linksOf.get(s.id) ?? [];
    if (scope === 'primary') {
      if (!links.some((l) => addGuardian(l, s))) countBad(links.find((l) => l.phone?.trim())?.phone);
    } else {
      if (links.length === 0) excluded.noPhone++;
      for (const l of links) {
        if (!addGuardian(l, s) && !badGuardians.has(l.guardianId)) {
          badGuardians.add(l.guardianId);
          countBad(l.phone);
        }
      }
    }
  }

  // Wali yang dipilih langsung; anak aktifnya dipakai untuk {{student}} dan {{class}}.
  if (selection.guardians?.length) {
    const gs = await tx
      .select({ guardianId: guardian.id, name: guardian.name, phone: guardian.phone })
      .from(guardian)
      .where(and(eq(guardian.schoolId, schoolId), inArray(guardian.id, selection.guardians)))
      .orderBy(asc(guardian.name), asc(guardian.id));
    const kids = year
      ? await tx
          .select({
            guardianId: studentGuardian.guardianId,
            id: student.id,
            name: student.name,
            className: classRoom.name,
          })
          .from(studentGuardian)
          .innerJoin(student, eq(student.id, studentGuardian.studentId))
          .innerJoin(
            enrollment,
            and(eq(enrollment.studentId, student.id), eq(enrollment.academicYearId, year.id)),
          )
          .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
          .where(
            and(
              eq(studentGuardian.schoolId, schoolId),
              inArray(studentGuardian.guardianId, selection.guardians),
              eq(student.status, 'active'),
              isNull(student.deletedAt),
            ),
          )
          .orderBy(asc(student.name), asc(student.id))
      : [];
    for (const g of gs) {
      const mine = kids.filter((k) => k.guardianId === g.guardianId);
      const phone = normalizePhone(g.phone);
      if (!phone) {
        if (!badGuardians.has(g.guardianId)) {
          badGuardians.add(g.guardianId);
          countBad(g.phone);
        }
        continue;
      }
      add({
        phone,
        kind: 'guardian',
        name: g.name,
        guardianId: g.guardianId,
        teacherId: null,
        studentId: mine[0]?.id ?? null,
        studentNames: mine.map((k) => k.name),
        classNames: [...new Set(mine.map((k) => k.className))],
      });
    }
  }

  // Staf (guru aktif).
  if (selection.allStaff || selection.teachers?.length) {
    const ts = await tx
      .select({ id: teacher.id, name: teacher.name, phone: teacher.phone })
      .from(teacher)
      .where(
        and(
          eq(teacher.schoolId, schoolId),
          eq(teacher.status, 'active'),
          selection.allStaff ? undefined : inArray(teacher.id, selection.teachers ?? []),
        ),
      )
      .orderBy(asc(teacher.name), asc(teacher.id));
    for (const t of ts) {
      const phone = normalizePhone(t.phone);
      if (!phone) {
        countBad(t.phone);
        continue;
      }
      add({
        phone,
        kind: 'teacher',
        name: t.name,
        guardianId: null,
        teacherId: t.id,
        studentId: null,
        studentNames: [],
        classNames: [],
      });
    }
  }
  return { recipients: [...byPhone.values()], excluded };
}

export interface SendLimits {
  /** Batas harian efektif (pesan langsung/siaran). */
  limit: number;
  used: number;
  remaining: number;
  /** Nomor dianggap baru: belum ada pesan terkirim yang lebih tua dari 7 hari. */
  newNumber: boolean;
  /** Slot antrean yang masih boleh dipakai batch (setelah cadangan untuk peristiwa otomatis). */
  queueRemaining: number;
  /** Saklar sekolah dan platform sama-sama menyala. */
  enabled: boolean;
  accountReady: boolean;
  timezone: string | null;
}

/** Batas kirim, pemakaian hari ini (sejak 00:00 waktu sekolah), sisa antrean, dan kesiapan sambungan sebuah sekolah. */
export async function loadSendLimits(tx: Tx, schoolId: string, now: Date = new Date()): Promise<SendLimits> {
  const [setting] = await tx.select().from(msgSetting).where(eq(msgSetting.schoolId, schoolId));
  const [sch] = await tx.select({ timezone: school.timezone }).from(school).where(eq(school.id, schoolId));
  const [account] = await tx
    .select({ status: waAccount.status })
    .from(waAccount)
    .where(eq(waAccount.schoolId, schoolId));
  const platform = await platformMessagingIn(tx);
  const tz = sch?.timezone ?? null;
  const dayStart = zonedTimeToDate(localParts(now, tz).date, '00:00', tz);
  const count = (...where: (SQL | undefined)[]) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(msgMessage)
      .where(and(eq(msgMessage.schoolId, schoolId), ...where))
      .then((r) => r[0]?.n ?? 0);
  const used = await count(
    sql`${msgMessage.priority} > 0`,
    sql`${msgMessage.createdAt} >= ${dayStart.toISOString()}::timestamptz`,
    // Yang dibatalkan tidak dihitung; skipped lain (mis. expired) tetap terhitung karena bisa dikirim ulang.
    sql`not (${msgMessage.status} = 'skipped' and ${msgMessage.detail} is not distinct from 'cancelled')`,
  );
  const queued = await count(eq(msgMessage.status, 'queued'));
  // shortcut: tanpa kolom "tersambung sejak", nomor baru = belum pernah ada kiriman sukses > 7 hari; upgrade bila wa_account mencatatnya.
  const veteran = await count(
    eq(msgMessage.status, 'sent'),
    sql`${msgMessage.sentAt} < ${new Date(now.getTime() - NEW_NUMBER_DAYS * 86_400_000).toISOString()}::timestamptz`,
  );
  const newNumber = veteran === 0;
  const base = Math.min(setting?.dailyLimit ?? DEFAULT_DAILY_LIMIT, platform.dailyLimitMax);
  const limit = newNumber ? Math.min(base, NEW_NUMBER_DAILY_LIMIT) : base;
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    newNumber,
    queueRemaining: Math.max(0, platform.maxQueuedPerSchool - QUEUE_RESERVE - queued),
    enabled: Boolean(setting?.enabled) && platform.enabled,
    accountReady: account?.status === 'ready',
    timezone: tz,
  };
}

export type BatchErrorCode =
  | 'unknown_placeholder'
  | 'sensitive_content'
  | 'no_recipients'
  | 'count_changed'
  | 'messaging_disabled'
  | 'daily_limit'
  | 'queue_full';

/** Galat bisnis pembuatan batch; API memetakannya ke 400/409. */
export class BatchError extends Error {
  constructor(
    readonly code: BatchErrorCode,
    message: string,
    readonly extra: Record<string, number | string> = {},
  ) {
    super(message);
  }
}

export interface EnqueueBatchInput {
  schoolId: string;
  kind: 'direct' | 'broadcast';
  /** Subjek internal untuk riwayat. */
  title: string;
  /** Isi asli dengan pengganti ({{guardian}} dst.). */
  body: string;
  selection: RecipientSelection;
  createdBy: string;
  /** Jumlah penerima yang dikonfirmasi pengguna di pratinjau. */
  expectedTotal: number;
  schoolName: string;
  /** Lampiran (msg_attachment) yang ikut dikirim ke tiap penerima; null/kosong = teks saja. */
  attachmentId?: string | null;
  now?: Date;
}

/**
 * Buat batch dan antrekan satu pesan per penerima (prioritas 1 langsung / 2 siaran) dalam transaksi pemanggil: semua atau
 * tidak sama sekali. Berbeda dengan `enqueueMessages`, tidak ada yang dibuang diam-diam: pemeriksaan di depan menghasilkan
 * `BatchError` eksplisit. Kunci advisory per sekolah mencegah dua batch bersamaan melampaui batas harian/antrean.
 */
export async function enqueueBatch(
  tx: Tx,
  input: EnqueueBatchInput,
): Promise<{ batchId: string; total: number; excluded: ExcludedCounts }> {
  const issue = directBodyIssue(input.body);
  if (issue) throw new BatchError(issue.code, `Isi pesan tidak layak: ${issue.detail}.`);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`msg_batch:${input.schoolId}`}, 0))`);
  const now = input.now ?? new Date();
  const limits = await loadSendLimits(tx, input.schoolId, now);
  if (!limits.enabled) {
    throw new BatchError('messaging_disabled', 'Pengiriman pesan sedang dimatikan untuk sekolah ini.');
  }
  const { recipients, excluded } = await resolveRecipients(tx, input.schoolId, input.selection);
  const total = recipients.length;
  if (selectionIsEmpty(input.selection) || total === 0) {
    throw new BatchError('no_recipients', 'Tidak ada penerima yang bisa dikirimi pesan.');
  }
  if (total !== input.expectedTotal) {
    throw new BatchError('count_changed', 'Jumlah penerima berubah sejak pratinjau.', { total });
  }
  if (total > limits.remaining) {
    throw new BatchError('daily_limit', 'Melebihi batas pesan harian sekolah.', {
      remaining: limits.remaining,
      limit: limits.limit,
    });
  }
  if (total > limits.queueRemaining) {
    throw new BatchError('queue_full', 'Antrean pesan sekolah penuh.', { remaining: limits.queueRemaining });
  }
  const date = formatDateId(localParts(now, limits.timezone).date);
  const [batch] = await tx
    .insert(msgBatch)
    .values({
      schoolId: input.schoolId,
      kind: input.kind,
      title: input.title,
      bodyTemplate: input.body,
      selection: input.selection as Record<string, unknown>,
      recipientCount: total,
      excluded,
      createdBy: input.createdBy,
      attachmentId: input.attachmentId ?? null,
    })
    .returning({ id: msgBatch.id });
  const batchId = (batch as { id: string }).id;
  const priority = input.kind === 'direct' ? MESSAGE_PRIORITY.direct : MESSAGE_PRIORITY.broadcast;
  const rows = recipients.map((r) => ({
    schoolId: input.schoolId,
    eventKey: input.kind,
    studentId: r.studentId,
    guardianId: r.guardianId,
    teacherId: r.teacherId,
    toPhone: r.phone,
    body: renderDirect(
      input.body,
      {
        guardianName: r.kind === 'guardian' ? r.name : null,
        teacherName: r.kind === 'teacher' ? r.name : null,
        studentNames: r.studentNames,
        classNames: r.classNames,
      },
      { school: input.schoolName, date },
    ),
    priority,
    batchId,
    dedupeKey: `batch:${batchId}:${r.phone}`,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await tx
      .insert(msgMessage)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing({ target: [msgMessage.schoolId, msgMessage.dedupeKey] });
  }
  return { batchId, total, excluded };
}
