import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOG,
  QuoteError,
  quoteUnit,
  quoteUnits,
  registrationInput,
  requirementMap,
  slugify,
  slugSchema,
  tierLimit,
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

describe('katalog dinamis', () => {
  const custom = [
    ...DEFAULT_CATALOG.filter((c) => c.key !== 'assessments'),
    // Katalog menang atas bawaan: assessments kini bergantung pada administration, bukan grades.
    {
      kind: 'module' as const,
      key: 'assessments',
      name: 'Penilaian',
      priceMonthly: 50_000,
      sort: 12,
      requires: ['administration'],
    },
  ];

  it('syarat dibaca dari katalog dan jatuh ke bawaan bila modul tidak ada di katalog', () => {
    expect(withRequirements(['assessments'], custom).sort()).toEqual(['administration', 'assessments']);
    expect(withRequirements(['assessments'], []).sort()).toEqual(['assessments', 'grades']);
    expect(withRequirements(['assessments']).sort()).toEqual(['assessments', 'grades']);
  });

  it('daftar syarat kosong di katalog melepas syarat bawaan', () => {
    const open = custom.map((c) => (c.key === 'assessments' ? { ...c, requires: [] } : c));
    expect(withRequirements(['assessments'], open)).toEqual(['assessments']);
  });

  it('syarat berantai ditelusuri dan siklus tidak membuat perulangan tak hingga', () => {
    const chain = [
      { kind: 'module' as const, key: 'a', name: 'A', priceMonthly: 1, sort: 1, requires: ['b'] },
      { kind: 'module' as const, key: 'b', name: 'B', priceMonthly: 1, sort: 2, requires: ['c'] },
      { kind: 'module' as const, key: 'c', name: 'C', priceMonthly: 1, sort: 3, requires: ['a'] },
    ];
    expect(withRequirements(['a'], chain).sort()).toEqual(['a', 'b', 'c']);
  });

  it('harga memakai syarat dari katalog dan pengali tahunan yang diberikan', () => {
    const q = quoteUnit(custom, { modules: ['assessments'], tier: 't300' }, 'monthly');
    expect(q.lines.map((l) => l.key)).toEqual(expect.arrayContaining(['administration', 'assessments']));
    expect(q.lines.some((l) => l.key === 'grades')).toBe(false);
    const monthly = quoteUnit(DEFAULT_CATALOG, { modules: ['attendance'], tier: 't300' }, 'monthly').total;
    const yearly = quoteUnit(
      DEFAULT_CATALOG,
      { modules: ['attendance'], tier: 't300' },
      'yearly',
      undefined,
      { yearlyMonths: 11 },
    );
    expect(yearly.total).toBe(monthly * 11);
    expect(yearly.months).toBe(11);
    expect(
      quoteUnits(DEFAULT_CATALOG, [{ name: 'A', modules: [], tier: 't300' }], 'yearly', { yearlyMonths: 12 })
        .total,
    ).toBe(150_000 * 12);
  });

  it('requirementMap dan tierLimit', () => {
    expect(requirementMap(custom).assessments).toEqual(['administration']);
    expect(requirementMap(DEFAULT_CATALOG).parent_portal).toEqual(['attendance']);
    expect(requirementMap(DEFAULT_CATALOG).attendance).toBeUndefined();
    expect(tierLimit(DEFAULT_CATALOG, 't300')).toBe(300);
    expect(tierLimit(DEFAULT_CATALOG, 't1500')).toBe(1500);
    expect(tierLimit(DEFAULT_CATALOG, 'tidak-ada')).toBeNull();
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
