import { describe, expect, it } from 'vitest';
import { badgeText, validateReply, validateTicket } from './support';

describe('validasi laporan', () => {
  it('judul dan penjelasan wajib, minimal 3 karakter', () => {
    expect(validateTicket({ subject: '', body: '' })).toEqual({
      subject: { code: 'required' },
      body: { code: 'required' },
    });
    expect(validateTicket({ subject: 'ab', body: '  x ' }).subject).toEqual({ code: 'required' });
    expect(validateTicket({ subject: 'Kartu rusak', body: 'Tidak terbaca' })).toEqual({});
  });

  it('batas panjang mengikuti API: judul 150, penjelasan 5000', () => {
    expect(validateTicket({ subject: 'x'.repeat(151), body: 'isi' }).subject).toEqual({
      code: 'tooLong',
      max: 150,
    });
    expect(validateTicket({ subject: 'x'.repeat(150), body: 'isi' }).subject).toBeUndefined();
    expect(validateTicket({ subject: 'Judul', body: 'x'.repeat(5001) }).body).toEqual({
      code: 'tooLong',
      max: 5000,
    });
  });

  it('balasan tidak boleh kosong atau hanya spasi', () => {
    expect(validateReply('   ')).toEqual({ body: { code: 'required' } });
    expect(validateReply('ok')).toEqual({});
    expect(validateReply('x'.repeat(5001)).body).toEqual({ code: 'tooLong', max: 5000 });
  });
});

describe('lencana', () => {
  it('99+ untuk angka besar', () => {
    expect(badgeText(3)).toBe('3');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});
