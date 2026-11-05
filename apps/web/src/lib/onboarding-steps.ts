/**
 * Logika murni panduan awal (OnboardingCard) untuk pemilik lembaga dan staf platform. Hanya menghitung
 * status selesai dari data yang sudah ada; teks dan tautan tampilan dipasang oleh komponen.
 */

export interface StepState {
  id: string;
  done: boolean;
  href: string;
}

interface OwnerInput {
  subscriptionStatus: 'pending_payment' | 'active' | 'past_due' | 'suspended' | 'canceled' | null;
  openInvoices: number;
  /** Pemilik sudah pernah menekan "Buka sekolah" di peramban ini (tidak ada data server untuk ini). */
  openedSchool: boolean;
}

export function ownerSteps(i: OwnerInput): StepState[] {
  return [
    {
      id: 'pay',
      done: i.subscriptionStatus === 'active' && i.openInvoices === 0,
      href: '/account/billing',
    },
    { id: 'openSchool', done: i.openedSchool, href: '/account/units' },
  ];
}

interface StaffInput {
  smtp: { source: 'database' | 'environment' } | undefined;
  payment:
    | { source: 'database' | 'environment'; provider: 'dev' | 'midtrans'; hasServerKey: boolean }
    | undefined;
  catalog:
    | {
        items: { kind: 'base' | 'module' | 'tier'; active: boolean }[];
        plans: { active: boolean }[];
      }
    | undefined;
}

/** Langkah yang datanya belum termuat tidak ditampilkan (undefined), supaya kartu tidak berkedip. */
export function staffSteps(i: StaffInput): StepState[] {
  const steps: StepState[] = [];
  if (i.smtp) steps.push({ id: 'email', done: i.smtp.source === 'database', href: '/platform/email' });
  if (i.payment) {
    steps.push({
      id: 'payment',
      done: i.payment.source === 'database' && (i.payment.provider === 'dev' || i.payment.hasServerKey),
      href: '/platform/payments',
    });
  }
  if (i.catalog) {
    const has = (kind: 'base' | 'tier') => i.catalog?.items.some((x) => x.kind === kind && x.active);
    steps.push({
      id: 'catalog',
      done: !!has('base') && !!has('tier') && i.catalog.plans.some((p) => p.active),
      href: '/platform/catalog',
    });
  }
  return steps;
}

const OPENED_KEY = (foundationId: string) => `edusync.openedSchool.${foundationId}`;

export function readOpenedSchool(foundationId: string): boolean {
  try {
    return localStorage.getItem(OPENED_KEY(foundationId)) === '1';
  } catch {
    return false;
  }
}

export function markOpenedSchool(foundationId: string) {
  try {
    localStorage.setItem(OPENED_KEY(foundationId), '1');
  } catch {
    // Penyimpanan diblokir: langkah tetap muncul, tidak fatal.
  }
}
