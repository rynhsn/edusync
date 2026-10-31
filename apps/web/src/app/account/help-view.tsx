'use client';

import { BookOpen, ChevronDown, LifeBuoy, Mail, Rocket } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconTile } from '@/components/ui-kit';

const STEPS = ['s1', 's2', 's3', 's4'] as const;
const FAQ = ['f1', 'f2', 'f3', 'f4', 'f5'] as const;
// Alamat dukungan diatur lewat env publik; tanpa itu kartu kontak hanya mengarahkan ke dokumentasi.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export function HelpView() {
  const t = useTranslations('account.help');
  const ta = useTranslations('account');
  return (
    <PageBody>
      <PageHeader icon={LifeBuoy} tone="sky" title={ta('nav.help')} description={t('subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading flex items-center gap-2 text-lg">
            <Rocket className="text-primary size-5" aria-hidden /> {t('gettingStarted')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 rounded-xl border p-3">
                <span className="bg-primary/10 text-primary grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>
                <span className="text-sm">
                  <span className="block font-medium">{t(`${s}Title`)}</span>
                  <span className="text-muted-foreground block">{t(`${s}Body`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('faq')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {FAQ.map((f) => (
            <details key={f} className="group bg-muted/30 rounded-xl border px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                {t(`${f}Q`)}
                <ChevronDown
                  className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{t(`${f}A`)}</p>
            </details>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-card flex items-start gap-3.5 rounded-2xl border p-4">
          <IconTile icon={Mail} tone="sky" />
          <div className="grid gap-1.5">
            <p className="font-heading font-semibold">{t('contact')}</p>
            <p className="text-muted-foreground text-sm">
              {SUPPORT_EMAIL ? t('contactBody') : t('contactFallback')}
            </p>
            {SUPPORT_EMAIL && (
              <Button
                size="sm"
                className="justify-self-start"
                nativeButton={false}
                render={<a href={`mailto:${SUPPORT_EMAIL}`} />}
              >
                {SUPPORT_EMAIL}
              </Button>
            )}
          </div>
        </div>
        <div className="bg-card flex items-start gap-3.5 rounded-2xl border p-4">
          <IconTile icon={BookOpen} tone="violet" />
          <div className="grid gap-1.5">
            <p className="font-heading font-semibold">{ta('nav.docs')}</p>
            <p className="text-muted-foreground text-sm">{t('docsBody')}</p>
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              nativeButton={false}
              render={<Link href="/account/docs" />}
            >
              {t('openDocs')}
            </Button>
          </div>
        </div>
      </div>
    </PageBody>
  );
}
