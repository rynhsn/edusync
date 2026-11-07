import { describe, expect, it } from 'vitest';
import { POLICY_ORDER, validateDevice, validatePolicy } from './attendance-settings-validation';

const ok = { lateAfter: '07:15', departureFrom: '14:00', debounceSeconds: '30' };

describe('validatePolicy', () => {
  it('menerima kebijakan yang benar', () => {
    expect(validatePolicy(ok)).toEqual({});
    expect(validatePolicy({ ...ok, debounceSeconds: '0' })).toEqual({});
    expect(validatePolicy({ ...ok, debounceSeconds: '600' })).toEqual({});
  });

  it('jam terlambat harus lebih awal dari jam pulang (sama pun ditolak, seperti server)', () => {
    expect(validatePolicy({ ...ok, departureFrom: '07:15' }).departureFrom).toMatchObject({
      key: 'areaForms.departureAfterLate',
    });
    expect(validatePolicy({ ...ok, departureFrom: '07:00' }).departureFrom).toMatchObject({
      key: 'areaForms.departureAfterLate',
    });
    expect(validatePolicy({ ...ok, departureFrom: '07:16' }).departureFrom).toBeUndefined();
  });

  it('format jam HH:MM 24 jam', () => {
    expect(validatePolicy({ ...ok, lateAfter: '7:15' }).lateAfter).toMatchObject({
      key: 'areaForms.timeInvalid',
    });
    expect(validatePolicy({ ...ok, lateAfter: '24:00' }).lateAfter).toMatchObject({
      key: 'areaForms.timeInvalid',
    });
    expect(validatePolicy({ ...ok, lateAfter: '' }).lateAfter).toEqual({ code: 'required' });
  });

  it('urutan tidak diperiksa bila jam terlambat sendiri sudah salah', () => {
    expect(validatePolicy({ ...ok, lateAfter: '99:99' }).departureFrom).toBeUndefined();
  });

  it('jeda ulang: bulat 0..600, teks kosong atau huruf salah', () => {
    expect(validatePolicy({ ...ok, debounceSeconds: '' }).debounceSeconds).toEqual({ code: 'required' });
    expect(validatePolicy({ ...ok, debounceSeconds: 'abc' }).debounceSeconds).toEqual({ code: 'intInvalid' });
    expect(validatePolicy({ ...ok, debounceSeconds: '1.5' }).debounceSeconds).toEqual({ code: 'intInvalid' });
    expect(validatePolicy({ ...ok, debounceSeconds: '601' }).debounceSeconds).toEqual({
      code: 'range',
      min: 0,
      max: 600,
    });
    expect(validatePolicy({ ...ok, debounceSeconds: '-1' }).debounceSeconds).toMatchObject({ code: 'range' });
  });

  it('urutan isian untuk fokus', () => {
    expect(Object.keys(validatePolicy({ lateAfter: '', departureFrom: '', debounceSeconds: '' }))).toEqual(
      POLICY_ORDER,
    );
  });
});

describe('validateDevice', () => {
  it('nama 2 sampai 80 karakter', () => {
    expect(validateDevice({ name: '' }).name).toEqual({ code: 'required' });
    expect(validateDevice({ name: 'A' }).name).toMatchObject({
      key: 'areaForms.minLength',
      values: { min: 2 },
    });
    expect(validateDevice({ name: ' A ' }).name).toMatchObject({ key: 'areaForms.minLength' });
    expect(validateDevice({ name: 'Gerbang' })).toEqual({});
    expect(validateDevice({ name: 'x'.repeat(81) }).name).toEqual({ code: 'tooLong', max: 80 });
  });
});
