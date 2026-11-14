import { describe, expect, it } from 'vitest';
import {
  UKK_BAND_SOURCES,
  UKK_DEFAULT_BANDS,
  UKK_PATTERNS,
  ukkAssessorsBodySchema,
  ukkBandOf,
  ukkEffectiveBands,
  ukkEventBodySchema,
  ukkFinalScore,
  ukkLatestScored,
  validUkkBands,
  validUkkWeights,
  vocationalUkkSettingSchema,
} from './ukk';

const ID = '0190a7f0-0000-7000-8000-000000000001';

describe('skala bawaan UKK', () => {
  it('semua skala bawaan sah dan berlabel sumber; hanya pola industry yang belum terverifikasi', () => {
    for (const p of UKK_PATTERNS) {
      expect(validUkkBands(UKK_DEFAULT_BANDS[p]), p).toBe(true);
      expect(UKK_BAND_SOURCES[p].source.length).toBeGreaterThan(0);
    }
    expect(UKK_BAND_SOURCES.lsp.verified).toBe(true);
    expect(UKK_BAND_SOURCES.independent.verified).toBe(true);
    expect(UKK_BAND_SOURCES.industry.verified).toBe(false);
    expect(UKK_DEFAULT_BANDS.industry).toEqual(UKK_DEFAULT_BANDS.lsp);
  });

  it('batas kategori: lsp 74/75, mandiri 60/61, 74/75, 90/91', () => {
    const lsp = UKK_DEFAULT_BANDS.lsp;
    expect(ukkBandOf(lsp, 0).code).toBe('bk');
    expect(ukkBandOf(lsp, 74).competent).toBe(false);
    expect(ukkBandOf(lsp, 74.99).competent).toBe(false);
    expect(ukkBandOf(lsp, 75).competent).toBe(true);
    expect(ukkBandOf(lsp, 100).label).toBe('Kompeten');
    const ind = UKK_DEFAULT_BANDS.independent;
    expect(ukkBandOf(ind, 60).label).toBe('Belum Kompeten');
    expect(ukkBandOf(ind, 61).label).toBe('Cukup Kompeten');
    expect(ukkBandOf(ind, 74).label).toBe('Cukup Kompeten');
    expect(ukkBandOf(ind, 74).competent).toBe(false);
    expect(ukkBandOf(ind, 75).label).toBe('Kompeten');
    expect(ukkBandOf(ind, 90).label).toBe('Kompeten');
    expect(ukkBandOf(ind, 91).label).toBe('Sangat Kompeten');
    expect(ukkBandOf(ind, 91).competent).toBe(true);
  });

  it('timpaan sekolah menggantikan bawaan per pola; null kembali ke bawaan', () => {
    const custom = [
      { code: 'a', label: 'Tidak', min: 0, competent: false },
      { code: 'b', label: 'Ya', min: 70, competent: true },
    ];
    expect(ukkEffectiveBands({ lsp: custom }, 'lsp')).toBe(custom);
    expect(ukkEffectiveBands({ lsp: custom }, 'industry')).toBe(UKK_DEFAULT_BANDS.industry);
    expect(ukkEffectiveBands({ lsp: null }, 'lsp')).toBe(UKK_DEFAULT_BANDS.lsp);
    expect(ukkEffectiveBands(null, 'independent')).toBe(UKK_DEFAULT_BANDS.independent);
  });
});

describe('validasi skala', () => {
  const b = (min: number, competent = false, code = String(min)) => ({
    code,
    label: `L${min}`,
    min,
    competent,
  });
  it('wajib mulai 0, naik tegas, kode unik, minimal satu kompeten, maksimal 8', () => {
    expect(validUkkBands([b(0), b(75, true)])).toBe(true);
    expect(validUkkBands([])).toBe(false);
    expect(validUkkBands([b(10), b(75, true)])).toBe(false); // celah 0-10
    expect(validUkkBands([b(0), b(50, true), b(50, true, 'x')])).toBe(false); // tumpang tindih
    expect(validUkkBands([b(0), b(60, true), b(50, true)])).toBe(false); // menurun
    expect(validUkkBands([b(0), b(50, false, '0')])).toBe(false); // kode kembar
    expect(validUkkBands([b(0), b(50)])).toBe(false); // tidak ada yang kompeten
    expect(validUkkBands(Array.from({ length: 9 }, (_, i) => b(i * 10, i === 8)))).toBe(false);
  });
});

describe('nilai akhir', () => {
  it('bobot 70:30 butuh praktik dan teori; dibulatkan 2 desimal', () => {
    expect(ukkFinalScore(80, 70, { practice: 70, theory: 30 })).toBe(77);
    expect(ukkFinalScore(81.55, 70.1, { practice: 60, theory: 40 })).toBe(76.97);
    expect(ukkFinalScore(80, null, { practice: 70, theory: 30 })).toBeNull();
    expect(ukkFinalScore(null, 70, { practice: 70, theory: 30 })).toBeNull();
    expect(ukkFinalScore(60, 90, { practice: 100, theory: 0 })).toBe(60);
  });

  it('bobot sah: bulat, tidak negatif, jumlah 100', () => {
    expect(validUkkWeights({ practice: 70, theory: 30 })).toBe(true);
    expect(validUkkWeights({ practice: 100, theory: 0 })).toBe(true);
    expect(validUkkWeights({ practice: 60, theory: 30 })).toBe(false);
    expect(validUkkWeights({ practice: 110, theory: -10 })).toBe(false);
    expect(validUkkWeights({ practice: 70.5, theory: 29.5 })).toBe(false);
  });

  it('percobaan terakhir yang bernilai dipakai; percobaan kosong dilewati', () => {
    const a = (attemptNo: number, finalScore: number | null) => ({ attemptNo, finalScore });
    expect(ukkLatestScored([])).toBeNull();
    expect(ukkLatestScored([a(1, 50), a(2, 80)])?.attemptNo).toBe(2);
    expect(ukkLatestScored([a(1, 50), a(2, null)])?.attemptNo).toBe(1);
    expect(ukkLatestScored([a(2, 80), a(1, 50)])?.attemptNo).toBe(2);
    expect(ukkLatestScored([a(1, null)])).toBeNull();
  });
});

describe('badan permintaan', () => {
  const base = {
    academicYearId: ID,
    semesterId: ID,
    concentrationId: ID,
    pattern: 'lsp',
    title: 'UKK TKJ 2026',
  };
  it('kegiatan: bawaan draft, KKNI hanya 2/3, tanggal terurut', () => {
    expect(ukkEventBodySchema.parse(base)).toMatchObject({
      status: 'draft',
      kkniLevel: null,
      partnerId: null,
    });
    expect(ukkEventBodySchema.safeParse({ ...base, kkniLevel: 4 }).success).toBe(false);
    expect(ukkEventBodySchema.safeParse({ ...base, kkniLevel: 3 }).success).toBe(true);
    expect(ukkEventBodySchema.safeParse({ ...base, pattern: 'lain' }).success).toBe(false);
    expect(
      ukkEventBodySchema.safeParse({ ...base, startsOn: '2026-12-02', endsOn: '2026-12-01' }).success,
    ).toBe(false);
  });

  it('penguji: internal wajib guru, eksternal wajib nama, maksimal 20', () => {
    expect(
      ukkAssessorsBodySchema.safeParse({ assessors: [{ kind: 'internal', teacherId: ID }] }).success,
    ).toBe(true);
    expect(ukkAssessorsBodySchema.safeParse({ assessors: [{ kind: 'internal' }] }).success).toBe(false);
    expect(ukkAssessorsBodySchema.safeParse({ assessors: [{ kind: 'external', name: ' ' }] }).success).toBe(
      false,
    );
    expect(
      ukkAssessorsBodySchema.safeParse({
        assessors: Array.from({ length: 21 }, () => ({ kind: 'internal', teacherId: ID })),
      }).success,
    ).toBe(false);
  });

  it('pengaturan: pola kosong menjadi null, skala per pola opsional', () => {
    const parsed = vocationalUkkSettingSchema.parse({
      bands: {},
      practiceWeight: null,
      theoryWeight: null,
      inReport: false,
      certificatePattern: '  ',
    });
    expect(parsed.certificatePattern).toBeNull();
  });
});
