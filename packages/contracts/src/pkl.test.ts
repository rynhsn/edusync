import { describe, expect, it } from 'vitest';
import {
  canPlacementTransition,
  DEFAULT_PKL_ASPECTS,
  pklPredicate,
  pklResult,
  validPklThresholds,
  validPklWeights,
} from './pkl';

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

  it('memakai ambang sekolah bila diberikan', () => {
    const custom = { predicateA: 95, predicateB: 85, predicateC: 75 };
    expect(pklPredicate(90, custom)).toBe('B');
    expect(pklPredicate(85, custom)).toBe('B');
    expect(pklPredicate(74.9, custom)).toBe('D');
  });

  it('validasi ambang: bulat 1-100 dan A > B > C', () => {
    expect(validPklThresholds({ predicateA: 90, predicateB: 80, predicateC: 70 })).toBe(true);
    expect(validPklThresholds({ predicateA: 80, predicateB: 80, predicateC: 70 })).toBe(false);
    expect(validPklThresholds({ predicateA: 90, predicateB: 70, predicateC: 80 })).toBe(false);
    expect(validPklThresholds({ predicateA: 101, predicateB: 80, predicateC: 70 })).toBe(false);
    expect(validPklThresholds({ predicateA: 90, predicateB: 80, predicateC: 0 })).toBe(false);
    expect(validPklThresholds({ predicateA: 90.5, predicateB: 80, predicateC: 70 })).toBe(false);
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

describe('pklResult dengan bobot penilai (5.3)', () => {
  const aspects = [
    { id: 'a', weight: 60 },
    { id: 'b', weight: 40 },
  ];
  const both = [
    { aspectId: 'a', assessor: 'school' as const, value: 80 },
    { aspectId: 'a', assessor: 'industry' as const, value: 90 },
    { aspectId: 'b', assessor: 'school' as const, value: 70 },
    { aspectId: 'b', assessor: 'industry' as const, value: 100 },
  ];
  it('bobot kosong atau null = hasil lama persis', () => {
    expect(pklResult(aspects, both, null)).toEqual(pklResult(aspects, both));
    expect(pklResult(aspects, both, undefined)).toEqual(pklResult(aspects, both));
  });
  it('bobot 50:50 sama dengan rata-rata biasa bila kedua penilai ada', () => {
    expect(pklResult(aspects, both, { school: 50, industry: 50 })).toEqual(pklResult(aspects, both));
  });
  it('bobot 70:30', () => {
    const r = pklResult(aspects, both, { school: 70, industry: 30 });
    // a = 80*.7 + 90*.3 = 83; b = 70*.7 + 100*.3 = 79; final = (83*60 + 79*40) / 100 = 81.4
    expect(r.perAspect.map((p) => p.value)).toEqual([83, 79]);
    expect(r.final).toBe(81.4);
  });
  it('satu penilai saja: bobot dinormalisasi atas penilai yang mengisi', () => {
    const r = pklResult(aspects, [{ aspectId: 'a', assessor: 'industry', value: 90 }], {
      school: 70,
      industry: 30,
    });
    expect(r.perAspect[0]?.value).toBe(90);
    expect(r.final).toBe(90);
  });
  it('bobot penilai yang ada 0 jatuh ke rata-rata biasa', () => {
    const r = pklResult(aspects, [{ aspectId: 'a', assessor: 'industry', value: 90 }], {
      school: 100,
      industry: 0,
    });
    expect(r.final).toBe(90);
  });
  it('validPklWeights', () => {
    expect(validPklWeights({ school: 70, industry: 30 })).toBe(true);
    expect(validPklWeights({ school: 100, industry: 0 })).toBe(true);
    expect(validPklWeights({ school: 60, industry: 30 })).toBe(false);
    expect(validPklWeights({ school: 50.5, industry: 49.5 })).toBe(false);
    expect(validPklWeights({ school: -10, industry: 110 })).toBe(false);
  });
});
