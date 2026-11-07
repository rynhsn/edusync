import { describe, expect, it } from 'vitest';
import { validateRole } from './roles-validation';

const ok = { name: 'Bendahara', permissionCount: 3, nameLocked: false };

describe('validateRole', () => {
  it('menerima nama dan izin', () => expect(validateRole(ok)).toEqual({}));
  it('nama wajib, minimal 2, maksimal 40 (setelah dipangkas)', () => {
    expect(validateRole({ ...ok, name: '  ' }).name).toEqual({ code: 'required' });
    expect(validateRole({ ...ok, name: ' a ' }).name).toMatchObject({
      code: 'custom',
      key: 'areaForms.minLength',
      values: { min: 2 },
    });
    expect(validateRole({ ...ok, name: 'ab' })).toEqual({});
    expect(validateRole({ ...ok, name: 'a'.repeat(41) }).name).toEqual({ code: 'tooLong', max: 40 });
  });
  it('minimal satu izin', () => {
    expect(validateRole({ ...ok, permissionCount: 0 }).permissions).toEqual({ code: 'choose' });
  });
  it('nama peran sistem terkunci tidak diperiksa', () => {
    expect(validateRole({ ...ok, name: '', nameLocked: true })).toEqual({});
  });
});
