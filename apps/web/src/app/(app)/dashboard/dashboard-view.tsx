'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NAV_GROUPS, useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardView() {
  const t = useTranslations('dashboard');
  const tp = useTranslations('permissions');
  const tn = useTranslations('nav');
  const { school, userName, can, hasModule } = useSchool();

  const label = (permission: string) => {
    const key = permission.replace(':', '_');
    return tp.has(key as never) ? tp(key as never) : permission;
  };

  // Pintasan ke menu yang boleh dibuka pengguna, dikelompokkan seperti menu samping.
  const groups = NAV_GROUPS.filter((g) => g.key !== null)
    .map((g) => ({
      key: g.key as 'groupMaster' | 'groupAcademic' | 'groupAccess',
      items: g.items.filter(
        (n) => (n.permission === null || can(n.permission)) && (!('module' in n) || hasModule(n.module)),
      ),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <PageBody>
      <PageHeader
        title={t('greeting', { name: userName })}
        description={`${school.schoolName} · ${t('subtitle')}`}
      />

      {groups.map((g) => (
        <section key={g.key} className="grid gap-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{tn(g.key)}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="group bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
              >
                <span className="bg-accent text-accent-foreground grid size-10 shrink-0 place-items-center rounded-lg">
                  <n.icon className="size-5" aria-hidden />
                </span>
                <span className="font-heading flex-1 font-semibold">{tn(n.labelKey)}</span>
                <ArrowRight className="text-muted-foreground group-hover:text-primary size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('accessTitle')}</CardTitle>
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
    </PageBody>
  );
}
