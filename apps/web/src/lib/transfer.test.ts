import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import {
  buildClassMoveBody,
  buildTransferEditBody,
  buildTransferInBody,
  buildTransferOutBody,
  EMPTY_TRANSFER,
  isFinalLevelBlock,
  normalizeReason,
  npsnIssue,
  reasonForKind,
  transferToValues,
  validateTransfer,
  yearEvents,
} from './transfer';

const base = { ...EMPTY_TRANSFER, effectiveOn: '2026-11-10' };

describe('npsnIssue', () => {
  it('kosong lolos, 8 angka lolos', () => {
    expect(npsnIssue('')).toBeUndefined();
    expect(npsnIssue('  ')).toBeUndefined();
    expect(npsnIssue('20212345')).toBeUndefined();
    expect(npsnIssue(' 20212345 ')).toBeUndefined();
  });
  it('selain 8 angka ditolak', () => {
    for (const v of ['1234567', '123456789', '2021234a', '2021 2345']) {
      expect(npsnIssue(v)).toEqual({ code: 'npsn' });
    }
  });
});

describe('validateTransfer', () => {
  it('tanggal efektif wajib dan harus tanggal nyata', () => {
    expect(validateTransfer({ ...base, effectiveOn: '' }).effectiveOn).toEqual({ code: 'required' });
    expect(validateTransfer({ ...base, effectiveOn: '2026-02-30' }).effectiveOn).toEqual({
      code: 'dateInvalid',
    });
    expect(validateTransfer(base)).toEqual({});
  });
  it('saat mengubah, tanggal efektif tidak diperiksa', () => {
    expect(validateTransfer({ ...base, effectiveOn: '' }, { editing: true })).toEqual({});
  });
  it('NPSN, panjang, dan tanggal surat', () => {
    const e = validateTransfer({
      ...base,
      counterpartNpsn: '123',
      letterNumber: 'x'.repeat(101),
      reasonNote: 'y'.repeat(1001),
      letterDate: 'bukan-tanggal',
    });
    expect(e.counterpartNpsn).toEqual({ code: 'npsn' });
    expect(e.letterNumber).toEqual({ code: 'tooLong', max: 100 });
    expect(e.reasonNote).toEqual({ code: 'tooLong', max: 1000 });
    expect(e.letterDate).toEqual({ code: 'dateInvalid' });
  });
  it('alasan pengecualian wajib hanya saat larangan ditimpa', () => {
    expect(validateTransfer(base).exceptionReason).toBeUndefined();
    expect(validateTransfer(base, { needsException: true }).exceptionReason).toEqual({ code: 'required' });
    expect(
      validateTransfer({ ...base, exceptionReason: '   ' }, { needsException: true }).exceptionReason,
    ).toEqual({ code: 'required' });
    expect(
      validateTransfer({ ...base, exceptionReason: 'Pindah tugas orang tua' }, { needsException: true }),
    ).toEqual({});
  });
});

describe('penyusunan isi permintaan', () => {
  it('mutasi keluar: kosong menjadi null, pengecualian hanya bila diisi', () => {
    const body = buildTransferOutBody(
      { ...base, counterpartSchoolName: '  SMKN 1  ', letterDate: '' },
      'transfer',
    );
    expect(body).toEqual({
      effectiveOn: '2026-11-10',
      kind: 'transfer',
      reason: 'parent_relocation',
      reasonNote: null,
      counterpartSchoolName: 'SMKN 1',
      counterpartNpsn: null,
      letterNumber: null,
      letterDate: null,
    });
    expect('exceptionReason' in body).toBe(false);
    expect(buildTransferOutBody({ ...base, exceptionReason: ' alasan ' }, 'dropped')).toMatchObject({
      kind: 'dropped',
      exceptionReason: 'alasan',
    });
  });
  it('mutasi masuk membawa data murid dan kelas tujuan', () => {
    const body = buildTransferInBody({ name: 'Budi', gender: 'L' as const }, base, 'cls-1');
    expect(body).toMatchObject({ name: 'Budi', gender: 'L', classId: 'cls-1', effectiveOn: '2026-11-10' });
  });
  it('ubah keterangan tidak mengirim tanggal efektif', () => {
    const body = buildTransferEditBody({ ...base, letterNumber: '421/2026', letterDate: '2026-11-01' });
    expect(body).not.toHaveProperty('effectiveOn');
    expect(body).toMatchObject({ letterNumber: '421/2026', letterDate: '2026-11-01' });
  });
  it('pindah kelas: tanggal dan alasan opsional', () => {
    expect(buildClassMoveBody('c1', '', '  ')).toEqual({ classId: 'c1' });
    expect(buildClassMoveBody(null, '2026-11-12', ' naik tingkat ')).toEqual({
      classId: null,
      effectiveOn: '2026-11-12',
      reason: 'naik tingkat',
    });
  });
});

describe('alasan dan galat', () => {
  it('memetakan alasan yang tidak dikenal ke lainnya', () => {
    expect(normalizeReason('school_choice')).toBe('school_choice');
    expect(normalizeReason('apa-saja')).toBe('other');
    expect(normalizeReason(null)).toBe('other');
  });
  it('alasan mengikuti jenis', () => {
    expect(reasonForKind('dropped', 'other')).toBe('dropped');
    expect(reasonForKind('transfer', 'dropped')).toBe('other');
    expect(reasonForKind('transfer', 'school_choice')).toBe('school_choice');
  });
  it('mengenali galat larangan semester genap tingkat akhir', () => {
    expect(isFinalLevelBlock(new ApiError('x', 409, 'transfer_final_level_even_semester'))).toBe(true);
    expect(isFinalLevelBlock(new ApiError('x', 409, 'student_not_active'))).toBe(false);
    expect(isFinalLevelBlock(new Error('x'))).toBe(false);
  });
  it('transferToValues menormalkan data tersimpan', () => {
    const v = transferToValues({
      effectiveOn: '2026-11-10',
      reason: 'zzz',
      reasonNote: null,
      counterpartSchoolName: 'SMA 2',
      counterpartNpsn: null,
      letterNumber: null,
      letterDate: null,
    });
    expect(v.reason).toBe('other');
    expect(v.counterpartSchoolName).toBe('SMA 2');
    expect(v.reasonNote).toBe('');
  });
});

describe('yearEvents', () => {
  it('mengurutkan perpindahan kelas dan mutasi menurut tanggal', () => {
    const ev = yearEvents({
      classChanges: [{ effectiveOn: '2026-09-01' }, { effectiveOn: '2026-11-01' }],
      transfers: [{ effectiveOn: '2026-10-01' }, { effectiveOn: '2026-09-01' }],
    });
    expect(ev.map((e) => `${e.type}:${e.date}`)).toEqual([
      'classChange:2026-09-01',
      'transfer:2026-09-01',
      'transfer:2026-10-01',
      'classChange:2026-11-01',
    ]);
  });
});
