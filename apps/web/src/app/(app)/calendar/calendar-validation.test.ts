import { describe, expect, it } from 'vitest';
import { validateEvent } from './calendar-validation';

describe('validateEvent', () => {
  it('menerima judul dan satu tanggal', () => {
    expect(validateEvent({ title: 'Libur', startsOn: '2026-08-17', endsOn: '' })).toEqual({});
  });
  it('judul dan tanggal mulai wajib', () => {
    expect(validateEvent({ title: ' ', startsOn: '', endsOn: '' })).toEqual({
      title: { code: 'required' },
      startsOn: { code: 'required' },
    });
  });
  it('judul maksimal 120', () => {
    expect(validateEvent({ title: 'a'.repeat(121), startsOn: '2026-01-01', endsOn: '' }).title).toEqual({
      code: 'tooLong',
      max: 120,
    });
  });
  it('tanggal selesai tidak boleh sebelum mulai, boleh sama', () => {
    expect(validateEvent({ title: 'x', startsOn: '2026-01-02', endsOn: '2026-01-01' }).endsOn).toEqual({
      code: 'dateOrder',
    });
    expect(validateEvent({ title: 'x', startsOn: '2026-01-02', endsOn: '2026-01-02' })).toEqual({});
  });
});
