import { describe, expect, it } from 'vitest';
import {
  achievementRate,
  aggregationChange,
  aggregationOrDefault,
  buildOverrideRecord,
  cellStatus,
  decisionOf,
  formatPercent,
  hasLinkedObjectives,
  isClearingRecord,
  isFeedbackOnly,
  MAX_OBJECTIVES_PER_ASSESSMENT,
  OBJECTIVE_SCOPES,
  type ObjectiveLite,
  type OutcomeGroup,
  objectiveIdsChanged,
  objectiveLabel,
  overrideUnchanged,
  pendingCount,
  pickableGroups,
  scopeLabelKey,
  selectedObjectives,
  toggleObjective,
} from './objective-achievement';

const o = (id: string, code: string | null, description: string, active = true): ObjectiveLite => ({
  id,
  code,
  description,
  active,
});

const GROUPS: OutcomeGroup[] = [
  {
    outcomeId: 'cp1',
    outcomeCode: 'CP-1',
    phase: 'E',
    objectives: [o('a', 'TP1', 'Memahami jaringan'), o('b', 'TP2', 'Mengonfigurasi router', false)],
  },
  {
    outcomeId: 'cp2',
    outcomeCode: null,
    phase: 'F',
    objectives: [o('c', null, 'Mengamankan server'), o('d', 'TP9', 'Membuat laporan')],
  },
  { outcomeId: 'cp3', outcomeCode: 'CP-3', phase: 'F', objectives: [o('e', 'TP5', 'Lama', false)] },
];

describe('objectiveLabel', () => {
  it('memakai kode bila ada', () => {
    expect(objectiveLabel(o('a', 'TP1', 'Memahami'))).toBe('TP1 · Memahami');
    expect(objectiveLabel(o('a', null, 'Memahami'))).toBe('Memahami');
  });
});

describe('pickableGroups: penyaringan TP aktif', () => {
  it('membuang TP nonaktif dan CP yang menjadi kosong', () => {
    const g = pickableGroups(GROUPS, '');
    expect(g.map((x) => x.outcomeId)).toEqual(['cp1', 'cp2']);
    expect(g[0]?.objectives.map((x) => x.id)).toEqual(['a']);
    expect(g[1]?.objectives.map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('mencari di kode, isi, dan kode CP tanpa membedakan huruf besar', () => {
    expect(pickableGroups(GROUPS, 'ROUTER')).toEqual([]); // router sudah nonaktif
    expect(pickableGroups(GROUPS, 'amankan')[0]?.objectives.map((x) => x.id)).toEqual(['c']);
    expect(pickableGroups(GROUPS, 'tp9')[0]?.objectives.map((x) => x.id)).toEqual(['d']);
    // Kode CP cocok: seluruh TP aktif di CP itu tampil.
    expect(pickableGroups(GROUPS, 'cp-1')[0]?.objectives.map((x) => x.id)).toEqual(['a']);
  });

  it('tidak mengubah data masukan', () => {
    pickableGroups(GROUPS, 'x');
    expect(GROUPS[0]?.objectives).toHaveLength(2);
  });
});

describe('toggleObjective: batas 20 TP', () => {
  it('menambah dan melepas', () => {
    expect(toggleObjective([], 'a')).toEqual({ ids: ['a'], limited: false });
    expect(toggleObjective(['a', 'b'], 'a')).toEqual({ ids: ['b'], limited: false });
  });

  it('menolak penambahan di atas batas tetapi tetap boleh melepas', () => {
    const full = Array.from({ length: MAX_OBJECTIVES_PER_ASSESSMENT }, (_, i) => `id${i}`);
    expect(MAX_OBJECTIVES_PER_ASSESSMENT).toBe(20);
    const r = toggleObjective(full, 'baru');
    expect(r.limited).toBe(true);
    expect(r.ids).toEqual(full);
    expect(toggleObjective(full, 'id3').ids).toHaveLength(19);
  });
});

describe('selectedObjectives dan objectiveIdsChanged', () => {
  it('menampilkan TP terkait versi lama walau tak ada di daftar aktif', () => {
    const old = o('b', 'TP2', 'Lama', false);
    const sel = selectedObjectives(['b', 'a', 'zzz'], [old], [o('a', 'TP1', 'Baru')]);
    expect(sel.map((x) => x.id)).toEqual(['b', 'a']);
    expect(sel[0]?.active).toBe(false);
  });

  it('mendeteksi perubahan himpunan tanpa memperhatikan urutan', () => {
    expect(objectiveIdsChanged(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(objectiveIdsChanged(['a'], ['a', 'b'])).toBe(true);
    expect(objectiveIdsChanged(['a'], ['c'])).toBe(true);
    expect(objectiveIdsChanged([], [])).toBe(false);
  });
});

describe('scopeLabelKey', () => {
  it('menerjemahkan keenam asal ambang dan menolak yang tak dikenal', () => {
    for (const s of OBJECTIVE_SCOPES) expect(scopeLabelKey(s)).toBe(`oaScope_${s}`);
    expect(scopeLabelKey('lain')).toBeNull();
    expect(scopeLabelKey(null)).toBeNull();
  });
});

describe('status sel dan ringkasan', () => {
  it('cellStatus', () => {
    expect(cellStatus({ achieved: true })).toBe('achieved');
    expect(cellStatus({ achieved: false })).toBe('not_achieved');
    expect(cellStatus({ achieved: null })).toBe('undetermined');
  });

  it('formatPercent mengikuti bahasa dan menampilkan strip bila kosong', () => {
    expect(formatPercent(null, 'id')).toBe('-');
    expect(formatPercent(76.25, 'en')).toBe('76.3%');
    expect(formatPercent(76.25, 'id')).toBe('76,3%');
    expect(formatPercent(80, 'id')).toBe('80%');
  });

  it('achievementRate dan pendingCount', () => {
    expect(achievementRate({ assessed: 0, achieved: 0 })).toBeNull();
    expect(achievementRate({ assessed: 4, achieved: 3 })).toBe(75);
    expect(pendingCount({ assessed: 4 }, 10)).toBe(6);
    expect(pendingCount({ assessed: 12 }, 10)).toBe(0);
  });

  it('hasLinkedObjectives dan isFeedbackOnly', () => {
    expect(hasLinkedObjectives([])).toBe(false);
    expect(hasLinkedObjectives([{ assessmentCount: 0, formativeCount: 0 }])).toBe(false);
    expect(hasLinkedObjectives([{ assessmentCount: 0, formativeCount: 1 }])).toBe(true);
    expect(isFeedbackOnly({ assessmentCount: 0, formativeCount: 2 })).toBe(true);
    expect(isFeedbackOnly({ assessmentCount: 1, formativeCount: 2 })).toBe(false);
    expect(isFeedbackOnly({ assessmentCount: 0, formativeCount: 0 })).toBe(false);
  });
});

describe('keputusan guru: susunan isi permintaan', () => {
  it('decisionOf: hanya keputusan guru yang berstatus yang dianggap keputusan', () => {
    expect(decisionOf({ achieved: true, source: 'override' })).toBe('achieved');
    expect(decisionOf({ achieved: false, source: 'override' })).toBe('not_achieved');
    expect(decisionOf({ achieved: true, source: 'computed' })).toBe('follow');
    expect(decisionOf({ achieved: null, source: null })).toBe('follow');
    // Keputusan hanya berupa catatan: status tetap dari hitungan.
    expect(decisionOf({ achieved: false, source: 'computed' })).toBe('follow');
  });

  it('buildOverrideRecord', () => {
    expect(buildOverrideRecord('s1', 'o1', 'achieved', '')).toEqual({
      studentId: 's1',
      objectiveId: 'o1',
      achieved: true,
    });
    expect(buildOverrideRecord('s1', 'o1', 'not_achieved', '  Remedial belum tuntas  ')).toEqual({
      studentId: 's1',
      objectiveId: 'o1',
      achieved: false,
      note: 'Remedial belum tuntas',
    });
    expect(buildOverrideRecord('s1', 'o1', 'follow', 'Catatan saja')).toEqual({
      studentId: 's1',
      objectiveId: 'o1',
      note: 'Catatan saja',
    });
    expect(buildOverrideRecord('s1', 'o1', 'follow', 'x'.repeat(900)).note).toHaveLength(500);
  });

  it('"Ikuti hitungan" tanpa catatan = baris kosong yang menghapus keputusan', () => {
    const r = buildOverrideRecord('s1', 'o1', 'follow', '   ');
    expect(r).toEqual({ studentId: 's1', objectiveId: 'o1' });
    expect(isClearingRecord(r)).toBe(true);
    expect(isClearingRecord(buildOverrideRecord('s1', 'o1', 'achieved', ''))).toBe(false);
    expect(isClearingRecord(buildOverrideRecord('s1', 'o1', 'follow', 'a'))).toBe(false);
  });

  it('overrideUnchanged', () => {
    const cell = { achieved: false as boolean | null, source: 'override' as const, note: 'a' };
    expect(overrideUnchanged(cell, 'not_achieved', ' a ')).toBe(true);
    expect(overrideUnchanged(cell, 'achieved', 'a')).toBe(false);
    expect(overrideUnchanged(cell, 'not_achieved', 'b')).toBe(false);
    expect(overrideUnchanged({ achieved: null, source: null, note: null }, 'follow', '')).toBe(true);
  });
});

describe('aturan agregasi', () => {
  it('bawaan rata-rata', () => {
    expect(aggregationOrDefault(undefined)).toBe('mean');
    expect(aggregationOrDefault(null)).toBe('mean');
    expect(aggregationOrDefault('max')).toBe('max');
  });

  it('dikirim hanya bila berubah, termasuk kembali ke rata-rata', () => {
    expect(aggregationChange(undefined, 'mean')).toEqual({});
    expect(aggregationChange('latest', 'latest')).toEqual({});
    expect(aggregationChange(undefined, 'latest')).toEqual({ objectiveAggregation: 'latest' });
    expect(aggregationChange('max', 'mean')).toEqual({ objectiveAggregation: 'mean' });
  });
});
