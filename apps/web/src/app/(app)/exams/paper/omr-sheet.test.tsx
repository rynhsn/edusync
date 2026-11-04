import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OmrPages, OmrSheet, omrCounts, omrPages, omrSupport } from './omr-sheet';

const base = {
  examId: '01a1a41f-595c-7db5-8d30-2a4c37521170',
  schoolName: 'SMK Contoh',
  examTitle: 'ASAS',
  subjectName: 'Matematika',
  classNames: '7 A',
  mcqCount: 6,
  optionCount: 4,
};
const count = (html: string, attr: string) => html.split(`data-omr="${attr}"`).length - 1;

describe('lembar OMR', () => {
  it('lembar siswa memuat 4 penanda, semua gelembung, dan QR', () => {
    const html = renderToStaticMarkup(
      <OmrSheet
        {...base}
        page={{
          kind: 'student',
          studentId: '01a19f49-5709-7f52-8dd1-270c5654e24c',
          name: 'Ahmad Fauzan',
          nis: '261003',
          className: 'X TJKT 1',
        }}
      />,
    );
    expect(count(html, 'marker')).toBe(4);
    expect(count(html, 'bubble')).toBe(24);
    expect(count(html, 'qr')).toBe(1);
    expect(html).toContain('Ahmad Fauzan');
    expect(html).toContain('210mm');
  });

  it('lembar kosong tanpa QR tetapi dengan kotak tempel label', () => {
    const html = renderToStaticMarkup(<OmrSheet {...base} page={{ kind: 'blank' }} />);
    expect(count(html, 'marker')).toBe(4);
    expect(count(html, 'qr')).toBe(0);
    expect(count(html, 'blank-box')).toBe(1);
  });

  it('menghitung soal pilihan ganda dan pilihan terbanyak, dan batas lembar', () => {
    const c = omrCounts([
      { type: 'mcq', optionKeys: ['A', 'B', 'C'] },
      { type: 'essay', optionKeys: [] },
      { type: 'mcq', optionKeys: ['A', 'B', 'C', 'D', 'E'] },
    ]);
    expect(c).toEqual({ mcqCount: 2, optionCount: 5 });
    expect(omrSupport(c.mcqCount, c.optionCount)).toEqual({ ok: true });
    expect(omrSupport(101, 4)).toMatchObject({ ok: false, reason: 'questions' });
    expect(omrSupport(10, 6)).toMatchObject({ ok: false, reason: 'options' });
    expect(omrCounts([])).toEqual({ mcqCount: 0, optionCount: 0 });
  });

  it('daftar halaman: saring kelas lalu tambah lembar kosong', () => {
    const students = [
      { studentId: 'a', name: 'A', nis: null, className: '7 A', classId: 'ka' },
      { studentId: 'b', name: 'B', nis: '1', className: '7 B', classId: 'kb' },
    ];
    expect(omrPages(students, '', 0)).toHaveLength(2);
    const only = omrPages(students, 'kb', 2);
    expect(only.map((p) => p.kind)).toEqual(['student', 'blank', 'blank']);
    expect(omrPages(students, '', -3)).toHaveLength(2);
    const html = renderToStaticMarkup(<OmrPages pages={omrPages(students, '', 1)} {...base} />);
    expect(count(html, 'marker')).toBe(12);
  });
});
