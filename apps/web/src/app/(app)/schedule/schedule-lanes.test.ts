import { describe, expect, it } from 'vitest';
import { combineCandidates, type LaneEntry, laneOf, slotEntries } from './schedule-lanes';

const e = (patch: Partial<LaneEntry> & { id: string }): LaneEntry => ({
  classId: 'a',
  className: 'A',
  subjectId: 'fis',
  weekday: 1,
  periodId: 'p1',
  semesterId: null,
  ...patch,
});

describe('slotEntries', () => {
  it('memilih sel pada slot dan mengurutkan menurut lane (lane kosong = 0)', () => {
    const list = [
      e({ id: '2', lane: 2 }),
      e({ id: '0' }),
      e({ id: 'x', weekday: 2 }),
      e({ id: '1', lane: 1 }),
    ];
    expect(slotEntries(list, 1, 'p1').map((x) => x.id)).toEqual(['0', '1', '2']);
    expect(slotEntries(list, 3, 'p1')).toEqual([]);
  });
  it('lane bawaan 0', () => {
    expect(laneOf({})).toBe(0);
    expect(laneOf({ lane: 4 })).toBe(4);
  });
});

describe('combineCandidates', () => {
  const target = { classId: 'a', subjectId: 'fis', weekday: 1, periodId: 'p1', scopeId: '' };
  it('hanya rombel lain dengan mapel, hari, jam, dan cakupan sama', () => {
    const list = [
      e({ id: 'own' }),
      e({ id: 'b', classId: 'b' }),
      e({ id: 'sub', classId: 'c', subjectId: 'kim' }),
      e({ id: 'day', classId: 'c', weekday: 2 }),
      e({ id: 'per', classId: 'c', periodId: 'p2' }),
      e({ id: 'sem', classId: 'c', semesterId: 's1' }),
    ];
    expect(combineCandidates(list, target).map((x) => x.id)).toEqual(['b']);
    expect(combineCandidates(list, { ...target, scopeId: 's1' }).map((x) => x.id)).toEqual(['sem']);
  });
});
