import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXAM_PAPER,
  examDateParts,
  examPaperConfigSchema,
  examTimeRange,
  renderExamTemplate,
  resolveExamPaper,
} from './exam-paper';

describe('exam-paper', () => {
  it('bawaan lolos skema', () => {
    expect(examPaperConfigSchema.safeParse(DEFAULT_EXAM_PAPER).success).toBe(true);
  });

  it('resolveExamPaper menggabungkan sebagian dan membuang nilai tak valid', () => {
    expect(resolveExamPaper(null)).toEqual(DEFAULT_EXAM_PAPER);
    const r = resolveExamPaper({
      paperSize: 'F4',
      kop: { showLogo: false },
      instructions: { items: ['Satu'] },
    });
    expect(r.paperSize).toBe('F4');
    expect(r.kop.showLogo).toBe(false);
    expect(r.kop.source).toBe('identity');
    expect(r.instructions.items).toEqual(['Satu']);
    expect(r.instructions.title).toBe('PETUNJUK UMUM');
    // Nilai di luar rentang -> seluruhnya kembali ke bawaan, bukan setengah rusak.
    expect(resolveExamPaper({ marginMm: 999 })).toEqual(DEFAULT_EXAM_PAPER);
  });

  it('renderExamTemplate mengisi penampung dan merapikan spasi', () => {
    expect(
      renderExamTemplate('{examName} {semester} TA {academicYear}', {
        examName: 'ASAS',
        semester: 'GANJIL',
        academicYear: '2026/2027',
      }),
    ).toBe('ASAS GANJIL TA 2026/2027');
    expect(renderExamTemplate('A {kosong} B {time}', {})).toBe('A B');
  });

  it('tanggal dan jam dalam bahasa Indonesia', () => {
    expect(examDateParts('2026-12-08')).toEqual({ day: 'Selasa', date: '8 Desember 2026' });
    expect(examDateParts(null)).toEqual({ day: '', date: '' });
    expect(examTimeRange('07:30', 90)).toBe('07.30 - 09.00 WIB');
    expect(examTimeRange('23:30', 60, 'WITA')).toBe('23.30 - 00.30 WITA');
    expect(examTimeRange(null, 60)).toBe('');
  });
});
