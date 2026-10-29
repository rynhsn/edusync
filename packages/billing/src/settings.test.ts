import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './settings';

describe('enkripsi rahasia', () => {
  const secret = 'rahasia-aplikasi-yang-cukup-panjang-12345';

  it('bolak-balik, dan hasilnya acak tiap kali', () => {
    const a = encryptSecret('SB-Mid-server-abc', secret);
    const b = encryptSecret('SB-Mid-server-abc', secret);
    expect(a).not.toBe(b);
    expect(a).not.toContain('SB-Mid');
    expect(decryptSecret(a, secret)).toBe('SB-Mid-server-abc');
  });

  it('gagal dengan rahasia lain atau data yang diubah', () => {
    const blob = encryptSecret('kunci', secret);
    expect(() => decryptSecret(blob, 'rahasia-lain-yang-cukup-panjang-123456')).toThrow();
    const [v, iv, tag, data] = blob.split('.');
    expect(() => decryptSecret([v, iv, tag, `${data}A`].join('.'), secret)).toThrow();
    expect(() => decryptSecret('bukan-format', secret)).toThrow();
  });
});
