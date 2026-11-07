import { describe, expect, it } from 'vitest';
import { validateCorrection } from './correction-validation';

describe('validateCorrection', () => {
  it('menerima kosong dan berbagai bentuk jam', () => {
    expect(validateCorrection({ checkIn: '', checkOut: '' })).toEqual({});
    expect(validateCorrection({ checkIn: '7:05', checkOut: '14.30' })).toEqual({});
    expect(validateCorrection({ checkIn: '0705', checkOut: '' })).toEqual({});
  });

  it('jam yang tidak terbaca ditandai pada isiannya', () => {
    const e = validateCorrection({ checkIn: '25:00', checkOut: 'abc' });
    expect(e.checkIn).toMatchObject({ key: 'areaForms.timeInvalid' });
    expect(e.checkOut).toMatchObject({ key: 'areaForms.timeInvalid' });
  });

  it('jam pulang tidak boleh sebelum jam datang (sama boleh)', () => {
    expect(validateCorrection({ checkIn: '08:00', checkOut: '07:59' }).checkOut).toMatchObject({
      key: 'areaForms.checkOutBeforeIn',
    });
    expect(validateCorrection({ checkIn: '08:00', checkOut: '08:00' })).toEqual({});
  });
});
