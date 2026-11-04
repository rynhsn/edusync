'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, TONES } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

interface ExamType {
  id: string;
  name: string;
  shortName: string;
  sort: number;
  active: boolean;
}
interface Draft {
  id: string | null;
  name: string;
  shortName: string;
  active: boolean;
}
const EMPTY: Draft = { id: null, name: '', shortName: '', active: true };

/** Jenis ujian milik sekolah (ASTS, ASAS, ...): namanya bebas diganti mengikuti kebijakan. */
export function TypesView() {
  const t = useTranslations('exams');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('exam:manage');
  const key = ['exam-types', school.schoolId];
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<ExamType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/exam/types', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { name: d.name.trim(), shortName: d.shortName.trim(), active: d.active };
      if (d.id) {
        return unwrap(
          await api.PUT('/v1/exam/types/{id}', { params: { ...header, path: { id: d.id } }, body }),
        );
      }
      return unwrap(await api.POST('/v1/exam/types', { params: header, body }));
    },
    onSuccess: (_r, d) => {
      toast.success(d.id ? t('typeSaved') : t('typeCreated'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const defaults = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/exam/types/defaults', { params: header })),
    onSuccess: () => {
      toast.success(t('defaultsFilled'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/exam/types/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('typeDeleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function openNew() {
    setDraft(EMPTY);
    setError(null);
    setOpen(true);
  }
  const list = types.data ?? [];

  return (
    <PageBody>
      <PageHeader
        title={t('typesTitle')}
        description={t('typesSubtitle')}
        actions={
          manage && (
            <Button onClick={openNew}>
              <Plus className="size-4" aria-hidden /> {t('addType')}
            </Button>
          )
        }
      />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? t('editType') : t('addType')}
        submitLabel={t('save')}
        error={error}
        disabled={!draft.name.trim() || !draft.shortName.trim()}
        onSubmit={() => save.mutateAsync(draft)}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="et-name">{t('typeName')}</Label>
            <Input
              id="et-name"
              required
              maxLength={100}
              placeholder="Asesmen Sekolah Akhir Semester"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="et-short">{t('typeShort')}</Label>
            <Input
              id="et-short"
              required
              maxLength={20}
              placeholder="ASAS"
              value={draft.shortName}
              onChange={(e) => setDraft({ ...draft, shortName: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">{t('typeShortHint')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="et-active"
              checked={draft.active}
              onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
            />
            <Label htmlFor="et-active">{t('typeActive')}</Label>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('deleteTypeTitle', { name: deleting?.name ?? '' })}
        description={t('deleteTypeBody')}
        confirmLabel={t('delete')}
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />

      {types.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}
      {types.isPending ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyPanel
          icon={ClipboardList}
          tone="violet"
          title={t('typesEmptyTitle')}
          body={t('typesEmptyBody')}
          action={
            manage && (
              <Button onClick={() => defaults.mutate()} disabled={defaults.isPending}>
                {t('fillDefaults')}
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((x) => (
            <li
              key={x.id}
              className={cn(
                'bg-card flex items-center gap-3 rounded-xl border p-3',
                !x.active && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'grid min-w-14 shrink-0 place-items-center rounded-lg px-2 py-2 text-sm font-semibold',
                  TONES.violet.soft,
                )}
              >
                {x.shortName}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{x.name}</p>
                {!x.active && <p className="text-muted-foreground text-xs">{t('inactive')}</p>}
              </div>
              {manage && (
                <ActionMenu
                  label={t('typeActionsFor', { name: x.name })}
                  items={[
                    {
                      label: t('edit'),
                      icon: Pencil,
                      onSelect: () => {
                        setError(null);
                        setDraft({ id: x.id, name: x.name, shortName: x.shortName, active: x.active });
                        setOpen(true);
                      },
                    },
                    { label: t('delete'), icon: Trash2, destructive: true, onSelect: () => setDeleting(x) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
