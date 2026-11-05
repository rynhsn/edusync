'use client';

import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { OnboardingCard, type OnboardingStep } from '@/components/onboarding-card';
import { isStaffNonAdmin, staffWelcomeItems } from '@/components/role-welcome-logic';

interface Props {
  kind: 'staff' | 'guardian' | 'student';
  /** Alamat rincian anak (wali dengan satu anak); bila kosong tautan mengarah ke beranda portal. */
  childHref?: string;
}

/** Sambutan untuk staf non-admin di dashboard bersama; admin sekolah tidak melihatnya. */
export function StaffWelcomeGate() {
  const { can } = useSchool();
  return isStaffNonAdmin(can) ? <RoleWelcome kind="staff" /> : null;
}

/**
 * Sambutan pertama untuk guru/staf, wali, dan siswa: apa yang bisa dilakukan di sini. Langkahnya tidak bisa
 * dihitung dari data, jadi tidak ada tanda selesai; kartu hilang bila ditutup (disimpan di peramban ini).
 */
export function RoleWelcome({ kind, childHref }: Props) {
  const t = useTranslations('roleWelcome');
  const { school, userId, can, hasModule } = useSchool();

  let steps: OnboardingStep[];
  if (kind === 'staff') {
    steps = [
      ...staffWelcomeItems(can, hasModule).map((i) => ({
        id: i.id,
        label: t(`staff.${i.id}.label`),
        hint: t(`staff.${i.id}.hint`),
        href: i.href,
        done: false,
      })),
      { id: 'docs', label: t('staff.docs.label'), hint: t('staff.docs.hint'), href: '/docs', done: false },
    ];
  } else if (kind === 'guardian') {
    const href = childHref ?? '/portal';
    steps = (['attendance', 'grades', 'invoices', 'reports'] as const).map((id) => ({
      id,
      label: t(`guardian.${id}.label`),
      hint: t(`guardian.${id}.hint`),
      href,
      done: false,
    }));
  } else {
    steps = [
      {
        id: 'exams',
        label: t('student.exams.label'),
        hint: t('student.exams.hint'),
        href: '/portal/exams',
        done: false,
      },
      ...(['attendance', 'grades', 'invoices'] as const).map((id) => ({
        id,
        label: t(`student.${id}.label`),
        hint: t(`student.${id}.hint`),
        href: childHref ?? '/portal',
        done: false,
      })),
    ];
  }

  return (
    <OnboardingCard
      storageKey={`onboarding:${userId}:role:${school.schoolId}`}
      title={t(`${kind}Title`)}
      description={t(`${kind}Description`)}
      steps={steps}
      progressLabel={t('progress', { n: steps.length })}
      openLabel={t('open')}
      dismissLabel={t('dismiss')}
      variant="welcome"
    />
  );
}
