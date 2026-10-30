'use client';

import { Eye, PencilLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import {
  type AnnouncementAudience,
  type AnnouncementCategory,
  AUDIENCES,
  CATEGORIES,
  endOfDayIso,
} from '@/lib/announcements';
import { cn } from '@/lib/utils';
import { AnnouncementPreview } from './announcement-preview';

export const MAX_BODY = 5000;

export interface Draft {
  title: string;
  body: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  eventDate: string;
  expires: string;
  pinned: boolean;
  publish: boolean;
}

export const EMPTY_DRAFT: Draft = {
  title: '',
  body: '',
  category: 'news',
  audience: 'all',
  eventDate: '',
  expires: '',
  pinned: false,
  publish: true,
};

/** Badan permintaan POST/PUT dari isian formulir. */
export function toBody(d: Draft) {
  return {
    title: d.title.trim(),
    body: d.body.trim(),
    category: d.category,
    audience: d.audience,
    eventDate: d.category === 'agenda' ? d.eventDate || null : null,
    pinned: d.pinned,
    status: d.publish ? ('published' as const) : ('draft' as const),
    expiresAt: endOfDayIso(d.expires),
  };
}

export const isDraftValid = (d: Draft) =>
  d.title.trim().length > 0 &&
  d.body.trim().length > 0 &&
  d.body.length <= MAX_BODY &&
  (d.category !== 'agenda' || d.eventDate !== '');

/**
 * Penyunting pengumuman: formulir di kiri, pratinjau langsung di kanan (di ponsel dipisah dua tab).
 * Dialog menutup bila `onSubmit` berhasil; galat ditampilkan lewat `error`.
 */
export function AnnouncementEditor({
  open,
  onOpenChange,
  title,
  submitLabel,
  draft,
  onChange,
  error,
  onSubmit,
  accent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  draft: Draft;
  onChange: (d: Draft) => void;
  error: string | null;
  onSubmit: () => Promise<unknown>;
  accent?: string | null;
}) {
  const t = useTranslations('announcements');
  const tc = useTranslations('common');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [pending, setPending] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const needsDate = draft.category === 'agenda' && !draft.eventDate;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o);
        if (!o) setTab('edit');
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              await onSubmit();
              onOpenChange(false);
            } catch {
              // Galat ditampilkan lewat prop `error`; dialog tetap terbuka.
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{title}</DialogTitle>
            <DialogDescription>{t('previewHint')}</DialogDescription>
          </DialogHeader>

          <div className="bg-muted flex gap-0.5 rounded-lg p-0.5 lg:hidden" role="tablist">
            {(
              [
                ['edit', PencilLine, t('tabEdit')],
                ['preview', Eye, t('tabPreview')],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors',
                  tab === key ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className={cn('grid gap-4', tab === 'preview' && 'hidden lg:grid')}>
              <div className="grid gap-2">
                <Label htmlFor="ann-title">{t('fieldTitle')}</Label>
                <Input
                  id="ann-title"
                  required
                  maxLength={150}
                  value={draft.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="ann-category">{t('categoryLabel')}</Label>
                  <SelectField
                    id="ann-category"
                    value={draft.category}
                    onChange={(e) => set('category', e.target.value as AnnouncementCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`category.${c}`)}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ann-audience">{t('audienceLabel')}</Label>
                  <SelectField
                    id="ann-audience"
                    value={draft.audience}
                    onChange={(e) => set('audience', e.target.value as AnnouncementAudience)}
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {t(`audience.${a}`)}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>
              <p className="text-muted-foreground -mt-2 text-xs">{t(`audienceHint.${draft.audience}`)}</p>

              {draft.category === 'agenda' && (
                <div className="grid gap-2">
                  <Label htmlFor="ann-event">{t('fieldEventDate')}</Label>
                  <DatePicker id="ann-event" value={draft.eventDate} onChange={(v) => set('eventDate', v)} />
                  <p className={cn('text-xs', needsDate ? 'text-destructive' : 'text-muted-foreground')}>
                    {needsDate ? t('agendaNeedsDate') : t('fieldEventDateHint')}
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="ann-body">{t('fieldBody')}</Label>
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      draft.body.length > MAX_BODY ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {t('charCount', { count: draft.body.length, max: MAX_BODY })}
                  </span>
                </div>
                <Textarea
                  id="ann-body"
                  required
                  rows={8}
                  value={draft.body}
                  aria-describedby="ann-body-hint"
                  onChange={(e) => set('body', e.target.value)}
                />
                <p id="ann-body-hint" className="text-muted-foreground text-xs">
                  {t('bodyHint')}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ann-expires">{t('fieldExpires')}</Label>
                <DatePicker
                  id="ann-expires"
                  clearable
                  value={draft.expires}
                  onChange={(v) => set('expires', v)}
                />
                <p className="text-muted-foreground text-xs">{t('fieldExpiresHint')}</p>
              </div>

              <div className="grid gap-3 rounded-xl border p-3">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="ann-pinned"
                    checked={draft.pinned}
                    onCheckedChange={(v) => set('pinned', v === true)}
                  />
                  <Label htmlFor="ann-pinned" className="font-normal">
                    {t('fieldPinned')}
                  </Label>
                </div>
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="ann-publish"
                    className="mt-0.5"
                    checked={draft.publish}
                    onCheckedChange={(v) => set('publish', v === true)}
                  />
                  <div className="grid gap-0.5">
                    <Label htmlFor="ann-publish" className="font-normal">
                      {t('fieldPublish')}
                    </Label>
                    <span className="text-muted-foreground text-xs">{t('fieldPublishHint')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={cn('lg:sticky lg:top-0', tab === 'edit' && 'hidden lg:block')}>
              <p className="text-muted-foreground mb-2 hidden text-xs font-semibold tracking-wide uppercase lg:block">
                {t('previewTitle')}
              </p>
              <AnnouncementPreview
                accent={accent ?? null}
                data={{
                  title: draft.title,
                  body: draft.body,
                  category: draft.category,
                  eventDate: draft.eventDate,
                  pinned: draft.pinned,
                  expires: draft.expires,
                }}
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={pending || !isDraftValid(draft)}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
