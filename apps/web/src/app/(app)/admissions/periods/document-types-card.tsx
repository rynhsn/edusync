'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

interface Draft {
  id: string | null;
  key: string;
  label: string;
  required: boolean;
  active: boolean;
  sort: number;
}

const EMPTY: Draft = { id: null, key: '', label: '', required: false, active: true, sort: 0 };

/** Kunci dari nama: huruf kecil, angka, garis bawah; diberi akhiran acak bila bentrok. */
function keyFromLabel(label: string, taken: Set<string>) {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'dokumen';
  return taken.has(base) ? `${base}_${Math.random().toString(36).slice(2, 6)}` : base;
}

/** Kartu pengelola jenis dokumen yang diminta formulir pendaftaran SPMB. */
export function DocumentTypesCard() {
  const t = useTranslations('admissions.docTypes');
  const te = useTranslations();
  const { school, can } = useSchool();
  const manage = can('admission:manage');
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const queryKey = ['admissions', school.schoolId, 'document-types'];

  const list = useQuery({
    queryKey,
    queryFn: async () => unwrap(await api.GET('/v1/admissions/document-types', { params: header })),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);
  const rows = list.data ?? [];

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        label: d.label.trim(),
        required: d.required,
        active: d.active,
        sort: d.id ? d.sort : rows.reduce((max, r) => Math.max(max, r.sort), 0) + 1,
      };
      if (d.id) {
        return unwrap(
          await api.PUT('/v1/admissions/document-types/{id}', {
            params: { ...header, path: { id: d.id } },
            body,
          }),
        );
      }
      const key = keyFromLabel(d.label, new Set(rows.map((r) => r.key)));
      return unwrap(
        await api.POST('/v1/admissions/document-types', { params: header, body: { key, ...body } }),
      );
    },
    onSuccess: (_r, d) => {
      toast.success(d.id ? t('saved') : t('created'));
      setError(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/admissions/document-types/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <section aria-labelledby="doc-types" className="bg-card grid gap-4 rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="doc-types" className="font-heading flex items-center gap-2 text-lg font-semibold">
            <FileText className="size-5 text-teal-600 dark:text-teal-300" aria-hidden /> {t('title')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">{t('hint')}</p>
        </div>
        {manage && (
          <Button
            onClick={() => {
              setError(null);
              setDraft(EMPTY);
            }}
          >
            <Plus className="size-4" aria-hidden /> {t('add')}
          </Button>
        )}
      </div>

      {list.isPending && <Skeleton className="h-32 w-full rounded-xl" aria-busy />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className={cn('flex items-center gap-3 rounded-xl border p-3', !r.active && 'opacity-70')}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.label}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <ToneBadge tone={r.required ? 'rose' : 'slate'} dot={false}>
                    {r.required ? t('required') : t('optional')}
                  </ToneBadge>
                  {!r.active && <ToneBadge tone="slate">{t('inactive')}</ToneBadge>}
                  <span className="text-muted-foreground text-xs">{t('usedBy', { count: r.usedBy })}</span>
                </div>
              </div>
              {manage && (
                <>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('edit')}: ${r.label}`}
                    onClick={() => {
                      setError(null);
                      setDraft({
                        id: r.id,
                        key: r.key,
                        label: r.label,
                        required: r.required,
                        active: r.active,
                        sort: r.sort,
                      });
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('delete')}: ${r.label}`}
                    onClick={() => setDeleting({ id: r.id, label: r.label })}
                  >
                    <Trash2 className="text-destructive size-4" aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        open={draft !== null}
        title={draft?.id ? t('edit') : t('add')}
        submitLabel={t('save')}
        disabled={!draft?.label.trim()}
        error={error}
        onOpenChange={(o) => {
          if (!o) setDraft(null);
        }}
        onSubmit={() => (draft ? save.mutateAsync(draft) : Promise.resolve())}
      >
        {draft && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="doc-type-label">{t('name')}</Label>
              <Input
                id="doc-type-label"
                required
                maxLength={60}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="doc-type-required"
                checked={draft.required}
                onCheckedChange={(v) => setDraft({ ...draft, required: v === true })}
              />
              <Label htmlFor="doc-type-required">{t('requiredLabel')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="doc-type-active"
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
              />
              <Label htmlFor="doc-type-active">{t('activeLabel')}</Label>
            </div>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('delete')}
        description={deleting ? t('confirmDelete', { name: deleting.label }) : undefined}
        destructive
        pending={remove.isPending}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />
    </section>
  );
}
