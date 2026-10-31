import { describe, expect, it } from 'vitest';
import { billingSettingsSchema, DEFAULT_BILLING_SETTINGS, parseBillingSettings } from './billing-settings';

describe('parameter penagihan', () => {
  it('bawaan sama dengan konstanta lama', () => {
    expect(DEFAULT_BILLING_SETTINGS).toEqual({
      graceDays: 7,
      renewalLeadDays: 7,
      reservationHours: 24,
      yearlyMonths: 10,
    });
    expect(parseBillingSettings(null)).toEqual(DEFAULT_BILLING_SETTINGS);
    expect(parseBillingSettings('rusak')).toEqual(DEFAULT_BILLING_SETTINGS);
  });

  it('nilai valid dipakai, nilai di luar rentang atau bukan bilangan bulat diganti bawaan', () => {
    expect(parseBillingSettings({ graceDays: 0, yearlyMonths: 12, reservationHours: 48 })).toEqual({
      graceDays: 0,
      renewalLeadDays: 7,
      reservationHours: 48,
      yearlyMonths: 12,
    });
    expect(
      parseBillingSettings({ graceDays: -1, renewalLeadDays: 0, reservationHours: 1.5, yearlyMonths: '10' }),
    ).toEqual(DEFAULT_BILLING_SETTINGS);
  });

  it('skema menolak rentang tak valid', () => {
    const ok = { graceDays: 3, renewalLeadDays: 3, reservationHours: 3, yearlyMonths: 3 };
    expect(billingSettingsSchema.safeParse(ok).success).toBe(true);
    expect(billingSettingsSchema.safeParse({ ...ok, graceDays: 91 }).success).toBe(false);
    expect(billingSettingsSchema.safeParse({ ...ok, yearlyMonths: 0 }).success).toBe(false);
    expect(billingSettingsSchema.safeParse({ graceDays: 3 }).success).toBe(false);
  });
});
