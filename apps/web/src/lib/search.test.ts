import { describe, expect, it } from 'vitest';
import { highlight, matchScore, normalize, rankItems, tokens } from './search';

describe('normalize', () => {
  it('menurunkan huruf dan membuang aksen', () => {
    expect(normalize('Café Éclair')).toBe('cafe eclair');
    expect(normalize('SISWA')).toBe('siswa');
  });
});

describe('tokens', () => {
  it('memecah kata dan membuang spasi berlebih', () => {
    expect(tokens('  Tahun   Ajaran ')).toEqual(['tahun', 'ajaran']);
    expect(tokens('   ')).toEqual([]);
  });
});

describe('matchScore', () => {
  it('0 untuk kueri kosong dan tidak cocok', () => {
    expect(matchScore('', ['Siswa'])).toBe(0);
    expect(matchScore('xyz', ['Siswa', 'Daftar murid'])).toBe(0);
  });

  it('tidak peka huruf besar/kecil dan aksen', () => {
    expect(matchScore('CAFE', ['Café'])).toBeGreaterThan(0);
    expect(matchScore('siswa', ['SISWA'])).toBeGreaterThan(0);
  });

  it('semua kata harus cocok', () => {
    expect(matchScore('tahun ajaran', ['Tahun ajaran'])).toBeGreaterThan(0);
    expect(matchScore('tahun kelas', ['Tahun ajaran'])).toBe(0);
  });

  it('awal teks mengalahkan awal kata, dan awal kata mengalahkan tengah kata', () => {
    const prefix = matchScore('ab', ['abc']);
    const wordStart = matchScore('ab', ['x abc']);
    const inside = matchScore('ab', ['xabc']);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(inside);
  });

  it('bidang utama mengalahkan bidang lain', () => {
    expect(matchScore('absen', ['Absensi', 'x'])).toBeGreaterThan(
      matchScore('absen', ['x', 'absensi harian']),
    );
  });
});

describe('rankItems', () => {
  const items = [
    { t: 'Pengaturan sekolah', s: '' },
    { t: 'Siswa', s: 'daftar murid' },
    { t: 'Absensi siswa', s: '' },
    { t: 'Guru', s: 'pengaturan akun guru' },
  ];
  const fields = (i: { t: string; s: string }) => [i.t, i.s];

  it('kueri kosong mengembalikan semua sesuai urutan', () => {
    expect(rankItems('', items, fields)).toEqual(items);
    expect(rankItems('  ', items, fields, 2)).toEqual(items.slice(0, 2));
  });

  it('menyaring dan mengurutkan menurut nilai', () => {
    expect(rankItems('siswa', items, fields).map((i) => i.t)).toEqual(['Siswa', 'Absensi siswa']);
    expect(rankItems('pengaturan', items, fields).map((i) => i.t)).toEqual(['Pengaturan sekolah', 'Guru']);
  });

  it('urutan asli dipertahankan bila nilai sama dan batas dihormati', () => {
    const same = [
      { t: 'Kelas A', s: '' },
      { t: 'Kelas B', s: '' },
      { t: 'Kelas C', s: '' },
    ];
    expect(rankItems('kelas', same, fields).map((i) => i.t)).toEqual(['Kelas A', 'Kelas B', 'Kelas C']);
    expect(rankItems('kelas', same, fields, 2)).toHaveLength(2);
  });
});

describe('highlight', () => {
  const joined = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

  it('menyorot bagian yang cocok tanpa mengubah teks', () => {
    const parts = highlight('Absensi Siswa', 'sis');
    expect(joined(parts)).toBe('Absensi Siswa');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['Sis']);
  });

  it('tidak peka aksen dan huruf besar/kecil', () => {
    const parts = highlight('Café Mocha', 'CAFE');
    expect(parts[0]).toEqual({ text: 'Café', match: true });
    expect(joined(parts)).toBe('Café Mocha');
  });

  it('beberapa kata dan tanpa kecocokan', () => {
    const parts = highlight('Tahun ajaran', 'tahun ajar');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['Tahun', 'ajar']);
    expect(highlight('Guru', 'zzz')).toEqual([{ text: 'Guru', match: false }]);
    expect(highlight('Guru', '')).toEqual([{ text: 'Guru', match: false }]);
  });
});
