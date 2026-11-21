import { describe, expect, it } from 'vitest';
import {
  checkFlowItems,
  gradeFromLevelCode,
  isPhase,
  isValidFlowQuantity,
  isValidPlanLink,
  MAX_FLOW_ITEMS,
  MAX_JOURNAL_NOTE,
  MAX_JOURNAL_OBJECTIVES,
  MAX_JOURNAL_TOPIC,
  PHASES,
  phaseForGrade,
  phaseForLevelCode,
} from './teaching-plan';

describe('fase', () => {
  it('daftar fase A sampai F dan pengenalannya', () => {
    expect(PHASES).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(isPhase('D')).toBe(true);
    expect(isPhase('G')).toBe(false);
    expect(isPhase(null)).toBe(false);
  });

  it('memetakan kelas ke fase', () => {
    const expected: Record<number, string> = {
      1: 'A',
      2: 'A',
      3: 'B',
      4: 'B',
      5: 'C',
      6: 'C',
      7: 'D',
      8: 'D',
      9: 'D',
      10: 'E',
      11: 'F',
      12: 'F',
    };
    for (const [grade, phase] of Object.entries(expected)) expect(phaseForGrade(Number(grade))).toBe(phase);
    expect(phaseForGrade(0)).toBeNull();
    expect(phaseForGrade(13)).toBeNull();
    expect(phaseForGrade(7.5)).toBeNull();
  });

  it('memetakan kode tingkat angka dan Romawi', () => {
    expect(gradeFromLevelCode('7')).toBe(7);
    expect(gradeFromLevelCode(' viii ')).toBe(8);
    expect(gradeFromLevelCode('XII')).toBe(12);
    expect(gradeFromLevelCode('TK-A')).toBeNull();
    expect(phaseForLevelCode('X')).toBe('E');
    expect(phaseForLevelCode('XI')).toBe('F');
    expect(phaseForLevelCode('3')).toBe('B');
    expect(phaseForLevelCode('ZZ')).toBeNull();
  });
});

describe('isi ATP', () => {
  it('menolak duplikat dan kelebihan item', () => {
    expect(checkFlowItems([{ objectiveId: 'a' }, { objectiveId: 'b' }])).toBeNull();
    expect(checkFlowItems([{ objectiveId: 'a' }, { objectiveId: 'a' }])).toBe('duplicate_entry');
    const many = Array.from({ length: MAX_FLOW_ITEMS + 1 }, (_, i) => ({ objectiveId: String(i) }));
    expect(checkFlowItems(many)).toBe('too_many');
    expect(checkFlowItems(many.slice(0, MAX_FLOW_ITEMS))).toBeNull();
  });

  it('memvalidasi jumlah minggu dan JP', () => {
    for (const ok of [null, undefined, 0, 4, 9999]) expect(isValidFlowQuantity(ok)).toBe(true);
    for (const bad of [-1, 2.5, 10_000]) expect(isValidFlowQuantity(bad)).toBe(false);
  });
});

describe('tautan perencanaan', () => {
  it('hanya menerima https tanpa spasi dan maksimal 500 karakter', () => {
    expect(isValidPlanLink('https://drive.example.com/folder/abc?x=1')).toBe(true);
    for (const bad of [
      'http://a.com',
      'javascript:alert(1)',
      'https://a b.com',
      'https://',
      'ftp://a.com',
      '',
    ]) {
      expect(isValidPlanLink(bad)).toBe(false);
    }
    expect(isValidPlanLink(`https://a.com/${'x'.repeat(500)}`)).toBe(false);
  });
});

describe('batas jurnal mengajar', () => {
  it('topik 200, catatan 2000, TP 10 (sama dengan CHECK migrasi 0123 dan skema API)', () => {
    expect([MAX_JOURNAL_TOPIC, MAX_JOURNAL_NOTE, MAX_JOURNAL_OBJECTIVES]).toEqual([200, 2000, 10]);
  });
});
