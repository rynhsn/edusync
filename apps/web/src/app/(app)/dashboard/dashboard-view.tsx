'use client';

import { ArrowRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSchool } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardView() {
  const t = useTranslations('dashboard');
  const tp = useTranslations('permissions');
  const tn = useTranslations('nav');
  const { school, userName, can } = useSchool();

  const label = (permission: string) => {
    const key = permission.replace(':', '_');
    return tp.has(key as never) ? tp(key as never) : permission;
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-8">
      <div>
        <p className="text-primary text-sm font-medium">{school.schoolName}</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight text-balance">
          {t('greeting', { name: userName })}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{t('subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('accessTitle')}</CardTitle>
            <CardDescription>{t('accessDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {school.permissions.length === 0 && (
                <span className="text-muted-foreground text-sm">{t('noPermissions')}</span>
              )}
              {[...school.permissions].sort().map((p) => (
                <Badge key={p} variant="secondary">
                  {label(p)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {can('academic_year:read') && (
          <Link
            href="/academic-years"
            className="group bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex flex-col justify-between gap-6 rounded-xl border p-6 transition-colors outline-none focus-visible:ring-3"
          >
            <span className="bg-accent text-accent-foreground grid size-10 place-items-center rounded-lg">
              <CalendarDays className="size-5" aria-hidden />
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="font-heading text-lg font-semibold">{tn('academicYears')}</span>
              <ArrowRight className="text-muted-foreground group-hover:text-primary size-5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
