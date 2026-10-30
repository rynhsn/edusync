'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, ShieldAlert, Unlink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { type PklPlacement, pklKey } from './shared';

/** Tautan pembimbing industri: dibuat sekali (token hanya tampil satu kali), disalin, atau dicabut. */
export function LinkPanel({ placement }: { placement: PklPlacement }) {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });
  const cancelled = placement.status === 'cancelled';

  useEffect(() => {
    if (!url) {
      setQr(null);
      return;
    }
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((d) => live && setQr(d))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [url]);

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/pkl/placements/{id}/access-link', {
          params: { ...header, path: { id: placement.id } },
        }),
      ),
    onSuccess: (r) => {
      setError(null);
      setCopied(false);
      setUrl(`${window.location.origin}/pkl/${r.token}`);
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const revoke = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/v1/pkl/placements/{id}/access-link', {
          params: { ...header, path: { id: placement.id } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('linkRevoked'));
      setUrl(null);
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <section className="bg-card grid max-w-2xl gap-4 rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200">
          <Link2 className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-heading text-base font-semibold">{t('linkTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('linkBody')}</p>
        </div>
      </div>

      <p className="text-sm">
        {placement.hasAccessLink ? (
          <span className="font-medium text-teal-700 dark:text-teal-300">{t('linkActive')}</span>
        ) : (
          <span className="text-muted-foreground">{t('linkNone')}</span>
        )}
      </p>

      {url && (
        <div className="grid gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('linkOnce')}
          </p>
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label={t('linkUrl')} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{' '}
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
          {qr && (
            // biome-ignore lint/performance/noImgElement: QR berupa data URL
            <img src={qr} alt={t('linkQrAlt')} width={160} height={160} className="rounded-lg bg-white p-1" />
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {placement.hasAccessLink ? (
          <ConfirmDialog
            title={t('confirm.regenTitle')}
            description={t('confirm.regenBody')}
            confirmLabel={t('linkRegenerate')}
            pending={create.isPending}
            onConfirm={() => create.mutateAsync()}
            trigger={
              <Button type="button" disabled={cancelled}>
                <Link2 className="size-4" aria-hidden /> {t('linkRegenerate')}
              </Button>
            }
          />
        ) : (
          <Button type="button" disabled={cancelled || create.isPending} onClick={() => create.mutate()}>
            <Link2 className="size-4" aria-hidden /> {t('linkCreate')}
          </Button>
        )}
        {placement.hasAccessLink && (
          <ConfirmDialog
            destructive
            title={t('confirm.revokeTitle')}
            description={t('confirm.revokeBody')}
            confirmLabel={t('linkRevoke')}
            pending={revoke.isPending}
            onConfirm={() => revoke.mutateAsync()}
            trigger={
              <Button type="button" variant="outline">
                <Unlink className="size-4" aria-hidden /> {t('linkRevoke')}
              </Button>
            }
          />
        )}
      </div>
    </section>
  );
}
