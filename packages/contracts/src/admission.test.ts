import { describe, expect, it } from 'vitest';
import {
  ADMISSION_STATUSES,
  ADMISSION_TRANSITIONS,
  canTransition,
  detectMime,
  MAX_DOC_BYTES,
  normalizeApplicantName,
} from './admission';

describe('canTransition', () => {
  it('mengikuti tabel peralihan', () => {
    expect(canTransition('submitted', 'verified')).toBe(true);
    expect(canTransition('submitted', 'rejected')).toBe(true);
    expect(canTransition('submitted', 'withdrawn')).toBe(true);
    expect(canTransition('verified', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'enrolled')).toBe(true);
    expect(canTransition('accepted', 'rejected')).toBe(true);
    expect(canTransition('rejected', 'verified')).toBe(true);
  });

  it('menolak lompatan dan peralihan dari status akhir', () => {
    expect(canTransition('submitted', 'accepted')).toBe(false);
    expect(canTransition('submitted', 'enrolled')).toBe(false);
    expect(canTransition('verified', 'enrolled')).toBe(false);
    expect(canTransition('rejected', 'accepted')).toBe(false);
    for (const to of ADMISSION_STATUSES) {
      expect(canTransition('enrolled', to)).toBe(false);
      expect(canTransition('withdrawn', to)).toBe(false);
    }
  });

  it('tidak ada peralihan ke diri sendiri', () => {
    for (const s of ADMISSION_STATUSES) expect(ADMISSION_TRANSITIONS[s]).not.toContain(s);
  });
});

describe('detectMime', () => {
  it('mengenali PDF, JPEG, dan PNG dari magic bytes', () => {
    expect(detectMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf');
    expect(detectMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png');
  });

  it('menolak yang lain, kosong, dan terlalu pendek', () => {
    expect(detectMime(new Uint8Array([]))).toBeNull();
    expect(detectMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectMime(new Uint8Array([0x25, 0x50, 0x44]))).toBeNull();
    expect(detectMime(Uint8Array.from([60, 104, 116, 109, 108, 62]))).toBeNull();
    expect(detectMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(detectMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // ZIP
  });

  it('batas dokumen 2 MB', () => {
    expect(MAX_DOC_BYTES).toBe(2_097_152);
  });
});

describe('normalizeApplicantName', () => {
  it('memadatkan spasi dan memangkas tepi', () => {
    expect(normalizeApplicantName('  Siti   Aisyah \t Putri\n')).toBe('Siti Aisyah Putri');
    expect(normalizeApplicantName('Budi')).toBe('Budi');
    expect(normalizeApplicantName('   ')).toBe('');
  });
});
