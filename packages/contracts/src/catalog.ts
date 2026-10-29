import { z } from 'zod';

/**
 * Katalog harga awal. Angka di sini hanya contoh; katalog aslinya disimpan di database
 * (tabel catalog_item) sehingga harga bisa diubah tanpa deploy. Fungsi harga di bawah membaca
 * katalog dari mana pun asalnya, jadi API dan web selalu menghitung dengan aturan yang sama.
 */
export const BILLING_PERIODS = ['monthly', 'yearly'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/** Bayar tahunan = 10 bulan (hemat 2 bulan). */
export const YEARLY_MONTHS = 10;

export interface CatalogItem {
  kind: 'base' | 'module' | 'tier';
  key: string;
  name: string;
  /** Rupiah per bulan per unit. */
  priceMonthly: number;
  sort: number;
}

export const DEFAULT_CATALOG: readonly CatalogItem[] = [
  { kind: 'base', key: 'core', name: 'Modul inti (sampai 300 siswa)', priceMonthly: 150_000, sort: 0 },
  { kind: 'tier', key: 't300', name: 'Sampai 300 siswa', priceMonthly: 0, sort: 1 },
  { kind: 'tier', key: 't800', name: '301 sampai 800 siswa', priceMonthly: 100_000, sort: 2 },
  { kind: 'tier', key: 't1500', name: '801 sampai 1.500 siswa', priceMonthly: 250_000, sort: 3 },
  { kind: 'module', key: 'attendance', name: 'Absensi', priceMonthly: 100_000, sort: 10 },
  { kind: 'module', key: 'grades', name: 'Nilai dan rapor', priceMonthly: 75_000, sort: 11 },
  { kind: 'module', key: 'assessments', name: 'Penilaian non-akademik', priceMonthly: 50_000, sort: 12 },
  { kind: 'module', key: 'schedule', name: 'Jadwal pelajaran', priceMonthly: 50_000, sort: 13 },
  { kind: 'module', key: 'admissions', name: 'SPMB', priceMonthly: 75_000, sort: 14 },
  { kind: 'module', key: 'website', name: 'Website sekolah', priceMonthly: 75_000, sort: 15 },
  { kind: 'module', key: 'administration', name: 'Administrasi', priceMonthly: 50_000, sort: 16 },
  { kind: 'module', key: 'fees', name: 'SPP dan tagihan', priceMonthly: 75_000, sort: 17 },
  { kind: 'module', key: 'tahfidz', name: 'Tahfidz dan ibadah', priceMonthly: 50_000, sort: 18 },
  { kind: 'module', key: 'internship', name: 'PKL dan prakerin', priceMonthly: 50_000, sort: 19 },
  { kind: 'module', key: 'parent_portal', name: 'Portal wali dan siswa', priceMonthly: 50_000, sort: 20 },
  { kind: 'module', key: 'announcements', name: 'Pengumuman dan agenda', priceMonthly: 25_000, sort: 21 },
];

/** Modul yang dipilih bersama modul lain. Memilih yang bergantung otomatis menambah syaratnya. */
export const MODULE_REQUIRES: Readonly<Record<string, readonly string[]>> = {
  assessments: ['grades'],
  parent_portal: ['attendance'],
  internship: ['administration'],
};

export function withRequirements(modules: readonly string[]): string[] {
  const all = new Set(modules);
  for (const m of modules) for (const needed of MODULE_REQUIRES[m] ?? []) all.add(needed);
  return [...all];
}

export interface UnitSelection {
  modules: readonly string[];
  tier: string;
}

export interface QuoteLine {
  key: string;
  name: string;
  /** Per periode tagihan, sudah dikali jumlah bulan. */
  amount: number;
}

export interface Quote {
  period: BillingPeriod;
  months: number;
  lines: QuoteLine[];
  total: number;
}

export class QuoteError extends Error {}

/** Hitung harga satu unit. Menolak modul atau tingkat yang tidak ada di katalog. */
export function quoteUnit(
  catalog: readonly CatalogItem[],
  selection: UnitSelection,
  period: BillingPeriod,
  label?: string,
): Quote {
  const months = period === 'yearly' ? YEARLY_MONTHS : 1;
  const find = (kind: CatalogItem['kind'], key: string) => {
    const item = catalog.find((c) => c.kind === kind && c.key === key);
    if (!item) throw new QuoteError(`${kind} tidak dikenal: ${key}`);
    return item;
  };
  const prefix = label ? `${label}: ` : '';
  const base = find('base', 'core');
  const tier = find('tier', selection.tier);
  const lines: QuoteLine[] = [
    { key: `${prefix}core`, name: `${prefix}${base.name}`, amount: base.priceMonthly * months },
  ];
  if (tier.priceMonthly > 0) {
    lines.push({
      key: `${prefix}${tier.key}`,
      name: `${prefix}${tier.name}`,
      amount: tier.priceMonthly * months,
    });
  }
  for (const key of [...new Set(withRequirements(selection.modules))].sort()) {
    const m = find('module', key);
    lines.push({ key: `${prefix}${m.key}`, name: `${prefix}${m.name}`, amount: m.priceMonthly * months });
  }
  return { period, months, lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

/** Harga beberapa unit dalam satu invoice. */
export function quoteUnits(
  catalog: readonly CatalogItem[],
  units: readonly (UnitSelection & { name: string })[],
  period: BillingPeriod,
): Quote {
  const quotes = units.map((u) => quoteUnit(catalog, u, period, units.length > 1 ? u.name : undefined));
  const lines = quotes.flatMap((q) => q.lines);
  return {
    period,
    months: period === 'yearly' ? YEARLY_MONTHS : 1,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
  };
}

/* ---------- Subdomain sekolah ---------- */

export const RESERVED_SLUGS = new Set([
  'www',
  'api',
  'app',
  'admin',
  'platform',
  'docs',
  'status',
  'mail',
  'smtp',
  'ftp',
  'cdn',
  'static',
  'assets',
  'login',
  'register',
  'support',
  'help',
  'billing',
  'pay',
  'blog',
  'edusync',
]);

export const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Hanya huruf kecil, angka, dan tanda hubung di tengah.')
  .refine((s) => !RESERVED_SLUGS.has(s), 'Nama ini dicadangkan.');

/** Turunkan saran subdomain dari nama sekolah. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/* ---------- Pendaftaran ---------- */

export const registrationInput = z.object({
  foundationName: z.string().trim().min(3).max(120),
  period: z.enum(BILLING_PERIODS),
  units: z
    .array(
      z.object({
        name: z.string().trim().min(3).max(120),
        slug: slugSchema,
        modules: z.array(z.string().min(1)).max(40),
        tier: z.string().min(1),
      }),
    )
    .min(1)
    .max(10),
});

export type RegistrationInput = z.infer<typeof registrationInput>;
