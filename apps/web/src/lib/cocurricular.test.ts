import { describe, expect, it } from 'vitest';
import {
  cellMapFrom,
  changedCells,
  chunkBy,
  EMPTY_PROGRAM,
  type FacilitatorDraft,
  facilitatorsBody,
  facilitatorsValid,
  fillColumn,
  getCell,
  type ItemDraft,
  itemsBody,
  itemsValid,
  type LevelDraft,
  levelsBody,
  levelsValid,
  moveItem,
  pickSemester,
  programBody,
  programValid,
  refLabel,
  sameDrafts,
  sameIds,
  setCell,
  toggleId,
} from './cocurricular';

const item = (over: Partial<ItemDraft> = {}): ItemDraft => ({
  key: 'a',
  frameworkKey: 'f',
  refCode: null,
  code: 'c',
  label: 'Label',
  description: '',
  active: true,
  ...over,
});
const level = (over: Partial<LevelDraft> = {}): LevelDraft => ({
  key: 'a',
  code: 'SB',
  label: 'Sangat Baik',
  description: '',
  active: true,
  ...over,
});

describe('pembantu pengaturan kokurikuler', () => {
  it('refLabel memilih bahasa dan jatuh ke Indonesia', () => {
    const l = { labelId: 'Kewargaan', labelEn: 'Citizenship', labelSu: 'Kawargaan' };
    expect([refLabel(l, 'id'), refLabel(l, 'en'), refLabel(l, 'su'), refLabel(l, 'fr')]).toEqual([
      'Kewargaan',
      'Citizenship',
      'Kawargaan',
      'Kewargaan',
    ]);
  });

  it('moveItem menukar tetangga dan diam di ujung', () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it('itemsBody: urutan per kerangka, deskripsi kosong null, butir baru tanpa id', () => {
    const body = itemsBody([
      item({ id: 'x', frameworkKey: 'f1', code: ' a ' }),
      item({ frameworkKey: 'f2', description: '  uraian ' }),
      item({ frameworkKey: 'f1', code: 'b' }),
    ]);
    expect(body.map((b) => b.sort)).toEqual([10, 10, 20]);
    expect(body[0]).toMatchObject({ id: 'x', code: 'a', description: null });
    expect(body[1]).toMatchObject({ description: 'uraian' });
    expect(body[1]).not.toHaveProperty('id');
  });

  it('levelsBody memberi urutan dari 1', () => {
    expect(levelsBody([level(), level({ code: 'B' })]).map((l) => l.sort)).toEqual([1, 2]);
  });

  it('validasi menolak isian kosong, kode kembar, dan lebih dari 12 tingkat', () => {
    expect(levelsValid([level(), level({ code: 'B' })])).toBe(true);
    expect(levelsValid([level({ label: ' ' })])).toBe(false);
    expect(levelsValid([level(), level()])).toBe(false);
    expect(levelsValid(Array.from({ length: 13 }, (_, n) => level({ code: `L${n}` })))).toBe(false);
    expect(itemsValid([item(), item({ code: 'd' })])).toBe(true);
    expect(itemsValid([item(), item()])).toBe(false);
    expect(itemsValid([item({ frameworkKey: 'g' }), item()])).toBe(true);
  });

  it('sameDrafts mengabaikan kunci lokal', () => {
    expect(sameDrafts([item({ key: '1' })], [item({ key: '2' })])).toBe(true);
    expect(sameDrafts([item()], [item({ label: 'Lain' })])).toBe(false);
  });
});

describe('program kokurikuler', () => {
  const fac = (over: Partial<FacilitatorDraft> = {}): FacilitatorDraft => ({
    key: 'k',
    teacherId: 't1',
    classId: 'c1',
    role: 'facilitator',
    ...over,
  });
  const classes = new Set(['c1', 'c2']);

  it('programBody mengubah isian kosong menjadi null dan JP menjadi angka', () => {
    expect(
      programBody({ ...EMPTY_PROGRAM, title: ' Proyek ', plannedPeriods: ' 36 ', theme: ' ' }),
    ).toMatchObject({ semesterId: null, title: 'Proyek', theme: null, plannedPeriods: 36 });
    expect(programBody({ ...EMPTY_PROGRAM, title: 'a' }).plannedPeriods).toBeNull();
  });

  it('programValid menolak judul kosong dan JP bukan bilangan bulat tak negatif', () => {
    expect(programValid({ ...EMPTY_PROGRAM, title: 'a' })).toBe(true);
    expect(programValid({ ...EMPTY_PROGRAM, title: ' ' })).toBe(false);
    expect(programValid({ ...EMPTY_PROGRAM, title: 'a', plannedPeriods: '0' })).toBe(true);
    expect(programValid({ ...EMPTY_PROGRAM, title: 'a', plannedPeriods: '-1' })).toBe(false);
    expect(programValid({ ...EMPTY_PROGRAM, title: 'a', plannedPeriods: '1.5' })).toBe(false);
    expect(programValid({ ...EMPTY_PROGRAM, title: 'a', plannedPeriods: '100001' })).toBe(false);
  });

  it('facilitatorsBody: koordinator tanpa rombel', () => {
    expect(facilitatorsBody([fac({ role: 'coordinator' })])).toEqual([
      { teacherId: 't1', classId: null, role: 'coordinator' },
    ]);
  });

  it('facilitatorsValid menegakkan bentuk peran, rombel program, dan tanpa ganda', () => {
    expect(facilitatorsValid([fac(), fac({ role: 'coordinator', classId: '' })], classes)).toBe(true);
    expect(facilitatorsValid([fac({ classId: '' })], classes)).toBe(false);
    expect(facilitatorsValid([fac({ classId: 'zzz' })], classes)).toBe(false);
    expect(facilitatorsValid([fac({ teacherId: '' })], classes)).toBe(false);
    expect(facilitatorsValid([fac(), fac({ key: 'k2' })], classes)).toBe(false);
    expect(facilitatorsValid([fac(), fac({ key: 'k2', classId: 'c2' })], classes)).toBe(true);
  });

  it('toggleId dan sameIds', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameIds(['a'], ['b'])).toBe(false);
  });
});

describe('penilaian kokurikuler (tahap 4.3)', () => {
  const server = cellMapFrom([
    { studentId: 's1', profileItemId: 'i1', rubricLevelId: 'L1', note: null },
    { studentId: 's1', profileItemId: 'i2', rubricLevelId: null, note: 'aktif' },
  ]);
  it('peta sel dan setCell: sel kosong dibuang dari peta', () => {
    expect(getCell(server, 's1', 'i1')).toEqual({ levelId: 'L1', note: '' });
    expect(getCell(server, 's9', 'i1')).toEqual({ levelId: '', note: '' });
    expect(Object.keys(setCell(server, 's1', 'i1', { levelId: '' }))).toEqual(['s1|i2']);
    expect(setCell(server, 's2', 'i1', { levelId: 'L2' })['s2|i1']).toEqual({ levelId: 'L2', note: '' });
  });
  it('changedCells hanya mengirim sel yang berubah; dikosongkan = null/null', () => {
    expect(changedCells(server, server)).toEqual([]);
    const draft = setCell(setCell(server, 's1', 'i1', { levelId: '' }), 's2', 'i1', {
      levelId: 'L2',
      note: ' ok ',
    });
    expect(changedCells(draft, server).sort((a, b) => a.studentId.localeCompare(b.studentId))).toEqual([
      { profileItemId: 'i1', studentId: 's1', rubricLevelId: null, note: null },
      { profileItemId: 'i1', studentId: 's2', rubricLevelId: 'L2', note: 'ok' },
    ]);
  });
  it('isi massal mempertahankan catatan; chunkBy membagi per 500', () => {
    const filled = fillColumn(server, ['s1', 's2'], 'i2', 'L3');
    expect(filled['s1|i2']).toEqual({ levelId: 'L3', note: 'aktif' });
    expect(filled['s2|i2']).toEqual({ levelId: 'L3', note: '' });
    const parts = chunkBy(
      Array.from({ length: 1001 }, (_, i) => i),
      500,
    );
    expect(parts.map((p) => p.length)).toEqual([500, 500, 1]);
    expect(chunkBy([], 500)).toEqual([]);
  });
  it('pickSemester: semester berjalan, kalau tidak yang terakhir dimulai, kalau belum yang pertama', () => {
    const sems = [
      { id: 'g', startsOn: '2027-01-04', endsOn: '2027-06-30' },
      { id: 'a', startsOn: '2026-07-13', endsOn: '2026-12-20' },
    ];
    expect(pickSemester(sems, '2026-08-01')).toBe('a');
    expect(pickSemester(sems, '2026-12-25')).toBe('a');
    expect(pickSemester(sems, '2027-02-01')).toBe('g');
    expect(pickSemester(sems, '2026-01-01')).toBe('a');
    expect(pickSemester([], '2026-01-01')).toBe('');
  });
});
