'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Landmark, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { toBase64 } from '@/lib/file-base64';
import { cn } from '@/lib/utils';

const MAX_LOGO_BYTES = 512 * 1024;

const FIELDS = [
  'officialName',
  'street',
  'village',
  'district',
  'city',
  'province',
  'postalCode',
  'phone',
  'fax',
  'email',
  'website',
] as const;
type Field = (typeof FIELDS)[number];
type Draft = Record<Field, string>;

const WIDE: Field[] = ['officialName', 'street', 'website'];

/** Identitas sekolah: logo, alamat lengkap, dan kontak. Satu sumber untuk kop ujian, surat, dan (opsional) situs. */
export function IdentityPanel() {
  const t = useTranslations('schoolSettings.identity');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const canManage = can('school:manage');
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const identity = useQuery({
    queryKey: ['school-identity', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/school/identity', { params: header })),
  });
  const saved: Draft | null = identity.data
    ? (Object.fromEntries(FIELDS.map((f) => [f, identity.data[f] ?? ''])) as Draft)
    : null;
  const value = draft ?? saved;
  const refresh = (data: unknown) => {
    queryClient.setQueryData(['school-identity', school.schoolId], data);
  };

  const save = useMutation({
    mutationFn: async (v: Draft) =>
      unwrap(
        await api.PUT('/v1/school/identity', {
          params: header,
          body: Object.fromEntries(FIELDS.map((f) => [f, v[f].trim() || null])) as Record<
            Field,
            string | null
          >,
        }),
      ),
    onSuccess: (data) => {
      setError(null);
      setDraft(null);
      refresh(data);
      toast.success(t('saved'));
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const mime = file.type as 'image/png' | 'image/jpeg' | 'image/webp';
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime) || file.size > MAX_LOGO_BYTES) {
        throw new Error('logo');
      }
      return unwrap(
        await api.POST('/v1/school/identity/logo', {
          params: header,
          body: { mime, data: await toBase64(file) },
        }),
      );
    },
    onSuccess: (data) => {
      refresh(data);
      toast.success(t('logoSaved'));
    },
    onError: (e) =>
      toast.error(e instanceof Error && e.message === 'logo' ? t('logoInvalid') : te(errorKey(e))),
  });

  const removeLogo = useMutation({
    mutationFn: async () => unwrap(await api.DELETE('/v1/school/identity/logo', { params: header })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-identity', school.schoolId] });
      toast.success(t('logoRemoved'));
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (identity.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }
  if (!value) return <Skeleton className="h-72 rounded-2xl" />;

  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (f: Field, v: string) => setDraft({ ...value, [f]: v });
  const logoUrl = identity.data?.logoUrl ?? null;

  return (
    <section className="bg-card grid content-start gap-5 rounded-2xl border p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={Landmark} tone="teal" className="size-10" />
        <div>
          <h2 className="font-heading font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground max-w-2xl text-sm">{t('body')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="bg-muted/40 grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border">
          {logoUrl ? (
            // biome-ignore lint/performance/noImgElement: logo kecil dari API sendiri, tak perlu optimasi Next.
            <img
              src={logoUrl}
              alt={t('logoAlt', { name: school.schoolName })}
              className="size-full object-contain"
            />
          ) : (
            <ImagePlus aria-hidden className="text-muted-foreground size-7" />
          )}
        </div>
        <div className="grid content-start gap-2">
          <p className="text-muted-foreground max-w-sm text-xs">{t('logoHint')}</p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label={t('logoUpload')}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) upload.mutate(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={upload.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus />
                {logoUrl ? t('logoReplace') : t('logoUpload')}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={removeLogo.isPending}
                  onClick={() => removeLogo.mutate()}
                >
                  <Trash2 />
                  {t('logoRemove')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate(value);
        }}
      >
        <fieldset disabled={!canManage || save.isPending} className="grid min-w-0 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f} className={cn('grid content-start gap-2', WIDE.includes(f) && 'sm:col-span-2')}>
              <Label htmlFor={`identity-${f}`}>{t(`fields.${f}`)}</Label>
              <Input
                id={`identity-${f}`}
                type={f === 'email' ? 'email' : f === 'website' ? 'url' : 'text'}
                maxLength={f === 'street' ? 300 : f === 'postalCode' ? 10 : 200}
                placeholder={f === 'officialName' ? school.schoolName : undefined}
                value={value[f]}
                onChange={(e) => set(f, e.target.value)}
              />
              {f === 'officialName' && (
                <p className="text-muted-foreground text-xs">{t('officialNameHint')}</p>
              )}
            </div>
          ))}
        </fieldset>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!dirty || save.isPending}>
              {t('save')}
            </Button>
            {draft && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
              >
                {t('discard')}
              </Button>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
