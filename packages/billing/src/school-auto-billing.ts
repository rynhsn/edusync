/**
 * Penagihan otomatis TAGIHAN SEKOLAH (bukan langganan platform): penjadwal harian di worker dan tombol "Jalankan
 * sekarang" di API memakai kode yang sama. Pembuatan tagihan memakai `generateInvoices` (packages/db), jadi hasilnya
 * identik dan idempoten terhadap "Buat tagihan massal" manual. Aturan jadwal murni ada di packages/contracts/auto-billing.ts.
 *
 * Catatan operasional:
 * - `runAutoBilling` harus memakai `Db` berperan platform (melewati RLS) untuk menemukan sekolah yang punya aturan;
 *   pekerjaan per sekolah selalu berjalan di dalam konteks tenant (`withTenant`).
 * - Log run disimpan 24 bulan terakhir (belum ada pembersihan terjadwal).
 */
import {
  type AutoBillingRuleDraft,
  type AutoBillingSemester,
  type AutoBillingSkipReason,
  type AutoBillingStatus,
  type AutoBillingTrigger,
  type AutoBillingYear,
  defaultManualRun,
  evaluateRule,
  type PlannedRun,
  periodLabel,
  plannedRuns,
  todayIn,
  upcomingRuns,
} from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  auditLog,
  classRoom,
  type Db,
  desc,
  entitlement,
  eq,
  FinanceGenerateError,
  finAutoBillingRule,
  finAutoBillingRun,
  finFeeType,
  generateInvoices,
  gt,
  inArray,
  school,
  semester,
  sql,
  type Tx,
  withTenant,
} from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';

/** Penulis tagihan (`created_by`) untuk run otomatis. */
export const AUTO_BILLING_ACTOR = 'system:auto-billing';
const MAX_EMAIL_RECIPIENTS = 10;

export type RuleRow = typeof finAutoBillingRule.$inferSelect;
export type RunRow = typeof finAutoBillingRun.$inferSelect;

/** Galat yang dapat ditampilkan ke pengguna (API menerjemahkannya ke HTTP). */
export class AutoBillingError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AutoBillingError';
  }
}

export type BlockedReason =
  | 'school_suspended'
  | 'module_disabled'
  | 'fee_inactive'
  | Exclude<AutoBillingSkipReason, 'not_yet' | 'already_done'>;

const BLOCKED_TEXT: Record<BlockedReason, string> = {
  school_suspended: 'Sekolah sedang ditangguhkan.',
  module_disabled: 'Modul keuangan tidak aktif untuk sekolah ini.',
  fee_inactive: 'Jenis biaya tidak aktif.',
  invalid_rule: 'Aturan tidak lengkap atau tidak sah.',
  no_year: 'Tidak ada tahun ajaran aktif.',
  outside_year: 'Hari ini di luar rentang tahun ajaran aktif.',
  no_semester: 'Semester pada tahun ajaran aktif belum diatur.',
  run_on_outside_year: 'Tanggal jalan berada di luar tahun ajaran aktif.',
};
export const blockedText = (reason: BlockedReason) => BLOCKED_TEXT[reason];

export function ruleToDraft(rule: RuleRow, kind: AutoBillingRuleDraft['kind']): AutoBillingRuleDraft {
  return {
    kind,
    runDay: rule.runDay,
    dueMode: rule.dueMode,
    dueDay: rule.dueDay,
    dueDays: rule.dueDays,
    semesterRun: rule.semesterRun,
    semesterOffsetDays: rule.semesterOffsetDays,
    runOn: rule.runOn,
    installments: rule.installments,
  };
}

export interface SchoolBillingContext {
  school: { id: string; name: string; status: 'active' | 'suspended'; timezone: string };
  today: string;
  financeActive: boolean;
  year: AutoBillingYear | null;
  semesters: AutoBillingSemester[];
}

/** Konteks sekolah (tanggal lokal, modul keuangan, tahun ajaran aktif, semester). Panggil di dalam `withTenant`. */
export async function loadBillingContext(tx: Tx, schoolId: string, now: Date): Promise<SchoolBillingContext> {
  const [s] = await tx
    .select({ id: school.id, name: school.name, status: school.status, timezone: school.timezone })
    .from(school)
    .where(eq(school.id, schoolId));
  if (!s) throw new AutoBillingError(404, 'not_found', 'Sekolah tidak ditemukan.');
  const ent = await tx
    .select({ key: entitlement.moduleKey })
    .from(entitlement)
    .where(
      and(
        eq(entitlement.schoolId, schoolId),
        eq(entitlement.moduleKey, 'finance'),
        gt(entitlement.validUntil, now),
      ),
    );
  const [yearRow] = await tx
    .select({
      id: academicYear.id,
      name: academicYear.name,
      startsOn: academicYear.startsOn,
      endsOn: academicYear.endsOn,
    })
    .from(academicYear)
    .where(and(eq(academicYear.schoolId, schoolId), eq(academicYear.isActive, true)))
    .limit(1);
  const semesters = yearRow
    ? await tx
        .select({ startsOn: semester.startsOn, endsOn: semester.endsOn })
        .from(semester)
        .where(eq(semester.academicYearId, yearRow.id))
        .orderBy(asc(semester.startsOn))
    : [];
  return {
    school: s,
    today: todayIn(s.timezone, now),
    financeActive: ent.length > 0,
    year: yearRow ?? null,
    semesters,
  };
}

/** Periode yang sudah punya run otomatis `ok` untuk aturan ini pada tahun ajaran itu. */
async function doneKeys(tx: Tx, ruleId: string, yearId: string | null): Promise<Set<string>> {
  if (!yearId) return new Set();
  const rows = await tx
    .select({ period: finAutoBillingRun.period })
    .from(finAutoBillingRun)
    .where(
      and(
        eq(finAutoBillingRun.ruleId, ruleId),
        eq(finAutoBillingRun.academicYearId, yearId),
        eq(finAutoBillingRun.trigger, 'auto'),
        eq(finAutoBillingRun.status, 'ok'),
      ),
    );
  return new Set(rows.map((r) => r.period));
}

export interface RuleEvaluation {
  /** Periode yang jatuh tempo hari ini (null bila tidak ada). */
  due: PlannedRun | null;
  /** Mengapa tidak berjalan; null bila `due` ada dan tidak terblokir. */
  blocked: BlockedReason | null;
  /** Jadwal berikutnya (maks 3), urut tanggal jalan. */
  upcoming: PlannedRun[];
  skip: AutoBillingSkipReason | null;
}

/** Evaluasi aturan terhadap konteks sekolah dan log run. Tanpa efek samping. */
export async function evaluateRuleInContext(
  tx: Tx,
  rule: RuleRow,
  fee: { kind: AutoBillingRuleDraft['kind']; active: boolean },
  ctx: SchoolBillingContext,
): Promise<RuleEvaluation> {
  const draft = ruleToDraft(rule, fee.kind);
  const done = await doneKeys(tx, rule.id, ctx.year?.id ?? null);
  const evalCtx = { today: ctx.today, year: ctx.year, semesters: ctx.semesters, done };
  const result = evaluateRule(draft, evalCtx);
  const upcoming = upcomingRuns(draft, evalCtx, 3);
  let blocked: BlockedReason | null = null;
  if (ctx.school.status !== 'active') blocked = 'school_suspended';
  else if (!ctx.financeActive) blocked = 'module_disabled';
  else if (!fee.active) blocked = 'fee_inactive';
  else if (result.reason && result.reason !== 'not_yet' && result.reason !== 'already_done') {
    blocked = result.reason;
  }
  return { due: result.due, blocked, upcoming, skip: result.reason };
}

/* ---------- Pencatatan run ---------- */

interface RunValues {
  schoolId: string;
  ruleId: string;
  academicYearId: string | null;
  period: string;
  scheduledFor: string;
  startedAt: Date;
  trigger: AutoBillingTrigger;
  status: AutoBillingStatus;
  createdCount: number;
  skippedCount: number;
  missingPlanCount: number;
  freeCount: number;
  error: string | null;
}

/**
 * Tulis baris log. Untuk run otomatis yang hasilnya sama dengan upaya sebelumnya (status sama, tidak ada tagihan baru,
 * pesan sama), baris lama hanya diperbarui waktu selesainya agar percobaan harian tidak membanjiri log.
 */
async function recordRun(tx: Tx, v: RunValues): Promise<string> {
  if (v.trigger === 'auto' && v.status !== 'ok' && v.createdCount === 0) {
    const [last] = await tx
      .select()
      .from(finAutoBillingRun)
      .where(
        and(
          eq(finAutoBillingRun.ruleId, v.ruleId),
          eq(finAutoBillingRun.period, v.period),
          eq(finAutoBillingRun.trigger, 'auto'),
        ),
      )
      .orderBy(desc(finAutoBillingRun.startedAt), desc(finAutoBillingRun.id))
      .limit(1);
    if (
      last &&
      last.status === v.status &&
      last.academicYearId === v.academicYearId &&
      last.createdCount === 0 &&
      last.missingPlanCount === v.missingPlanCount &&
      (last.error ?? null) === v.error
    ) {
      await tx
        .update(finAutoBillingRun)
        .set({ finishedAt: new Date(), skippedCount: v.skippedCount, freeCount: v.freeCount })
        .where(eq(finAutoBillingRun.id, last.id));
      return last.id;
    }
  }
  const [row] = await tx
    .insert(finAutoBillingRun)
    .values({ ...v, finishedAt: new Date() })
    .returning({ id: finAutoBillingRun.id });
  return row!.id;
}

/* ---------- Eksekusi satu aturan ---------- */

export interface ExecuteOptions {
  trigger: AutoBillingTrigger;
  now: Date;
  /** Pengguna yang menekan "Jalankan sekarang" (run manual); run otomatis memakai penanda sistem. */
  actorId?: string;
  /** Awalan URL web untuk tautan di email ringkasan. */
  webUrl?: string;
  /** Run manual: periode yang diminta; kosong = periode berjalan. */
  period?: string | null;
}

export interface RunSummary {
  runId: string;
  ruleId: string;
  period: string;
  status: AutoBillingStatus;
  created: number;
  skipped: number;
  free: number;
  missingPlan: number;
  error: string | null;
  trigger: AutoBillingTrigger;
}

export type ExecuteOutcome =
  | { kind: 'none'; reason: AutoBillingSkipReason | null }
  | { kind: 'ran'; run: RunSummary };

function statusOf(r: { created: number; skipped: number; free: number; missingPlan: number }): {
  status: AutoBillingStatus;
  error: string | null;
} {
  if (r.missingPlan > 0) {
    return {
      status: 'partial',
      error: `${r.missingPlan} siswa belum punya tarif untuk jenis biaya ini; atur tarifnya lalu jalankan lagi.`,
    };
  }
  if (r.created + r.skipped + r.free === 0) {
    return { status: 'partial', error: 'Tidak ada siswa aktif dalam cakupan jenis biaya ini.' };
  }
  return { status: 'ok', error: null };
}

/** Pengelola keuangan sekolah (anggota aktif dengan `finance:manage`) yang punya email. */
async function financeAdminEmails(tx: Tx, schoolId: string): Promise<string[]> {
  const rows = await tx.execute<{ email: string }>(sql`
    select distinct u.email
    from member m
    join "user" u on u.id = m.user_id
    join member_role mr on mr.member_id = m.id
    join role_permission rp on rp.role_id = mr.role_id
    where m.school_id = ${schoolId}::uuid and m.status = 'active' and rp.permission = 'finance:manage'
    order by u.email
    limit ${MAX_EMAIL_RECIPIENTS}`);
  return rows.rows.map((r) => r.email);
}

const rupiahNumber = (n: number) => n.toLocaleString('id-ID');

async function notifyRun(
  tx: Tx,
  input: { schoolId: string; schoolName: string; feeName: string; run: RunSummary; webUrl?: string },
) {
  const { run } = input;
  const recipients = await financeAdminEmails(tx, input.schoolId);
  const label = /^\d{4}-\d{2}$/.test(run.period) ? periodLabel(run.period) : run.period;
  const subject = `Tagihan otomatis dibuat: ${input.feeName} (${label})`.slice(0, 200);
  const lines = [
    `Penagihan otomatis ${input.schoolName} telah membuat tagihan.`,
    '',
    `Jenis biaya: ${input.feeName}`,
    `Periode: ${label}`,
    `Tagihan baru: ${rupiahNumber(run.created)}`,
    `Sudah ada (dilewati): ${rupiahNumber(run.skipped)}`,
    ...(run.free > 0 ? [`Gratis (tarif 0): ${rupiahNumber(run.free)}`] : []),
    ...(run.missingPlan > 0
      ? [`Siswa tanpa tarif: ${rupiahNumber(run.missingPlan)} (atur tarif lalu jalankan lagi)`]
      : []),
    '',
    ...(input.webUrl ? [`Lihat tagihan: ${input.webUrl.replace(/\/$/, '')}/finance/invoices`, ''] : []),
    'Penagihan otomatis dapat diatur atau dimatikan di Keuangan > Pengaturan > Tagihan otomatis.',
  ];
  for (const to of recipients) {
    await enqueue(
      tx,
      QUEUES.emailSend,
      { to, subject, text: lines.join('\n') },
      { schoolId: input.schoolId },
    );
  }
}

/**
 * Jalankan satu aturan. Otomatis: hanya bila ada periode yang jatuh tempo hari ini (catch-up, tanpa backfill).
 * Manual: periode diminta atau periode berjalan, tanpa menunggu tanggal jalan. Tidak pernah membuat tagihan ganda
 * (kunci advisory per aturan dan periode, indeks unik run `ok`, dan idempotensi `generateInvoices`).
 */
export async function executeRule(
  db: Db,
  schoolId: string,
  ruleId: string,
  opts: ExecuteOptions,
): Promise<ExecuteOutcome> {
  const manual = opts.trigger === 'manual';
  // Catatan: worker memakai peran platform yang melewati RLS, jadi setiap kueri di sini memfilter sekolah secara
  // eksplisit (langsung lewat school_id atau lewat id yang sudah milik sekolah itu).
  // Fase 1: baca konteks dan tentukan periode (tanpa menulis).
  const plan = await planRun(db, schoolId, ruleId, opts);
  if (plan.kind === 'none') return plan;
  const { rule, fee, ctx, target } = plan;

  const base = {
    schoolId,
    ruleId: rule.id,
    academicYearId: ctx.year?.id ?? null,
    period: target.period,
    scheduledFor: target.runDate,
    startedAt: opts.now,
    trigger: opts.trigger,
  };
  const summarize = (runId: string, v: RunValues): ExecuteOutcome => ({
    kind: 'ran',
    run: {
      runId,
      ruleId: rule.id,
      period: v.period,
      status: v.status,
      created: v.createdCount,
      skipped: v.skippedCount,
      free: v.freeCount,
      missingPlan: v.missingPlanCount,
      error: v.error,
      trigger: v.trigger,
    },
  });
  const zero = { createdCount: 0, skippedCount: 0, missingPlanCount: 0, freeCount: 0 };

  // Terblokir (sekolah ditangguhkan, modul mati, jenis biaya nonaktif): catat 'skipped' dan jangan buat tagihan.
  const hard =
    plan.blocked === 'school_suspended' ||
    plan.blocked === 'fee_inactive' ||
    (plan.blocked === 'module_disabled' && !manual);
  if (plan.blocked && hard) {
    if (manual) throw new AutoBillingError(409, plan.blocked, blockedText(plan.blocked));
    const v: RunValues = { ...base, status: 'skipped', error: blockedText(plan.blocked), ...zero };
    const id = await withTenant(db, [schoolId], (tx) => recordRun(tx, v));
    return summarize(id, v);
  }

  // Fase 2: kunci, periksa ulang, buat tagihan, catat. Satu transaksi; galat membatalkan semuanya.
  try {
    return await withTenant(db, [schoolId], async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`fin-auto-billing:${rule.id}:${target.period}`}, 0))`,
      );
      if (!manual) {
        const done = await doneKeys(tx, rule.id, ctx.year?.id ?? null);
        if (done.has(target.period)) return { kind: 'none', reason: 'already_done' } as const;
      }
      // Pembatas kelas hanya berlaku untuk kelas yang ada pada tahun ajaran aktif.
      const wanted = rule.classIds ?? [];
      let classIds: string[] | null = null;
      if (wanted.length > 0) {
        const found = await tx
          .select({ id: classRoom.id })
          .from(classRoom)
          .where(and(inArray(classRoom.id, wanted), eq(classRoom.academicYearId, ctx.year!.id)));
        classIds = found.map((c) => c.id);
        if (classIds.length === 0) {
          const v: RunValues = {
            ...base,
            status: 'partial',
            error: 'Kelas pembatas tidak ditemukan pada tahun ajaran aktif; perbarui aturan.',
            ...zero,
          };
          return summarize(await recordRun(tx, v), v);
        }
      }
      const result = await generateInvoices(tx, {
        schoolId,
        actorId: manual ? (opts.actorId ?? AUTO_BILLING_ACTOR) : AUTO_BILLING_ACTOR,
        academicYearId: ctx.year!.id,
        feeTypeId: rule.feeTypeId,
        period: target.invoicePeriod,
        classIds,
        dueDate: target.dueDate,
        installments: rule.installments,
      });
      const { status, error } = statusOf({
        created: result.created,
        skipped: result.skipped,
        free: result.free,
        missingPlan: result.missingPlan.length,
      });
      const v: RunValues = {
        ...base,
        status,
        error,
        createdCount: result.created,
        skippedCount: result.skipped,
        missingPlanCount: result.missingPlan.length,
        freeCount: result.free,
      };
      const out = summarize(await recordRun(tx, v), v);
      if (out.kind === 'ran' && (result.created > 0 || manual)) {
        await tx.insert(auditLog).values({
          schoolId,
          actorId: manual ? (opts.actorId ?? null) : null,
          action: 'finance.auto_billing_run',
          entityType: 'fin_auto_billing_rule',
          entityId: rule.id,
          details: {
            feeType: fee.name,
            period: target.period,
            trigger: opts.trigger,
            status,
            created: result.created,
            skipped: result.skipped,
            free: result.free,
            missingPlan: result.missingPlan.length,
            dueDate: target.dueDate,
            ...(error ? { reason: error } : {}),
          },
        });
        if (!manual && result.created > 0) {
          await notifyRun(tx, {
            schoolId,
            schoolName: ctx.school.name,
            feeName: fee.name,
            run: out.run,
            ...(opts.webUrl ? { webUrl: opts.webUrl } : {}),
          });
        }
      }
      return out;
    });
  } catch (error) {
    // Transaksi sudah dibatalkan; tinggalkan jejak 'failed' di transaksi baru.
    const message =
      error instanceof FinanceGenerateError || error instanceof AutoBillingError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    const v: RunValues = { ...base, status: 'failed', error: message.slice(0, 500), ...zero };
    try {
      await withTenant(db, [schoolId], (tx) => recordRun(tx, v));
    } catch (logError) {
      console.error('[auto-billing] gagal mencatat run gagal', logError);
    }
    throw error;
  }
}

type PlanResult =
  | { kind: 'none'; reason: AutoBillingSkipReason | null }
  | {
      kind: 'run';
      rule: RuleRow;
      fee: { name: string; kind: AutoBillingRuleDraft['kind']; active: boolean };
      ctx: SchoolBillingContext;
      target: PlannedRun;
      blocked: BlockedReason | null;
    };

async function planRun(db: Db, schoolId: string, ruleId: string, opts: ExecuteOptions): Promise<PlanResult> {
  return withTenant(db, [schoolId], async (tx): Promise<PlanResult> => {
    const [rule] = await tx.select().from(finAutoBillingRule).where(eq(finAutoBillingRule.id, ruleId));
    if (!rule) throw new AutoBillingError(404, 'not_found', 'Aturan penagihan tidak ditemukan.');
    const [fee] = await tx
      .select({ name: finFeeType.name, kind: finFeeType.kind, active: finFeeType.active })
      .from(finFeeType)
      .where(eq(finFeeType.id, rule.feeTypeId));
    if (!fee) throw new AutoBillingError(404, 'not_found', 'Jenis biaya tidak ditemukan.');
    const ctx = await loadBillingContext(tx, schoolId, opts.now);
    const draft = ruleToDraft(rule, fee.kind);
    if (opts.trigger === 'auto') {
      const ev = await evaluateRuleInContext(tx, rule, fee, ctx);
      if (!ev.due) return { kind: 'none', reason: ev.skip };
      return { kind: 'run', rule, fee, ctx, target: ev.due, blocked: ev.blocked };
    }
    // Manual: tidak menunggu tanggal jalan.
    if (!ctx.year) throw new AutoBillingError(409, 'no_year', blockedText('no_year'));
    const planned = plannedRuns(draft, ctx.year, ctx.semesters);
    if (planned.length === 0) {
      const code = fee.kind === 'semester' ? 'no_semester' : 'run_on_outside_year';
      throw new AutoBillingError(409, code, blockedText(code));
    }
    const target = opts.period
      ? planned.find((p) => p.period === opts.period)
      : defaultManualRun(draft, ctx.year, ctx.semesters, ctx.today);
    if (!target) {
      throw new AutoBillingError(400, 'period_invalid', 'Periode itu bukan bagian dari tahun ajaran aktif.');
    }
    const ev = await evaluateRuleInContext(tx, rule, fee, ctx);
    return { kind: 'run', rule, fee, ctx, target, blocked: ev.blocked };
  });
}

/* ---------- Sapuan harian (worker) ---------- */

export interface SweepOptions {
  now?: Date;
  /** Batasi ke sekolah tertentu (untuk tes yang berbagi basis data). */
  schoolIds?: string[];
  webUrl?: string;
  log?: Pick<Console, 'log' | 'error'>;
}

export interface SweepResult {
  rules: number;
  ran: RunSummary[];
  errors: { ruleId: string; message: string }[];
}

/**
 * Sapuan harian: untuk semua sekolah yang punya aturan aktif, jalankan periode yang jatuh tempo. Satu aturan yang
 * gagal tidak menghentikan yang lain (galat dicatat sebagai run `failed`). Aman diulang kapan saja.
 */
export async function runAutoBilling(db: Db, options: SweepOptions = {}): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const rows = await db
    .select({ id: finAutoBillingRule.id, schoolId: finAutoBillingRule.schoolId })
    .from(finAutoBillingRule)
    .where(
      and(
        eq(finAutoBillingRule.enabled, true),
        options.schoolIds ? inArray(finAutoBillingRule.schoolId, options.schoolIds) : undefined,
      ),
    )
    .orderBy(asc(finAutoBillingRule.schoolId), asc(finAutoBillingRule.createdAt));
  const result: SweepResult = { rules: rows.length, ran: [], errors: [] };
  for (const row of rows) {
    try {
      const outcome = await executeRule(db, row.schoolId, row.id, {
        trigger: 'auto',
        now,
        ...(options.webUrl ? { webUrl: options.webUrl } : {}),
      });
      if (outcome.kind === 'ran') result.ran.push(outcome.run);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ ruleId: row.id, message });
      options.log?.error(`[auto-billing] aturan ${row.id} gagal: ${message}`);
    }
  }
  return result;
}

/* ---------- Pratinjau (tanpa menulis) ---------- */

class PreviewRollback extends Error {
  constructor(readonly payload: { created: number; skipped: number; free: number; missingPlan: number }) {
    super('rollback');
  }
}

export interface PreviewResult {
  nextRuns: { period: string; runDate: string; dueDate: string; catchUp: boolean }[];
  /** Perkiraan untuk periode terdekat; null bila tidak ada periode atau jenis biaya tidak bisa dihitung. */
  forPeriod: string | null;
  wouldCreate: number | null;
  alreadyBilled: number | null;
  free: number | null;
  missingPlan: number | null;
  /** Kode galat bila perkiraan tak bisa dihitung (mis. `inactive`, `invalid_reference`). */
  error: string | null;
}

/**
 * Pratinjau draf aturan: tiga jadwal berikutnya dan perkiraan jumlah siswa yang akan ditagih atau tanpa tarif untuk
 * periode terdekat. Perhitungan memakai `generateInvoices` di dalam savepoint yang SELALU dibatalkan, jadi tidak ada
 * data yang tersimpan. Panggil di dalam `withTenant`.
 */
export async function previewAutoBilling(
  tx: Tx,
  input: {
    schoolId: string;
    feeTypeId: string;
    draft: AutoBillingRuleDraft;
    classIds: string[] | null;
    now: Date;
  },
): Promise<PreviewResult> {
  const ctx = await loadBillingContext(tx, input.schoolId, input.now);
  const empty: PreviewResult = {
    nextRuns: [],
    forPeriod: null,
    wouldCreate: null,
    alreadyBilled: null,
    free: null,
    missingPlan: null,
    error: null,
  };
  if (!ctx.year) return { ...empty, error: 'no_year' };
  const planned = plannedRuns(input.draft, ctx.year, ctx.semesters)
    .filter((p) => p.periodEnd >= ctx.today)
    .sort((a, b) => a.runDate.localeCompare(b.runDate));
  const next = planned.slice(0, 3);
  const nextRuns = next.map((p) => ({
    period: p.period,
    runDate: p.runDate,
    dueDate: p.dueDate,
    catchUp: p.runDate < ctx.today,
  }));
  const first = next[0];
  if (!first) {
    return { ...empty, nextRuns, error: input.draft.kind === 'semester' ? 'no_semester' : 'no_runs' };
  }
  try {
    await tx.transaction(async (sp) => {
      let classIds = input.classIds && input.classIds.length > 0 ? input.classIds : null;
      if (classIds) {
        const found = await sp
          .select({ id: classRoom.id })
          .from(classRoom)
          .where(and(inArray(classRoom.id, classIds), eq(classRoom.academicYearId, ctx.year!.id)));
        classIds = found.map((c) => c.id);
        if (classIds.length === 0)
          throw new FinanceGenerateError(400, 'invalid_reference', 'Kelas tidak valid.');
      }
      const r = await generateInvoices(sp, {
        schoolId: input.schoolId,
        actorId: AUTO_BILLING_ACTOR,
        academicYearId: ctx.year!.id,
        feeTypeId: input.feeTypeId,
        period: first.invoicePeriod,
        classIds,
        dueDate: first.dueDate,
        installments: input.draft.installments,
      });
      throw new PreviewRollback({
        created: r.created,
        skipped: r.skipped,
        free: r.free,
        missingPlan: r.missingPlan.length,
      });
    });
  } catch (error) {
    if (error instanceof PreviewRollback) {
      const p = error.payload;
      return {
        nextRuns,
        forPeriod: first.period,
        wouldCreate: p.created,
        alreadyBilled: p.skipped,
        free: p.free,
        missingPlan: p.missingPlan,
        error: null,
      };
    }
    if (error instanceof FinanceGenerateError) return { ...empty, nextRuns, error: error.code };
    throw error;
  }
  return { ...empty, nextRuns };
}
