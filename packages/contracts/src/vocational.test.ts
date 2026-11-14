import { describe, expect, it } from 'vitest';
import {
  vocationalConcentrationBodySchema,
  vocationalFieldBodySchema,
  vocationalProgramBodySchema,
  vocationalReportSettingSchema,
} from './vocational';

const id = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('kontrak struktur keahlian', () => {
  it('bidang: memangkas teks, kode Dapodik/sumber kosong menjadi null, bawaan aktif dan urutan 0', () => {
    expect(
      vocationalFieldBodySchema.parse({
        code: ' TI ',
        name: ' Teknologi Informasi ',
        dapodikCode: '  ',
        sourceRef: '',
      }),
    ).toEqual({
      code: 'TI',
      name: 'Teknologi Informasi',
      dapodikCode: null,
      sourceRef: null,
      sort: 0,
      active: true,
    });
  });

  it('kode dan nama dibatasi; karakter kode dibatasi', () => {
    expect(() => vocationalFieldBodySchema.parse({ code: '', name: 'x' })).toThrow();
    expect(() => vocationalFieldBodySchema.parse({ code: 'a'.repeat(21), name: 'x' })).toThrow();
    expect(() => vocationalFieldBodySchema.parse({ code: 'a b', name: 'x' })).toThrow();
    expect(() => vocationalFieldBodySchema.parse({ code: 'a', name: 'n'.repeat(161) })).toThrow();
    expect(() =>
      vocationalFieldBodySchema.parse({ code: 'a', name: 'x', dapodikCode: 'd'.repeat(41) }),
    ).toThrow();
    expect(() =>
      vocationalFieldBodySchema.parse({ code: 'a', name: 'x', sourceRef: 's'.repeat(61) }),
    ).toThrow();
  });

  it('program dan konsentrasi memerlukan induk berupa uuid', () => {
    expect(vocationalProgramBodySchema.parse({ code: 'RPL', name: 'RPL', fieldId: id }).fieldId).toBe(id);
    expect(() => vocationalProgramBodySchema.parse({ code: 'RPL', name: 'RPL', fieldId: 'x' })).toThrow();
    expect(
      vocationalConcentrationBodySchema.parse({ code: 'K', name: 'K', vocationalProgramId: id })
        .vocationalProgramId,
    ).toBe(id);
    expect(() => vocationalConcentrationBodySchema.parse({ code: 'K', name: 'K' })).toThrow();
  });

  it('pengaturan rapor: sakelar boolean wajib', () => {
    expect(vocationalReportSettingSchema.parse({ reportGrouped: true })).toEqual({ reportGrouped: true });
    expect(() => vocationalReportSettingSchema.parse({})).toThrow();
  });
});
