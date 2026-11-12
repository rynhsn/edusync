import { describe, expect, it } from 'vitest';
import {
  buildSavePayload,
  chunk,
  defaultSourceId,
  eligibleTargets,
  initialChoices,
  optionsFor,
  type PromotionClass,
  pendingStudents,
  setClassDecision,
  summarize,
} from './promotion-logic';

const stu = (id: string, over: Partial<PromotionClass['students'][number]> = {}) => ({
  studentId: id,
  name: `Siswa ${id}`,
  nis: null,
  decision: null,
  suggestedDecision: 'promote' as const,
  toClassId: null,
  note: null,
  applied: false,
  ...over,
});

const classes: PromotionClass[] = [
  {
    classId: 'c7',
    name: '7A',
    level: '7',
    nextLevel: '8',
    isFinalLevel: false,
    students: [
      stu('a'),
      stu('b', { decision: 'retain', note: 'sakit lama' }),
      stu('c', { applied: true, decision: 'promote' }),
    ],
  },
  {
    classId: 'c9',
    name: '9A',
    level: '9',
    nextLevel: null,
    isFinalLevel: true,
    students: [
      stu('d', { suggestedDecision: 'graduate' }),
      stu('e', { suggestedDecision: 'graduate', decision: 'graduate' }),
    ],
  },
];

describe('tahun tujuan', () => {
  const years = [
    { id: 'y1', name: '2025/2026', startsOn: '2025-07-01', isActive: true },
    { id: 'y2', name: '2026/2027', startsOn: '2026-07-01' },
    { id: 'y3', name: '2027/2028', startsOn: '2027-07-01' },
    { id: 'y0', name: '2024/2025', startsOn: '2024-07-01' },
  ];
  it('hanya tahun yang dimulai setelah sumber, urut dari terdekat', () => {
    expect(eligibleTargets(years, 'y1').map((y) => y.id)).toEqual(['y2', 'y3']);
    expect(eligibleTargets(years, 'y3')).toEqual([]);
    expect(eligibleTargets(years, 'nope')).toEqual([]);
  });
  it('sumber bawaan: tahun aktif, atau yang terbaru', () => {
    expect(defaultSourceId(years)).toBe('y1');
    expect(defaultSourceId(years.map((y) => ({ ...y, isActive: false })))).toBe('y3');
    expect(defaultSourceId([])).toBe('');
  });
});

describe('keputusan', () => {
  it('pilihan per tingkat', () => {
    expect(optionsFor({ isFinalLevel: false })).toEqual(['promote', 'retain']);
    expect(optionsFor({ isFinalLevel: true })).toEqual(['graduate', 'retain']);
  });

  it('pilihan awal memakai keputusan tersimpan, kalau tidak saran backend', () => {
    expect(initialChoices(classes)).toEqual({
      a: 'promote',
      b: 'retain',
      c: 'promote',
      d: 'graduate',
      e: 'graduate',
    });
  });

  it('aksi massal melewati siswa yang sudah diterapkan dan menolak keputusan yang tak sah', () => {
    const base = initialChoices(classes);
    const all = setClassDecision(classes[0] as PromotionClass, base, 'promote');
    expect(all).toMatchObject({ a: 'promote', b: 'promote', c: 'promote' });
    const retain = setClassDecision(classes[0] as PromotionClass, base, 'retain');
    expect(retain).toMatchObject({ a: 'retain', b: 'retain', c: 'promote' });
    expect(setClassDecision(classes[0] as PromotionClass, base, 'graduate')).toBe(base);
    expect(setClassDecision(classes[1] as PromotionClass, base, 'promote')).toBe(base);
  });

  it('yang perlu disimpan: belum tersimpan atau berbeda; yang diterapkan tidak pernah', () => {
    const base = initialChoices(classes);
    expect(pendingStudents(classes, base).map((p) => p.student.studentId)).toEqual(['a', 'd']);
    const changed = { ...base, b: 'promote' as const, c: 'retain' as const };
    expect(pendingStudents(classes, changed).map((p) => p.student.studentId)).toEqual(['a', 'b', 'd']);
  });

  it('payload: kelas tujuan eksplisit dibawa hanya bila keputusan tidak berubah, catatan selalu dibawa', () => {
    const withTarget: PromotionClass[] = [
      {
        ...(classes[0] as PromotionClass),
        students: [
          stu('p', { decision: 'promote', toClassId: 'x' }),
          stu('q', { decision: 'promote', toClassId: 'x', note: 'ok' }),
        ],
      },
    ];
    const choices = { p: 'promote' as const, q: 'retain' as const };
    expect(buildSavePayload(withTarget, choices)).toEqual([
      { studentId: 'q', decision: 'retain', note: 'ok' },
    ]);
    // p tidak berubah jadi tidak dikirim; q berubah jadi kelas tujuan lama dilepas.
    const unchangedPlusNew: PromotionClass[] = [
      { ...(classes[0] as PromotionClass), students: [stu('r', { decision: 'retain', toClassId: 'x' })] },
    ];
    expect(buildSavePayload(unchangedPlusNew, { r: 'retain' })).toEqual([]);
  });

  it('payload lengkap untuk keputusan baru', () => {
    expect(buildSavePayload(classes, initialChoices(classes))).toEqual([
      { studentId: 'a', decision: 'promote' },
      { studentId: 'd', decision: 'graduate' },
    ]);
  });

  it('ringkasan: yang diterapkan dihitung terpisah', () => {
    expect(summarize(classes, initialChoices(classes))).toEqual({
      total: 5,
      promote: 1,
      retain: 1,
      graduate: 2,
      applied: 1,
      unsaved: 2,
    });
  });
});

describe('chunk', () => {
  it('membagi daftar menurut ukuran', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
