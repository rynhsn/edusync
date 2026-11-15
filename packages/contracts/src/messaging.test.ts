import { describe, expect, it } from 'vitest';
import {
  attachmentUploadSchema,
  composeMessage,
  DEFAULT_TEMPLATES,
  DIRECT_TEMPLATES,
  detectAttachmentMime,
  EVENT_KEYS,
  EVENT_PLACEHOLDERS,
  hasSensitiveNumber,
  joinNames,
  MESSAGE_TOTAL_MAX,
  normalizePhone,
  recipientSelectionSchema,
  renderDirect,
  renderTemplate,
  safeAttachmentName,
  selectionIsBroad,
  selectionIsEmpty,
  unknownDirectPlaceholders,
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

describe('pesan langsung', () => {
  it('pengganti dikenal: guardian, student, class, school, date, teacher; selain itu ditolak', () => {
    expect(
      unknownDirectPlaceholders('{{guardian}} {{student}} {{class}} {{school}} {{date}} {{teacher}}'),
    ).toEqual([]);
    expect(unknownDirectPlaceholders('{{amount}} {{nik}} {{student}}')).toEqual(['amount', 'nik']);
    for (const t of DIRECT_TEMPLATES) expect(unknownDirectPlaceholders(t.body), t.key).toEqual([]);
  });

  it('deteksi deret 16 digit (NIK), termasuk yang dipisah spasi atau tanda hubung', () => {
    expect(hasSensitiveNumber('NIK 3201234567890123 tolong')).toBe(true);
    expect(hasSensitiveNumber('NIK 3201 2345 6789 0123')).toBe(true);
    expect(hasSensitiveNumber('NIK 3201-2345-6789-0123')).toBe(true);
    expect(hasSensitiveNumber('nomor 081234567890 dan 12345')).toBe(false);
    expect(hasSensitiveNumber('123456789012345')).toBe(false);
  });

  it('joinNames dan renderDirect memakai kakak-adik, header/footer tetap berlaku lewat composeMessage', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A dan B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B dan C');
    const body = renderDirect(
      'Yth. {{guardian}}, {{student}} ({{class}}) di {{school}}, {{date}}.',
      { guardianName: 'Bu Sari', studentNames: ['Ani', 'Budi'], classNames: ['7A', '9B'] },
      { school: 'SMP Satu', date: '15 November 2026' },
    );
    expect(body).toBe('Yth. Bu Sari, Ani dan Budi (7A dan 9B) di SMP Satu, 15 November 2026.');
    const frame = { headerText: '*{{school}}*', footerText: 'Terima kasih', schoolName: 'SMP Satu' };
    expect(composeMessage(body, frame)).toBe(['*SMP Satu*', body, 'Terima kasih'].join('\n\n'));
    const staff = { teacherName: 'Pak Eko', studentNames: [], classNames: [] };
    expect(renderDirect('{{teacher}}|{{guardian}}|{{student}}', staff, { school: 's', date: 'd' })).toBe(
      'Pak Eko||',
    );
  });

  it('pemilih penerima: skema membatasi larik 500 dan mengenali pemilih luas/kosong', () => {
    const id = '0198f7c0-0000-7000-8000-000000000001';
    expect(recipientSelectionSchema.safeParse({ students: [id] }).success).toBe(true);
    expect(recipientSelectionSchema.safeParse({ students: ['x'] }).success).toBe(false);
    expect(recipientSelectionSchema.safeParse({ students: Array(501).fill(id) }).success).toBe(false);
    expect(recipientSelectionSchema.safeParse({ wholeSchool: false }).success).toBe(false);
    expect(selectionIsEmpty({})).toBe(true);
    expect(selectionIsEmpty({ students: [] })).toBe(true);
    expect(selectionIsEmpty({ teachers: [id] })).toBe(false);
    expect(selectionIsBroad({ students: [id], guardians: [id], teachers: [id] })).toBe(false);
    expect(selectionIsBroad({ classes: [id] })).toBe(true);
    expect(selectionIsBroad({ wholeSchool: true })).toBe(true);
    expect(selectionIsBroad({ allStaff: true })).toBe(true);
  });
});

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('lampiran pesan langsung', () => {
  it('mengenali jenis dari magic bytes, bukan dari nama', () => {
    expect(detectAttachmentMime(ascii('%PDF-1.7 isi'))).toBe('application/pdf');
    expect(detectAttachmentMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(detectAttachmentMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(detectAttachmentMime(ascii('MZ exe'))).toBeNull();
    expect(detectAttachmentMime(ascii('%PDF'))).toBeNull(); // terpotong
    expect(detectAttachmentMime(new Uint8Array())).toBeNull();
  });
  it('membersihkan nama berkas', () => {
    expect(safeAttachmentName('..\\x/surat?.pdf')).toBe('surat_.pdf');
    expect(safeAttachmentName('  ')).toBe('lampiran');
    expect(safeAttachmentName('a'.repeat(300))).toHaveLength(120);
  });
  it('skema unggah: jenis terbatas dan ukuran base64 dibatasi', () => {
    const ok = { fileName: 'a.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' };
    expect(attachmentUploadSchema.safeParse(ok).success).toBe(true);
    expect(attachmentUploadSchema.safeParse({ ...ok, mime: 'text/html' }).success).toBe(false);
    const big = 'A'.repeat(2_900_001);
    expect(attachmentUploadSchema.safeParse({ ...ok, dataBase64: big }).success).toBe(false);
  });
});
