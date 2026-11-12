import { describe, expect, it } from 'vitest';
import {
  CALC_MODE_KEYS,
  calcExampleResult,
  modeChange,
  modeOrDefault,
  percentageSaveBlocked,
  weightsAreComplete,
  weightsSumFromMessage,
  weightsTotal,
} from './calc-mode';

describe('contoh mode nilai akhir', () => {
  it('angka contoh sama dengan rumus sebenarnya', () => {
    // (80*30 + 70*30) / 60 = 75; 80*30% + 70*30% + 0*40% = 45; (80 + 70) / 2 = 75
    expect(calcExampleResult('weighted_average')).toBe(75);
    expect(calcExampleResult('percentage')).toBe(45);
    expect(calcExampleResult('simple_average')).toBe(75);
  });
  it('mencakup ketiga mode resmi', () => {
    expect([...CALC_MODE_KEYS]).toEqual(['weighted_average', 'percentage', 'simple_average']);
  });
});

describe('perubahan mode', () => {
  it('data lama tanpa mode dianggap rata-rata tertimbang', () => {
    expect(modeOrDefault(undefined)).toBe('weighted_average');
    expect(modeOrDefault(null)).toBe('weighted_average');
  });
  it('mode hanya dikirim bila berubah', () => {
    expect(modeChange('weighted_average', 'weighted_average')).toEqual({});
    expect(modeChange(undefined, 'weighted_average')).toEqual({});
    expect(modeChange('weighted_average', 'percentage')).toEqual({ calculationMode: 'percentage' });
    expect(modeChange('percentage', 'weighted_average')).toEqual({ calculationMode: 'weighted_average' });
  });
});

describe('jumlah bobot untuk mode persentase', () => {
  it('menjumlahkan bobot komponen', () => {
    expect(weightsTotal([])).toBe(0);
    expect(weightsTotal([{ weight: 20 }, { weight: 30 }, { weight: 20 }, { weight: 30 }])).toBe(100);
    expect(weightsTotal([{ weight: 40 }, { weight: 50 }])).toBe(90);
  });
  it('hanya 100 tepat yang lengkap', () => {
    expect(weightsAreComplete(100)).toBe(true);
    expect(weightsAreComplete(99)).toBe(false);
    expect(weightsAreComplete(101)).toBe(false);
    expect(weightsAreComplete(0)).toBe(false);
  });
  it('menyimpan mode persentase diblokir bila bobot bukan 100', () => {
    expect(percentageSaveBlocked('weighted_average', 'percentage', 90)).toBe(true);
    expect(percentageSaveBlocked(undefined, 'percentage', 110)).toBe(true);
    expect(percentageSaveBlocked('weighted_average', 'percentage', 100)).toBe(false);
  });
  it('mode lain, atau mode persentase yang sudah tersimpan (mode tidak dikirim), tidak diblokir', () => {
    expect(percentageSaveBlocked('percentage', 'weighted_average', 90)).toBe(false);
    expect(percentageSaveBlocked('weighted_average', 'simple_average', 10)).toBe(false);
    expect(percentageSaveBlocked('percentage', 'percentage', 90)).toBe(false);
  });
  it('jumlah bobot dibaca dari pesan galat server', () => {
    expect(
      weightsSumFromMessage(
        'Mode persentase mensyaratkan jumlah bobot komponen tepat 100 (sekarang 90). Sesuaikan bobot komponen lebih dulu.',
      ),
    ).toBe(90);
    expect(weightsSumFromMessage('sekarang 99,5)')).toBe(99.5);
    expect(weightsSumFromMessage('pesan lain')).toBeNull();
  });
});
