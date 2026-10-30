'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Globe, Info, Save, Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/i18n/config';
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  isoDay,
  normalizeHex,
  readableOn,
  safeHttpUrl,
} from '@/lib/announcements';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { useSite } from '@/lib/site';
import { cn } from '@/lib/utils';
import { SitePreview } from './site-preview';

interface Form {
  tagline: string;
  about: string;
  vision: string;
  mission: string;
  address: string;
  phone: string;
  email: string;
  whatsapp: string;
  mapUrl: string;
  accent: string;
  published: boolean;
}

interface Profile {
  tagline: string | null;
  about: string | null;
  vision: string | null;
  mission: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  mapUrl: string | null;
  accentColor: string | null;
  published: boolean;
  updatedAt: string | null;
}

const fromProfile = (p: Profile): Form => ({
  tagline: p.tagline ?? '',
  about: p.about ?? '',
  vision: p.vision ?? '',
  mission: p.mission ?? '',
  address: p.address ?? '',
  phone: p.phone ?? '',
  email: p.email ?? '',
  whatsapp: p.whatsapp ?? '',
  mapUrl: p.mapUrl ?? '',
  accent: p.accentColor ?? '',
  published: p.published,
});

const toBody = (f: Form) => ({
  tagline: f.tagline.trim() || null,
  about: f.about.trim() || null,
  vision: f.vision.trim() || null,
  mission: f.mission.trim() || null,
  address: f.address.trim() || null,
  phone: f.phone.trim() || null,
  email: f.email.trim() || null,
  whatsapp: f.whatsapp.trim() || null,
  mapUrl: f.mapUrl.trim() || null,
  accentColor: normalizeHex(f.accent),
  published: f.published,
});

export function SiteSettingsView() {
  const t = useTranslations('siteSettings');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const site = useSite();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('announcement:manage');

  const profile = useQuery({
    queryKey: ['site-profile', school.schoolId],
    enabled: manage,
    queryFn: async () => unwrap(await api.GET('/v1/site/profile', { params: header })),
  });
  const [draft, setDraft] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const saved = profile.data ? fromProfile(profile.data) : null;
  const form = draft ?? saved;
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  const save = useMutation({
    mutationFn: async (f: Form) =>
      unwrap(await api.PUT('/v1/site/profile', { params: header, body: toBody(f) })),
    onSuccess: (data) => {
      setError(null);
      setDraft(null);
      queryClient.setQueryData(['site-profile', school.schoolId], data);
      toast.success(t('saved'));
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (!manage) {
    return (
      <PageBody>
        <PageHeader title={t('title')} description={t('subtitle')} />
        <Alert variant="destructive">
          <AlertDescription>{te('errors.forbidden')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => form && setDraft({ ...form, [key]: value });

  const accentOk = !form?.accent.trim() || normalizeHex(form.accent) !== null;
  const mapOk = !form?.mapUrl.trim() || safeHttpUrl(form.mapUrl) !== null;
  const canSave = !!form && dirty && accentOk && mapOk && !save.isPending;
  const publicUrl = site.ready ? site.urlFor(school.schoolSlug, '/site') : null;
  const currentAccent = normalizeHex(form?.accent) ?? DEFAULT_ACCENT;

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success(t('linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard tidak tersedia (mis. konteks tidak aman); tautan tetap bisa dibuka lewat tombol.
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          publicUrl && form?.published ? (
            <>
              <Button variant="outline" onClick={copyLink}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {t('copyLink')}
              </Button>
              <Button
                nativeButton={false}
                render={<a href={publicUrl} target="_blank" rel="noopener noreferrer" />}
              >
                <ExternalLink className="size-4" aria-hidden /> {t('openSite')}
              </Button>
            </>
          ) : undefined
        }
      />

      {profile.isPending && <Skeleton className="h-96 w-full" />}
      {profile.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {form && (
        <form
          className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) save.mutate(form);
          }}
        >
          <div className="grid gap-5">
            {/* Publikasi */}
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4">
                <span
                  className={cn(
                    'grid size-11 shrink-0 place-items-center rounded-xl',
                    form.published ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted',
                  )}
                >
                  <Globe className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="site-published" className="font-heading text-base">
                      {t('publishLabel')}
                    </Label>
                    <Badge variant={form.published ? 'default' : 'outline'}>
                      {form.published ? t('publishedBadge') : t('draftBadge')}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">{t('publishHelp')}</p>
                  {publicUrl && (
                    <p className="text-muted-foreground mt-1 text-xs break-all">
                      {t('siteAddress')}: <span className="text-foreground font-mono">{publicUrl}</span>
                    </p>
                  )}
                </div>
                <button
                  id="site-published"
                  type="button"
                  role="switch"
                  aria-checked={form.published}
                  onClick={() => set('published', !form.published)}
                  className={cn(
                    'focus-visible:ring-ring/50 relative h-7 w-12 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-3',
                    form.published ? 'bg-primary' : 'bg-input',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'bg-background absolute top-0.5 left-0.5 size-6 rounded-full shadow transition-transform motion-reduce:transition-none',
                      form.published && 'translate-x-5',
                    )}
                  />
                </button>
              </CardContent>
            </Card>

            {/* Identitas dan warna */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">{t('sectionIdentity')}</CardTitle>
                <CardDescription>{t('sectionIdentityHint')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="grid gap-2">
                  <Label htmlFor="site-tagline">{t('tagline')}</Label>
                  <Input
                    id="site-tagline"
                    maxLength={160}
                    value={form.tagline}
                    placeholder={t('taglinePlaceholder')}
                    onChange={(e) => set('tagline', e.target.value)}
                  />
                </div>
                <div className="grid gap-3">
                  <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
                    <legend className="text-sm leading-none font-medium">{t('accent')}</legend>
                    <div className="flex flex-wrap gap-2.5">
                      {ACCENT_PRESETS.map((p) => {
                        const active = normalizeHex(form.accent) === p.hex;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            aria-label={t('accentPick', { name: t(`preset.${p.key}`) })}
                            aria-pressed={active}
                            title={t(`preset.${p.key}`)}
                            onClick={() => set('accent', p.hex)}
                            style={{ backgroundColor: p.hex, color: readableOn(p.hex) }}
                            className={cn(
                              'focus-visible:ring-ring grid size-10 place-items-center rounded-full shadow-sm transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100',
                              active && 'ring-foreground ring-2 ring-offset-2 ring-offset-[var(--card)]',
                            )}
                          >
                            {active && <Check className="size-4" aria-hidden />}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="site-accent-hex" className="text-xs">
                        {t('accentCustom')}
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={t('accentCustom')}
                          value={currentAccent}
                          onChange={(e) => set('accent', e.target.value)}
                          className="border-input size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                        />
                        <Input
                          id="site-accent-hex"
                          className="w-32 font-mono uppercase"
                          maxLength={7}
                          value={form.accent}
                          placeholder={DEFAULT_ACCENT}
                          aria-invalid={!accentOk}
                          onChange={(e) => set('accent', e.target.value)}
                        />
                        {form.accent && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => set('accent', '')}>
                            {t('accentDefault')}
                          </Button>
                        )}
                      </div>
                    </div>
                    <span
                      aria-hidden
                      className="font-heading mt-5 rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm"
                      style={{ backgroundColor: currentAccent, color: readableOn(currentAccent) }}
                    >
                      {t('previewApply')}
                    </span>
                  </div>
                  <p className={cn('text-xs', accentOk ? 'text-muted-foreground' : 'text-destructive')}>
                    {accentOk ? t('accentContrast') : t('accentInvalid')}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Tentang */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">{t('sectionAbout')}</CardTitle>
                <CardDescription>{t('sectionAboutHint')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="site-about">{t('about')}</Label>
                  <Textarea
                    id="site-about"
                    rows={5}
                    maxLength={4000}
                    value={form.about}
                    placeholder={t('aboutPlaceholder')}
                    onChange={(e) => set('about', e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="site-vision">{t('vision')}</Label>
                    <Textarea
                      id="site-vision"
                      rows={4}
                      maxLength={1000}
                      value={form.vision}
                      onChange={(e) => set('vision', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="site-mission">{t('mission')}</Label>
                    <Textarea
                      id="site-mission"
                      rows={4}
                      maxLength={2000}
                      value={form.mission}
                      aria-describedby="site-mission-hint"
                      onChange={(e) => set('mission', e.target.value)}
                    />
                    <p id="site-mission-hint" className="text-muted-foreground text-xs">
                      {t('missionHint')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Kontak */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">{t('sectionContact')}</CardTitle>
                <CardDescription>{t('sectionContactHint')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="site-address">{t('address')}</Label>
                  <Textarea
                    id="site-address"
                    rows={2}
                    maxLength={400}
                    value={form.address}
                    onChange={(e) => set('address', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="site-phone">{t('phone')}</Label>
                  <Input
                    id="site-phone"
                    type="tel"
                    maxLength={30}
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="site-email">{t('email')}</Label>
                  <Input
                    id="site-email"
                    type="email"
                    maxLength={254}
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="site-whatsapp">{t('whatsapp')}</Label>
                  <Input
                    id="site-whatsapp"
                    type="tel"
                    maxLength={30}
                    value={form.whatsapp}
                    aria-describedby="site-wa-hint"
                    onChange={(e) => set('whatsapp', e.target.value)}
                  />
                  <p id="site-wa-hint" className="text-muted-foreground text-xs">
                    {t('whatsappHint')}
                  </p>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="site-map">{t('mapUrl')}</Label>
                  <Input
                    id="site-map"
                    type="url"
                    maxLength={500}
                    value={form.mapUrl}
                    aria-invalid={!mapOk}
                    aria-describedby="site-map-hint"
                    onChange={(e) => set('mapUrl', e.target.value)}
                  />
                  <p
                    id="site-map-hint"
                    className={cn('text-xs', mapOk ? 'text-muted-foreground' : 'text-destructive')}
                  >
                    {mapOk ? t('mapHint') : t('mapInvalid')}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bilah simpan */}
            <div className="bg-background/90 sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-lg backdrop-blur">
              <div className="text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-sm">
                <Info className="size-4 shrink-0" aria-hidden />
                <span className="truncate" aria-live="polite">
                  {dirty
                    ? t('dirty')
                    : profile.data?.updatedAt
                      ? t('lastSaved', { date: formatCalendarDate(locale, isoDay(profile.data.updatedAt)) })
                      : ''}
                </span>
              </div>
              {error && (
                <span role="alert" className="text-destructive text-sm">
                  {error}
                </span>
              )}
              <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft(null)}>
                <Undo2 className="size-4" aria-hidden /> {t('reset')}
              </Button>
              <Button type="submit" disabled={!canSave}>
                <Save className="size-4" aria-hidden /> {t('save')}
              </Button>
            </div>
          </div>

          {/* Pratinjau */}
          <aside className="lg:sticky lg:top-4" aria-label={t('previewTitle')}>
            <p className="font-heading mb-1 text-sm font-semibold">{t('previewTitle')}</p>
            <p className="text-muted-foreground mb-3 text-xs">{t('previewHint')}</p>
            <SitePreview
              name={school.schoolName}
              published={form.published}
              profile={{
                tagline: form.tagline,
                about: form.about,
                vision: form.vision,
                address: form.address,
                phone: form.phone,
                email: form.email,
                whatsapp: form.whatsapp,
                accent: currentAccent,
              }}
            />
            {!form.published && (
              <p className="text-muted-foreground mt-3 text-center text-xs">{t('previewUnpublished')}</p>
            )}
          </aside>
        </form>
      )}
    </PageBody>
  );
}
