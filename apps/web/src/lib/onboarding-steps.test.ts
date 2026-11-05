import { describe, expect, it } from 'vitest';
import { ownerSteps, staffSteps } from './onboarding-steps';

describe('ownerSteps', () => {
  it('bayar selesai hanya bila langganan aktif dan tak ada invoice terbuka', () => {
    expect(ownerSteps({ subscriptionStatus: 'active', openInvoices: 0, openedSchool: false })[0]?.done).toBe(
      true,
    );
    expect(ownerSteps({ subscriptionStatus: 'active', openInvoices: 1, openedSchool: false })[0]?.done).toBe(
      false,
    );
    expect(
      ownerSteps({ subscriptionStatus: 'past_due', openInvoices: 0, openedSchool: false })[0]?.done,
    ).toBe(false);
    expect(ownerSteps({ subscriptionStatus: null, openInvoices: 0, openedSchool: false })[0]?.done).toBe(
      false,
    );
  });
  it('buka sekolah mengikuti penanda peramban', () => {
    expect(ownerSteps({ subscriptionStatus: 'active', openInvoices: 0, openedSchool: true })[1]?.done).toBe(
      true,
    );
  });
});

describe('staffSteps', () => {
  it('tanpa data tidak ada langkah', () => {
    expect(staffSteps({ smtp: undefined, payment: undefined, catalog: undefined })).toEqual([]);
  });
  it('SMTP dari environment belum selesai, dari database selesai', () => {
    const s = (source: 'database' | 'environment') =>
      staffSteps({ smtp: { source }, payment: undefined, catalog: undefined })[0]?.done;
    expect(s('environment')).toBe(false);
    expect(s('database')).toBe(true);
  });
  it('pembayaran midtrans butuh kunci server', () => {
    const p = (hasServerKey: boolean) =>
      staffSteps({
        smtp: undefined,
        payment: { source: 'database', provider: 'midtrans', hasServerKey },
        catalog: undefined,
      })[0]?.done;
    expect(p(false)).toBe(false);
    expect(p(true)).toBe(true);
  });
  it('katalog butuh dasar aktif, tingkat aktif, dan paket aktif', () => {
    const c = (
      items: { kind: 'base' | 'module' | 'tier'; active: boolean }[],
      plans: { active: boolean }[],
    ) => staffSteps({ smtp: undefined, payment: undefined, catalog: { items, plans } })[0]?.done;
    expect(
      c(
        [
          { kind: 'base', active: true },
          { kind: 'tier', active: true },
        ],
        [{ active: true }],
      ),
    ).toBe(true);
    expect(c([{ kind: 'base', active: true }], [{ active: true }])).toBe(false);
    expect(
      c(
        [
          { kind: 'base', active: true },
          { kind: 'tier', active: true },
        ],
        [{ active: false }],
      ),
    ).toBe(false);
  });
});
