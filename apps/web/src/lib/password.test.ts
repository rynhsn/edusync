import { describe, expect, it } from 'vitest';
import { checkPasswords, MIN_PASSWORD } from './password';

describe('checkPasswords', () => {
  const valid = 'a'.repeat(MIN_PASSWORD);

  it('kosong belum dianggap salah, tetapi belum boleh dikirim', () => {
    expect(checkPasswords('', '')).toEqual({ tooShort: false, mismatch: false, ok: false });
  });

  it('terlalu pendek ditandai, dan tidak boleh dikirim walau ulangannya sama', () => {
    const r = checkPasswords('pendek', 'pendek');
    expect(r.tooShort).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('tepat di batas minimum diterima', () => {
    expect(checkPasswords(valid, valid).ok).toBe(true);
    expect(checkPasswords(valid.slice(1), valid.slice(1)).tooShort).toBe(true);
  });

  it('ulangan berbeda ditandai tidak sama', () => {
    const r = checkPasswords(valid, `${valid}x`);
    expect(r.mismatch).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('ulangan belum diisi tidak langsung ditandai tidak sama', () => {
    const r = checkPasswords(valid, '');
    expect(r.mismatch).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('huruf besar dan kecil dibedakan', () => {
    expect(checkPasswords(valid, valid.toUpperCase()).mismatch).toBe(true);
  });
});
