import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { emailsMatch, inviteScreen, inviteTokenFromUrl, staffErrorKey } from './platform-staff';

const valid = { valid: true, accountExists: true, email: 'budi@contoh.id' };

describe('emailsMatch', () => {
  it('tidak membedakan huruf besar/kecil dan spasi', () => {
    expect(emailsMatch(' Budi@Contoh.ID ', 'budi@contoh.id')).toBe(true);
    expect(emailsMatch('budi@contoh.id', 'ani@contoh.id')).toBe(false);
  });
  it('kosong tidak pernah cocok', () => {
    expect(emailsMatch(null, null)).toBe(false);
    expect(emailsMatch('a@b.id', undefined)).toBe(false);
  });
});

describe('inviteScreen', () => {
  it('undangan tidak berlaku', () => {
    expect(inviteScreen({ valid: false, accountExists: false, email: null }, 'budi@contoh.id')).toBe(
      'invalid',
    );
  });
  it('belum masuk: masuk bila akun ada, daftar bila belum', () => {
    expect(inviteScreen(valid, null)).toBe('signin');
    expect(inviteScreen({ ...valid, accountExists: false }, undefined)).toBe('signup');
  });
  it('sudah masuk: cocok siap diterima, berbeda ditolak', () => {
    expect(inviteScreen(valid, 'BUDI@contoh.id')).toBe('accept');
    expect(inviteScreen(valid, 'ani@contoh.id')).toBe('mismatch');
  });
});

describe('staffErrorKey', () => {
  it('last_admin memakai teks platform, kode lain mengikuti daftar umum', () => {
    expect(staffErrorKey(new ApiError('x', 409, 'last_admin'))).toBe('platformStaff.lastAdmin');
    expect(staffErrorKey(new ApiError('x', 409, 'already_staff'))).toBe('errors.already_staff');
    expect(staffErrorKey(new ApiError('x', 500))).toBe('errors.unknown');
  });
});

describe('inviteTokenFromUrl', () => {
  it('mengambil token dari tautan lengkap', () => {
    const token = 'a'.repeat(43);
    expect(inviteTokenFromUrl(`https://edusync.web.id/platform-invite/${token}`)).toBe(token);
    expect(inviteTokenFromUrl('https://edusync.web.id/invite/abc')).toBeNull();
  });
});
