import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import {
  buildChoiceBody,
  buildRuleBody,
  type CellState,
  cellKey,
  countChanges,
  EMPTY_RULE,
  groupKeyFor,
  indexCells,
  isChecked,
  isChoiceLocked,
  kindOfKey,
  normalizeUnmatchedReason,
  parseCount,
  participationChanges,
  presetFor,
  problemOf,
  type RuleResultLike,
  rangeKind,
  ruleToDraft,
  scoredWhenEnabling,
  slugGroupKey,
  summarizeWarnings,
  toggleDraft,
  validateRule,
} from './subject-choice';

const S1 = 's1';
const S2 = 's2';
const M1 = 'm1';
const M2 = 'm2';
const SEM = 'sem1';

const entry = (studentId: string, subjectId: string, semesterId: string | null = null) => ({
  studentId,
  subjectId,
  semesterId,
  source: 'choice' as const,
  note: null,
});

describe('indeks sel pilihan', () => {
  it('baris setahun menjadi sel year, baris semester menjadi partial', () => {
    const cells = indexCells([entry(S1, M1), entry(S1, M2, SEM)]);
    expect(cells.get(cellKey(S1, M1))?.kind).toBe('year');
    expect(cells.get(cellKey(S1, M2))).toEqual({
      kind: 'partial',
      semesterIds: [SEM],
      religionMismatch: false,
    });
    expect(cells.get(cellKey(S2, M1))).toBeUndefined();
  });

  it('menyimpan sumber dan ketidakcocokan agama', () => {
    const cells = indexCells([{ ...entry(S1, M1), source: 'religion', religionMismatch: true }]);
    expect(cells.get(cellKey(S1, M1))).toEqual({ kind: 'year', source: 'religion', religionMismatch: true });
  });
});

describe('susunan isi PUT pilihan', () => {
  const cells = indexCells([entry(S1, M1), entry(S1, M2, SEM)]);

  it('tanpa perubahan: kosong', () => {
    const body = buildChoiceBody(cells, new Map());
    expect(body).toEqual({ set: [], remove: [] });
    expect(countChanges(body)).toBe(0);
  });

  it('menyalakan sel kosong membuat baris setahun dengan sumber pilihan', () => {
    const draft = new Map([[cellKey(S2, M1), true]]);
    expect(buildChoiceBody(cells, draft).set).toEqual([
      { studentId: S2, subjectId: M1, semesterId: null, source: 'choice' },
    ]);
  });

  it('mematikan sel setahun menghapus barisnya', () => {
    const draft = new Map([[cellKey(S1, M1), false]]);
    expect(buildChoiceBody(cells, draft).remove).toEqual([{ studentId: S1, subjectId: M1 }]);
  });

  it('perubahan yang sama dengan keadaan tersimpan dan sel per-semester tidak dikirim', () => {
    const draft = new Map([
      [cellKey(S1, M1), true],
      [cellKey(S1, M2), true],
      [cellKey(S1, M2), false],
    ]);
    expect(countChanges(buildChoiceBody(cells, draft))).toBe(0);
  });

  it('override hanya ikut bila diminta', () => {
    expect(buildChoiceBody(cells, new Map()).override).toBeUndefined();
    expect(buildChoiceBody(cells, new Map(), true).override).toBe(true);
  });

  it('toggleDraft membuang catatan bila kembali ke keadaan tersimpan', () => {
    const on = toggleDraft(cells, new Map(), cellKey(S2, M1), true);
    expect(on.get(cellKey(S2, M1))).toBe(true);
    expect(isChecked(cells, on, cellKey(S2, M1))).toBe(true);
    const back = toggleDraft(cells, on, cellKey(S2, M1), false);
    expect(back.size).toBe(0);
    expect(isChecked(cells, back, cellKey(S1, M1))).toBe(true);
  });

  it('sel kosong default tidak tercentang', () => {
    const none: ReadonlyMap<string, CellState> = new Map();
    expect(isChecked(none, new Map(), cellKey(S1, M1))).toBe(false);
  });
});

describe('penanda hanya murid yang memilih', () => {
  const subjects = [
    { subjectId: M1, mode: 'all' as const, scoredStudents: 3 },
    { subjectId: M2, mode: 'selected' as const, scoredStudents: 0 },
  ];

  it('hanya mapel yang modenya berubah', () => {
    const draft = new Map<string, 'all' | 'selected'>([
      [M1, 'selected'],
      [M2, 'selected'],
    ]);
    expect(participationChanges(subjects, draft)).toEqual([{ subjectId: M1, mode: 'selected' }]);
  });

  it('konfirmasi hanya untuk mapel yang dinyalakan dan sudah punya nilai', () => {
    const changes = [
      { subjectId: M1, mode: 'selected' as const },
      { subjectId: M2, mode: 'all' as const },
    ];
    expect(scoredWhenEnabling(subjects, changes)).toEqual([{ subjectId: M1, scoredStudents: 3 }]);
    expect(scoredWhenEnabling(subjects, [{ subjectId: M1, mode: 'all' }])).toEqual([]);
  });
});

describe('ringkasan peringatan', () => {
  const r = (over: Partial<RuleResultLike>): RuleResultLike => ({
    ruleId: 'r1',
    groupKey: 'elective',
    label: 'Mapel pilihan',
    enforce: false,
    count: 4,
    minChoices: 4,
    maxChoices: 5,
    status: 'ok',
    ...over,
  });

  it('memetakan status ke jenis masalah', () => {
    expect(problemOf(r({}))).toBeNull();
    expect(problemOf(r({ status: 'below_min', count: 2 }))?.kind).toBe('tooFew');
    expect(problemOf(r({ status: 'below_min', count: 0 }))?.kind).toBe('notChosen');
    expect(problemOf(r({ status: 'above_max', count: 6 }))?.kind).toBe('tooMany');
  });

  it('membuang murid tanpa masalah dan mengurutkan menurut nama', () => {
    const out = summarizeWarnings([
      { studentId: 'b', name: 'Budi', nis: null, results: [r({ status: 'above_max', count: 6 })] },
      { studentId: 'c', name: 'Cici', nis: null, results: [r({})] },
      {
        studentId: 'a',
        name: 'Ani',
        nis: '1',
        results: [
          r({ groupKey: 'arts', label: 'Seni', count: 0, minChoices: 1, maxChoices: 1, status: 'below_min' }),
        ],
      },
    ]);
    expect(out.map((s) => s.name)).toEqual(['Ani', 'Budi']);
    expect(out[0]?.problems[0]).toMatchObject({ kind: 'notChosen', groupKey: 'arts', min: 1 });
  });

  it('rangeKind menyebut bentuk rentang', () => {
    expect(rangeKind(null, null)).toBe('none');
    expect(rangeKind(1, 1)).toBe('exact');
    expect(rangeKind(4, 5)).toBe('between');
    expect(rangeKind(2, null)).toBe('atLeast');
    expect(rangeKind(null, 3)).toBe('atMost');
  });
});

describe('alasan tidak cocok dan penguncian', () => {
  it('alasan dikenal dipertahankan, lainnya dianggap tidak ada mapel yang cocok', () => {
    expect(normalizeUnmatchedReason('no_religion')).toBe('no_religion');
    expect(normalizeUnmatchedReason('has_other_religion_choice')).toBe('has_other_religion_choice');
    expect(normalizeUnmatchedReason('ambiguous_subject')).toBe('ambiguous_subject');
    expect(normalizeUnmatchedReason('aneh')).toBe('no_matching_subject');
    expect(normalizeUnmatchedReason(null)).toBe('no_matching_subject');
  });

  it('choice_locked dikenali hanya pada 409 ApiError', () => {
    expect(isChoiceLocked(new ApiError('x', 409, 'choice_locked'))).toBe(true);
    expect(isChoiceLocked(new ApiError('x', 409, 'report_final'))).toBe(false);
    expect(isChoiceLocked(new ApiError('x', 400, 'choice_locked'))).toBe(false);
    expect(isChoiceLocked(new Error('x'))).toBe(false);
  });
});

describe('aturan sekolah', () => {
  it('kunci kelompok', () => {
    expect(slugGroupKey('Mapel Pilihan Lintas Minat!')).toBe('mapel-pilihan-lintas-minat');
    expect(slugGroupKey('Kelompok Ünik')).toBe('kelompok-unik');
    expect(slugGroupKey('???')).toBe('rule');
    expect(slugGroupKey('a'.repeat(60)).length).toBeLessThanOrEqual(40);
    expect(groupKeyFor('arts', 'apa saja')).toBe('arts');
    expect(groupKeyFor('other', 'Bahasa Asing')).toBe('bahasa-asing');
    expect(groupKeyFor('other', 'Nama baru', 'kunci-lama')).toBe('kunci-lama');
    expect(kindOfKey('religion')).toBe('religion');
    expect(kindOfKey('kunci-lama')).toBe('other');
  });

  it('parseCount menerima kosong dan 0 sampai 100', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount(' 7 ')).toBe(7);
    expect(parseCount('101')).toBeUndefined();
    expect(parseCount('-1')).toBeUndefined();
    expect(parseCount('2,5')).toBeUndefined();
  });

  it('validasi: tingkat dan nama wajib, rentang harus berurutan', () => {
    expect(validateRule(EMPTY_RULE)).toEqual({ level: 'required', label: 'required' });
    const ok = { ...EMPTY_RULE, levelCode: '11', label: 'Pilihan', minChoices: '4', maxChoices: '5' };
    expect(validateRule(ok)).toEqual({});
    expect(validateRule({ ...ok, minChoices: '6' })).toEqual({ maxChoices: 'rangeOrder' });
    expect(validateRule({ ...ok, minOffered: 'x' })).toEqual({ minOffered: 'invalidNumber' });
  });

  it('isi permintaan: kosong menjadi null, mapel unik, bawaan hanya peringatan', () => {
    const body = buildRuleBody('y1', {
      ...EMPTY_RULE,
      levelCode: ' 11 ',
      label: '  Mapel pilihan ',
      minOffered: '7',
      minChoices: '4',
      maxChoices: '5',
      subjectIds: ['a', 'b', 'a'],
    });
    expect(body).toEqual({
      academicYearId: 'y1',
      levelCode: '11',
      programId: null,
      groupKey: 'elective',
      label: 'Mapel pilihan',
      minChoices: 4,
      maxChoices: 5,
      minOffered: 7,
      enforce: false,
      lockedFromSemesterId: null,
      subjectIds: ['a', 'b'],
    });
  });

  it('bawaan jenis dan pemuatan ulang untuk ubah', () => {
    expect(presetFor('arts')).toEqual({ minChoices: '1', maxChoices: '1' });
    expect(presetFor('elective')).toEqual({ minChoices: '', maxChoices: '' });
    const d = ruleToDraft({
      groupKey: 'bahasa',
      label: 'Bahasa',
      levelCode: '10',
      programId: 'p1',
      minChoices: null,
      maxChoices: 2,
      minOffered: 3,
      enforce: true,
      lockedFromSemesterId: 'sem2',
      subjectIds: ['a'],
    });
    expect(d).toMatchObject({ kind: 'other', existingKey: 'bahasa', minChoices: '', maxChoices: '2' });
    expect(buildRuleBody('y', d)).toMatchObject({
      groupKey: 'bahasa',
      programId: 'p1',
      maxChoices: 2,
      minChoices: null,
      lockedFromSemesterId: 'sem2',
      enforce: true,
    });
  });
});
