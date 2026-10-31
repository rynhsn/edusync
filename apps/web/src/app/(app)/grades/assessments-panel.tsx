'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Eye, Layers, ListChecks, Pencil, PenLine, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { RowMenu } from '@/components/row-menu';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyPanel,
  MODULE_TONE,
  StatCard,
  StatGrid,
  TONES,
  type Tone,
  ToneBadge,
} from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { COMPONENT_TONES } from './grade-ui';
import { ScoreSheet } from './score-sheet';

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

interface Props {
  semesterId: string;
  classId: string;
  subjectId: string;
}

interface Form {
  componentId: string;
  title: string;
  date: string;
  maxScore: string;
}

const emptyForm = (componentId = ''): Form => ({ componentId, title: '', date: todayIso(), maxScore: '100' });

/** Daftar penilaian untuk satu semester, kelas, dan mata pelajaran; membuka lembar input nilai. */
export function AssessmentsPanel({ semesterId, classId, subjectId }: Props) {
  const t = useTranslations('grades');
  const tc = useTranslations('common');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const canInput = can('grade:input');
  const [open, setOpen] = useState<string | null>(null);
  // null = dialog tertutup, '' = penilaian baru, selain itu id penilaian yang diubah.
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['assessments', school.schoolId, semesterId, classId, subjectId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/assessments', {
          params: { ...header, query: { semesterId, classId, subjectId } },
        }),
      ),
  });
  const components = useQuery({
    queryKey: ['grading-components', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/grading/components', { params: header })),
  });
  const componentName = (id: string) => components.data?.find((c) => c.id === id)?.name ?? '';
  const componentTone = (id: string): Tone => {
    const i = components.data?.findIndex((c) => c.id === id) ?? -1;
    return COMPONENT_TONES[Math.max(i, 0) % COMPONENT_TONES.length] ?? 'sky';
  };

  const maxNumber = Number(form.maxScore.trim().replace(',', '.'));
  const formValid =
    !!form.componentId &&
    form.title.trim().length > 0 &&
    !!form.date &&
    form.maxScore.trim() !== '' &&
    Number.isFinite(maxNumber) &&
    maxNumber > 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['assessments', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['grading-recap', school.schoolId] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      const body = {
        componentId: form.componentId,
        title: form.title.trim(),
        date: form.date,
        maxScore: maxNumber,
      };
      if (editing) {
        return unwrap(
          await api.PUT('/v1/assessments/{id}', { params: { ...header, path: { id: editing } }, body }),
        );
      }
      return unwrap(
        await api.POST('/v1/assessments', {
          params: header,
          body: { semesterId, classId, subjectId, ...body },
        }),
      );
    },
    onSuccess: () => {
      toast.success(editing ? t('assessmentUpdated') : t('assessmentCreated'));
      invalidate();
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/assessments/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('assessmentDeleted'));
      invalidate();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function openDialog(id: string, init: Form) {
    setForm(init);
    setFormError(null);
    setEditing(id);
  }

  if (open) {
    return (
      <ScoreSheet
        assessmentId={open}
        onClose={() => {
          setOpen(null);
          invalidate();
        }}
      />
    );
  }

  const items = list.data ?? [];
  const noComponents = components.data?.length === 0;
  const sumFilled = items.reduce((n, a) => n + a.filled, 0);
  const sumTotal = items.reduce((n, a) => n + a.total, 0);
  const completeCount = items.filter((a) => a.total > 0 && a.filled >= a.total).length;
  const usedComponents = new Set(items.map((a) => a.componentId)).size;

  return (
    <div className="grid gap-4">
      {list.data && items.length > 0 && (
        <StatGrid className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <StatCard
            icon={ClipboardList}
            tone={MODULE_TONE.academic}
            label={t('statAssessments')}
            value={items.length}
          />
          <StatCard
            icon={ListChecks}
            tone="emerald"
            label={t('statComplete')}
            value={`${completeCount}/${items.length}`}
            progress={items.length ? (completeCount / items.length) * 100 : 0}
          />
          <StatCard
            icon={PenLine}
            tone="sky"
            label={t('statScoresFilled')}
            value={sumTotal ? `${Math.round((sumFilled / sumTotal) * 100)}%` : '-'}
            hint={t('filledOf', { filled: sumFilled, total: sumTotal })}
            progress={sumTotal ? (sumFilled / sumTotal) * 100 : 0}
          />
          <StatCard icon={Layers} tone="amber" label={t('statComponents')} value={usedComponents} />
        </StatGrid>
      )}

      {canInput && items.length > 0 && (
        <div className="flex justify-end">
          <Button
            disabled={!components.data || noComponents}
            onClick={() => openDialog('', emptyForm(components.data?.[0]?.id))}
          >
            <Plus className="size-4" /> {t('newAssessment')}
          </Button>
        </div>
      )}
      {noComponents && (
        <EmptyPanel icon={Layers} tone="amber" title={t('noComponentsTitle')} body={t('noComponentsHint')} />
      )}
      {list.isPending && (
        <div className="grid gap-2" aria-busy>
          {['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 4).map((k) => (
            <Skeleton key={k} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}
      {list.data && items.length === 0 && !noComponents && (
        <EmptyPanel
          icon={ClipboardList}
          tone={MODULE_TONE.academic}
          title={t('noAssessmentsTitle')}
          body={t('noAssessments')}
          action={
            canInput && (
              <Button onClick={() => openDialog('', emptyForm(components.data?.[0]?.id))}>
                <Plus className="size-4" /> {t('newAssessment')}
              </Button>
            )
          }
        />
      )}
      {items.length > 0 && (
        <div className="bg-card overflow-hidden rounded-2xl border">
          <div
            aria-hidden
            className="bg-muted/50 text-muted-foreground hidden grid-cols-[minmax(0,2fr)_9rem_8rem_5rem_minmax(0,1.2fr)_auto] items-center gap-4 border-b px-4 py-2.5 text-xs font-medium md:grid"
          >
            <span>{t('assessmentTitle')}</span>
            <span>{t('component')}</span>
            <span>{t('date')}</span>
            <span className="text-right">{t('maxScore')}</span>
            <span>{t('filledHeader')}</span>
            <span className="w-28" />
          </div>
          <ul className="divide-y">
            {items.map((a, idx) => {
              const done = a.total > 0 && a.filled >= a.total;
              const pct = a.total ? (a.filled / a.total) * 100 : 0;
              const ct = componentTone(a.componentId);
              return (
                <li
                  key={a.id}
                  style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
                  className="hover:bg-muted/30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors md:grid-cols-[minmax(0,2fr)_9rem_8rem_5rem_minmax(0,1.2fr)_auto] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'hidden size-9 shrink-0 place-items-center rounded-xl sm:grid',
                        TONES[ct].soft,
                      )}
                    >
                      <ClipboardList className="size-4" />
                    </span>
                    <button
                      type="button"
                      className="focus-visible:ring-ring/60 min-w-0 truncate rounded text-left font-medium outline-none hover:underline focus-visible:ring-2"
                      onClick={() => setOpen(a.id)}
                    >
                      {a.title}
                    </button>
                  </div>
                  <div className="col-start-1 flex flex-wrap items-center gap-2 md:contents">
                    <span className="md:order-none">
                      <ToneBadge tone={ct}>{componentName(a.componentId)}</ToneBadge>
                    </span>
                    <span className="text-muted-foreground text-sm md:text-foreground">
                      {formatCalendarDate(locale, a.date)}
                    </span>
                    <span className="text-muted-foreground text-sm tabular-nums md:text-foreground md:text-right">
                      <span className="md:hidden">{t('maxScore')}: </span>
                      {a.maxScore}
                    </span>
                  </div>
                  <div className="col-start-1 flex items-center gap-3 md:col-start-auto">
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={a.total}
                      aria-valuenow={a.filled}
                      aria-label={t('filledHeader')}
                      className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-500',
                          done ? TONES.emerald.bar : TONES.amber.bar,
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                      {t('filledOf', { filled: a.filled, total: a.total })}
                    </span>
                  </div>
                  <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-start-auto md:w-28">
                    <Button size="sm" variant={done ? 'outline' : 'default'} onClick={() => setOpen(a.id)}>
                      {canInput ? <PenLine className="size-3.5" /> : <Eye className="size-3.5" />}
                      {canInput ? t('fill') : t('view')}
                    </Button>
                    {canInput && (
                      <RowMenu
                        label={`${t('rowActions')}: ${a.title}`}
                        items={[
                          {
                            key: 'edit',
                            label: t('edit'),
                            icon: Pencil,
                            onSelect: () =>
                              openDialog(a.id, {
                                componentId: a.componentId,
                                title: a.title,
                                date: a.date,
                                maxScore: String(a.maxScore),
                              }),
                          },
                          {
                            key: 'delete',
                            label: t('delete'),
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => setDeleting({ id: a.id, title: a.title }),
                          },
                        ]}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('delete')}
        description={deleting ? t('confirmDelete', { title: deleting.title }) : undefined}
        confirmLabel={tc('confirmDelete')}
        destructive
        pending={remove.isPending}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={editing ? t('editAssessment') : t('newAssessment')}
        submitLabel={t('save')}
        error={formError}
        disabled={!formValid || submit.isPending}
        onSubmit={() => submit.mutateAsync()}
      >
        <div className="grid gap-2">
          <Label>{t('component')}</Label>
          <SelectField
            aria-label={t('component')}
            value={form.componentId}
            onChange={(e) => setForm((f) => ({ ...f, componentId: e.target.value }))}
          >
            {components.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.weight}%)
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="assessment-title">{t('assessmentTitle')}</Label>
          <Input
            id="assessment-title"
            maxLength={120}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>{t('date')}</Label>
            <DatePicker
              aria-label={t('date')}
              value={form.date}
              onChange={(v) => v && setForm((f) => ({ ...f, date: v }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="assessment-max">{t('maxScore')}</Label>
            <Input
              id="assessment-max"
              inputMode="decimal"
              value={form.maxScore}
              onChange={(e) => setForm((f) => ({ ...f, maxScore: e.target.value }))}
            />
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
