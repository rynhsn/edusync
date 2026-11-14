import { describe, expect, it } from 'vitest';
import { type EventValues, validateEvent } from './ukk-validation';

const ok: EventValues = {
  title: 'UKK TKJ',
  academicYearId: 'y',
  semesterId: 's',
  concentrationId: 'c',
  schemeName: '',
  lspName: '',
  lspLicenseRef: '',
  tukName: '',
  startsOn: '',
  endsOn: '',
};

describe('validateEvent', () => {
  it('lolos dengan isian wajib saja', () => {
    expect(validateEvent(ok)).toEqual({});
  });

  it('judul, tahun ajaran, semester, dan konsentrasi wajib', () => {
    const e = validateEvent({ ...ok, title: ' ', academicYearId: '', semesterId: '', concentrationId: '' });
    expect(Object.keys(e).sort()).toEqual(['academicYearId', 'concentrationId', 'semesterId', 'title']);
  });

  it('tanggal selesai tidak boleh sebelum tanggal mulai', () => {
    expect(validateEvent({ ...ok, startsOn: '2026-05-10', endsOn: '2026-05-09' }).endsOn).toBeDefined();
    expect(validateEvent({ ...ok, startsOn: '2026-05-10', endsOn: '2026-05-10' })).toEqual({});
  });
});
