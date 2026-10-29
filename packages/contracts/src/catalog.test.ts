import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOG,
  QuoteError,
  quoteUnit,
  quoteUnits,
  registrationInput,
  slugify,
  slugSchema,
  withRequirements,
} from './catalog';

describe('harga', () => {
  it('unit dengan modul inti saja', () => {
    const q = quoteUnit(DEFAULT_CATALOG, { modules: [], tier: 't300' }, 'monthly');
    expect(q.total).toBe(150_000);
    expect(q.lines).toHaveLength(1);
  });

  it('menambah modul dan tingkat siswa', () => {
    const q = quoteUnit(DEFAULT_CATALOG, { modules: ['attendance', 'grades'], tier: 't800' }, 'monthly');
    expect(q.total).toBe(150_000 + 100_000 + 100_000 + 75_000);
  });

  it('tahunan membayar 10 bulan', () => {
    const monthly = quoteUnit(DEFAULT_CATALOG, { modules: ['attendance'], tier: 't300' }, 'monthly').total;
    const yearly = quoteUnit(DEFAULT_CATALOG, { modules: ['attendance'], tier: 't300' }, 'yearly').total;
    expect(yearly).toBe(monthly * 10);
  });

  it('syarat modul ditambahkan otomatis dan tidak dihitung dua kali', () => {
    expect(withRequirements(['assessments']).sort()).toEqual(['assessments', 'grades']);
    const q = quoteUnit(DEFAULT_CATALOG, { modules: ['assessments', 'grades'], tier: 't300' }, 'monthly');
    expect(q.lines.filter((l) => l.key === 'grades')).toHaveLength(1);
    expect(q.total).toBe(150_000 + 50_000 + 75_000);
  });

  it('urutan dan duplikat modul tidak mengubah harga', () => {
    const a = quoteUnit(
      DEFAULT_CATALOG,
      { modules: ['grades', 'attendance', 'grades'], tier: 't300' },
      'monthly',
    );
    const b = quoteUnit(DEFAULT_CATALOG, { modules: ['attendance', 'grades'], tier: 't300' }, 'monthly');
    expect(a.total).toBe(b.total);
  });

  it('menolak modul atau tingkat yang tidak ada', () => {
    expect(() => quoteUnit(DEFAULT_CATALOG, { modules: ['tidak-ada'], tier: 't300' }, 'monthly')).toThrow(
      QuoteError,
    );
    expect(() => quoteUnit(DEFAULT_CATALOG, { modules: [], tier: 'raksasa' }, 'monthly')).toThrow(QuoteError);
  });

  it('beberapa unit dijumlahkan dalam satu invoice', () => {
    const q = quoteUnits(
      DEFAULT_CATALOG,
      [
        { name: 'SMP IT', modules: ['attendance'], tier: 't300' },
        { name: 'SMK', modules: ['internship'], tier: 't800' },
      ],
      'monthly',
    );
    expect(q.total).toBe(150_000 + 100_000 + (150_000 + 100_000 + 50_000 + 50_000));
    expect(q.lines.every((l) => l.name.startsWith('SMP IT') || l.name.startsWith('SMK'))).toBe(true);
  });
});

describe('subdomain', () => {
  it('menerima format yang benar', () => {
    for (const ok of ['smk-mh', 'sman1', 'abc']) expect(slugSchema.safeParse(ok).success, ok).toBe(true);
  });

  it('menolak format salah dan nama dicadangkan', () => {
    for (const bad of ['ab', 'SMK', '-smk', 'smk-', 'smk--mh', 'smk mh', 'smk_mh', 'www', 'admin']) {
      expect(slugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('slugify menghasilkan saran yang valid', () => {
    expect(slugify('SMP IT Miftahul Huda')).toBe('smp-it-miftahul-huda');
    expect(slugify('  Yayasan Pendidikan Ñandú!! ')).toBe('yayasan-pendidikan-nandu');
    expect(slugSchema.safeParse(slugify('SMK Negeri 1 Cendekia')).success).toBe(true);
  });
});

describe('input pendaftaran', () => {
  const valid = {
    foundationName: 'Yayasan Miftahul Huda',
    period: 'monthly' as const,
    units: [{ name: 'SMP IT Miftahul Huda', slug: 'smpit-mh', modules: ['attendance'], tier: 't300' }],
  };

  it('menerima input yang benar', () => {
    expect(registrationInput.safeParse(valid).success).toBe(true);
  });

  it('wajib punya minimal satu unit', () => {
    expect(registrationInput.safeParse({ ...valid, units: [] }).success).toBe(false);
  });
});
