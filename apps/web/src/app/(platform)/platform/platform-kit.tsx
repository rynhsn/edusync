'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Tone } from '@/components/ui-kit';
import type { paths } from '@/lib/api-types';
import { errorKey } from '@/lib/errors';

/** Format rupiah mengikuti bahasa aktif (Sunda memakai format Indonesia). */
export function useMoney() {
  const locale = useLocale();
  return new Intl.NumberFormat(locale === 'su' ? 'id' : locale, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });
}

export const SUB_TONE: Record<string, Tone> = {
  active: 'emerald',
  past_due: 'amber',
  suspended: 'rose',
  canceled: 'slate',
  pending_payment: 'sky',
};

export const SUB_KEY = {
  active: 'statusActive',
  past_due: 'statusPastDue',
  suspended: 'statusSuspended',
  canceled: 'statusCanceled',
  pending_payment: 'statusPending',
} as const;

/** Galat memuat data yang tampil di halaman (bukan layar kosong), dengan tombol coba lagi. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const te = useTranslations();
  const tc = useTranslations('common');
  return (
    <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-3">
      <AlertDescription>{te(errorKey(error))}</AlertDescription>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {tc('retry')}
        </Button>
      )}
    </Alert>
  );
}

/** Tindakan staf selalu butuh alasan yang dicatat di audit log. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  error,
  onConfirm,
  maxLength = 500,
  notice,
}: {
  /** Batas panjang alasan (bawaan 500; penangguhan 300 karena alasan ditampilkan kepada pengguna). */
  maxLength?: number;
  /** Keterangan di bawah kolom alasan, mis. bahwa alasan akan terlihat oleh pengguna sekolah. */
  notice?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  error?: string | null;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const t = useTranslations('platform');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      submitLabel={submitLabel}
      error={error}
      disabled={reason.trim().length < 3}
      onSubmit={() => onConfirm(reason.trim())}
    >
      <div className="grid content-start gap-2">
        <Label htmlFor="staff-reason">{t('reasonLabel')}</Label>
        <Input
          id="staff-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('reasonPlaceholder')}
          minLength={3}
          maxLength={maxLength}
          required
          autoFocus
        />
        {notice && (
          <p className="text-muted-foreground flex justify-between gap-3 text-xs">
            <span>{notice}</span>
            <span className="shrink-0 tabular-nums">
              {t('reasonCount', { count: reason.length, max: maxLength })}
            </span>
          </p>
        )}
      </div>
    </FormDialog>
  );
}

/** Baris daftar yayasan sesuai respons API. */
export type Foundation =
  paths['/v1/platform/foundations']['get']['responses'][200]['content']['application/json'][number];
