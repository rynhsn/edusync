import { describe, expect, it } from 'vitest';
import { gradingConfigVersionOf, REMEDIAL_POLICIES } from './grading-config';
import {
  effectiveScore,
  isRemedialPolicy,
  needsRemedial,
  normalizeRemedialPolicy,
  type RemedialAttempt,
  remedialCap,
} from './remedial';

const at = (attemptNo: number, value: number | null): RemedialAttempt => ({ attemptNo, value });

describe('effectiveScore: kebijakan nilai remedial', () => {
  it('record_only selalu skor asli, ada atau tidak ada percobaan', () => {
    expect(effectiveScore('record_only', { original: 50, max: 100, attempts: [at(1, 90)] })).toEqual({
      value: 50,
      source: 'original',
    });
    expect(effectiveScore('record_only', { original: null, max: 100, attempts: [at(1, 90)] })).toEqual({
      value: null,
      source: 'original',
    });
  });

  it('tanpa percobaan berisi nilai, semua kebijakan menghasilkan skor asli', () => {
    for (const policy of REMEDIAL_POLICIES) {
      for (const attempts of [[], [at(1, null)]]) {
        expect(effectiveScore(policy, { original: 60, max: 100, attempts, kkmPercent: 75 }), policy).toEqual({
          value: 60,
          source: 'original',
        });
      }
    }
  });

  it('replace_latest memakai percobaan terakhir yang berisi nilai, bahkan bila lebih rendah', () => {
    const p = { original: 60, max: 100, attempts: [at(2, 55), at(1, 80), at(3, null)] };
    expect(effectiveScore('replace_latest', p)).toEqual({ value: 55, source: 'remedial' });
  });

  it('max memakai skor tertinggi dari asli dan semua percobaan', () => {
    expect(effectiveScore('max', { original: 60, max: 100, attempts: [at(1, 85), at(2, 70)] })).toEqual({
      value: 85,
      source: 'remedial',
    });
    // Skor asli lebih tinggi: tetap asli.
    expect(effectiveScore('max', { original: 90, max: 100, attempts: [at(1, 85)] })).toEqual({
      value: 90,
      source: 'original',
    });
  });

  it('cap_at_criteria menaikkan paling tinggi ke ambang KKM dan tidak menurunkan skor asli', () => {
    const base = { max: 100, kkmPercent: 75 };
    expect(effectiveScore('cap_at_criteria', { ...base, original: 60, attempts: [at(1, 95)] })).toEqual({
      value: 75,
      source: 'remedial',
    });
    expect(effectiveScore('cap_at_criteria', { ...base, original: 60, attempts: [at(1, 70)] })).toEqual({
      value: 70,
      source: 'remedial',
    });
    // Skor asli sudah di atas ambang: tidak turun ke ambang.
    expect(effectiveScore('cap_at_criteria', { ...base, original: 80, attempts: [at(1, 95)] })).toEqual({
      value: 80,
      source: 'original',
    });
    // KKM desimal dan skor maksimum bukan 100: ambang dalam satuan skor.
    expect(
      effectiveScore('cap_at_criteria', { max: 50, kkmPercent: 72.5, original: 10, attempts: [at(1, 50)] }),
    ).toEqual({ value: 36.25, source: 'remedial' });
  });

  it('cap_at_criteria tanpa KKM diketahui berperilaku seperti max', () => {
    expect(effectiveScore('cap_at_criteria', { original: 60, max: 100, attempts: [at(1, 95)] }).value).toBe(
      95,
    );
  });

  it('mean_with_original merata-ratakan skor asli dan percobaan terakhir', () => {
    expect(
      effectiveScore('mean_with_original', { original: 60, max: 100, attempts: [at(1, 100), at(2, 81)] }),
    ).toEqual({ value: 70.5, source: 'remedial' });
  });

  it('tanpa skor asli, percobaan tetap dipakai', () => {
    const attempts = [at(1, 40), at(2, 60)];
    expect(effectiveScore('replace_latest', { original: null, max: 100, attempts }).value).toBe(60);
    expect(effectiveScore('max', { original: null, max: 100, attempts }).value).toBe(60);
    expect(effectiveScore('mean_with_original', { original: null, max: 100, attempts }).value).toBe(60);
    expect(
      effectiveScore('cap_at_criteria', { original: null, max: 100, attempts, kkmPercent: 50 }).value,
    ).toBe(50);
  });

  it('percobaan yang nilainya sama dengan skor asli dianggap sumber asli', () => {
    expect(effectiveScore('replace_latest', { original: 70, max: 100, attempts: [at(1, 70)] }).source).toBe(
      'original',
    );
  });
});

describe('pembantu kebijakan', () => {
  it('remedialCap dan needsRemedial', () => {
    expect(remedialCap(100, 75)).toBe(75);
    expect(remedialCap(20, 75)).toBe(15);
    expect(needsRemedial(74.99, 75)).toBe(true);
    expect(needsRemedial(75, 75)).toBe(false);
    expect(needsRemedial(null, 75)).toBe(false);
  });

  it('normalizeRemedialPolicy menolak nilai asing ke record_only', () => {
    expect(isRemedialPolicy('max')).toBe(true);
    expect(isRemedialPolicy('tebak')).toBe(false);
    expect(normalizeRemedialPolicy(null)).toBe('record_only');
    expect(normalizeRemedialPolicy('tebak')).toBe('record_only');
    expect(normalizeRemedialPolicy('cap_at_criteria')).toBe('cap_at_criteria');
  });

  it('salinan beku v2 hanya bila kebijakan bukan record_only (sparse)', () => {
    expect(gradingConfigVersionOf([], { remedialPolicy: null })).toBe(1);
    expect(gradingConfigVersionOf([], { remedialPolicy: 'record_only' })).toBe(1);
    expect(gradingConfigVersionOf([], { remedialPolicy: 'max' })).toBe(2);
  });
});
