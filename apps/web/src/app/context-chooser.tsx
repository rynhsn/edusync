'use client';

import { Building2, ChevronRight, GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type ChoiceContext, nextFocusIndex } from '@/lib/context-choice';

/**
 * Layar "Pilih tujuan" untuk pengguna dengan lebih dari satu konteks (konsol platform, portal pemilik, sekolah).
 * Daftar tombol besar (>= 56px); panah atas/bawah, Home, dan End memindahkan fokus, Enter membuka. Item pertama
 * (terakhir dibuka bila ada) mendapat fokus awal.
 */
export function ContextChooser({
  contexts,
  lastId,
  openingId,
  failed,
  onPick,
  onSignOut,
}: {
  contexts: ChoiceContext[];
  lastId: string | null;
  openingId: string | null;
  failed: boolean;
  onPick: (context: ChoiceContext) => void;
  onSignOut: () => void;
}) {
  const t = useTranslations('chooser');
  const tc = useTranslations('common');
  const list = useRef<HTMLUListElement>(null);

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const next = nextFocusIndex(
      event.key,
      items.indexOf(document.activeElement as HTMLButtonElement),
      items.length,
    );
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex items-center justify-between p-4">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center p-4 pt-6 pb-16 sm:items-center sm:pt-4">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">{t('subtitle')}</p>
          </div>
          {failed && (
            <Alert variant="destructive" role="alert" className="mb-3">
              <AlertDescription>{t('openFailed')}</AlertDescription>
            </Alert>
          )}
          <ul ref={list} aria-label={t('listLabel')} onKeyDown={onKeyDown} className="grid gap-2">
            {contexts.map((context, index) => {
              const Icon =
                context.kind === 'platform'
                  ? ShieldCheck
                  : context.kind === 'owner'
                    ? Building2
                    : GraduationCap;
              const name =
                context.kind === 'platform'
                  ? t('platform')
                  : context.kind === 'owner'
                    ? t('owner')
                    : (context.name ?? context.slug ?? '');
              const subtitle =
                context.kind === 'platform'
                  ? t('platformRole')
                  : context.kind === 'owner'
                    ? t('ownerRole')
                    : t(context.role === 'guardian' ? 'roleGuardian' : 'roleStaff');
              const opening = openingId === context.id;
              return (
                <li key={context.id}>
                  <button
                    type="button"
                    // biome-ignore lint/a11y/noAutofocus: fokus awal pada tujuan terakhir dibuka agar cukup menekan Enter
                    autoFocus={index === 0}
                    disabled={openingId !== null}
                    onClick={() => onPick(context)}
                    className="bg-card hover:bg-accent focus-visible:ring-ring flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 disabled:opacity-60"
                  >
                    <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{name}</span>
                      <span className="text-muted-foreground block truncate text-xs">{subtitle}</span>
                    </span>
                    {context.id === lastId && <Badge variant="secondary">{t('last')}</Badge>}
                    {opening ? (
                      <Loader2
                        className="text-muted-foreground size-4 shrink-0 animate-spin"
                        aria-label={t('opening')}
                      />
                    ) : (
                      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 text-center">
            <Button variant="ghost" onClick={onSignOut} disabled={openingId !== null}>
              {tc('signOut')}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
