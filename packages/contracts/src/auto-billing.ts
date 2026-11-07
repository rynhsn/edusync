/**
 * Penagihan otomatis sekolah: fungsi murni (tanpa basis data) untuk menentukan periode yang harus ditagih hari ini,
 * tanggal jatuh tempo, dan jadwal berikutnya. Dipakai bersama oleh API, worker, dan web.
 *
 * Aturan inti:
 * - Semua tanggal berbentuk TTTT-BB-HH menurut zona waktu sekolah; `today` sudah tanggal lokal sekolah.
 * - Bulanan: tagihan bulan M dibuat pada `runDay` bulan M (periode TTTT-BB = bulan yang ditagih).
 * - Semester: dibuat pada tanggal mulai semester + selisih hari (`start` = 0 hari, `custom` = selisih bebas).
 * - Tahunan dan sekali bayar: dibuat pada tanggal `runOn`, yang harus berada di dalam tahun ajaran aktif.
 * - Catch-up: bila penjadwal sempat mati, periode BERJALAN tetap dibuat begitu `today >= tanggal jalan` dan belum ada
 *   run `ok` untuk periode itu. Periode yang sudah lewat tidak pernah diisi mundur (tanpa backfill).
 */
import { addDays } from './finance-late-fee';

export const AUTO_BILLING_FEE_KINDS = ['monthly', 'semester', 'one_time', 'yearly'] as const;
export type AutoBillingKind = (typeof AUTO_BILLING_FEE_KINDS)[number];
export const AUTO_BILLING_DUE_MODES = ['fixed_day', 'days_after'] as const;
export type AutoBillingDueMode = (typeof AUTO_BILLING_DUE_MODES)[number];
export const AUTO_BILLING_SEMESTER_RUNS = ['start', 'custom'] as const;
export type AutoBillingSemesterRun = (typeof AUTO_BILLING_SEMESTER_RUNS)[number];
export const AUTO_BILLING_STATUSES = ['ok', 'partial', 'failed', 'skipped'] as const;
export type AutoBillingStatus = (typeof AUTO_BILLING_STATUSES)[number];
export const AUTO_BILLING_TRIGGERS = ['auto', 'manual'] as const;
export type AutoBillingTrigger = (typeof AUTO_BILLING_TRIGGERS)[number];

/** Batas nilai aturan (juga dipakai validasi API dan formulir web). */
export const AUTO_BILLING_LIMITS = {
  dayMin: 1,
  dayMax: 28,
  dueDaysMax: 120,
  offsetMin: -60,
  offsetMax: 180,
  installmentsMin: 2,
  installmentsMax: 12,
} as const;

export interface AutoBillingRuleDraft {
  kind: AutoBillingKind;
  /** Tanggal pembuatan tiap bulan (1..28); hanya biaya bulanan. */
  runDay: number | null;
  dueMode: AutoBillingDueMode;
  /** Tanggal jatuh tempo (1..28) untuk `fixed_day`. */
  dueDay: number | null;
  /** Hari setelah tanggal pembuatan untuk `days_after`. */
  dueDays: number | null;
  /** Hanya biaya semester. */
  semesterRun: AutoBillingSemesterRun | null;
  semesterOffsetDays: number | null;
  /** Tanggal pembuatan untuk biaya tahunan dan sekali bayar. */
  runOn: string | null;
  /** Cicilan 2..12; hanya biaya non-bulanan. */
  installments: number | null;
}

export interface AutoBillingYear {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface AutoBillingSemester {
  startsOn: string;
  endsOn: string;
}

export interface PlannedRun {
  /** Kunci periode pada log: TTTT-BB (bulanan), S1/S2 (semester), nama tahun ajaran (tahunan, sekali bayar). */
  period: string;
  /** Periode untuk tagihan (`generate`): TTTT-BB, S1/S2, atau null. */
  invoicePeriod: string | null;
  /** Tanggal pembuatan menurut aturan (belum dibatasi hari ini). */
  runDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
}

export type AutoBillingSkipReason =
  | 'invalid_rule'
  | 'no_year'
  | 'outside_year'
  | 'no_semester'
  | 'run_on_outside_year'
  | 'not_yet'
  | 'already_done';

export interface RuleIssue {
  field: 'runDay' | 'dueDay' | 'dueDays' | 'semesterRun' | 'semesterOffsetDays' | 'runOn' | 'installments';
  code: 'required' | 'invalid' | 'not_allowed';
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Tanggal pada bulan `year-month` dengan hari `day` yang dijepit ke akhir bulan. */
function dateInMonth(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(Math.max(1, day), daysInMonth(year, month)))}`;
}

function splitDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

/** Bulan berikutnya dari (tahun, bulan). */
function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Galat aturan; kosong bila sah. Dipakai API (400) dan formulir web (pesan merah per kolom). */
export function validateAutoBillingRule(rule: AutoBillingRuleDraft): RuleIssue[] {
  const L = AUTO_BILLING_LIMITS;
  const issues: RuleIssue[] = [];
  if (rule.kind === 'monthly') {
    if (rule.runDay === null) issues.push({ field: 'runDay', code: 'required' });
    else if (!isInt(rule.runDay, L.dayMin, L.dayMax)) issues.push({ field: 'runDay', code: 'invalid' });
  } else if (rule.runDay !== null) {
    issues.push({ field: 'runDay', code: 'not_allowed' });
  }
  if (rule.dueMode === 'fixed_day') {
    if (rule.dueDay === null) issues.push({ field: 'dueDay', code: 'required' });
    else if (!isInt(rule.dueDay, L.dayMin, L.dayMax)) issues.push({ field: 'dueDay', code: 'invalid' });
  } else if (rule.dueDays === null) {
    issues.push({ field: 'dueDays', code: 'required' });
  } else if (!isInt(rule.dueDays, 0, L.dueDaysMax)) {
    issues.push({ field: 'dueDays', code: 'invalid' });
  }
  if (rule.kind === 'semester') {
    if (rule.semesterRun === null) issues.push({ field: 'semesterRun', code: 'required' });
    else if (rule.semesterRun === 'custom') {
      if (rule.semesterOffsetDays === null) issues.push({ field: 'semesterOffsetDays', code: 'required' });
      else if (!isInt(rule.semesterOffsetDays, L.offsetMin, L.offsetMax)) {
        issues.push({ field: 'semesterOffsetDays', code: 'invalid' });
      }
    }
  } else if (rule.semesterRun !== null) {
    issues.push({ field: 'semesterRun', code: 'not_allowed' });
  }
  if (rule.kind === 'yearly' || rule.kind === 'one_time') {
    if (rule.runOn === null) issues.push({ field: 'runOn', code: 'required' });
    else if (!ISO_DATE.test(rule.runOn) || Number.isNaN(Date.parse(`${rule.runOn}T00:00:00Z`))) {
      issues.push({ field: 'runOn', code: 'invalid' });
    }
  } else if (rule.runOn !== null) {
    issues.push({ field: 'runOn', code: 'not_allowed' });
  }
  if (rule.installments !== null) {
    if (rule.kind === 'monthly') issues.push({ field: 'installments', code: 'not_allowed' });
    else if (!isInt(rule.installments, L.installmentsMin, L.installmentsMax)) {
      issues.push({ field: 'installments', code: 'invalid' });
    }
  }
  return issues;
}

/**
 * Jatuh tempo dari tanggal pembuatan. `fixed_day`: tanggal `dueDay` pada bulan tanggal pembuatan; bila `dueDay` lebih
 * kecil daripada harinya, jatuh di bulan berikutnya (hari dijepit ke akhir bulan). `days_after`: tanggal pembuatan + N hari.
 */
export function dueDateFor(rule: AutoBillingRuleDraft, runDate: string): string {
  if (rule.dueMode === 'days_after') return addDays(runDate, rule.dueDays ?? 0);
  const [y, m, d] = splitDate(runDate);
  const day = rule.dueDay ?? d;
  if (day < d) {
    const [ny, nm] = nextMonth(y, m);
    return dateInMonth(ny, nm, day);
  }
  return dateInMonth(y, m, day);
}

/** Selisih hari tanggal mulai semester untuk aturan semester (`start` = 0). */
function semesterOffset(rule: AutoBillingRuleDraft): number {
  return rule.semesterRun === 'custom' ? (rule.semesterOffsetDays ?? 0) : 0;
}

/** Semua periode yang direncanakan aturan pada satu tahun ajaran (belum disaring menurut hari ini atau log). */
export function plannedRuns(
  rule: AutoBillingRuleDraft,
  year: AutoBillingYear,
  semesters: readonly AutoBillingSemester[],
): PlannedRun[] {
  if (validateAutoBillingRule(rule).length > 0) return [];
  if (rule.kind === 'monthly') {
    const out: PlannedRun[] = [];
    let [y, m] = splitDate(year.startsOn);
    const [ey, em] = splitDate(year.endsOn);
    for (let guard = 0; guard < 24 && (y < ey || (y === ey && m <= em)); guard++) {
      const period = `${pad(y, 4)}-${pad(m)}`;
      const runDate = dateInMonth(y, m, rule.runDay as number);
      out.push({
        period,
        invoicePeriod: period,
        runDate,
        dueDate: dueDateFor(rule, runDate),
        periodStart: `${period}-01`,
        periodEnd: dateInMonth(y, m, 31),
      });
      [y, m] = nextMonth(y, m);
    }
    return out;
  }
  if (rule.kind === 'semester') {
    const sorted = [...semesters].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).slice(0, 2);
    return sorted.map((s, i) => {
      const period = i === 0 ? 'S1' : 'S2';
      const runDate = addDays(s.startsOn, semesterOffset(rule));
      return {
        period,
        invoicePeriod: period,
        runDate,
        dueDate: dueDateFor(rule, runDate),
        periodStart: s.startsOn,
        periodEnd: s.endsOn,
      };
    });
  }
  const runOn = rule.runOn as string;
  if (runOn < year.startsOn || runOn > year.endsOn) return [];
  return [
    {
      period: year.name,
      invoicePeriod: null,
      runDate: runOn,
      dueDate: dueDateFor(rule, runOn),
      periodStart: year.startsOn,
      periodEnd: year.endsOn,
    },
  ];
}

export interface EvaluateContext {
  /** Tanggal hari ini menurut zona waktu sekolah. */
  today: string;
  /** Tahun ajaran aktif; null bila tidak ada. */
  year: AutoBillingYear | null;
  semesters: readonly AutoBillingSemester[];
  /** Kunci periode (PlannedRun.period) yang sudah punya run otomatis berstatus `ok` pada tahun ajaran ini. */
  done: ReadonlySet<string>;
}

export interface EvaluateResult {
  due: PlannedRun | null;
  reason: AutoBillingSkipReason | null;
}

/**
 * Periode yang harus dibuat HARI INI (paling banyak satu), atau alasan tidak ada. Periode berjalan dianggap jatuh
 * tempo begitu `today >= tanggal jalan` dan hari ini masih di dalam periode itu (catch-up). Periode lampau tidak
 * pernah diambil (tanpa backfill); bila ada lebih dari satu kandidat, yang tanggal jalannya terbaru dipilih.
 */
export function evaluateRule(rule: AutoBillingRuleDraft, ctx: EvaluateContext): EvaluateResult {
  if (validateAutoBillingRule(rule).length > 0) return { due: null, reason: 'invalid_rule' };
  const { year, today } = ctx;
  if (!year) return { due: null, reason: 'no_year' };
  if (today < year.startsOn || today > year.endsOn) return { due: null, reason: 'outside_year' };
  const planned = plannedRuns(rule, year, ctx.semesters);
  if (planned.length === 0) {
    return { due: null, reason: rule.kind === 'semester' ? 'no_semester' : 'run_on_outside_year' };
  }
  const candidates = planned
    .filter((p) => p.runDate <= today && today <= p.periodEnd)
    .sort((a, b) => b.runDate.localeCompare(a.runDate));
  const due = candidates[0];
  if (!due) return { due: null, reason: 'not_yet' };
  if (ctx.done.has(due.period)) return { due: null, reason: 'already_done' };
  return { due, reason: null };
}

/** Beberapa jadwal berikutnya (paling banyak `count`) yang belum selesai dan periodenya belum lewat. Urut tanggal jalan. */
export function upcomingRuns(rule: AutoBillingRuleDraft, ctx: EvaluateContext, count = 3): PlannedRun[] {
  const { year } = ctx;
  if (!year) return [];
  return plannedRuns(rule, year, ctx.semesters)
    .filter((p) => p.periodEnd >= ctx.today && !ctx.done.has(p.period))
    .sort((a, b) => a.runDate.localeCompare(b.runDate))
    .slice(0, count);
}

/**
 * Periode bawaan untuk "Jalankan sekarang" bila pengguna tidak menyebut periode: yang memuat hari ini; bila tidak ada
 * (jeda antarsemester), periode terakhir yang sudah mulai; bila belum ada yang mulai, yang pertama.
 */
export function defaultManualRun(
  rule: AutoBillingRuleDraft,
  year: AutoBillingYear | null,
  semesters: readonly AutoBillingSemester[],
  today: string,
): PlannedRun | null {
  if (!year) return null;
  const planned = plannedRuns(rule, year, semesters);
  const containing = planned.find((p) => p.periodStart <= today && today <= p.periodEnd);
  if (containing) return containing;
  const started = planned.filter((p) => p.periodStart <= today);
  return started[started.length - 1] ?? planned[0] ?? null;
}
