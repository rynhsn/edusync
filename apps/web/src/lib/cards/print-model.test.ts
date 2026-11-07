import { describe, expect, it } from 'vitest';
import { cardsFileName, percent, slug } from './print-model';

describe('nama berkas', () => {
  it('slug membuang tanda baca dan aksen', () => {
    expect(slug('VII-A  (Pagi)')).toBe('vii-a-pagi');
    expect(slug('Kelas Ünggulan')).toBe('kelas-unggulan');
    expect(slug('')).toBe('');
  });
  it('nama PDF menurut jenis', () => {
    expect(cardsFileName('student', 'VII-A', '2026-11-07')).toBe('kartu-siswa-vii-a-2026-11-07.pdf');
    expect(cardsFileName('exam', 'VII-A Ganjil', '2026-11-07')).toBe(
      'kartu-ujian-vii-a-ganjil-2026-11-07.pdf',
    );
    expect(cardsFileName('exam', '', '2026-11-07')).toBe('kartu-ujian-2026-11-07.pdf');
  });
});

describe('percent', () => {
  it('membatasi 0..100', () => {
    expect(percent(1, 4)).toBe(25);
    expect(percent(5, 4)).toBe(100);
    expect(percent(0, 0)).toBe(100);
  });
});
