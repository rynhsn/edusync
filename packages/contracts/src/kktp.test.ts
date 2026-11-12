import { describe, expect, it } from 'vitest';
import {
  checkCriteria,
  effectiveThreshold,
  findOverlap,
  isAchieved,
  isCriteriaMode,
  type KktpRow,
  resolveKkm,
} from './kktp';

const lv = (label: string, minScore: number | null, maxScore: number | null, isAchieved: boolean) => ({
  label,
  minScore,
  maxScore,
  isAchieved,
});

const rubric = [lv('Belum', 0, 59.99, false), lv('Cukup', 60, 79.5, true), lv('Baik', 79.51, 100, true)];

const row = (p: Partial<KktpRow> & { id: string }): KktpRow => ({
  mode: 'numeric',
  threshold: 70,
  levels: [],
  levelCode: null,
  programId: null,
  objectiveId: null,
  active: true,
  ...p,
});

describe('effectiveThreshold', () => {
  it('numeric memakai ambang desimal apa adanya', () => {
    expect(effectiveThreshold({ mode: 'numeric', threshold: 72.5 })).toBe(72.5);
    expect(effectiveThreshold({ mode: 'numeric', threshold: null })).toBeNull();
  });

  it('interval dan rubrik memakai min_score terkecil level tercapai', () => {
    expect(effectiveThreshold({ mode: 'interval', levels: rubric })).toBe(60);
    expect(effectiveThreshold({ mode: 'rubric', levels: [...rubric].reverse() })).toBe(60);
  });

  it('level tercapai tanpa min_score diabaikan; tanpa satu pun hasilnya null', () => {
    const levels = [lv('Tercapai', null, null, true), lv('Belum', 0, 50, false)];
    expect(effectiveThreshold({ mode: 'descriptor', levels })).toBeNull();
    expect(effectiveThreshold({ mode: 'descriptor', levels: [...levels, lv('Mahir', 85, 100, true)] })).toBe(
      85,
    );
    expect(effectiveThreshold({ mode: 'rubric', levels: [lv('Belum', 0, 100, false)] })).toBeNull();
    expect(effectiveThreshold({ mode: 'interval' })).toBeNull();
  });
});

describe('isAchieved', () => {
  it('numeric: nilai >= ambang (batas termasuk)', () => {
    expect(isAchieved(75, { mode: 'numeric', threshold: 75 })).toBe(true);
    expect(isAchieved(74.99, { mode: 'numeric', threshold: 75 })).toBe(false);
    expect(isAchieved(80, { mode: 'numeric', threshold: null })).toBeNull();
  });

  it('interval/rubrik: level yang memuat nilai menentukan, batas inklusif', () => {
    expect(isAchieved(59.99, { mode: 'interval', levels: rubric })).toBe(false);
    expect(isAchieved(60, { mode: 'interval', levels: rubric })).toBe(true);
    expect(isAchieved(100, { mode: 'rubric', levels: rubric })).toBe(true);
    expect(isAchieved(0, { mode: 'rubric', levels: rubric })).toBe(false);
  });

  it('nilai di celah antarlevel dianggap belum tercapai; deskriptor tanpa angka tak dapat ditentukan', () => {
    expect(isAchieved(59.995, { mode: 'interval', levels: rubric })).toBe(false);
    expect(isAchieved(50, { mode: 'descriptor', levels: [lv('Tercapai', null, null, true)] })).toBeNull();
    expect(isAchieved(50, { mode: 'descriptor', levels: [lv('Baik', 40, 60, true)] })).toBe(true);
  });
});

describe('findOverlap dan checkCriteria', () => {
  it('mendeteksi rentang bertumpuk termasuk yang bersentuhan di batas', () => {
    expect(findOverlap(rubric)).toBeNull();
    expect(findOverlap([lv('A', 0, 60, false), lv('B', 60, 100, true)])).toEqual(['A', 'B']);
    expect(findOverlap([lv('A', null, null, false), lv('B', null, null, true)])).toBeNull();
  });

  it('numeric: wajib ambang 0..100 dan tanpa level', () => {
    expect(checkCriteria({ mode: 'numeric', threshold: 70.5 })).toBeNull();
    expect(checkCriteria({ mode: 'numeric' })?.code).toBe('invalid_criteria');
    expect(checkCriteria({ mode: 'numeric', threshold: 101 })?.code).toBe('invalid_criteria');
    expect(checkCriteria({ mode: 'numeric', threshold: 70, levels: [lv('x', 0, 1, true)] })?.code).toBe(
      'invalid_criteria',
    );
  });

  it('interval/rubrik: wajib level berangka; deskriptor boleh tanpa angka', () => {
    expect(checkCriteria({ mode: 'interval', levels: rubric })).toBeNull();
    expect(checkCriteria({ mode: 'rubric' })?.code).toBe('invalid_criteria');
    expect(checkCriteria({ mode: 'interval', levels: [lv('x', 10, null, true)] })?.code).toBe(
      'invalid_criteria',
    );
    expect(checkCriteria({ mode: 'descriptor', levels: [lv('Tercapai', null, null, true)] })).toBeNull();
    expect(checkCriteria({ mode: 'descriptor' })).toBeNull();
  });

  it('menolak min > max, di luar 0..100, dan ambang pada mode non-numerik', () => {
    expect(checkCriteria({ mode: 'interval', levels: [lv('x', 80, 70, true)] })?.code).toBe(
      'invalid_criteria',
    );
    expect(checkCriteria({ mode: 'interval', levels: [lv('x', -1, 70, true)] })?.code).toBe(
      'invalid_criteria',
    );
    expect(checkCriteria({ mode: 'interval', levels: [lv('x', 0, 101, true)] })?.code).toBe(
      'invalid_criteria',
    );
    expect(checkCriteria({ mode: 'rubric', threshold: 60, levels: rubric })?.code).toBe('invalid_criteria');
  });

  it('level bertumpuk menghasilkan overlapping_levels', () => {
    const p = checkCriteria({ mode: 'interval', levels: [lv('A', 0, 70, false), lv('B', 70, 100, true)] });
    expect(p?.code).toBe('overlapping_levels');
  });

  it('mengenali mode', () => {
    expect(isCriteriaMode('rubric')).toBe(true);
    expect(isCriteriaMode('weighted')).toBe(false);
  });
});

describe('resolveKkm (urutan fallback)', () => {
  const P = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
  const rows: KktpRow[] = [
    row({ id: 'subj', threshold: 60 }),
    row({ id: 'subj-prog', programId: P, threshold: 65 }),
    row({ id: 'subj-lvl', levelCode: '10', threshold: 70 }),
    row({ id: 'subj-lvl-prog', levelCode: '10', programId: P, threshold: 72.5 }),
  ];

  it('tanpa kriteria jatuh ke KKM sekolah', () => {
    expect(resolveKkm([], { levelCode: '10', programId: P }, 75)).toEqual({
      kkm: 75,
      scope: 'settings',
      criteriaId: null,
    });
  });

  it('memakai tingkat paling spesifik dulu', () => {
    expect(resolveKkm(rows, { levelCode: '10', programId: P }, 75)).toMatchObject({
      kkm: 72.5,
      scope: 'subject_level_program',
      criteriaId: 'subj-lvl-prog',
    });
    expect(resolveKkm(rows, { levelCode: '10', programId: null }, 75)).toMatchObject({
      kkm: 70,
      scope: 'subject_level',
    });
    expect(resolveKkm(rows, { levelCode: '11', programId: P }, 75)).toMatchObject({
      kkm: 65,
      scope: 'subject_program',
    });
    expect(resolveKkm(rows, { levelCode: '11', programId: null }, 75)).toMatchObject({
      kkm: 60,
      scope: 'subject',
    });
  });

  it('(mapel, tingkat) mengalahkan (mapel, program) bila program kelas tidak punya kriteria sendiri', () => {
    const r = [rows[1] as KktpRow, rows[2] as KktpRow];
    expect(resolveKkm(r, { levelCode: '10', programId: P }, 75)).toMatchObject({
      kkm: 70,
      scope: 'subject_level',
    });
  });

  it('melewati kriteria nonaktif, kriteria TP, dan yang ambangnya tak dapat dihitung', () => {
    const r: KktpRow[] = [
      row({ id: 'off', levelCode: '10', threshold: 50, active: false }),
      row({ id: 'tp', levelCode: '10', threshold: 40, objectiveId: 'obj' }),
      row({
        id: 'desc',
        levelCode: '10',
        mode: 'descriptor',
        threshold: null,
        levels: [lv('T', null, null, true)],
      }),
      row({ id: 'subj', threshold: 68 }),
    ];
    expect(resolveKkm(r, { levelCode: '10', programId: null }, 75)).toMatchObject({
      kkm: 68,
      scope: 'subject',
      criteriaId: 'subj',
    });
  });

  it('mode rubrik ikut menentukan KKM lewat min_score level tercapai', () => {
    const r: KktpRow[] = [row({ id: 'rub', mode: 'rubric', threshold: null, levels: rubric })];
    expect(resolveKkm(r, { levelCode: null, programId: null }, 75)).toMatchObject({
      kkm: 60,
      criteriaId: 'rub',
    });
  });

  it('kelas tanpa tingkat dan program hanya memakai kriteria mapel', () => {
    expect(resolveKkm(rows, { levelCode: null, programId: null }, 75)).toMatchObject({
      kkm: 60,
      scope: 'subject',
    });
  });
});
