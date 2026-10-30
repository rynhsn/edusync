import { describe, expect, it } from 'vitest';
import {
  bodyLines,
  bytesToHex,
  dataUrlKb,
  formatIdDate,
  insertAtCursor,
  isValidSignatureDataUrl,
  letterFileName,
  nextSignatureScale,
  sha256Hex,
  slugify,
  splitSignatureTail,
  verifyUrl,
} from './format';

describe('bodyLines', () => {
  it('menandai judul huruf kapital di awal dan meringkas baris kosong', () => {
    const lines = bodyLines('SURAT KETERANGAN\nNomor: 1\n\n\n\nIsi surat\n\n');
    expect(lines).toEqual([
      { kind: 'title', text: 'SURAT KETERANGAN' },
      { kind: 'text', text: 'Nomor: 1' },
      { kind: 'blank', text: '' },
      { kind: 'text', text: 'Isi surat' },
    ]);
  });

  it('tidak menjadikan baris biasa sebagai judul', () => {
    expect(bodyLines('Nomor: 5\nPerihal: Panggilan')[0]?.kind).toBe('text');
  });

  it('menangani CRLF dan teks kosong', () => {
    expect(bodyLines('A\r\nb')).toHaveLength(2);
    expect(bodyLines('')).toEqual([]);
  });
});

describe('format tanggal dan nama berkas', () => {
  it('memformat tanggal Indonesia dari ISO tanggal atau waktu', () => {
    expect(formatIdDate('2026-10-05')).toBe('5 Oktober 2026');
    expect(formatIdDate('2026-10-05T10:00:00.000Z')).toBe('5 Oktober 2026');
  });

  it('slugify membuang diakritik dan simbol', () => {
    expect(slugify('Surat Keterangan: Siswa Aktif!')).toBe('surat-keterangan-siswa-aktif');
  });

  it('nama berkas memakai nomor dan perihal', () => {
    expect(letterFileName('012/SMP/X/2026', 'Panggilan Orang Tua')).toBe(
      'surat-012-smp-x-2026-panggilan-orang-tua.pdf',
    );
    expect(letterFileName('', '')).toBe('surat-tanpa-nomor.pdf');
  });

  it('perihal panjang dipotong', () => {
    const name = letterFileName('1', 'a'.repeat(100));
    expect(name.length).toBeLessThan(70);
  });
});

describe('hash', () => {
  it('bytesToHex memakai dua digit per byte', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });

  it('sha256Hex cocok dengan nilai baku', async () => {
    const bytes = new TextEncoder().encode('abc');
    expect(await sha256Hex(bytes)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('verifyUrl', () => {
  it('menyusun tautan absolut tanpa garis miring ganda', () => {
    expect(verifyUrl('https://edusync.id/', 'abc123')).toBe('https://edusync.id/verify/abc123');
  });
});

describe('insertAtCursor', () => {
  it('menyisipkan di posisi kursor', () => {
    expect(insertAtCursor('Halo !', 5, 5, '{{nama}}')).toEqual({ value: 'Halo {{nama}}!', cursor: 13 });
  });

  it('mengganti teks terpilih dan membatasi posisi', () => {
    expect(insertAtCursor('abcdef', 1, 4, 'X')).toEqual({ value: 'aXef', cursor: 2 });
    expect(insertAtCursor('ab', 99, 120, 'X').value).toBe('abX');
  });
});

describe('tanda tangan', () => {
  it('menerima data URL PNG kecil dan menolak yang lain', () => {
    expect(isValidSignatureDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isValidSignatureDataUrl('data:image/gif;base64,AAAA')).toBe(false);
    expect(isValidSignatureDataUrl(`data:image/png;base64,${'A'.repeat(200000)}`)).toBe(false);
  });

  it('menghitung ukuran dan skala pengecilan', () => {
    expect(dataUrlKb('a'.repeat(2048))).toBe('2,0 KB');
    expect(nextSignatureScale(1)).toBe(0.8);
    expect(nextSignatureScale(0.21)).toBeNull();
  });
});

describe('splitSignatureTail', () => {
  const signer = { name: 'Drs. Hasan', title: 'Kepala Sekolah' };

  it('melepas tanggal, jabatan, dan nama di ekor', () => {
    const lines = bodyLines('Isi surat.\n\n30 Oktober 2026\nKepala Sekolah\n\nDrs. Hasan');
    const r = splitSignatureTail(lines, signer);
    expect(r.dateLine).toBe('30 Oktober 2026');
    expect(r.lines.map((l) => l.text)).toEqual(['Isi surat.']);
  });

  it('membiarkan isi bila ekor bukan nama penandatangan', () => {
    const lines = bodyLines('Isi surat.\n\nHormat kami');
    expect(splitSignatureTail(lines, signer).lines).toEqual(lines);
    expect(splitSignatureTail(lines, null).lines).toEqual(lines);
  });
});
