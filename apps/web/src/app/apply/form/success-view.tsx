'use client';

import { Copy, Printer, Search, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

const CONFETTI_COLORS = [
  'var(--ap-orange)',
  'var(--primary)',
  'var(--amber)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

/** Potongan konfeti dengan arah dan penundaan tetap (deterministik, jadi aman untuk render server). */
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  dx: `${((i * 53) % 120) - 60}px`,
  rot: `${180 + ((i * 71) % 540)}deg`,
  delay: `${(i % 9) * 0.07}s`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

async function copy(text: string, ok: string, fail: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(ok);
  } catch {
    toast.error(fail);
  }
}

function Code({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const t = useTranslations('apply.success');
  return (
    <div className="bg-card rounded-2xl border p-4 text-left shadow-sm">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p
          className={cn(
            'min-w-0 text-2xl font-semibold tracking-wide break-all sm:text-3xl',
            mono ? 'font-mono' : 'font-heading',
          )}
        >
          {value}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t('copyLabel', { label })}
          onClick={() => copy(value, t('copied'), t('copyFailed'))}
        >
          <Copy className="size-4" aria-hidden /> {t('copy')}
        </Button>
      </div>
    </div>
  );
}

/** Layar sukses: nomor pendaftaran dan kode pelacakan (hanya tampil sekali), salin, dan cetak bukti. */
export function SuccessView({
  result,
  schoolName,
  fullName,
  periodName,
}: {
  result: { regNumber: string; trackingCode: string; submittedAt: string };
  schoolName: string;
  fullName: string;
  periodName: string;
}) {
  const t = useTranslations('apply.success');
  const locale = useLocale() as Locale;
  const date = formatCalendarDate(locale, result.submittedAt.slice(0, 10));

  return (
    <div className="relative mx-auto w-full max-w-xl overflow-hidden px-4 py-8 text-center sm:px-6 sm:py-12">
      <div aria-hidden className="no-print pointer-events-none absolute inset-x-0 top-0 h-72">
        {PIECES.map((p) => (
          <span
            key={`${p.left}-${p.delay}`}
            className="ap-confetti"
            style={
              {
                left: p.left,
                background: p.color,
                animationDelay: p.delay,
                '--dx': p.dx,
                '--rot': p.rot,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="no-print">
        <svg viewBox="0 0 80 80" className="ap-pop mx-auto size-24" fill="none" role="img" aria-hidden>
          <circle cx="40" cy="40" r="30" className="fill-[var(--ap-orange-soft)]" />
          <circle
            cx="40"
            cy="40"
            r="30"
            stroke="var(--ap-orange)"
            strokeWidth="4"
            className="ap-check-circle"
            transform="rotate(-90 40 40)"
          />
          <path
            d="M27 41l9 9 18-20"
            stroke="var(--ap-orange)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ap-check-mark"
          />
        </svg>
        <h1 className="font-heading mt-4 text-3xl font-semibold tracking-tight text-balance">{t('title')}</h1>
        <p className="text-muted-foreground mt-2 text-pretty">{t('body', { school: schoolName })}</p>

        <div className="mt-6 grid gap-3">
          <Code label={t('regNumber')} value={result.regNumber} />
          <Code label={t('trackingCode')} value={result.trackingCode} mono />
        </div>

        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-2xl bg-[var(--ap-orange-soft)] p-4 text-left text-sm text-[var(--ap-orange-ink)]"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="font-medium text-pretty">{t('warning')}</p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" size="lg" className="h-11" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> {t('print')}
          </Button>
          <Link
            href="/apply/status"
            className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'h-11')}
          >
            <Search className="size-4" aria-hidden /> {t('checkStatus')}
          </Link>
        </div>
        <p className="text-muted-foreground mt-6 text-sm text-pretty">{t('next')}</p>
      </div>

      {/* Bukti pendaftaran: hanya tampil saat dicetak. */}
      <div className="print-area hidden text-left print:block">
        <h1 style={{ fontSize: '22pt', fontWeight: 700 }}>{schoolName}</h1>
        <h2 style={{ fontSize: '14pt', marginTop: '4mm' }}>{t('proofTitle')}</h2>
        <hr style={{ margin: '5mm 0' }} />
        <table style={{ fontSize: '12pt', borderSpacing: '0 3mm' }}>
          <tbody>
            <tr>
              <td style={{ width: '50mm' }}>{t('regNumber')}</td>
              <td>
                <strong style={{ fontSize: '16pt' }}>{result.regNumber}</strong>
              </td>
            </tr>
            <tr>
              <td>{t('trackingCode')}</td>
              <td>
                <strong style={{ fontSize: '16pt', fontFamily: 'monospace' }}>{result.trackingCode}</strong>
              </td>
            </tr>
            <tr>
              <td>{t('applicant')}</td>
              <td>{fullName}</td>
            </tr>
            <tr>
              <td>{t('period')}</td>
              <td>{periodName}</td>
            </tr>
            <tr>
              <td>{t('date')}</td>
              <td>{date}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: '8mm', fontSize: '11pt' }}>{t('proofNote')}</p>
      </div>
    </div>
  );
}
