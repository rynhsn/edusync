'use client';

import { useQuery } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { useSite } from '@/lib/site';
import { cn } from '@/lib/utils';
import { verifyUrl } from './format';
import './letters.css';

export type LetterStatus = 'draft' | 'signed' | 'revoked';
export type Direction = 'outgoing' | 'incoming';

/** Nama kunci status pada namespace `letters`. */
export const STATUS_LABEL: Record<LetterStatus, 'statusDraft' | 'statusSigned' | 'statusRevoked'> = {
  draft: 'statusDraft',
  signed: 'statusSigned',
  revoked: 'statusRevoked',
};

const STATUS_STYLE: Record<LetterStatus, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  signed: 'bg-[color-mix(in_oklab,var(--lt-valid)_16%,transparent)] text-[var(--lt-valid)]',
  revoked: 'bg-[color-mix(in_oklab,var(--lt-revoked)_16%,transparent)] text-[var(--lt-revoked)]',
};

export function StatusBadge({ status }: { status: LetterStatus }) {
  const t = useTranslations('letters');
  return (
    <Badge variant="outline" className={cn('lt-scope border-transparent font-medium', STATUS_STYLE[status])}>
      <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" aria-hidden />
      {t(STATUS_LABEL[status])}
    </Badge>
  );
}

/** Header sekolah aktif untuk setiap panggilan API. */
export function useHeader() {
  const { school } = useSchool();
  return { header: schoolHeader(school.schoolId) };
}

/** Penandatangan milik pengguna ini (null bila belum terdaftar). */
export function useMySigner() {
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  return useQuery({
    queryKey: ['letters', school.schoolId, 'signer-me'],
    queryFn: async () => unwrap(await api.GET('/v1/letters/signers/me', { params: header })),
  });
}

/** Daftar penandatangan sekolah. */
export function useSigners() {
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  return useQuery({
    queryKey: ['letters', school.schoolId, 'signers'],
    queryFn: async () => unwrap(await api.GET('/v1/letters/signers', { params: header })),
  });
}

/** Daftar templat surat. */
export function useTemplates() {
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  return useQuery({
    queryKey: ['letters', school.schoolId, 'templates'],
    queryFn: async () => unwrap(await api.GET('/v1/letters/templates', { params: header })),
  });
}

/**
 * Identitas untuk kop surat: nama sekolah dari keanggotaan, alamat dari pengaturan rapor bila pengguna boleh
 * membacanya (tanpa itu kop hanya memuat nama).
 */
export function useLetterhead(): { schoolName: string; address: string | null } {
  const { school, can, hasModule } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const enabled = can('report_card:read') && hasModule('grades');
  const settings = useQuery({
    queryKey: ['letters', school.schoolId, 'letterhead'],
    enabled,
    retry: false,
    queryFn: async () => unwrap(await api.GET('/v1/report-cards/settings', { params: header })),
  });
  return { schoolName: school.schoolName, address: settings.data?.address ?? null };
}

/** Tautan verifikasi mutlak untuk sebuah token, memakai alamat utama bila diketahui. */
export function useVerifyUrl() {
  const site = useSite();
  return (token: string) => {
    const origin = site.ready ? site.urlFor(null, '') : window.location.origin;
    return verifyUrl(origin, token);
  };
}

export const ZOOMS = [60, 75, 90, 100, 120] as const;

/** Kontrol zoom ringan untuk pratinjau kertas. */
export function ZoomControl({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  const t = useTranslations('letters');
  const idx = Math.max(0, ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]));
  return (
    <div className="bg-card inline-flex items-center gap-1 rounded-full border p-0.5 text-xs shadow-xs">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        aria-label={t('zoomOut')}
        disabled={idx === 0}
        onClick={() => onChange(ZOOMS[idx - 1] ?? zoom)}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-10 text-center tabular-nums" aria-live="polite">
        {zoom}%
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        aria-label={t('zoomIn')}
        disabled={idx === ZOOMS.length - 1}
        onClick={() => onChange(ZOOMS[idx + 1] ?? zoom)}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

export function useZoom(initial = 90) {
  return useState<number>(initial);
}

/** Ilustrasi amplop dan segel untuk keadaan kosong. */
export function EnvelopeArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={cn('lt-scope', className)} role="img" aria-hidden>
      <rect
        x="14"
        y="30"
        width="132"
        height="80"
        rx="8"
        fill="var(--lt-ink-soft)"
        stroke="var(--lt-ink)"
        strokeWidth="2"
      />
      <path
        d="M16 34 L80 78 L144 34"
        fill="none"
        stroke="var(--lt-ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 108 L62 64 M144 108 L98 64" stroke="var(--lt-ink)" strokeWidth="1.5" opacity="0.5" />
      <circle cx="80" cy="82" r="13" fill="var(--lt-gold)" stroke="var(--lt-gold-deep)" strokeWidth="2" />
      <path
        d="M74 82 l4.5 4.5 L87 77"
        fill="none"
        stroke="var(--lt-gold-deep)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="40"
        y="12"
        width="80"
        height="34"
        rx="3"
        fill="#fffdf8"
        stroke="var(--lt-ink)"
        strokeWidth="1.5"
        transform="rotate(-4 80 29)"
      />
      <path
        d="M50 24 h58 M50 32 h44"
        stroke="var(--lt-ink)"
        strokeWidth="1.5"
        opacity="0.5"
        transform="rotate(-4 80 29)"
      />
    </svg>
  );
}
