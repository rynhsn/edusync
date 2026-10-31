import { z } from 'zod';

/** Kunci baris `platform_setting` untuk parameter penagihan. */
export const BILLING_SETTINGS_KEY = 'billing';

/** Parameter penagihan yang dapat diatur staf platform. */
export interface BillingSettings {
  /** Hari setelah akhir periode sebelum sekolah ditangguhkan (masa tenggang). */
  graceDays: number;
  /** Berapa hari sebelum akhir periode invoice perpanjangan dibuat. */
  renewalLeadDays: number;
  /** Lama pesanan subdomain dan invoice pendaftaran berlaku (jam). */
  reservationHours: number;
  /** Bayar tahunan = sekian bulan. */
  yearlyMonths: number;
}

/** Nilai bawaan (sama dengan konstanta lama) bila belum diatur atau tersimpan rusak. */
export const DEFAULT_BILLING_SETTINGS: Readonly<BillingSettings> = {
  graceDays: 7,
  renewalLeadDays: 7,
  reservationHours: 24,
  yearlyMonths: 10,
};

/** Rentang yang diizinkan; juga dipakai formulir konsol. */
export const BILLING_SETTINGS_LIMITS = {
  graceDays: { min: 0, max: 90 },
  renewalLeadDays: { min: 1, max: 90 },
  reservationHours: { min: 1, max: 168 },
  yearlyMonths: { min: 1, max: 12 },
} as const;

const field = (key: keyof BillingSettings) =>
  z.number().int().min(BILLING_SETTINGS_LIMITS[key].min).max(BILLING_SETTINGS_LIMITS[key].max);

export const billingSettingsSchema = z.object({
  graceDays: field('graceDays').describe('Masa tenggang setelah periode habis sebelum ditangguhkan (hari)'),
  renewalLeadDays: field('renewalLeadDays').describe(
    'Invoice perpanjangan dibuat sekian hari sebelum periode habis',
  ),
  reservationHours: field('reservationHours').describe(
    'Lama pesanan subdomain dan invoice pendaftaran berlaku (jam)',
  ),
  yearlyMonths: field('yearlyMonths').describe('Bayar tahunan dihitung sekian bulan'),
});

/** Gabungkan nilai tersimpan (boleh sebagian/rusak) dengan bawaan; nilai di luar rentang diganti bawaan. */
export function parseBillingSettings(raw: unknown): BillingSettings {
  const out: BillingSettings = { ...DEFAULT_BILLING_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const v = raw as Record<string, unknown>;
  for (const key of Object.keys(BILLING_SETTINGS_LIMITS) as (keyof BillingSettings)[]) {
    const n = v[key];
    const { min, max } = BILLING_SETTINGS_LIMITS[key];
    if (typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max) out[key] = n;
  }
  return out;
}
