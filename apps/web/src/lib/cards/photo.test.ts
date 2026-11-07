import { describe, expect, it } from 'vitest';
import { base64Bytes, centerCrop, outputSize } from './photo';

describe('centerCrop', () => {
  it('gambar lebar dipotong sisi kiri-kanan', () => {
    expect(centerCrop(1600, 1200)).toEqual({ sx: 350, sy: 0, sw: 900, sh: 1200 });
  });
  it('gambar tinggi dipotong atas-bawah', () => {
    expect(centerCrop(600, 1200)).toEqual({ sx: 0, sy: 200, sw: 600, sh: 800 });
  });
  it('rasio pas tidak dipotong', () => {
    expect(centerCrop(300, 400)).toEqual({ sx: 0, sy: 0, sw: 300, sh: 400 });
  });
});

describe('outputSize', () => {
  it('mengecilkan sampai tinggi maksimum dan tidak membesarkan', () => {
    expect(outputSize(900, 1200)).toEqual({ w: 480, h: 640 });
    expect(outputSize(150, 200)).toEqual({ w: 150, h: 200 });
  });
});

describe('base64Bytes', () => {
  it('menghitung ukuran byte', () => {
    expect(base64Bytes(Buffer.from('abc').toString('base64'))).toBe(3);
    expect(base64Bytes(Buffer.from('abcd').toString('base64'))).toBe(4);
    expect(base64Bytes(Buffer.from('abcde').toString('base64'))).toBe(5);
  });
});
