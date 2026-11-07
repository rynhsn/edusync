'use client';

import { Gift, LifeBuoy, type LucideIcon, Package, PowerOff, Send } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PageBody, PageHeader } from '@/components/page-header';
import { Checkbox } from '@/components/ui/checkbox';
import { IconTile, type Tone } from '@/components/ui-kit';

const STORAGE_KEY = 'edusync.platform.guide';
const STEPS = [1, 2, 3, 4] as const;

const SECTIONS: { key: string; icon: LucideIcon; tone: Tone; href: string }[] = [
  { key: 'comp', icon: Gift, tone: 'sky', href: '/platform/pending' },
  { key: 'suspend', icon: PowerOff, tone: 'rose', href: '/platform' },
  { key: 'catalog', icon: Package, tone: 'violet', href: '/platform/catalog' },
  { key: 'wa', icon: Send, tone: 'emerald', href: '/platform/messaging' },
];

/** Panduan operator internal: checklist operasional. Centang hanya tersimpan di peramban ini. */
export function GuideView() {
  const t = useTranslations('platform');
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // Penyimpanan tak tersedia: checklist tetap berfungsi untuk sesi ini.
    }
  }, []);

  function toggle(id: string, next: boolean) {
    const updated = { ...done, [id]: next };
    setDone(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // abaikan
    }
  }

  return (
    <PageBody>
      <PageHeader icon={LifeBuoy} tone="teal" title={t('guide')} description={t('guideSubtitle')} />
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((s) => {
          const ids = STEPS.map((n) => `${s.key}-${n}`);
          const count = ids.filter((id) => done[id]).length;
          return (
            <section key={s.key} className="bg-card grid content-start gap-3 rounded-2xl border p-4">
              <div className="flex items-start gap-3">
                <IconTile icon={s.icon} tone={s.tone} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading font-semibold">{t(`guide_${s.key}_title` as never)}</h2>
                  <p className="text-muted-foreground text-sm">{t(`guide_${s.key}_intro` as never)}</p>
                </div>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {count}/{STEPS.length}
                </span>
              </div>
              <ul className="grid content-start gap-2">
                {STEPS.map((n) => {
                  const id = `${s.key}-${n}`;
                  return (
                    <li key={id}>
                      <label htmlFor={`guide-${id}`} className="flex items-start gap-2.5 text-sm">
                        <Checkbox
                          id={`guide-${id}`}
                          className="mt-0.5"
                          checked={!!done[id]}
                          onCheckedChange={(next) => toggle(id, next)}
                        />
                        <span className={done[id] ? 'text-muted-foreground line-through' : undefined}>
                          {t(`guide_${s.key}_${n}` as never)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <Link
                href={s.href}
                className="text-primary w-fit rounded text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('guideOpen')}
              </Link>
            </section>
          );
        })}
      </div>
    </PageBody>
  );
}
