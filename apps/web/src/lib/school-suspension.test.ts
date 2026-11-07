import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { isSchoolSuspendedError, suspensionKind } from './school-suspension';

describe('suspensionKind', () => {
  it('sekolah aktif atau respons lama tanpa status tidak ditangguhkan', () => {
    expect(suspensionKind({ schoolStatus: 'active', suspendedReason: null })).toBeNull();
    expect(suspensionKind({})).toBeNull();
  });

  it('alasan tagihan dibedakan dari alasan lain', () => {
    expect(suspensionKind({ schoolStatus: 'suspended', suspendedReason: 'billing' })).toBe('billing');
    expect(suspensionKind({ schoolStatus: 'suspended', suspendedReason: 'staff' })).toBe('other');
    expect(suspensionKind({ schoolStatus: 'suspended', suspendedReason: null })).toBe('other');
  });
});

describe('isSchoolSuspendedError', () => {
  it('hanya mengenali galat school_suspended dari API', () => {
    expect(isSchoolSuspendedError(new ApiError('x', 403, 'school_suspended'))).toBe(true);
    expect(isSchoolSuspendedError(new ApiError('x', 403, 'forbidden'))).toBe(false);
    expect(isSchoolSuspendedError(new Error('school_suspended'))).toBe(false);
  });
});
