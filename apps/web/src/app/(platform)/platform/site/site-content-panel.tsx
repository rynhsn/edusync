'use client';

import {
  SITE_ICONS,
  SITE_LOCALES,
  SITE_MAX_FEATURES,
  type SiteContent,
  type SiteLocale,
  type SiteLocaleContent,
  type SiteSections,
} from '@edusync/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  addFeature,
  canAddFeature,
  localesWithMissingRequired,
  moveItem,
  removeItem,
  sameContent,
  updateFeature,
  updateFeatureText,
  updateLocale,
} from '@/lib/site-editor';
import { SITE_ICON_MAP } from '@/lib/site-icons';
import { cn } from '@/lib/utils';

const SECTION_KEYS = ['features', 'how', 'audience', 'security', 'about', 'contact', 'cta'] as const;
const SOCIAL_KEYS = ['instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin'] as const;
const CONTACT_KEYS = ['email', 'phone', 'whatsapp', 'address'] as const;

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function SiteContentPanel({
  saved,
  customized,
  canEdit,
}: {
  saved: SiteContent;
  customized: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations('platformSite');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SiteContent>(saved);
  const [locale, setLocale] = useState<SiteLocale>('id');
  const [error, setError] = useState<string | null>(null);

  // Isi tersimpan berubah (simpan, atau dimuat ulang): formulir mengikuti.
  useEffect(() => setDraft(saved), [saved]);

  const dirty = !sameContent(draft, saved);
  const missing = localesWithMissingRequired(draft);
  const lc = draft.locales[locale];
  const setLocaleField = (patch: Partial<SiteLocaleContent>) =>
    setDraft((d) => updateLocale(d, locale, patch));
  const disabled = !canEdit;

  const save = useMutation({
    mutationFn: async () => unwrap(await api.PUT('/v1/platform/site', { body: draft })),
    onSuccess: () => {
      setError(null);
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['platform-site'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const reset = useMutation({
    mutationFn: async () => unwrap(await api.DELETE('/v1/platform/site')),
    onSuccess: () => {
      setError(null);
      toast.success(t('resetDone'));
      queryClient.invalidateQueries({ queryKey: ['platform-site'] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const localeField = (
    key: keyof SiteLocaleContent,
    opts?: {
      area?: boolean;
      hint?:
        | 'h_metaTitle'
        | 'h_metaDescription'
        | 'h_tagline'
        | 'h_ctaPrimary'
        | 'h_ctaSecondary'
        | 'h_aboutBody'
        | 'h_footerText';
    },
  ) => {
    const id = `site-${locale}-${key}`;
    const value = lc[key];
    return (
      <Field id={id} label={t(`f_${key}`)} hint={opts?.hint ? t(opts.hint) : undefined}>
        {opts?.area ? (
          <Textarea
            id={id}
            rows={4}
            disabled={disabled}
            value={value}
            onChange={(e) => setLocaleField({ [key]: e.target.value })}
          />
        ) : (
          <Input
            id={id}
            disabled={disabled}
            value={value}
            onChange={(e) => setLocaleField({ [key]: e.target.value })}
          />
        )}
      </Field>
    );
  };

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('brandTitle')}</CardTitle>
          <CardDescription>{customized ? t('customized') : t('notCustomized')}</CardDescription>
        </CardHeader>
        <CardContent className="max-w-xl">
          <Field id="site-brand" label={t('brandName')} hint={t('brandNameHint')}>
            <Input
              id="site-brand"
              disabled={disabled}
              value={draft.brandName}
              onChange={(e) => setDraft((d) => ({ ...d, brandName: e.target.value }))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('textsTitle')}</CardTitle>
          <CardDescription>{t('textsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div
            role="tablist"
            aria-label={t('localeTabs')}
            className="bg-muted inline-flex w-fit gap-1 rounded-xl p-1"
          >
            {SITE_LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={locale === code}
                onClick={() => setLocale(code)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  locale === code
                    ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`locale_${code}`)}
                {missing.includes(code) && (
                  <span
                    role="img"
                    aria-label={t('incomplete')}
                    className="bg-destructive size-2 rounded-full"
                    title={t('incomplete')}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="grid max-w-3xl gap-5">
            <h3 className="font-heading text-sm font-semibold">{t('secMeta')}</h3>
            {localeField('metaTitle', { hint: 'h_metaTitle' })}
            {localeField('metaDescription', { area: true, hint: 'h_metaDescription' })}
            {localeField('tagline', { hint: 'h_tagline' })}

            <h3 className="font-heading mt-2 text-sm font-semibold">{t('secHero')}</h3>
            {localeField('eyebrow')}
            {localeField('heroTitle')}
            {localeField('heroSubtitle', { area: true })}
            <div className="grid gap-4 sm:grid-cols-2">
              {localeField('ctaPrimary', { hint: 'h_ctaPrimary' })}
              {localeField('ctaSecondary', { hint: 'h_ctaSecondary' })}
            </div>

            <h3 className="font-heading mt-2 text-sm font-semibold">{t('secFeatures')}</h3>
            {localeField('featuresTitle')}
            {localeField('featuresSubtitle', { area: true })}

            <ul className="grid gap-3">
              {draft.features.map((feature, index) => {
                const Icon = SITE_ICON_MAP[feature.icon];
                const text = feature.text[locale];
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: fitur tidak punya id; urutan = identitas
                  <li key={index} className="bg-muted/40 grid gap-3 rounded-xl border p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-accent text-accent-foreground grid size-9 place-items-center rounded-lg">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="text-muted-foreground text-xs font-medium">
                        {t('featureNumber', { n: index + 1 })}
                      </span>
                      <SelectField
                        aria-label={t('featureIcon')}
                        className="ml-auto w-44"
                        disabled={disabled}
                        value={feature.icon}
                        onChange={(e) =>
                          setDraft((d) =>
                            updateFeature(d, index, { icon: e.target.value as (typeof SITE_ICONS)[number] }),
                          )
                        }
                      >
                        {SITE_ICONS.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </SelectField>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('moveUp')}
                            disabled={index === 0}
                            onClick={() =>
                              setDraft((d) => ({ ...d, features: moveItem(d.features, index, -1) }))
                            }
                          >
                            <ArrowUp className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('moveDown')}
                            disabled={index === draft.features.length - 1}
                            onClick={() =>
                              setDraft((d) => ({ ...d, features: moveItem(d.features, index, 1) }))
                            }
                          >
                            <ArrowDown className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('removeFeature')}
                            onClick={() =>
                              setDraft((d) => ({ ...d, features: removeItem(d.features, index) }))
                            }
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </div>
                      )}
                    </div>
                    <Input
                      aria-label={t('featureTitle')}
                      placeholder={t('featureTitle')}
                      disabled={disabled}
                      value={text.title}
                      onChange={(e) =>
                        setDraft((d) => updateFeatureText(d, index, locale, { title: e.target.value }))
                      }
                    />
                    <Textarea
                      aria-label={t('featureBody')}
                      placeholder={t('featureBody')}
                      rows={2}
                      disabled={disabled}
                      value={text.description}
                      onChange={(e) =>
                        setDraft((d) => updateFeatureText(d, index, locale, { description: e.target.value }))
                      }
                    />
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canAddFeature(draft)}
                  onClick={() => setDraft((d) => addFeature(d))}
                >
                  <Plus className="size-4" aria-hidden /> {t('addFeature')}
                </Button>
                <span className="text-muted-foreground text-xs">
                  {t('featureCount', { count: draft.features.length, max: SITE_MAX_FEATURES })}
                </span>
              </div>
            )}
            <p className="text-muted-foreground text-xs">{t('featuresShared')}</p>

            <h3 className="font-heading mt-2 text-sm font-semibold">{t('secAbout')}</h3>
            {localeField('aboutTitle')}
            {localeField('aboutBody', { area: true, hint: 'h_aboutBody' })}

            <h3 className="font-heading mt-2 text-sm font-semibold">{t('secFooter')}</h3>
            {localeField('footerText', { hint: 'h_footerText' })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('contactTitle')}</CardTitle>
          <CardDescription>{t('contactHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-3xl gap-4 sm:grid-cols-2">
          {CONTACT_KEYS.map((key) => (
            <Field key={key} id={`site-contact-${key}`} label={t(`c_${key}`)}>
              {key === 'address' ? (
                <Textarea
                  id={`site-contact-${key}`}
                  rows={2}
                  disabled={disabled}
                  value={draft.contact[key]}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: e.target.value } }))
                  }
                />
              ) : (
                <Input
                  id={`site-contact-${key}`}
                  type={key === 'email' ? 'email' : 'text'}
                  disabled={disabled}
                  value={draft.contact[key]}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: e.target.value } }))
                  }
                />
              )}
            </Field>
          ))}
          {SOCIAL_KEYS.map((key) => (
            <Field key={key} id={`site-social-${key}`} label={t(`s_${key}`)}>
              <Input
                id={`site-social-${key}`}
                inputMode="url"
                placeholder="https://"
                disabled={disabled}
                value={draft.social[key]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, social: { ...d.social, [key]: e.target.value.trim() } }))
                }
              />
            </Field>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('sectionsTitle')}</CardTitle>
          <CardDescription>{t('sectionsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {SECTION_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                id={`site-section-${key}`}
                checked={draft.sections[key]}
                disabled={disabled}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, sections: { ...d.sections, [key]: v === true } as SiteSections }))
                }
              />
              <Label htmlFor={`site-section-${key}`} className="font-normal">
                {t(`sec_${key}`)}
              </Label>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {missing.length > 0 && (
        <Alert role="status">
          <AlertDescription>
            {t('missingRequired', { locales: missing.map((c) => t(`locale_${c}`)).join(', ') })}
          </AlertDescription>
        </Alert>
      )}

      {canEdit && (
        <div className="bg-background/90 sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t px-1 py-3 backdrop-blur">
          <Button type="submit" disabled={!dirty || save.isPending || missing.length > 0}>
            {t('save')}
          </Button>
          {dirty && (
            <>
              <Button type="button" variant="ghost" onClick={() => setDraft(saved)}>
                {t('discard')}
              </Button>
              <span className="text-muted-foreground text-xs">{t('unsaved')}</span>
            </>
          )}
          <div className="ml-auto">
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" disabled={!customized && !dirty}>
                  <RotateCcw className="size-4" aria-hidden /> {t('resetContent')}
                </Button>
              }
              title={t('resetContentTitle')}
              description={t('resetContentBody')}
              confirmLabel={t('resetContent')}
              destructive
              pending={reset.isPending}
              onConfirm={() => reset.mutateAsync()}
            />
          </div>
        </div>
      )}
    </form>
  );
}
