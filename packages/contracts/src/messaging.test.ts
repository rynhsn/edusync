import { describe, expect, it } from 'vitest';
import {
  composeMessage,
  DEFAULT_TEMPLATES,
  EVENT_KEYS,
  EVENT_PLACEHOLDERS,
  MESSAGE_TOTAL_MAX,
  normalizePhone,
  renderTemplate,
  unknownFramePlaceholders,
  unknownPlaceholders,
} from './messaging';

describe('normalizePhone', () => {
  const cases: [string | null | undefined, string | null][] = [
    ['081234567890', '6281234567890'],
    ['0812-3456-7890', '6281234567890'],
    ['0812 3456 7890', '6281234567890'],
    ['+6281234567890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890'],
    ['(0812) 3456.7890', '6281234567890'],
    ['81234567890', null],
    ['08123', null],
    ['0812345678901234567', null],
    ['+1 415 555 2671', null],
    ['abc', null],
    ['0812abc34567', null],
    ['', null],
    [null, null],
    [undefined, null],
  ];
  it.each(cases)('%s -> %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
});

describe('renderTemplate', () => {
  it('mengisi pengganti dan men-trim nilai', () => {
    expect(renderTemplate('Halo {{student}} di {{class}}', { student: '  Budi ', class: '7A' })).toBe(
      'Halo Budi di 7A',
    );
  });
  it('pengganti tak dikenal dibiarkan kosong', () => {
    expect(renderTemplate('A{{nope}}B', { student: 'x' })).toBe('AB');
    expect(renderTemplate('Halo {{ student }}.', {})).toBe('Halo.');
  });
  it('angka dan null', () => {
    expect(renderTemplate('{{amount}}|{{time}}', { amount: 5, time: null })).toBe('5|');
  });
  it('tidak membocorkan properti prototipe', () => {
    expect(renderTemplate('{{constructor}}', {})).toBe('');
  });
});

describe('templat bawaan', () => {
  it('ada untuk tiap peristiwa dan hanya memakai pengganti yang dikenal', () => {
    for (const key of EVENT_KEYS) {
      expect(DEFAULT_TEMPLATES[key].length).toBeGreaterThan(10);
      expect(EVENT_PLACEHOLDERS[key].length).toBeGreaterThan(0);
      expect(unknownPlaceholders(key, DEFAULT_TEMPLATES[key])).toEqual([]);
    }
  });
  it('mendeteksi pengganti yang bukan milik peristiwa itu', () => {
    expect(unknownPlaceholders('arrival', 'Halo {{student}} {{receipt}} {{zzz}}')).toEqual([
      'receipt',
      'zzz',
    ]);
  });
});

describe('format', () => {
  it('rupiah dan tanggal Indonesia', async () => {
    const { formatRupiah, formatDateId } = await import('./messaging');
    expect(formatRupiah(250000)).toBe('Rp 250.000');
    expect(formatDateId('2026-10-30')).toBe('30 Oktober 2026');
  });

  it('formatMonthYearId menulis bulan Indonesia dari periode', async () => {
    const { formatMonthYearId } = await import('./messaging');
    expect(formatMonthYearId('2026-08')).toBe('Agustus 2026');
    expect(formatMonthYearId('2026-05')).toBe('Mei 2026');
    expect(formatMonthYearId('xx')).toBe('xx');
  });
});

describe('composeMessage', () => {
  it('tanpa header/footer isi tidak berubah', () => {
    expect(composeMessage('Halo', {})).toBe('Halo');
    expect(composeMessage('Halo', { headerText: '  ', footerText: null })).toBe('Halo');
  });
  it('header + isi + footer, pengganti sekolah, bagian kosong dilewati', () => {
    expect(
      composeMessage('Isi', { headerText: '*{{school}}*', footerText: 'Salam', schoolName: 'SMP 1' }),
    ).toBe('*SMP 1*\n\nIsi\n\nSalam');
    expect(composeMessage('Isi', { footerText: 'Salam' })).toBe('Isi\n\nSalam');
    expect(composeMessage('Isi', { headerText: 'Atas\nBaris 2' })).toBe('Atas\nBaris 2\n\nIsi');
  });
  it('melebihi batas total: isi dikirim apa adanya', () => {
    const body = 'x'.repeat(MESSAGE_TOTAL_MAX - 5);
    expect(composeMessage(body, { headerText: 'header panjang' })).toBe(body);
  });
  it('unknownFramePlaceholders', () => {
    expect(unknownFramePlaceholders('{{school}} {{student}}')).toEqual(['student']);
  });
});
