import { UKK_DEFAULT_BANDS } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import {
  bandsToDraft,
  buildItems,
  canRetake,
  documentOf,
  draftToBands,
  isDirty,
  liveResult,
  newBandDraft,
  scoreInvalid,
  type UkkStudent,
} from './lib';

const attempt = (over: Partial<UkkStudent['attempts'][number]> = {}) => ({
  attemptNo: 1,
  practiceScore: null,
  theoryScore: null,
  finalScore: null,
  bandCode: null,
  bandLabel: null,
  competent: null,
  certificateNo: null,
  statementNo: null,
  passportUnits: null,
  note: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const student = (attempts: UkkStudent['attempts'] = [], over: Partial<UkkStudent> = {}): UkkStudent => ({
  studentId: '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa1',
  name: 'Budi',
  nis: '1',
  nisn: null,
  className: 'XII TKJ',
  reportFinal: false,
  attempts,
  latestAttemptNo: null,
  ...over,
});
const bands = UKK_DEFAULT_BANDS.independent;
const W = { practice: 70, theory: 30 };

describe('isian nilai UKK', () => {
  it('menerima koma desimal dan menolak di luar 0-100', () => {
    expect(scoreInvalid('85,5')).toBe(false);
    expect(scoreInvalid('')).toBe(false);
    expect(scoreInvalid('101')).toBe(true);
    expect(scoreInvalid('abc')).toBe(true);
  });

  it('dengan bobot: nilai akhir dan kategori dihitung langsung dari praktik dan teori', () => {
    const s = student();
    expect(liveResult(s, { practice: '90', theory: '80' }, W, bands)).toMatchObject({
      final: 87,
      invalid: false,
    });
    expect(liveResult(s, { practice: '90', theory: '80' }, W, bands).band?.code).toBe('k');
    expect(liveResult(s, { practice: '95', theory: '90' }, W, bands).band?.code).toBe('sk');
    expect(liveResult(s, { practice: '90' }, W, bands).final).toBeNull();
  });

  it('tanpa bobot: nilai akhir diisi langsung; isian tak sah menahan hitungan', () => {
    const s = student();
    expect(liveResult(s, { final: '60' }, null, bands).band?.code).toBe('bk');
    expect(liveResult(s, { final: '75' }, null, bands).band?.code).toBe('k');
    expect(liveResult(s, { final: '120' }, null, bands)).toMatchObject({ final: null, invalid: true });
  });

  it('butir simpan: hanya kolom yang berubah, percobaan terakhir, kosong = hapus', () => {
    const s = student([attempt({ attemptNo: 2, practiceScore: 70, theoryScore: 60, finalScore: 67 })]);
    const r = buildItems([s], { [s.studentId]: { practice: '80', theory: '' } }, W);
    expect(r.invalid).toBe(false);
    expect(r.items).toEqual([{ studentId: s.studentId, attemptNo: 2, practiceScore: 80, theoryScore: null }]);
    expect(buildItems([s], { [s.studentId]: { practice: '70' } }, W).items).toEqual([]);
  });

  it('dengan bobot, nilai akhir tidak dikirim; tanpa bobot dikirim', () => {
    const s = student();
    expect(buildItems([s], { [s.studentId]: { final: '80' } }, W).items).toEqual([]);
    expect(buildItems([s], { [s.studentId]: { final: '80' } }, null).items[0]).toMatchObject({
      attemptNo: 1,
      finalScore: 80,
    });
  });

  it('isian tak sah ditandai dan tidak dikirim', () => {
    const s = student();
    const r = buildItems([s], { [s.studentId]: { practice: '999' } }, W);
    expect(r.invalid).toBe(true);
    expect(r.items).toEqual([]);
  });

  it('uji ulang: hanya setelah percobaan terakhir bernilai, belum batas, dan tanpa perubahan belum disimpan', () => {
    const scored = student([attempt({ finalScore: 70 })]);
    expect(canRetake(scored, undefined, 5)).toBe(true);
    expect(canRetake(scored, { practice: '10' }, 5)).toBe(false);
    expect(canRetake(student([attempt()]), undefined, 5)).toBe(false);
    expect(canRetake(student([attempt({ attemptNo: 5, finalScore: 70 })]), undefined, 5)).toBe(false);
    expect(canRetake(student(), undefined, 5)).toBe(false);
    expect(isDirty(scored, { final: '70' })).toBe(false);
  });

  it('dokumen murid: sertifikat untuk kompeten, surat keterangan untuk lainnya', () => {
    const cert = student([attempt({ finalScore: 80, competent: true, certificateNo: 'UKK/1' })], {
      latestAttemptNo: 1,
    });
    expect(documentOf(cert)).toEqual({ kind: 'certificate', number: 'UKK/1' });
    const st = student([attempt({ finalScore: 50, competent: false, statementNo: 'UKK/2' })], {
      latestAttemptNo: 1,
    });
    expect(documentOf(st)).toEqual({ kind: 'statement', number: 'UKK/2' });
    expect(documentOf(student([attempt()]))).toBeNull();
  });
});

describe('pengaturan skala UKK', () => {
  it('bolak-balik isian dan skala; isian kosong atau tak sah membuat null', () => {
    const d = bandsToDraft(UKK_DEFAULT_BANDS.lsp);
    expect(draftToBands(d)).toEqual([...UKK_DEFAULT_BANDS.lsp]);
    expect(draftToBands([newBandDraft({ code: 'x', label: '', min: '0', competent: true })])).toBeNull();
    expect(draftToBands([newBandDraft({ code: 'x', label: 'X', min: 'a', competent: true })])).toBeNull();
  });
});
