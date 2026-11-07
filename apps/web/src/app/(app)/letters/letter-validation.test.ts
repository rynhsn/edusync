import { describe, expect, it } from 'vitest';
import {
  validateIncoming,
  validateOutgoing,
  validateRevoke,
  validateSigner,
  validateTemplate,
} from './letter-validation';

describe('validateOutgoing', () => {
  const ok = { subject: 'S', party: 'P', letterDate: '2026-11-08', body: 'isi' };
  it('sah', () => expect(validateOutgoing(ok)).toEqual({}));
  it('perihal, penerima, isi wajib; tanggal wajib dan nyata', () => {
    expect(
      Object.keys(validateOutgoing({ subject: ' ', party: '', letterDate: '', body: '' })).sort(),
    ).toEqual(['body', 'letterDate', 'party', 'subject']);
    expect(validateOutgoing({ ...ok, letterDate: '2026-02-30' }).letterDate?.code).toBe('dateInvalid');
  });
  it('batas panjang 200 dan 20000', () => {
    expect(validateOutgoing({ ...ok, subject: 'x'.repeat(201) }).subject?.code).toBe('tooLong');
    expect(validateOutgoing({ ...ok, body: 'x'.repeat(20_001) }).body?.code).toBe('tooLong');
  });
});

describe('validateIncoming', () => {
  const ok = { number: '', letterDate: '2026-11-08', subject: 'S', party: 'P', body: '', note: '' };
  it('nomor, isi, disposisi opsional', () => expect(validateIncoming(ok)).toEqual({}));
  it('batas', () => {
    expect(validateIncoming({ ...ok, number: 'x'.repeat(101) }).number?.code).toBe('tooLong');
    expect(validateIncoming({ ...ok, note: 'x'.repeat(2001) }).note?.code).toBe('tooLong');
    expect(validateIncoming({ ...ok, subject: '' }).subject?.code).toBe('required');
  });
});

describe('validateSigner', () => {
  const ok = { memberId: 'm', name: 'N', title: 'T', nip: '' };
  it('akun hanya wajib saat membuat', () => {
    expect(validateSigner({ ...ok, memberId: '' }, true).memberId?.code).toBe('choose');
    expect(validateSigner({ ...ok, memberId: '' }, false)).toEqual({});
  });
  it('nama 120, jabatan 120, NIP opsional maks 40', () => {
    expect(validateSigner({ ...ok, name: '', title: '' }, false)).toEqual({
      name: { code: 'required' },
      title: { code: 'required' },
    });
    expect(validateSigner({ ...ok, nip: 'x'.repeat(41) }, false).nip?.code).toBe('tooLong');
  });
});

describe('validateTemplate', () => {
  it('nama dan isi wajib', () => {
    expect(validateTemplate({ name: 'a', body: 'b' })).toEqual({});
    expect(Object.keys(validateTemplate({ name: '', body: ' ' })).sort()).toEqual(['body', 'name']);
    expect(validateTemplate({ name: 'a'.repeat(121), body: 'b' }).name?.code).toBe('tooLong');
  });
});

describe('validateRevoke', () => {
  it('alasan 3..500', () => {
    expect(validateRevoke('')).toEqual({ reason: { code: 'required' } });
    expect(validateRevoke('ab').reason?.key).toBe('letterForm.reasonShort');
    expect(validateRevoke('abc')).toEqual({});
    expect(validateRevoke('x'.repeat(501)).reason?.code).toBe('tooLong');
  });
});
