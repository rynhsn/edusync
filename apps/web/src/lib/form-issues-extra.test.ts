import { describe, expect, it } from 'vitest';
import {
  dateNotBefore,
  hostName,
  optionalEmail,
  optionalUrl,
  requiredEmail,
  timeAfter,
} from './form-issues-extra';

describe('email', () => {
  it('opsional lolos saat kosong, wajib tidak', () => {
    expect(optionalEmail('  ')).toBeUndefined();
    expect(requiredEmail('')).toEqual({ code: 'required' });
  });
  it('menolak format salah dan menerima format benar', () => {
    expect(optionalEmail('abc')).toEqual({ code: 'email' });
    expect(optionalEmail('a@b')).toEqual({ code: 'email' });
    expect(optionalEmail('nama@contoh.sch.id')).toBeUndefined();
  });
  it('membatasi panjang', () => {
    expect(optionalEmail(`${'a'.repeat(20)}@x.id`, 10)).toEqual({ code: 'tooLong', max: 10 });
  });
});

describe('optionalUrl', () => {
  it('kosong lolos', () => expect(optionalUrl('', 200)).toBeUndefined());
  it('menerima http dan https', () => {
    expect(optionalUrl('https://contoh.sch.id/halaman', 200)).toBeUndefined();
    expect(optionalUrl('http://contoh.id', 200)).toBeUndefined();
  });
  it('menolak teks biasa dan protokol selain http(s)', () => {
    expect(optionalUrl('contoh', 200)).toEqual({ code: 'urlInvalid' });
    expect(optionalUrl('ftp://contoh.id', 200)).toEqual({ code: 'urlInvalid' });
    expect(optionalUrl('mailto:a@b.id', 200)).toEqual({ code: 'urlInvalid' });
  });
  it('membatasi panjang', () => {
    expect(optionalUrl(`https://${'a'.repeat(300)}.id`, 300)).toEqual({ code: 'tooLong', max: 300 });
  });
});

describe('hostName', () => {
  it('wajib diisi', () => expect(hostName(' ')).toEqual({ code: 'required' }));
  it('menerima domain biasa', () => {
    expect(hostName('sekolah.sch.id')).toBeUndefined();
    expect(hostName('SMK-1.example.com')).toBeUndefined();
  });
  it('menolak yang bukan domain', () => {
    expect(hostName('sekolah')).toEqual({ code: 'hostInvalid' });
    expect(hostName('https://a.id')).toEqual({ code: 'hostInvalid' });
    expect(hostName('a b.id')).toEqual({ code: 'hostInvalid' });
  });
});

describe('urutan jam dan tanggal', () => {
  it('jam selesai harus setelah jam mulai', () => {
    expect(timeAfter('08:00', '07:00')).toEqual({ code: 'timeOrder' });
    expect(timeAfter('08:00', '08:00')).toEqual({ code: 'timeOrder' });
    expect(timeAfter('08:00', '09:00')).toBeUndefined();
    expect(timeAfter('', '09:00')).toBeUndefined();
  });
  it('tanggal selesai boleh sama dengan tanggal mulai', () => {
    expect(dateNotBefore('2026-05-02', '2026-05-01')).toEqual({ code: 'dateOrder' });
    expect(dateNotBefore('2026-05-01', '2026-05-01')).toBeUndefined();
    expect(dateNotBefore('', '2026-05-01')).toBeUndefined();
  });
});
