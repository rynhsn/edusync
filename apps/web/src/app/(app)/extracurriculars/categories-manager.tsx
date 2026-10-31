'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile, TONES, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICONS,
  CATEGORY_TONE_KEYS,
  type CategoryIconKey,
  categoryMeta,
} from './shared';
import { useExtracurricularCategories } from './use-categories';

interface Draft {
  id: string | null;
  key: string;
  label: string;
  icon: CategoryIconKey;
  tone: (typeof CATEGORY_TONE_KEYS)[number];
  active: boolean;
}

const EMPTY: Draft = { id: null, key: '', label: '', icon: 'trophy', tone: 'teal', active: true };

/** Kunci dari nama: huruf kecil, angka, tanda hubung; diberi akhiran acak bila bentrok. */
function keyFromLabel(label: string, taken: Set<string>) {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'kategori';
  if (!taken.has(base)) return base;
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Dialog pengelola kategori ekstrakurikuler (nama, ikon, nada warna, urutan lewat penambahan, status aktif). */
export function CategoriesManager() {
  const t = useTranslations('extracurricular.categories');
  const tc = useTranslations('common');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const categories = useExtracurricularCategories();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['extracurricular-categories', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['extracurriculars', school.schoolId] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const rows = categories.data ?? [];
      const sort = d.id
        ? (rows.find((r) => r.id === d.id)?.sort ?? 0)
        : rows.reduce((max, r) => Math.max(max, r.sort), 0) + 1;
      const body = { label: d.label.trim(), icon: d.icon, tone: d.tone, sort, active: d.active };
      if (d.id) {
        return unwrap(
          await api.PUT('/v1/extracurricular-categories/{id}', {
            params: { ...header, path: { id: d.id } },
            body,
          }),
        );
      }
      const key = keyFromLabel(d.label, new Set(rows.map((r) => r.key)));
      return unwrap(
        await api.POST('/v1/extracurricular-categories', { params: header, body: { key, ...body } }),
      );
    },
    onSuccess: (_data, d) => {
      toast.success(d.id ? t('saved') : t('created'));
      setDraft(null);
      setError(null);
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE('/v1/extracurricular-categories/{id}', { params: { ...header, path: { id } } }),
      ),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setDraft(null);
          setError(null);
        }}
      >
        <DialogTrigger
          render={
            <Button variant="outline">
              <Settings2 className="size-4" /> {t('manage')}
            </Button>
          }
        />
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          {categories.isPending && <Skeleton className="h-40 w-full rounded-xl" aria-busy />}
          {categories.data && (
            <ul className="grid gap-2">
              {categories.data.map((c) => {
                const meta = categoryMeta(categories.data, c.key);
                return (
                  <li
                    key={c.id}
                    className={cn(
                      'bg-card flex items-center gap-3 rounded-xl border p-2.5',
                      !c.active && 'opacity-70',
                    )}
                  >
                    <IconTile icon={meta.icon} tone={meta.tone} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.label}</p>
                      <p className="text-muted-foreground text-xs">{t('usedBy', { count: c.usedBy })}</p>
                    </div>
                    {!c.active && <ToneBadge tone="slate">{t('inactive')}</ToneBadge>}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${t('edit')}: ${c.label}`}
                      onClick={() => {
                        setError(null);
                        setDraft({
                          id: c.id,
                          key: c.key,
                          label: c.label,
                          icon: c.icon,
                          tone: c.tone,
                          active: c.active,
                        });
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${tm('delete')}: ${c.label}`}
                      onClick={() => setDeleting({ id: c.id, label: c.label })}
                    >
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {draft ? (
            <form
              className="bg-muted/40 grid gap-4 rounded-xl border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
            >
              <p className="font-heading text-sm font-semibold">{draft.id ? t('edit') : t('add')}</p>
              <div className="grid gap-2">
                <Label htmlFor="cat-label">{t('name')}</Label>
                <Input
                  id="cat-label"
                  required
                  maxLength={50}
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{t('icon')}</legend>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_ICON_KEYS.map((k) => {
                    const Icon = CATEGORY_ICONS[k];
                    const on = draft.icon === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-label={t(`icons.${k}`)}
                        aria-pressed={on}
                        onClick={() => setDraft({ ...draft, icon: k })}
                        className={cn(
                          'grid size-9 place-items-center rounded-lg border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                          on
                            ? cn(TONES[draft.tone].soft, 'border-transparent ring-2', TONES[draft.tone].ring)
                            : 'hover:bg-muted',
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{t('tone')}</legend>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_TONE_KEYS.map((k) => {
                    const on = draft.tone === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-label={t(`tones.${k}`)}
                        aria-pressed={on}
                        onClick={() => setDraft({ ...draft, tone: k })}
                        className={cn(
                          'size-7 rounded-full transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                          TONES[k].bar,
                          on
                            ? 'ring-foreground/70 ring-offset-background scale-110 ring-2 ring-offset-2'
                            : 'hover:scale-105',
                        )}
                      />
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cat-active"
                  checked={draft.active}
                  onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
                />
                <Label htmlFor="cat-active">{t('activeLabel')}</Label>
              </div>
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  {tc('cancel')}
                </Button>
                <Button type="submit" disabled={save.isPending || !draft.label.trim()}>
                  {tm('save')}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => {
                setError(null);
                setDraft(EMPTY);
              }}
            >
              <Plus className="size-4" /> {t('add')}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('deleteTitle')}
        description={deleting ? t('confirmDelete', { name: deleting.label }) : undefined}
        confirmLabel={tc('confirmDelete')}
        destructive
        pending={remove.isPending}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />
    </>
  );
}
