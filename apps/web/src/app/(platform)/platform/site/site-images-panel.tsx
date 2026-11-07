'use client';

import {
  checkSiteAsset,
  SITE_ASSET_KEYS,
  type SITE_ASSET_MIMES,
  SITE_ASSET_SLOTS,
  type SiteAssetKey,
} from '@edusync/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageUp, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { toBase64 } from '@/lib/file-base64';
import { formatBytes } from '@/lib/site-editor';
import { cn } from '@/lib/utils';

export interface SiteAssetRow {
  key: SiteAssetKey;
  mime: string;
  size: number;
  updatedAt: string;
  url: string;
}

const SLOT_MESSAGE = {
  favicon: 'Favicon',
  app_icon: 'AppIcon',
  logo: 'Logo',
  logo_dark: 'LogoDark',
  hero: 'Hero',
  og_image: 'OgImage',
} as const satisfies Record<SiteAssetKey, string>;

/** Jenis berkas dari ekstensi bila peramban tidak mengisinya (.ico dan .svg sering kosong atau tidak baku). */
function mimeOf(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.ico')) return 'image/x-icon';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  return file.type;
}

const typeLabel = (mime: string) =>
  mime.replace('image/', '').replace('svg+xml', 'svg').replace('x-icon', 'ico');

export function SiteImagesPanel({ assets, canEdit }: { assets: SiteAssetRow[]; canEdit: boolean }) {
  const t = useTranslations('platformSite');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const [error, setError] = useState<{ key: SiteAssetKey; text: string } | null>(null);
  const [busy, setBusy] = useState<SiteAssetKey | null>(null);
  const inputs = useRef<Partial<Record<SiteAssetKey, HTMLInputElement | null>>>({});

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-site'] });

  const upload = useMutation({
    mutationFn: async ({ key, file }: { key: SiteAssetKey; file: File }) => {
      const mime = mimeOf(file);
      const problem = checkSiteAsset(key, mime, new Uint8Array(await file.arrayBuffer()));
      if (problem) {
        const slot = SITE_ASSET_SLOTS[key];
        throw new Error(
          t(`problem_${problem}`, {
            types: slot.mimes.map(typeLabel).join(', '),
            max: formatBytes(slot.maxBytes),
          }),
        );
      }
      return unwrap(
        await api.PUT('/v1/platform/site/assets/{key}', {
          params: { path: { key } },
          body: { mime: mime as (typeof SITE_ASSET_MIMES)[number], data: await toBase64(file) },
        }),
      );
    },
    onMutate: ({ key }) => {
      setBusy(key);
      setError(null);
    },
    onSuccess: (_row, { key }) => {
      toast.success(t('uploaded'));
      refresh();
      if (inputs.current[key]) inputs.current[key].value = '';
    },
    onError: (e, { key }) =>
      setError({ key, text: e instanceof Error && !('status' in e) ? e.message : te(errorKey(e)) }),
    onSettled: () => setBusy(null),
  });

  const remove = useMutation({
    mutationFn: async (key: SiteAssetKey) =>
      unwrap(await api.DELETE('/v1/platform/site/assets/{key}', { params: { path: { key } } })),
    onSuccess: () => {
      toast.success(t('removed'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground max-w-2xl text-sm">{t('imagesHint')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {SITE_ASSET_KEYS.map((key) => {
          const slot = SITE_ASSET_SLOTS[key];
          const current = assets.find((a) => a.key === key);
          const name = SLOT_MESSAGE[key];
          const dark = key === 'logo_dark';
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="font-heading text-base">{t(`slot${name}`)}</CardTitle>
                <CardDescription>{t(`slot${name}Hint`)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div
                  className={cn(
                    'grid h-32 place-items-center overflow-hidden rounded-lg border',
                    dark ? 'bg-slate-900' : 'bg-muted/50',
                  )}
                >
                  {current ? (
                    // biome-ignore lint/performance/noImgElement: pratinjau gambar unggahan dari API sendiri
                    <img
                      src={current.url}
                      alt={t(`slot${name}`)}
                      className="max-h-28 max-w-full object-contain"
                    />
                  ) : (
                    <span className={cn('text-xs', dark ? 'text-slate-300' : 'text-muted-foreground')}>
                      {t('usingDefault')}
                    </span>
                  )}
                </div>

                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {current ? (
                    <>
                      <Badge variant="outline">{typeLabel(current.mime)}</Badge>
                      <span>{formatBytes(current.size)}</span>
                      <span>{t('updatedAt', { date: new Date(current.updatedAt).toLocaleString() })}</span>
                    </>
                  ) : (
                    <span>{t('notUploaded')}</span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t('rules', {
                    types: slot.mimes.map(typeLabel).join(', '),
                    max: formatBytes(slot.maxBytes),
                  })}
                </p>

                {error?.key === key && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{error.text}</AlertDescription>
                  </Alert>
                )}

                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={(el) => {
                        inputs.current[key] = el;
                      }}
                      type="file"
                      className="sr-only"
                      tabIndex={-1}
                      aria-label={t(`slot${name}`)}
                      accept={[...slot.mimes, ...(slot.mimes.includes('image/x-icon') ? ['.ico'] : [])].join(
                        ',',
                      )}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) upload.mutate({ key, file });
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy === key}
                      onClick={() => inputs.current[key]?.click()}
                    >
                      <ImageUp className="size-4" aria-hidden /> {current ? t('replace') : t('upload')}
                    </Button>
                    {current && (
                      <ConfirmDialog
                        trigger={
                          <Button type="button" size="sm" variant="outline">
                            <RotateCcw className="size-4" aria-hidden /> {t('resetToDefault')}
                          </Button>
                        }
                        title={t('resetImageTitle', { slot: t(`slot${name}`) })}
                        description={t('resetImageBody')}
                        confirmLabel={t('resetToDefault')}
                        destructive
                        pending={remove.isPending}
                        onConfirm={() => remove.mutateAsync(key)}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
