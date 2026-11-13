import { describe, expect, it } from 'vitest';
import { validateAssessment, validateComponent, validateThresholds } from './grade-validation';

describe('validateAssessment', () => {
  const ok = { componentId: 'c1', title: 'UH 1', date: '2026-11-05', maxScore: '100' };
  it('menerima isian benar', () => {
    expect(validateAssessment(ok)).toEqual({});
  });
  it('isian wajib kosong', () => {
    const e = validateAssessment({ componentId: '', title: ' ', date: '', maxScore: '' });
    expect(Object.keys(e)).toEqual(['componentId', 'title', 'date', 'maxScore']);
    expect(e.componentId).toEqual({ code: 'choose' });
  });
  it('judul maksimal 120', () => {
    expect(validateAssessment({ ...ok, title: 'x'.repeat(121) }).title).toEqual({
      code: 'tooLong',
      max: 120,
    });
  });
  it('nilai maksimal bulat 1..1000 (koma desimal ditolak)', () => {
    expect(validateAssessment({ ...ok, maxScore: '0' }).maxScore).toMatchObject({ code: 'range' });
    expect(validateAssessment({ ...ok, maxScore: '1001' }).maxScore).toMatchObject({ code: 'range' });
    expect(validateAssessment({ ...ok, maxScore: '99,5' }).maxScore).toEqual({ code: 'intInvalid' });
    expect(validateAssessment({ ...ok, maxScore: 'abc' }).maxScore).toEqual({ code: 'intInvalid' });
    expect(validateAssessment({ ...ok, maxScore: '1000' }).maxScore).toBeUndefined();
  });
});

describe('validateComponent', () => {
  const ok = { name: 'UTS', weight: '30', sort: '2' };
  it('menerima isian benar dan urutan kosong', () => {
    expect(validateComponent(ok)).toEqual({});
    expect(validateComponent({ ...ok, sort: '' })).toEqual({});
  });
  it('nama, bobot, dan urutan', () => {
    expect(validateComponent({ ...ok, name: '' }).name).toEqual({ code: 'required' });
    expect(validateComponent({ ...ok, name: 'x'.repeat(61) }).name).toEqual({ code: 'tooLong', max: 60 });
    expect(validateComponent({ ...ok, weight: '' }).weight).toEqual({ code: 'required' });
    expect(validateComponent({ ...ok, weight: '0' }).weight).toMatchObject({ code: 'range' });
    expect(validateComponent({ ...ok, weight: '101' }).weight).toMatchObject({ code: 'range' });
    expect(validateComponent({ ...ok, weight: '2.5' }).weight).toEqual({ code: 'intInvalid' });
    expect(validateComponent({ ...ok, sort: '-1' }).sort).toMatchObject({ code: 'range' });
    expect(validateComponent({ ...ok, sort: '1001' }).sort).toMatchObject({ code: 'range' });
  });
});

describe('validateThresholds', () => {
  const ok = { kkm: '75', predicateA: '90', predicateB: '80', predicateC: '70' };
  it('menerima batas berurutan', () => {
    expect(validateThresholds(ok)).toEqual({});
  });
  it('bulat 1..100', () => {
    expect(validateThresholds({ ...ok, kkm: '0' }).kkm).toMatchObject({ code: 'range' });
    expect(validateThresholds({ ...ok, kkm: '101' }).kkm).toMatchObject({ code: 'range' });
    expect(validateThresholds({ ...ok, kkm: '' }).kkm).toEqual({ code: 'required' });
    expect(validateThresholds({ ...ok, predicateC: '70,5' }).predicateC).toEqual({ code: 'intInvalid' });
  });
  it('KKM sekolah tetap bulat: desimal ditolak (KKM desimal diatur per mapel lewat KKTP)', () => {
    expect(validateThresholds({ ...ok, kkm: '72,5' }).kkm).toEqual({ code: 'intInvalid' });
    expect(validateThresholds({ ...ok, kkm: '72.5' }).kkm).toEqual({ code: 'intInvalid' });
    expect(validateThresholds({ ...ok, kkm: '1' })).toEqual({});
    expect(validateThresholds({ ...ok, kkm: '100' })).toEqual({});
  });
  it('A harus lebih besar dari B, B dari C', () => {
    const e = validateThresholds({ ...ok, predicateA: '80', predicateB: '80', predicateC: '85' });
    expect(e.predicateA).toMatchObject({ key: 'areaForms.predicateOrder' });
    expect(e.predicateB).toMatchObject({ key: 'areaForms.predicateOrder' });
    expect(validateThresholds({ ...ok, predicateB: '95' }).predicateA).toMatchObject({
      key: 'areaForms.predicateOrder',
    });
  });
  it('urutan tidak diperiksa bila isian lawannya sendiri salah', () => {
    expect(validateThresholds({ ...ok, predicateB: 'x' }).predicateA).toBeUndefined();
  });
});

describe('validateComponent: kategori', () => {
  it('formatif tidak memeriksa bobot (bobotnya 0 dan tidak dikirim)', () => {
    const base = { name: 'Kuis', sort: '1', category: 'formative' as const };
    expect(validateComponent({ ...base, weight: '' })).toEqual({});
    expect(validateComponent({ ...base, weight: '0' })).toEqual({});
  });
  it('sumatif tetap mewajibkan bobot 1..100', () => {
    const base = { name: 'UTS', sort: '1', category: 'summative' as const };
    expect(validateComponent({ ...base, weight: '' }).weight).toEqual({ code: 'required' });
    expect(validateComponent({ ...base, weight: '0' }).weight).toMatchObject({ code: 'range' });
    expect(validateComponent({ ...base, weight: '100' })).toEqual({});
  });
  it('formatif tetap memeriksa nama', () => {
    expect(validateComponent({ name: '', weight: '', sort: '', category: 'formative' }).name).toEqual({
      code: 'required',
    });
  });
});
