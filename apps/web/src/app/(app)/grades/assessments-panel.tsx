'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
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

  return (
    <div className="grid gap-3">
      {canInput && (
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
        <Card className="text-muted-foreground p-6 text-center text-sm">{t('noComponentsHint')}</Card>
      )}
      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.data && items.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noAssessments')}</Card>
      )}
      {items.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('assessmentTitle')}</TableHead>
                <TableHead>{t('component')}</TableHead>
                <TableHead>{t('date')}</TableHead>
                <TableHead className="text-right">{t('maxScore')}</TableHead>
                <TableHead>{t('filledHeader')}</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => {
                const done = a.total > 0 && a.filled >= a.total;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => setOpen(a.id)}
                      >
                        {a.title}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{componentName(a.componentId)}</Badge>
                    </TableCell>
                    <TableCell>{formatCalendarDate(locale, a.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.maxScore}</TableCell>
                    <TableCell>
                      <Badge variant={done ? 'default' : 'outline'}>
                        {t('filledOf', { filled: a.filled, total: a.total })}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpen(a.id)}>
                        {canInput ? t('fill') : t('view')}
                      </Button>
                      {canInput && (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('edit')}
                            onClick={() =>
                              openDialog(a.id, {
                                componentId: a.componentId,
                                title: a.title,
                                date: a.date,
                                maxScore: String(a.maxScore),
                              })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button size="icon-sm" variant="ghost" aria-label={t('delete')}>
                                <Trash2 className="size-4" />
                              </Button>
                            }
                            title={t('delete')}
                            description={t('confirmDelete', { title: a.title })}
                            confirmLabel={tc('confirmDelete')}
                            destructive
                            pending={remove.isPending}
                            onConfirm={() => remove.mutateAsync(a.id)}
                          />
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

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
