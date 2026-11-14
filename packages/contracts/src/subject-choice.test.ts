import { describe, expect, it } from 'vitest';
import {
  blockingViolations,
  evaluateChoiceCount,
  evaluateOffered,
  evaluateStudentRules,
  pickReligionSubject,
  religionMatch,
  religionVariantOf,
  scopesOverlap,
  takesSubject,
} from './subject-choice';

describe('takesSubject', () => {
  it('mapel tanpa penanda diikuti semua murid', () => {
    expect(takesSubject({ participating: false, rows: [], semesterId: 's1' })).toBe(true);
  });
  it('mapel berpenanda hanya diikuti murid yang punya baris setahun atau semester itu', () => {
    expect(takesSubject({ participating: true, rows: [], semesterId: 's1' })).toBe(false);
    expect(takesSubject({ participating: true, rows: [{ semesterId: null }], semesterId: 's2' })).toBe(true);
    expect(takesSubject({ participating: true, rows: [{ semesterId: 's1' }], semesterId: 's1' })).toBe(true);
    expect(takesSubject({ participating: true, rows: [{ semesterId: 's1' }], semesterId: 's2' })).toBe(false);
  });
  it('cakupan bertumpuk bila salah satunya setahun atau semesternya sama', () => {
    expect(scopesOverlap({ semesterId: null }, { semesterId: 's1' })).toBe(true);
    expect(scopesOverlap({ semesterId: 's1' }, { semesterId: 's1' })).toBe(true);
    expect(scopesOverlap({ semesterId: 's1' }, { semesterId: 's2' })).toBe(false);
  });
});

describe('aturan pilihan', () => {
  const rule = { minChoices: 4, maxChoices: 5, minOffered: 7 };
  it('status jumlah dan jumlah ditawarkan', () => {
    expect(evaluateChoiceCount(rule, 3)).toBe('below_min');
    expect(evaluateChoiceCount(rule, 4)).toBe('ok');
    expect(evaluateChoiceCount(rule, 5)).toBe('ok');
    expect(evaluateChoiceCount(rule, 6)).toBe('above_max');
    expect(evaluateChoiceCount({ minChoices: null, maxChoices: null }, 99)).toBe('ok');
    expect(evaluateOffered(rule, 6)).toBe(false);
    expect(evaluateOffered(rule, 7)).toBe(true);
    expect(evaluateOffered({ minOffered: null }, 0)).toBe(true);
  });
  it('satu seni: hasil per murid dan penolakan hanya bila enforce', () => {
    const rules = [
      {
        id: 'r1',
        groupKey: 'arts',
        label: 'Seni',
        minChoices: 1,
        maxChoices: 1,
        minOffered: null,
        enforce: true,
        subjectIds: ['a', 'b'],
      },
      {
        id: 'r2',
        groupKey: 'religion',
        label: 'Agama',
        minChoices: 1,
        maxChoices: 1,
        minOffered: null,
        enforce: false,
        subjectIds: ['x'],
      },
    ];
    const res = evaluateStudentRules(rules, (id) => id === 'a' || id === 'b');
    expect(res.map((r) => [r.groupKey, r.count, r.status])).toEqual([
      ['arts', 2, 'above_max'],
      ['religion', 0, 'below_min'],
    ]);
    expect(blockingViolations(res).map((r) => r.groupKey)).toEqual(['arts']);
  });
});

describe('agama', () => {
  it('memetakan agama murid ke varian mapel (other = belief)', () => {
    expect(religionVariantOf('islam')).toBe('islam');
    expect(religionVariantOf('other')).toBe('belief');
    expect(religionVariantOf(null)).toBeNull();
    expect(religionMatch('hindu', 'hindu')).toBe('match');
    expect(religionMatch('hindu', 'islam')).toBe('mismatch');
    expect(religionMatch(null, 'islam')).toBe('unknown');
    expect(religionMatch('islam', null)).toBe('unknown');
  });
  it('tidak menebak: harus tepat satu mapel bervarian sesuai', () => {
    const c = [
      { id: 'i', religionVariant: 'islam' as const },
      { id: 'k', religionVariant: 'christian' as const },
      { id: 'k2', religionVariant: 'christian' as const },
    ];
    expect(pickReligionSubject('islam', c)).toEqual({ kind: 'matched', subjectId: 'i' });
    expect(pickReligionSubject('christian', c)).toEqual({ kind: 'unmatched', reason: 'ambiguous_subject' });
    expect(pickReligionSubject('hindu', c)).toEqual({ kind: 'unmatched', reason: 'no_matching_subject' });
    expect(pickReligionSubject('other', c)).toEqual({ kind: 'unmatched', reason: 'no_matching_subject' });
    expect(pickReligionSubject(null, c)).toEqual({ kind: 'unmatched', reason: 'no_religion' });
    expect(pickReligionSubject('other', [{ id: 'b', religionVariant: 'belief' }])).toEqual({
      kind: 'matched',
      subjectId: 'b',
    });
  });
});
