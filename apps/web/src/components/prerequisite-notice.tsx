'use client';

import { Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Data awal yang harus ada sebelum suatu halaman bisa dipakai, beserta halaman dan izin untuk membuatnya. */
const KINDS = {
  subjects: { href: '/subjects', permission: 'subject:manage' },
  semesters: { href: '/academic-years', permission: 'academic_year:manage' },
  examTypes: { href: '/exams/types', permission: 'exam:manage' },
} as const;

export type PrerequisiteKind = keyof typeof KINDS;

/**
 * Pemberitahuan "apa yang belum ada, mengapa perlu, dan di mana membuatnya". Dipakai pengganti tombol tambah yang
 * mati tanpa penjelasan. Tautan hanya muncul bila pengguna berhak membuat data itu; selain itu ia diminta
 * menghubungi admin.
 */
export function PrerequisiteNotice({ title, missing }: { title: string; missing: PrerequisiteKind[] }) {
  const t = useTranslations('schoolOnboarding.prereq');
  const { can } = useSchool();
  if (missing.length === 0) return null;
  return (
    <Alert>
      <Info aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 grid gap-2">
          {missing.map((k) => {
            const kind = KINDS[k];
            return (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t(`${k}Text`)}
                  {!can(kind.permission) && ` ${t('askAdmin')}`}
                </span>
                {can(kind.permission) && (
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={kind.href} />}>
                    {t(`${k}Cta`)}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
