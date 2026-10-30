import { describe, expect, it } from 'vitest';
import { canPlacementTransition, DEFAULT_PKL_ASPECTS, pklPredicate, pklResult } from './pkl';

describe('aspek bawaan', () => {
  it('total bobot 100', () => {
    expect(DEFAULT_PKL_ASPECTS.reduce((s, a) => s + a.weight, 0)).toBe(100);
  });
});

describe('pklResult', () => {
  const aspects = [
    { id: 'a', weight: 60 },
    { id: 'b', weight: 40 },
  ];
  it('null bila tak ada nilai', () => {
    const r = pklResult(aspects, []);
    expect(r.final).toBeNull();
    expect(r.perAspect.every((p) => p.value === null)).toBe(true);
  });
  it('rata-rata penilai sekolah dan industri, lalu tertimbang', () => {
    const r = pklResult(aspects, [
      { aspectId: 'a', assessor: 'school', value: 80 },
      { aspectId: 'a', assessor: 'industry', value: 90 },
      { aspectId: 'b', assessor: 'school', value: 70 },
    ]);
    expect(r.perAspect).toEqual([
      { aspectId: 'a', value: 85 },
      { aspectId: 'b', value: 70 },
    ]);
    expect(r.final).toBe(79); // (85*60 + 70*40) / 100
  });
  it('bobot dinormalisasi atas aspek yang bernilai dan dibulatkan 2 desimal', () => {
    const r = pklResult(aspects, [{ aspectId: 'b', assessor: 'industry', value: 77.777 }]);
    expect(r.final).toBe(77.78);
  });
});

describe('pklPredicate', () => {
  it('ambang A 90, B 80, C 70', () => {
    expect(pklPredicate(90)).toBe('A');
    expect(pklPredicate(89.99)).toBe('B');
    expect(pklPredicate(80)).toBe('B');
    expect(pklPredicate(70)).toBe('C');
    expect(pklPredicate(69.9)).toBe('D');
  });
});

describe('canPlacementTransition', () => {
  it('mengikuti alur status', () => {
    expect(canPlacementTransition('planned', 'active')).toBe(true);
    expect(canPlacementTransition('planned', 'cancelled')).toBe(true);
    expect(canPlacementTransition('planned', 'completed')).toBe(false);
    expect(canPlacementTransition('active', 'completed')).toBe(true);
    expect(canPlacementTransition('active', 'planned')).toBe(false);
    expect(canPlacementTransition('completed', 'cancelled')).toBe(false);
    expect(canPlacementTransition('cancelled', 'active')).toBe(false);
  });
});
