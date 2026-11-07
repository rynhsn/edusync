import { describe, expect, it } from 'vitest';
import {
  type AutoBillingRuleDraft,
  type AutoBillingSemester,
  type AutoBillingYear,
  defaultManualRun,
  dueDateFor,
  evaluateRule,
  plannedRuns,
  upcomingRuns,
  validateAutoBillingRule,
} from './auto-billing';

const year: AutoBillingYear = { id: 'y1', name: '2026/2027', startsOn: '2026-07-01', endsOn: '2027-06-30' };
const semesters: AutoBillingSemester[] = [
  { startsOn: '2026-07-13', endsOn: '2026-12-19' },
  { startsOn: '2027-01-04', endsOn: '2027-06-26' },
];

const monthly = (over: Partial<AutoBillingRuleDraft> = {}): AutoBillingRuleDraft => ({
  kind: 'monthly',
  runDay: 5,
  dueMode: 'fixed_day',
  dueDay: 10,
  dueDays: null,
  semesterRun: null,
  semesterOffsetDays: null,
  runOn: null,
  installments: null,
  ...over,
});
const semesterRule = (over: Partial<AutoBillingRuleDraft> = {}): AutoBillingRuleDraft => ({
  kind: 'semester',
  runDay: null,
  dueMode: 'days_after',
  dueDay: null,
  dueDays: 14,
  semesterRun: 'start',
  semesterOffsetDays: null,
  runOn: null,
  installments: null,
  ...over,
});
const yearlyRule = (over: Partial<AutoBillingRuleDraft> = {}): AutoBillingRuleDraft => ({
  kind: 'yearly',
  runDay: null,
  dueMode: 'days_after',
  dueDay: null,
  dueDays: 30,
  semesterRun: null,
  semesterOffsetDays: null,
  runOn: '2026-08-01',
  installments: null,
  ...over,
});

const ctx = (today: string, done: string[] = [], y: AutoBillingYear | null = year) => ({
  today,
  year: y,
  semesters,
  done: new Set(done),
});

describe('dueDateFor', () => {
  it('jatuh tempo di bulan yang sama bila tanggalnya sesudah tanggal pembuatan', () => {
    expect(dueDateFor(monthly(), '2026-08-05')).toBe('2026-08-10');
  });
  it('tanggal jatuh tempo sama dengan tanggal pembuatan tetap di hari yang sama', () => {
    expect(dueDateFor(monthly({ dueDay: 5 }), '2026-08-05')).toBe('2026-08-05');
  });
  it('tanggal jatuh tempo lebih kecil dari tanggal pembuatan jatuh di bulan berikutnya', () => {
    expect(dueDateFor(monthly({ runDay: 25, dueDay: 3 }), '2026-08-25')).toBe('2026-09-03');
  });
  it('melewati pergantian tahun', () => {
    expect(dueDateFor(monthly({ runDay: 20, dueDay: 5 }), '2026-12-20')).toBe('2027-01-05');
  });
  it('run_day 28 di Februari dengan jatuh tempo lebih awal masuk Maret', () => {
    expect(dueDateFor(monthly({ runDay: 28, dueDay: 10 }), '2027-02-28')).toBe('2027-03-10');
  });
  it('days_after menambah hari kalender (Februari kabisat dan biasa)', () => {
    const r = monthly({ dueMode: 'days_after', dueDay: null, dueDays: 3 });
    expect(dueDateFor(r, '2027-02-28')).toBe('2027-03-03');
    expect(dueDateFor(r, '2028-02-28')).toBe('2028-03-02');
  });
  it('days_after 0 = hari yang sama', () => {
    expect(dueDateFor(monthly({ dueMode: 'days_after', dueDays: 0 }), '2026-09-05')).toBe('2026-09-05');
  });
});

describe('plannedRuns', () => {
  it('bulanan: 12 periode sepanjang tahun ajaran lintas tahun kalender', () => {
    const runs = plannedRuns(monthly(), year, semesters);
    expect(runs).toHaveLength(12);
    expect(runs[0]).toMatchObject({ period: '2026-07', runDate: '2026-07-05', dueDate: '2026-07-10' });
    expect(runs[5]).toMatchObject({ period: '2026-12', periodEnd: '2026-12-31' });
    expect(runs[6]?.period).toBe('2027-01');
    expect(runs[11]).toMatchObject({ period: '2027-06', periodEnd: '2027-06-30' });
  });
  it('bulanan: run_day 28 pada Februari tetap 28 Februari', () => {
    const runs = plannedRuns(monthly({ runDay: 28 }), year, semesters);
    expect(runs.find((r) => r.period === '2027-02')?.runDate).toBe('2027-02-28');
  });
  it('bulanan: tahun ajaran yang mulai di tengah bulan tetap memuat bulan itu', () => {
    const odd: AutoBillingYear = { ...year, startsOn: '2026-07-20' };
    expect(plannedRuns(monthly(), odd, semesters)[0]?.period).toBe('2026-07');
  });
  it('semester: tanggal jalan = mulai semester + selisih; S1/S2 urut menurut tanggal', () => {
    const reversed = [...semesters].reverse();
    const runs = plannedRuns(semesterRule({ semesterRun: 'custom', semesterOffsetDays: 7 }), year, reversed);
    expect(runs.map((r) => [r.period, r.runDate])).toEqual([
      ['S1', '2026-07-20'],
      ['S2', '2027-01-11'],
    ]);
    expect(runs[0]?.dueDate).toBe('2026-08-03');
  });
  it('semester: selisih negatif jatuh sebelum semester mulai', () => {
    const runs = plannedRuns(
      semesterRule({ semesterRun: 'custom', semesterOffsetDays: -14 }),
      year,
      semesters,
    );
    expect(runs[0]?.runDate).toBe('2026-06-29');
  });
  it('semester: lebih dari dua semester hanya S1 dan S2', () => {
    const three = [...semesters, { startsOn: '2027-06-27', endsOn: '2027-06-30' }];
    expect(plannedRuns(semesterRule(), year, three)).toHaveLength(2);
  });
  it('tahunan: runOn di luar tahun ajaran tidak menghasilkan jadwal', () => {
    expect(plannedRuns(yearlyRule({ runOn: '2025-08-01' }), year, semesters)).toEqual([]);
    expect(plannedRuns(yearlyRule({ runOn: '2027-07-01' }), year, semesters)).toEqual([]);
    const ok = plannedRuns(yearlyRule(), year, semesters);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ period: '2026/2027', invoicePeriod: null, dueDate: '2026-08-31' });
  });
  it('aturan tak sah tidak menghasilkan jadwal', () => {
    expect(plannedRuns(monthly({ runDay: null }), year, semesters)).toEqual([]);
  });
});

describe('evaluateRule', () => {
  it('bulanan: sebelum tanggal jalan belum jatuh tempo', () => {
    expect(evaluateRule(monthly(), ctx('2026-08-04'))).toEqual({ due: null, reason: 'not_yet' });
  });
  it('bulanan: tepat pada tanggal jalan periode bulan itu jatuh tempo', () => {
    const r = evaluateRule(monthly(), ctx('2026-08-05'));
    expect(r.due).toMatchObject({ period: '2026-08', dueDate: '2026-08-10' });
  });
  it('bulanan: catch-up, worker mati beberapa hari tetap membuat bulan berjalan', () => {
    const r = evaluateRule(monthly(), ctx('2026-08-27'));
    expect(r.due?.period).toBe('2026-08');
    expect(r.due?.dueDate).toBe('2026-08-10');
  });
  it('bulanan: sudah ada run ok untuk bulan itu', () => {
    expect(evaluateRule(monthly(), ctx('2026-08-27', ['2026-08']))).toEqual({
      due: null,
      reason: 'already_done',
    });
  });
  it('bulanan: tidak backfill bulan lalu yang terlewat', () => {
    // Juli dan Agustus tidak pernah dijalankan; pada 10 September hanya September yang dibuat.
    const r = evaluateRule(monthly(), ctx('2026-09-10'));
    expect(r.due?.period).toBe('2026-09');
  });
  it('bulanan: bulan berjalan belum waktunya walau bulan lalu terlewat (tidak mundur)', () => {
    expect(evaluateRule(monthly(), ctx('2026-09-02'))).toEqual({ due: null, reason: 'not_yet' });
  });
  it('bulanan: pergantian tahun kalender memakai periode 2027-01', () => {
    expect(evaluateRule(monthly(), ctx('2027-01-05', ['2026-12'])).due?.period).toBe('2027-01');
  });
  it('bulanan: Februari dengan run_day 28', () => {
    const rule = monthly({ runDay: 28 });
    expect(evaluateRule(rule, ctx('2027-02-27')).reason).toBe('not_yet');
    expect(evaluateRule(rule, ctx('2027-02-28')).due?.period).toBe('2027-02');
  });
  it('di luar tahun ajaran atau tanpa tahun ajaran aktif', () => {
    expect(evaluateRule(monthly(), ctx('2026-06-30')).reason).toBe('outside_year');
    expect(evaluateRule(monthly(), ctx('2027-07-01')).reason).toBe('outside_year');
    expect(evaluateRule(monthly(), ctx('2026-08-05', [], null)).reason).toBe('no_year');
  });
  it('aturan tak sah', () => {
    expect(evaluateRule(monthly({ runDay: 31 }), ctx('2026-08-05')).reason).toBe('invalid_rule');
  });
  it('semester start: jatuh tempo pada hari mulai semester, S1', () => {
    expect(evaluateRule(semesterRule(), ctx('2026-07-12')).reason).toBe('not_yet');
    const r = evaluateRule(semesterRule(), ctx('2026-07-13'));
    expect(r.due).toMatchObject({ period: 'S1', invoicePeriod: 'S1', dueDate: '2026-07-27' });
  });
  it('semester custom: menunggu selisih hari', () => {
    const rule = semesterRule({ semesterRun: 'custom', semesterOffsetDays: 10 });
    expect(evaluateRule(rule, ctx('2026-07-22')).reason).toBe('not_yet');
    expect(evaluateRule(rule, ctx('2026-07-23')).due?.period).toBe('S1');
  });
  it('semester: selisih negatif membuat sebelum semester mulai (di dalam tahun ajaran)', () => {
    const rule = semesterRule({ semesterRun: 'custom', semesterOffsetDays: -7 });
    // 2026-07-06 = 7 hari sebelum mulai S1 dan sudah di dalam tahun ajaran.
    expect(evaluateRule(rule, ctx('2026-07-06')).due?.period).toBe('S1');
  });
  it('semester: catch-up di tengah semester', () => {
    expect(evaluateRule(semesterRule(), ctx('2026-10-15')).due?.period).toBe('S1');
  });
  it('semester: semester kedua tanpa backfill S1', () => {
    const r = evaluateRule(semesterRule(), ctx('2027-02-01'));
    expect(r.due?.period).toBe('S2');
    expect(evaluateRule(semesterRule(), ctx('2027-02-01', ['S2'])).reason).toBe('already_done');
  });
  it('semester: jeda di antara semester tidak membuat apa pun bila S1 sudah usai', () => {
    // 2026-12-25: S1 sudah berakhir (19 Des), S2 baru mulai 4 Jan.
    expect(evaluateRule(semesterRule(), ctx('2026-12-25')).reason).toBe('not_yet');
  });
  it('semester: belum ada semester', () => {
    const empty = { today: '2026-07-20', year, semesters: [], done: new Set<string>() };
    expect(evaluateRule(semesterRule(), empty).reason).toBe('no_semester');
  });
  it('semester: hanya satu semester terdaftar menghasilkan S1 saja', () => {
    const one = {
      today: '2027-02-01',
      year,
      semesters: [semesters[0] as AutoBillingSemester],
      done: new Set<string>(),
    };
    expect(evaluateRule(semesterRule(), one).reason).toBe('not_yet');
  });
  it('tahunan dan sekali bayar: pada atau setelah runOn, sekali per tahun ajaran', () => {
    expect(evaluateRule(yearlyRule(), ctx('2026-07-31')).reason).toBe('not_yet');
    expect(evaluateRule(yearlyRule(), ctx('2026-08-01')).due?.period).toBe('2026/2027');
    expect(evaluateRule(yearlyRule(), ctx('2027-03-01')).due?.period).toBe('2026/2027');
    expect(evaluateRule(yearlyRule(), ctx('2027-03-01', ['2026/2027'])).reason).toBe('already_done');
    expect(evaluateRule(yearlyRule({ kind: 'one_time' }), ctx('2026-08-01')).due?.invoicePeriod).toBeNull();
  });
  it('tahunan: runOn lama (tahun ajaran sebelumnya) tidak memicu run di tahun ajaran baru', () => {
    expect(evaluateRule(yearlyRule({ runOn: '2025-08-01' }), ctx('2026-09-01')).reason).toBe(
      'run_on_outside_year',
    );
  });
});

describe('upcomingRuns', () => {
  it('tiga jadwal berikutnya, urut, melewati yang sudah selesai', () => {
    const runs = upcomingRuns(monthly(), ctx('2026-08-10', ['2026-08']), 3);
    expect(runs.map((r) => r.period)).toEqual(['2026-09', '2026-10', '2026-11']);
  });
  it('periode berjalan yang tertunda tampil lebih dulu (catch-up)', () => {
    const runs = upcomingRuns(monthly(), ctx('2026-08-10'), 3);
    expect(runs.map((r) => r.period)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(runs[0]?.runDate).toBe('2026-08-05');
  });
  it('mendekati akhir tahun ajaran daftar memendek', () => {
    const runs = upcomingRuns(monthly(), ctx('2027-05-10', ['2027-05']), 3);
    expect(runs.map((r) => r.period)).toEqual(['2027-06']);
  });
  it('tanpa tahun ajaran aktif kosong', () => {
    expect(upcomingRuns(monthly(), ctx('2026-08-10', [], null))).toEqual([]);
  });
  it('semester menampilkan S1 lalu S2', () => {
    const runs = upcomingRuns(semesterRule(), ctx('2026-07-01'), 3);
    expect(runs.map((r) => r.period)).toEqual(['S1', 'S2']);
  });
});

describe('defaultManualRun', () => {
  it('bulanan: bulan berjalan', () => {
    expect(defaultManualRun(monthly(), year, semesters, '2026-10-15')?.period).toBe('2026-10');
  });
  it('semester: semester berjalan, atau terakhir yang sudah mulai bila di jeda', () => {
    expect(defaultManualRun(semesterRule(), year, semesters, '2027-02-01')?.period).toBe('S2');
    expect(defaultManualRun(semesterRule(), year, semesters, '2026-12-25')?.period).toBe('S1');
  });
  it('sebelum ada periode yang mulai memakai yang pertama; tanpa tahun ajaran null', () => {
    expect(defaultManualRun(semesterRule(), year, semesters, '2026-07-02')?.period).toBe('S1');
    expect(defaultManualRun(monthly(), null, semesters, '2026-07-02')).toBeNull();
  });
});

describe('validateAutoBillingRule', () => {
  it('aturan sah tidak punya masalah', () => {
    expect(validateAutoBillingRule(monthly())).toEqual([]);
    expect(validateAutoBillingRule(semesterRule())).toEqual([]);
    expect(validateAutoBillingRule(yearlyRule({ installments: 6 }))).toEqual([]);
  });
  it('bulanan wajib runDay 1..28', () => {
    expect(validateAutoBillingRule(monthly({ runDay: null }))).toContainEqual({
      field: 'runDay',
      code: 'required',
    });
    expect(validateAutoBillingRule(monthly({ runDay: 29 }))).toContainEqual({
      field: 'runDay',
      code: 'invalid',
    });
    expect(validateAutoBillingRule(monthly({ runDay: 0 }))).toContainEqual({
      field: 'runDay',
      code: 'invalid',
    });
  });
  it('jatuh tempo menurut mode', () => {
    expect(validateAutoBillingRule(monthly({ dueDay: null }))).toContainEqual({
      field: 'dueDay',
      code: 'required',
    });
    expect(validateAutoBillingRule(monthly({ dueMode: 'days_after', dueDays: null }))).toContainEqual({
      field: 'dueDays',
      code: 'required',
    });
    expect(validateAutoBillingRule(monthly({ dueMode: 'days_after', dueDays: 200 }))).toContainEqual({
      field: 'dueDays',
      code: 'invalid',
    });
  });
  it('semester custom wajib selisih dalam batas', () => {
    expect(validateAutoBillingRule(semesterRule({ semesterRun: null }))).toContainEqual({
      field: 'semesterRun',
      code: 'required',
    });
    expect(validateAutoBillingRule(semesterRule({ semesterRun: 'custom' }))).toContainEqual({
      field: 'semesterOffsetDays',
      code: 'required',
    });
    expect(
      validateAutoBillingRule(semesterRule({ semesterRun: 'custom', semesterOffsetDays: 500 })),
    ).toContainEqual({ field: 'semesterOffsetDays', code: 'invalid' });
  });
  it('runOn wajib dan sah untuk tahunan; terlarang untuk bulanan', () => {
    expect(validateAutoBillingRule(yearlyRule({ runOn: null }))).toContainEqual({
      field: 'runOn',
      code: 'required',
    });
    expect(validateAutoBillingRule(yearlyRule({ runOn: '2026-13-40' }))).toContainEqual({
      field: 'runOn',
      code: 'invalid',
    });
    expect(validateAutoBillingRule(monthly({ runOn: '2026-08-01' }))).toContainEqual({
      field: 'runOn',
      code: 'not_allowed',
    });
  });
  it('cicilan tidak boleh untuk bulanan dan harus 2..12', () => {
    expect(validateAutoBillingRule(monthly({ installments: 3 }))).toContainEqual({
      field: 'installments',
      code: 'not_allowed',
    });
    expect(validateAutoBillingRule(yearlyRule({ installments: 1 }))).toContainEqual({
      field: 'installments',
      code: 'invalid',
    });
    expect(validateAutoBillingRule(yearlyRule({ installments: 13 }))).toContainEqual({
      field: 'installments',
      code: 'invalid',
    });
  });
});
