import { describe, expect, it } from 'vitest';
import {
  computeGraduationSuggestion,
  type GraduationConfig,
  graduationConfigSchema,
  renderNumberTemplate,
  roundScore,
  validateNumberTemplate,
} from './graduation';

const E1 = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa1';
const E2 = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa2';
const S1 = '019bbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb1';
const S2 = '019bbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb2';

const config = (over: Partial<GraduationConfig> = {}): GraduationConfig => ({
  reportWeight: 60,
  examWeights: { [E1]: 40 },
  reportScope: 'final_level',
  reportLevels: [],
  rounding: 'two_decimals',
  minAverage: null,
  minSubjectScore: null,
  requiredSubjectIds: [],
  criteriaText: null,
  ...over,
});

describe('konfigurasi kelulusan', () => {
  const base = {
    reportWeight: 60,
    examWeights: { [E1]: 40 },
    reportScope: 'final_level',
    rounding: 'integer',
    minAverage: null,
    minSubjectScore: null,
  };
  it('menerima konfigurasi sah dan mengisi nilai bawaan daftar', () => {
    const c = graduationConfigSchema.parse(base);
    expect(c.reportLevels).toEqual([]);
    expect(c.requiredSubjectIds).toEqual([]);
  });
  it('menolak jumlah bobot nol, bobot di luar 0..100, dan cakupan tingkat tanpa tingkat', () => {
    expect(graduationConfigSchema.safeParse({ ...base, reportWeight: 0, examWeights: {} }).success).toBe(
      false,
    );
    expect(graduationConfigSchema.safeParse({ ...base, reportWeight: 101 }).success).toBe(false);
    expect(graduationConfigSchema.safeParse({ ...base, reportWeight: -1 }).success).toBe(false);
    expect(graduationConfigSchema.safeParse({ ...base, reportScope: 'levels' }).success).toBe(false);
    expect(
      graduationConfigSchema.safeParse({ ...base, reportScope: 'levels', reportLevels: ['XII'] }).success,
    ).toBe(true);
  });
  it('menolak id ujian yang bukan uuid', () => {
    expect(graduationConfigSchema.safeParse({ ...base, examWeights: { x: 10 } }).success).toBe(false);
  });
});

describe('pembulatan', () => {
  it('setengah ke atas pada desimal yang dikonfigurasi', () => {
    expect(roundScore(84.5, 'integer')).toBe(85);
    expect(roundScore(84.449, 'integer')).toBe(84);
    expect(roundScore(1.005, 'two_decimals')).toBe(1.01);
    expect(roundScore(83.349, 'one_decimal')).toBe(83.3);
  });
});

describe('saran nilai kelulusan', () => {
  it('rata-rata tertimbang rapor dan ujian menurut bobot yang dikonfigurasi', () => {
    const r = computeGraduationSuggestion(config(), [
      { subjectId: S1, name: 'Matematika', reportFinals: [80, 90], exams: [{ examId: E1, value: 70 }] },
    ]);
    // rapor 85 * 60% + ujian 70 * 40% = 79
    expect(r.subjects[0]).toMatchObject({ report: 85, final: 79, missing: [] });
    expect(r.average).toBe(79);
    expect(r.incomplete).toBe(false);
    expect(r.meetsCriteria).toBe(true);
  });

  it('bobot dinormalkan: 3 dan 1 sama dengan 75 dan 25; bobot rapor 0 mengabaikan rapor', () => {
    const input = [{ subjectId: S1, name: 'A', reportFinals: [100], exams: [{ examId: E1, value: 60 }] }];
    expect(
      computeGraduationSuggestion(config({ reportWeight: 3, examWeights: { [E1]: 1 } }), input).average,
    ).toBe(90);
    expect(
      computeGraduationSuggestion(config({ reportWeight: 0, examWeights: { [E1]: 5 } }), input).average,
    ).toBe(60);
  });

  it('komponen berbobot tanpa nilai ditandai missing dan murid incomplete; nilai dihitung dari yang ada', () => {
    const r = computeGraduationSuggestion(config(), [
      { subjectId: S1, name: 'A', reportFinals: [80], exams: [] },
      { subjectId: S2, name: 'B', reportFinals: [null], exams: [{ examId: E1, value: 90 }] },
    ]);
    expect(r.subjects[0]).toMatchObject({ final: 80, missing: [E1] });
    expect(r.subjects[1]).toMatchObject({ final: 90, missing: ['report'] });
    expect(r.incomplete).toBe(true);
    expect(r.average).toBe(85);
  });

  it('ujian berbobot 0 tidak dihitung dan tidak dianggap kurang', () => {
    const r = computeGraduationSuggestion(config({ examWeights: { [E1]: 0 } }), [
      { subjectId: S1, name: 'A', reportFinals: [80], exams: [{ examId: E1, value: 10 }] },
    ]);
    expect(r.subjects[0]).toMatchObject({ final: 80, missing: [], exams: [] });
  });

  it('ambang rata-rata dan nilai mapel hanya menjadi saran lewat failures', () => {
    const subjects = [
      { subjectId: S1, name: 'A', reportFinals: [90], exams: [{ examId: E1, value: 90 }] },
      { subjectId: S2, name: 'B', reportFinals: [50], exams: [{ examId: E1, value: 50 }] },
    ];
    const r = computeGraduationSuggestion(config({ minAverage: 75, minSubjectScore: 60 }), subjects);
    expect(r.average).toBe(70);
    expect(r.meetsCriteria).toBe(false);
    expect(r.failures).toEqual([{ code: 'below_average' }, { code: 'below_subject', subjectId: S2 }]);
  });

  it('mapel wajib: ambang hanya berlaku untuknya dan yang tak bernilai menggagalkan', () => {
    const subjects = [
      { subjectId: S1, name: 'A', reportFinals: [40], exams: [{ examId: E1, value: 40 }] },
      { subjectId: S2, name: 'B', reportFinals: [90], exams: [{ examId: E1, value: 90 }] },
    ];
    const ok = computeGraduationSuggestion(
      config({ minSubjectScore: 60, requiredSubjectIds: [S2] }),
      subjects,
    );
    expect(ok.failures).toEqual([]);
    const missing = computeGraduationSuggestion(config({ requiredSubjectIds: [S1, E2] }), [subjects[1]!]);
    expect(missing.failures).toEqual([
      { code: 'required_missing', subjectId: S1 },
      { code: 'required_missing', subjectId: E2 },
    ]);
  });

  it('tanpa mapel bernilai: no_scores dan rata-rata null', () => {
    const r = computeGraduationSuggestion(config(), []);
    expect(r).toMatchObject({ average: null, meetsCriteria: false, failures: [{ code: 'no_scores' }] });
  });
});

describe('templat nomor SKL', () => {
  it('memvalidasi: wajib memuat {seq}, hanya token dikenal, panjang', () => {
    expect(validateNumberTemplate('{seq}/SKL/{year}')).toBeNull();
    expect(validateNumberTemplate('{seq:3}/SKL')).toBeNull();
    expect(validateNumberTemplate('')).toBe('empty');
    expect(validateNumberTemplate('SKL/{year}')).toBe('noSeq');
    expect(validateNumberTemplate('{seq}/{nama}')).toBe('unknownToken');
    expect(validateNumberTemplate('x'.repeat(81))).toBe('tooLong');
  });
  it('mengisi urutan (dengan nol di depan) dan tahun', () => {
    expect(renderNumberTemplate('{seq}/SKL/{year}', { seq: 7, year: 2027 })).toBe('7/SKL/2027');
    expect(renderNumberTemplate('421.3/{seq:4}/SKL/{year}', { seq: 7, year: 2027 })).toBe(
      '421.3/0007/SKL/2027',
    );
  });
});

describe('syarat UKK opsional (tahap 5.6)', () => {
  const subjects = [{ subjectId: S1, name: 'A', reportFinals: [80], exams: [{ examId: E1, value: 80 }] }];
  it('tanpa kunci atau tanpa status UKK: hasil persis seperti sebelumnya', () => {
    const base = computeGraduationSuggestion(config(), subjects);
    expect(computeGraduationSuggestion(config(), subjects, 'none')).toEqual(base);
    expect(computeGraduationSuggestion(config({ requireUkkCompetent: false }), subjects, 'none')).toEqual(
      base,
    );
    expect(computeGraduationSuggestion(config({ requireUkkCompetent: true }), subjects)).toEqual(base);
    expect(graduationConfigSchema.parse({ ...config() })).not.toHaveProperty('requireUkkCompetent');
  });
  it('dinyalakan: belum kompeten dan belum ada hasil hanya menjadi saran (failures)', () => {
    const on = config({ requireUkkCompetent: true });
    expect(computeGraduationSuggestion(on, subjects, 'competent').failures).toEqual([]);
    const no = computeGraduationSuggestion(on, subjects, 'not_competent');
    expect(no.failures).toEqual([{ code: 'ukk_not_competent' }]);
    expect(no.meetsCriteria).toBe(false);
    expect(computeGraduationSuggestion(on, subjects, 'none').failures).toEqual([{ code: 'ukk_missing' }]);
  });
});
