import { checkCriteria } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import {
  appliesTo,
  buildBody,
  type CriteriaDraft,
  draftKkm,
  draftsEqual,
  emptyDraft,
  emptyLevel,
  formatKkm,
  formatRange,
  isBelowKkm,
  type LevelDraft,
  moveLevel,
  parseScore,
  pickKkm,
  switchMode,
  toDraft,
  validateDraft,
} from './kktp';

const scope = { subjectId: 's1', levelCode: 'X', programId: null, objectiveId: null };

const lv = (label: string, min: string, max: string, isAchieved = false, descriptor = ''): LevelDraft => ({
  ...emptyLevel(),
  label,
  min,
  max,
  isAchieved,
  descriptor,
});

const draft = (over: Partial<CriteriaDraft>): CriteriaDraft => ({ ...emptyDraft('interval'), ...over });

describe('parseScore', () => {
  it('kosong menjadi null', () => {
    expect(parseScore('')).toBeNull();
    expect(parseScore('   ')).toBeNull();
  });
  it('menerima koma atau titik desimal', () => {
    expect(parseScore('72,5')).toBe(72.5);
    expect(parseScore('72.5')).toBe(72.5);
    expect(parseScore('100')).toBe(100);
    expect(parseScore('0')).toBe(0);
    expect(parseScore('72,25')).toBe(72.25);
  });
  it('menolak lebih dari dua desimal, di luar 0..100, dan bukan angka', () => {
    expect(parseScore('72,255')).toBe('invalid');
    expect(parseScore('100,5')).toBe('invalid');
    expect(parseScore('-1')).toBe('invalid');
    expect(parseScore('abc')).toBe('invalid');
    expect(parseScore('1e2')).toBe('invalid');
    expect(parseScore('7,')).toBe('invalid');
  });
});

describe('formatKkm', () => {
  it('desimal dengan koma tanpa pembulatan ke bilangan bulat', () => {
    expect(formatKkm(72.5)).toBe('72,5');
    expect(formatKkm(75)).toBe('75');
    expect(formatKkm(72.25)).toBe('72,25');
    expect(formatKkm(72.5000001)).toBe('72,5');
  });
  it('tanpa nol sisa dan kosong menjadi strip', () => {
    expect(formatKkm(72.5)).not.toBe('72,50');
    expect(formatKkm(null)).toBe('-');
    expect(formatKkm(undefined)).toBe('-');
    expect(formatKkm(Number.NaN)).toBe('-');
  });
});

describe('pickKkm dan isBelowKkm', () => {
  it('KKM mapel dipakai bila ada, jika tidak KKM sekolah', () => {
    expect(pickKkm(72.5, 75)).toBe(72.5);
    expect(pickKkm(undefined, 75)).toBe(75);
    expect(pickKkm(null, 75)).toBe(75);
  });
  it('KKM mapel 0 tetap dipakai (bukan dianggap kosong)', () => {
    expect(pickKkm(0, 75)).toBe(0);
  });
  it('batas inklusif', () => {
    expect(isBelowKkm(72.5, 72.5)).toBe(false);
    expect(isBelowKkm(72.4, 72.5)).toBe(true);
    expect(isBelowKkm(null, 72.5)).toBe(false);
  });
});

describe('validateDraft numerik', () => {
  it('ambang wajib dan sah 0..100', () => {
    expect(validateDraft({ ...emptyDraft('numeric'), threshold: '' })).toEqual([
      { code: 'threshold_required' },
    ]);
    expect(validateDraft({ ...emptyDraft('numeric'), threshold: '101' })).toEqual([
      { code: 'threshold_invalid' },
    ]);
    expect(validateDraft({ ...emptyDraft('numeric'), threshold: '72,5' })).toEqual([]);
  });
});

describe('validateDraft level', () => {
  it('interval wajib punya level dan tiap level berlabel dan berangka', () => {
    expect(validateDraft(draft({ levels: [] }))).toEqual([{ code: 'levels_required' }]);
    expect(validateDraft(draft({ levels: [lv('', '0', '10')] }))).toEqual([
      { code: 'label_required', index: 0 },
    ]);
    expect(validateDraft(draft({ levels: [lv('A', '', '10')] }))).toEqual([
      { code: 'range_required', index: 0 },
    ]);
  });
  it('min tidak boleh melebihi max dan angka harus sah', () => {
    expect(validateDraft(draft({ levels: [lv('A', '80', '70')] }))).toEqual([
      { code: 'range_order', index: 0 },
    ]);
    expect(validateDraft(draft({ levels: [lv('A', 'x', '70')] }))).toEqual([
      { code: 'number_invalid', index: 0 },
    ]);
  });
  it('tumpang tindih, batas inklusif', () => {
    const issues = validateDraft(draft({ levels: [lv('Cukup', '60', '75'), lv('Baik', '75', '90')] }));
    expect(issues).toEqual([{ code: 'overlap', index: 0, other: 1 }]);
    expect(validateDraft(draft({ levels: [lv('Cukup', '60', '74,99'), lv('Baik', '75', '90')] }))).toEqual(
      [],
    );
  });
  it('deskriptor boleh tanpa angka dan tanpa level', () => {
    expect(validateDraft({ ...emptyDraft('descriptor'), levels: [] })).toEqual([]);
    expect(validateDraft({ ...emptyDraft('descriptor'), levels: [lv('Mulai berkembang', '', '')] })).toEqual(
      [],
    );
  });
  it('level lebih dari batas ditolak', () => {
    const many = Array.from({ length: 21 }, (_, i) => lv(`L${i}`, String(i), String(i)));
    expect(validateDraft(draft({ levels: many })).some((i) => i.code === 'too_many_levels')).toBe(true);
  });
});

describe('buildBody', () => {
  it('numerik: ambang desimal, tanpa level', () => {
    const r = buildBody(scope, { ...emptyDraft('numeric'), threshold: '72,5', note: '  catatan ' });
    expect(r).toEqual({
      ok: true,
      body: {
        subjectId: 's1',
        levelCode: 'X',
        programId: null,
        objectiveId: null,
        mode: 'numeric',
        threshold: 72.5,
        note: 'catatan',
        active: true,
        levels: [],
      },
    });
  });
  it('interval: urutan level dipertahankan, deskriptor dan catatan kosong menjadi null', () => {
    const r = buildBody(
      { ...scope, levelCode: null, programId: 'p1' },
      draft({
        levels: [lv(' Cukup ', '60', '74,5', false, ''), lv('Tuntas', '74,51', '100', true, ' Sudah ')],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.threshold).toBeNull();
    expect(r.body.levelCode).toBeNull();
    expect(r.body.programId).toBe('p1');
    expect(r.body.note).toBeNull();
    expect(r.body.levels).toEqual([
      { label: 'Cukup', descriptor: null, minScore: 60, maxScore: 74.5, isAchieved: false },
      { label: 'Tuntas', descriptor: 'Sudah', minScore: 74.51, maxScore: 100, isAchieved: true },
    ]);
  });
  it('mengembalikan masalah dan tidak membuat isi bila belum sah', () => {
    const r = buildBody(scope, draft({ levels: [lv('A', '0', '50'), lv('B', '50', '100')] }));
    expect(r).toEqual({ ok: false, issues: [{ code: 'overlap', index: 0, other: 1 }] });
  });
  it('isi yang dibangun selalu lolos checkCriteria server', () => {
    const drafts: CriteriaDraft[] = [
      { ...emptyDraft('numeric'), threshold: '0' },
      { ...emptyDraft('numeric'), threshold: '100' },
      draft({ levels: [lv('A', '0', '49,99', false), lv('B', '50', '100', true)] }),
      { ...emptyDraft('rubric'), levels: [lv('Baik', '70', '100', true, 'ok')] },
      { ...emptyDraft('descriptor'), levels: [lv('Berkembang', '', '', false)] },
      { ...emptyDraft('descriptor'), levels: [] },
    ];
    for (const d of drafts) {
      const r = buildBody(scope, d);
      expect(r.ok).toBe(true);
      if (r.ok) expect(checkCriteria(r.body)).toBeNull();
    }
  });
  it('validasi klien dan server sepakat pada kasus gagal', () => {
    const bad: CriteriaDraft[] = [
      { ...emptyDraft('numeric'), threshold: '' },
      draft({ levels: [] }),
      draft({ levels: [lv('A', '10', '5')] }),
      draft({ levels: [lv('A', '0', '60'), lv('B', '60', '100')] }),
    ];
    for (const d of bad) expect(buildBody(scope, d).ok).toBe(false);
  });
});

describe('toDraft, switchMode, draftsEqual', () => {
  it('kriteria server menjadi isian dan kembali sama', () => {
    const d = toDraft({
      mode: 'interval',
      threshold: null,
      note: null,
      active: true,
      levels: [{ label: 'Tuntas', descriptor: null, minScore: 72.5, maxScore: 100, isAchieved: true }],
    });
    expect(d.levels[0]).toMatchObject({ label: 'Tuntas', min: '72.5', max: '100', isAchieved: true });
    const r = buildBody(scope, d);
    expect(r.ok && r.body.levels[0]).toEqual({
      label: 'Tuntas',
      descriptor: null,
      minScore: 72.5,
      maxScore: 100,
      isAchieved: true,
    });
    expect(
      draftsEqual(
        d,
        toDraft({
          ...{ mode: 'interval' as const, threshold: null, note: null, active: true },
          levels: [{ label: 'Tuntas', descriptor: null, minScore: 72.5, maxScore: 100, isAchieved: true }],
        }),
      ),
    ).toBe(true);
  });
  it('pindah ke numerik membuang level, pindah dari numerik menyiapkan satu level', () => {
    const d = draft({ levels: [lv('A', '0', '10')] });
    expect(switchMode(d, 'numeric').levels).toEqual([]);
    const n = switchMode({ ...emptyDraft('numeric'), threshold: '70' }, 'rubric');
    expect(n.levels).toHaveLength(1);
    expect(n.threshold).toBe('');
  });
});

describe('moveLevel dan appliesTo dan formatRange', () => {
  it('geser level', () => {
    expect(moveLevel(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveLevel(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveLevel(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
  it('kriteria berlaku untuk filter bila cakupannya kosong atau sama', () => {
    const all = { levelCode: null, programId: null };
    const x = { levelCode: 'X', programId: null };
    expect(appliesTo(all, { levelCode: 'XI', programId: '' })).toBe(true);
    expect(appliesTo(x, { levelCode: 'XI', programId: '' })).toBe(false);
    expect(appliesTo(x, { levelCode: 'X', programId: 'p' })).toBe(true);
    expect(appliesTo({ levelCode: 'X', programId: 'p1' }, { levelCode: '', programId: 'p2' })).toBe(false);
  });
  it('rentang untuk tampilan', () => {
    expect(formatRange(60, 74.5)).toBe('60 – 74,5');
    expect(formatRange(60, null)).toBe('≥ 60');
    expect(formatRange(null, null)).toBe('');
  });
});

describe('draftKkm', () => {
  it('numerik memakai ambang; interval memakai nilai terkecil level tuntas', () => {
    expect(draftKkm({ ...emptyDraft('numeric'), threshold: '72,5' })).toBe(72.5);
    expect(draftKkm({ ...emptyDraft('numeric'), threshold: '' })).toBeNull();
    expect(
      draftKkm(
        draft({
          levels: [
            lv('Belum', '0', '59', false),
            lv('Cukup', '60', '79', true),
            lv('Baik', '80', '100', true),
          ],
        }),
      ),
    ).toBe(60);
    expect(draftKkm(draft({ levels: [lv('Belum', '0', '59', false)] }))).toBeNull();
    expect(draftKkm({ ...emptyDraft('descriptor'), levels: [lv('Tuntas', '', '', true)] })).toBeNull();
  });
});
