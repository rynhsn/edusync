'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

export type SlugStatus = 'checking' | 'available' | 'taken' | 'invalid';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  status: SlugStatus | undefined;
  onStatus: (id: string, status: SlugStatus) => void;
  /** Domain dasar dari API (mis. edusync.id atau localhost:3000). Kosong selama belum dimuat. */
  baseDomain: string | undefined;
}

/** Kolom subdomain dengan pemeriksaan ketersediaan yang ditunda 400 ms setelah pengguna berhenti mengetik. */
export function SlugField({ id, value, onChange, status, onStatus, baseDomain }: Props) {
  const t = useTranslations('register');

  useEffect(() => {
    if (value.length < 3) {
      onStatus(id, 'invalid');
      return;
    }
    onStatus(id, 'checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await api.GET('/v1/slugs/{slug}/availability', { params: { path: { slug: value } } });
      if (!cancelled) onStatus(id, data?.status ?? 'invalid');
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, value, onStatus]);

  const message =
    status === 'available'
      ? { text: t('slugAvailable'), tone: 'text-primary' }
      : status === 'taken'
        ? { text: t('slugTaken'), tone: 'text-destructive' }
        : status === 'invalid'
          ? { text: t('slugInvalid'), tone: 'text-muted-foreground' }
          : { text: t('slugChecking'), tone: 'text-muted-foreground' };

  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{t('subdomain')}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          maxLength={40}
          autoComplete="off"
          aria-describedby={`${id}-status`}
          className="font-mono"
        />
        <span className="text-muted-foreground shrink-0 text-sm">{baseDomain ? `.${baseDomain}` : ''}</span>
      </div>
      <p id={`${id}-status`} className={`text-xs ${message.tone}`} aria-live="polite">
        {message.text}
      </p>
    </div>
  );
}
