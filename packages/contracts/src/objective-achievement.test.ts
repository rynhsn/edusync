import { describe, expect, it } from 'vitest';
import { gradingConfigVersionOf } from './grading-config';
import { type KktpRow, resolveKkm, resolveObjectiveCriteria } from './kktp';
import {
  aggregateObjectivePercent,
  levelLabelOf,
  mergeObjectiveCell,
  type ObjectiveScoreEntry,
  objectiveStatus,
  summarizeObjective,
} from './objective-achievement';

const lv = (label: string, minScore: number | null, maxScore: number | null, isAchieved: boolean) => ({
  label,
  minScore,
  maxScore,
  isAchieved,
});

const row = (p: Partial<KktpRow> & { id: string }): KktpRow => ({
  mode: 'numeric',
  threshold: 70,
  levels: [],
  levelCode: null,
  programId: null,
  objectiveId: 'tp',
  active: true,
  ...p,
});

const entry = (value: number, date: string, max = 100, order?: string): ObjectiveScoreEntry => ({
  value,
  max,
  date,
  ...(order ? { order } : {}),
});

describe('aggregateObjectivePercent', () => {
  const entries = [entry(60, '2026-08-01'), entry(90, '2026-09-01'), entry(45, '2026-10-01', 50)];

  it('tanpa skor: null pada semua aturan', () => {
    for (const mode of ['mean', 'latest', 'max'] as const) {
      expect(aggregateObjectivePercent([], mode)).toBeNull();
    }
  });

  it('mean: rata-rata persen (maksimum berbeda dinormalisasi), dibulatkan 2 desimal', () => {
    expect(aggregateObjectivePercent(entries, 'mean')).toBe(80);
    expect(aggregateObjectivePercent(entries)).toBe(80);
    expect(aggregateObjectivePercent([entry(1, '2026-08-01', 3), entry(1, '2026-08-02', 3)], 'mean')).toBe(
      33.33,
    );
  });

  it('latest: penilaian terbaru menurut tanggal, bukan urutan masuk', () => {
    expect(aggregateObjectivePercent(entries, 'latest')).toBe(90);
    expect(aggregateObjectivePercent([...entries].reverse(), 'latest')).toBe(90);
  });

  it('latest: tanggal sama dipecah `order`', () => {
    const tie = [entry(50, '2026-08-01', 100, 'a'), entry(70, '2026-08-01', 100, 'b')];
    expect(aggregateObjectivePercent(tie, 'latest')).toBe(70);
    expect(aggregateObjectivePercent([...tie].reverse(), 'latest')).toBe(70);
  });

  it('max: persen tertinggi', () => {
    expect(aggregateObjectivePercent(entries, 'max')).toBe(90);
    expect(aggregateObjectivePercent([entry(10, '2026-08-01', 10), entry(60, '2026-08-02')], 'max')).toBe(
      100,
    );
  });
});

describe('objectiveStatus: empat mode kriteria per TP', () => {
  const kkm = resolveKkm([], { levelCode: null, programId: null }, 75);
  const target = { levelCode: null, programId: null };
  const status = (r: KktpRow, percent: number) =>
    objectiveStatus(percent, resolveObjectiveCriteria([r], 'tp', target), kkm);

  it('numeric: tercapai bila persen >= ambang; tanpa label level', () => {
    const r = row({ id: 'n', mode: 'numeric', threshold: 65 });
    expect(status(r, 65)).toEqual({ achieved: true, levelLabel: null, scope: 'objective', threshold: 65 });
    expect(status(r, 64.99).achieved).toBe(false);
  });

  it('interval: level yang memuat persen menentukan; di luar semua level = belum', () => {
    const r = row({
      id: 'i',
      mode: 'interval',
      threshold: null,
      levels: [lv('Belum', 0, 59.99, false), lv('Cukup', 60, 79.99, true), lv('Baik', 80, 100, true)],
    });
    expect(status(r, 85)).toMatchObject({ achieved: true, levelLabel: 'Baik', threshold: 60 });
    expect(status(r, 30)).toMatchObject({ achieved: false, levelLabel: 'Belum' });
    expect(status(r, 59.995)).toMatchObject({ achieved: false, levelLabel: null });
  });

  it('rubric: sama dengan interval (rentang per level)', () => {
    const r = row({
      id: 'r',
      mode: 'rubric',
      threshold: null,
      levels: [lv('Mulai', 0, 69, false), lv('Mahir', 70, 100, true)],
    });
    expect(status(r, 70)).toMatchObject({ achieved: true, levelLabel: 'Mahir' });
    expect(status(r, 69)).toMatchObject({ achieved: false, levelLabel: 'Mulai' });
  });

  it('descriptor: dengan rentang angka seperti interval; tanpa rentang = null (perlu keputusan guru)', () => {
    const ranged = row({
      id: 'd1',
      mode: 'descriptor',
      threshold: null,
      levels: [lv('Berkembang', 0, 74, false), lv('Tercapai', 75, 100, true)],
    });
    expect(status(ranged, 80)).toMatchObject({ achieved: true, levelLabel: 'Tercapai' });
    const bare = row({
      id: 'd2',
      mode: 'descriptor',
      threshold: null,
      levels: [lv('Tercapai', null, null, true)],
    });
    expect(status(bare, 99)).toMatchObject({ achieved: null, levelLabel: null, threshold: null });
  });

  it('empat jenjang cakupan memilih kriteria yang berbeda dan melaporkan scope-nya', () => {
    const rows = [
      row({ id: 'a', threshold: 10 }),
      row({ id: 'b', programId: 'p', threshold: 20 }),
      row({ id: 'c', levelCode: '10', threshold: 30 }),
      row({ id: 'd', levelCode: '10', programId: 'p', threshold: 40 }),
    ];
    const pick = (levelCode: string | null, programId: string | null) =>
      objectiveStatus(35, resolveObjectiveCriteria(rows, 'tp', { levelCode, programId }), kkm);
    expect(pick('10', 'p')).toMatchObject({
      scope: 'objective_level_program',
      threshold: 40,
      achieved: false,
    });
    expect(pick('10', null)).toMatchObject({ scope: 'objective_level', threshold: 30, achieved: true });
    expect(pick('11', 'p')).toMatchObject({ scope: 'objective_program', threshold: 20 });
    expect(pick('11', null)).toMatchObject({ scope: 'objective', threshold: 10 });
  });

  it('tanpa kriteria TP: jatuh ke KKM mapel, lalu KKM sekolah', () => {
    const subjectKkm = resolveKkm(
      [row({ id: 'k', objectiveId: null, threshold: 60 })],
      { levelCode: null, programId: null },
      75,
    );
    expect(objectiveStatus(65, null, subjectKkm)).toEqual({
      achieved: true,
      levelLabel: null,
      scope: 'subject_kkm',
      threshold: 60,
    });
    expect(objectiveStatus(65, null, kkm)).toEqual({
      achieved: false,
      levelLabel: null,
      scope: 'school_kkm',
      threshold: 75,
    });
  });
});

describe('levelLabelOf', () => {
  it('numerik tidak punya label; batas level inklusif', () => {
    expect(levelLabelOf(80, row({ id: 'x', mode: 'numeric' }))).toBeNull();
    const r = row({ id: 'y', mode: 'interval', threshold: null, levels: [lv('A', 0, 50, false)] });
    expect(levelLabelOf(50, r)).toBe('A');
    expect(levelLabelOf(50.01, r)).toBeNull();
  });
});

describe('mergeObjectiveCell: override menang', () => {
  const status = { achieved: false, levelLabel: 'Belum', scope: 'objective' as const, threshold: 70 };
  const computed = { percent: 55, status, scoredCount: 2 };

  it('tanpa override: sumber hitung', () => {
    expect(mergeObjectiveCell(computed, null)).toMatchObject({
      percent: 55,
      achieved: false,
      source: 'computed',
      levelLabel: 'Belum',
      note: null,
    });
  });

  it('override berstatus menang atas hitungan (juga yang tidak tercapai -> tercapai)', () => {
    const cell = mergeObjectiveCell(computed, {
      achieved: true,
      levelLabel: 'Mahir',
      note: 'remedial lisan',
    });
    expect(cell).toMatchObject({
      percent: 55,
      achieved: true,
      source: 'override',
      levelLabel: 'Mahir',
      note: 'remedial lisan',
    });
  });

  it('override tanpa status hanya menambah label dan catatan', () => {
    expect(mergeObjectiveCell(computed, { achieved: null, levelLabel: null, note: 'catatan' })).toMatchObject(
      {
        achieved: false,
        source: 'computed',
        levelLabel: 'Belum',
        note: 'catatan',
      },
    );
  });

  it('TP tanpa angka: override mengisi status; tanpa override sumber null', () => {
    const none = { percent: null, status: null, scoredCount: 0 };
    expect(mergeObjectiveCell(none, null)).toMatchObject({ achieved: null, source: null, scope: null });
    expect(mergeObjectiveCell(none, { achieved: true, levelLabel: null, note: null })).toMatchObject({
      achieved: true,
      source: 'override',
      percent: null,
    });
  });

  it('formatif dibawa terpisah dan tidak memengaruhi status', () => {
    const cell = mergeObjectiveCell({ ...computed, formative: { average: 95, count: 3 } }, null);
    expect(cell.formative).toEqual({ average: 95, count: 3 });
    expect(cell.achieved).toBe(false);
    expect(mergeObjectiveCell(computed, null)).not.toHaveProperty('formative');
  });
});

describe('summarizeObjective', () => {
  it('menghitung hanya sel yang berstatus', () => {
    const mk = (achieved: boolean | null) =>
      mergeObjectiveCell(
        {
          percent: achieved === null ? null : 80,
          status:
            achieved === null ? null : { achieved, levelLabel: null, scope: 'objective', threshold: 70 },
          scoredCount: 1,
        },
        null,
      );
    expect(summarizeObjective([mk(true), mk(false), mk(null), mk(true)])).toEqual({
      assessed: 3,
      achieved: 2,
    });
  });
});

describe('gradingConfigVersionOf (3.3)', () => {
  it('v2 hanya bila ada kriteria TP atau agregasi bukan bawaan', () => {
    expect(gradingConfigVersionOf([])).toBe(1);
    expect(gradingConfigVersionOf([], { objectiveCriteria: [], objectiveAggregation: null })).toBe(1);
    expect(gradingConfigVersionOf([], { objectiveAggregation: 'mean' })).toBe(1);
    expect(gradingConfigVersionOf([], { objectiveAggregation: 'latest' })).toBe(2);
    expect(gradingConfigVersionOf([], { objectiveCriteria: [{}] })).toBe(2);
  });
});
