'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CopyPlus,
  GitBranch,
  Lock,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ConfirmDelete, ListSkeleton, REVEAL } from '@/components/master-kit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  addObjectives,
  type DraftItem,
  itemsChanged,
  MAX_FLOW_ITEMS,
  moveItem,
  removeItemAt,
  toDraftItems,
  toRequestItems,
  totalsOf,
} from '@/lib/teaching-plan';
import { cn } from '@/lib/utils';
import { FlowMetaForm } from './flow-meta-form';

/** Status ATP sebagai lencana: draf (kuning) atau terbit (hijau). */
export function FlowStatusBadge({ status }: { status: 'draft' | 'published' }) {
  const t = useTranslations('teachingPlan');
  return (
    <ToneBadge tone={status === 'published' ? 'emerald' : 'amber'}>
      {status === 'published' ? t('statusPublished') : t('statusDraft')}
    </ToneBadge>
  );
}

interface ObjectiveInfo {
  code: string | null;
  description: string;
  active: boolean;
  outcomeCode: string | null;
  phase: string;
}

/** Editor satu ATP: item TP berurut (draf) atau tampilan baca-saja (terbit). */
export function FlowEditor({
  flowId,
  canWrite,
  onBack,
  onOpen,
}: {
  flowId: string;
  canWrite: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['teaching-plan'] });

  const flow = useQuery({
    queryKey: ['teaching-plan', 'flow', school.schoolId, flowId],
    queryFn: async () =>
      unwrap(await api.GET('/v1/learning-flows/{id}', { params: { ...header, path: { id: flowId } } })),
  });
  const data = flow.data;
  const editable = canWrite && data?.status === 'draft';

  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, data?.academicYearId],
    enabled: !!data && can('academic_year:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/semesters', {
          params: { ...header, query: { academicYearId: data?.academicYearId } },
        }),
      ),
  });

  // CP aktif mapel dan TP aktifnya: bahan pemilih TP serta keterangan untuk item yang baru ditambahkan.
  const outcomes = useQuery({
    queryKey: ['teaching-plan', 'outcomes', school.schoolId, data?.subjectId, false],
    enabled: !!data && editable,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/subjects/{subjectId}/outcomes', {
          params: {
            ...header,
            path: { subjectId: data?.subjectId ?? '' },
            query: { includeInactive: 'false' },
          },
        }),
      ),
  });
  const outcomeList = outcomes.data?.outcomes ?? [];
  const objectiveQueries = useQueries({
    queries: outcomeList.map((o) => ({
      queryKey: ['teaching-plan', 'objectives', school.schoolId, o.id, false],
      queryFn: async () =>
        unwrap(
          await api.GET('/v1/outcomes/{id}/objectives', {
            params: { ...header, path: { id: o.id }, query: { includeInactive: 'false' } },
          }),
        ),
    })),
  });

  const [draft, setDraft] = useState<{ key: string; items: DraftItem[] } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const key = data ? `${data.id}:${data.updatedAt}` : '';
  const items = data ? (draft?.key === key ? draft.items : toDraftItems(data.items)) : [];
  const setItems = (next: DraftItem[]) => setDraft({ key, items: next });
  const dirty = !!data && editable && itemsChanged(data.items, items);

  const info = new Map<string, ObjectiveInfo>();
  for (const i of data?.items ?? []) {
    info.set(i.objectiveId, {
      code: i.objectiveCode,
      description: i.objectiveDescription,
      active: i.objectiveActive,
      outcomeCode: i.outcomeCode,
      phase: i.outcomePhase,
    });
  }
  outcomeList.forEach((o, idx) => {
    for (const ob of objectiveQueries[idx]?.data?.objectives ?? []) {
      if (!info.has(ob.id)) {
        info.set(ob.id, {
          code: ob.code,
          description: ob.description,
          active: ob.active,
          outcomeCode: o.code,
          phase: o.phase,
        });
      }
    }
  });

  const save = useMutation({
    mutationFn: async () => {
      const req = toRequestItems(items);
      if (!req.ok) {
        const p = req.problem;
        throw new Error(
          p.kind === 'quantity'
            ? t('quantityInvalid', { row: p.index + 1 })
            : p.kind === 'too_many'
              ? te('errors.too_many_items')
              : te('errors.duplicate_entry'),
        );
      }
      return unwrap(
        await api.PUT('/v1/learning-flows/{id}', {
          params: { ...header, path: { id: flowId } },
          body: { items: req.items },
        }),
      );
    },
    onSuccess: () => {
      toast.success(t('draftSaved'));
      setDraft(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error && !('code' in e) ? e.message : te(errorKey(e))),
  });
  const publish = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/learning-flows/{id}/publish', { params: { ...header, path: { id: flowId } } }),
      ),
    onSuccess: () => {
      toast.success(t('published'));
      setDraft(null);
      invalidate();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const newVersion = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/learning-flows/{id}/new-version', {
          params: { ...header, path: { id: flowId } },
        }),
      ),
    onSuccess: (res) => {
      toast.success(t('newVersionDone', { version: res.version }));
      invalidate();
      onOpen(res.id);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/learning-flows/{id}', { params: { ...header, path: { id: flowId } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      invalidate();
      onBack();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const back = (
    <Button variant="ghost" size="sm" className="w-fit" onClick={onBack}>
      <ArrowLeft className="size-4" aria-hidden /> {t('backToFlows')}
    </Button>
  );

  if (flow.isPending) {
    return (
      <div className="grid gap-4">
        {back}
        <ListSkeleton rows={4} stats={0} />
      </div>
    );
  }
  if (flow.isError || !data) {
    return (
      <div className="grid gap-4">
        {back}
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(flow.error))}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const semesterName = new Map((semesters.data ?? []).map((s) => [s.id, s.name]));
  const totals = totalsOf(items);
  const busy = save.isPending || publish.isPending || newVersion.isPending || remove.isPending;

  function setField(index: number, field: keyof DraftItem, value: string) {
    setItems(items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="tp-flow-title">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 id="tp-flow-title" className="font-heading text-lg font-semibold">
              {data.name}
            </h2>
            <FlowStatusBadge status={data.status} />
            <ToneBadge tone="sky">{t('badgeVersion', { version: data.version })}</ToneBadge>
            {data.supersedesId && <ToneBadge tone="violet">{t('badgeReplaces')}</ToneBadge>}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {[
              data.subjectName,
              data.academicYearName,
              data.levelCode ? t('levelValue', { level: data.levelCode }) : null,
              data.phase ? t('phaseLabel', { phase: data.phase }) : null,
            ]
              .filter(Boolean)
              .join(' | ')}
          </p>
        </div>
        {editable && (
          <Button variant="outline" onClick={() => setEditingMeta(true)}>
            <Pencil className="size-4" aria-hidden /> {t('editFlow')}
          </Button>
        )}
      </div>

      {data.status === 'published' && (
        <Alert>
          <Lock className="size-4" aria-hidden />
          <AlertTitle>{t('lockedTitle')}</AlertTitle>
          <AlertDescription>{t('lockedBody')}</AlertDescription>
        </Alert>
      )}

      {items.length === 0 ? (
        <EmptyPanel
          icon={GitBranch}
          tone={MODULE_TONE.academic}
          title={t('itemsEmpty')}
          body={editable ? t('itemsEmptyBody') : undefined}
        />
      ) : (
        <div className="bg-card overflow-x-auto rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t('colNo')}</TableHead>
                <TableHead className="min-w-64">{t('colObjective')}</TableHead>
                <TableHead className="w-24">{t('colWeeks')}</TableHead>
                <TableHead className="w-24">{t('colPeriods')}</TableHead>
                <TableHead className="w-44">{t('colSemester')}</TableHead>
                {editable && (
                  <TableHead className="w-32">
                    <span className="sr-only">{t('rowActions')}</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, index) => {
                const o = info.get(it.objectiveId);
                return (
                  <TableRow key={it.objectiveId}>
                    <TableCell className="text-muted-foreground align-top">{index + 1}</TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {o?.code && (
                          <ToneBadge tone="slate" dot={false}>
                            {o.code}
                          </ToneBadge>
                        )}
                        {o && (
                          <span className="text-muted-foreground text-xs">
                            {t('outcomeShort')}
                            {o.outcomeCode ? ` ${o.outcomeCode}` : ''} | {t('phaseLabel', { phase: o.phase })}
                          </span>
                        )}
                        {o && !o.active && <ToneBadge tone="amber">{t('objectiveOld')}</ToneBadge>}
                      </div>
                      <p className="mt-1 text-sm whitespace-pre-line">{o?.description ?? '...'}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      {editable ? (
                        <Input
                          inputMode="numeric"
                          aria-label={t('weeksFor', { row: index + 1 })}
                          value={it.weeks}
                          onChange={(e) => setField(index, 'weeks', e.target.value)}
                        />
                      ) : (
                        it.weeks || '-'
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {editable ? (
                        <Input
                          inputMode="numeric"
                          aria-label={t('periodsFor', { row: index + 1 })}
                          value={it.periods}
                          onChange={(e) => setField(index, 'periods', e.target.value)}
                        />
                      ) : (
                        it.periods || '-'
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {editable ? (
                        <SelectField
                          className={TOUCH_SELECT}
                          aria-label={t('semesterFor', { row: index + 1 })}
                          value={it.semesterId}
                          onChange={(e) => setField(index, 'semesterId', e.target.value)}
                        >
                          <option value="">{t('noSemester')}</option>
                          {(semesters.data ?? []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </SelectField>
                      ) : (
                        (it.semesterId && semesterName.get(it.semesterId)) || '-'
                      )}
                    </TableCell>
                    {editable && (
                      <TableCell className="align-top">
                        <div className="flex items-center justify-end">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('moveUp')}
                            title={t('moveUp')}
                            disabled={index === 0}
                            onClick={() => setItems(moveItem(items, index, -1))}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('moveDown')}
                            title={t('moveDown')}
                            disabled={index === items.length - 1}
                            onClick={() => setItems(moveItem(items, index, 1))}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('removeItem')}
                            title={t('removeItem')}
                            onClick={() => setItems(removeItemAt(items, index))}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {t('totals', { weeks: totals.weeks, periods: totals.periods })} |{' '}
        {t('itemLimit', { count: items.length, max: MAX_FLOW_ITEMS })}
        {dirty && <span className="text-foreground font-medium"> | {t('unsaved')}</span>}
      </p>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={items.length >= MAX_FLOW_ITEMS || busy}
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-4" aria-hidden /> {t('addObjectives')}
          </Button>
          <Button disabled={!dirty || busy} onClick={() => save.mutate()}>
            <Save className="size-4" aria-hidden /> {save.isPending ? t('saving') : t('saveDraft')}
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="secondary" disabled={dirty || items.length === 0 || busy}>
                <Send className="size-4" aria-hidden /> {t('publish')}
              </Button>
            }
            title={t('publishTitle')}
            description={t('publishBody')}
            confirmLabel={t('publish')}
            pending={publish.isPending}
            onConfirm={async () => {
              try {
                await publish.mutateAsync();
              } catch {
                // Galat tampil sebagai toast.
              }
            }}
          />
          <Button variant="ghost" disabled={busy} onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" aria-hidden /> {t('deleteDraft')}
          </Button>
          {dirty && <span className="text-muted-foreground text-xs">{t('saveBeforePublish')}</span>}
        </div>
      )}

      {canWrite && data.status === 'published' && (
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmDialog
            trigger={
              <Button disabled={busy}>
                <CopyPlus className="size-4" aria-hidden /> {t('newVersion')}
              </Button>
            }
            title={t('newVersionTitle')}
            description={t('newVersionBody')}
            confirmLabel={t('newVersion')}
            pending={newVersion.isPending}
            onConfirm={async () => {
              try {
                await newVersion.mutateAsync();
              } catch {
                // Galat tampil sebagai toast.
              }
            }}
          />
        </div>
      )}

      {pickerOpen && (
        <ObjectivePicker
          outcomes={outcomeList.map((o, idx) => ({
            id: o.id,
            code: o.code,
            phase: o.phase,
            objectives: objectiveQueries[idx]?.data?.objectives ?? [],
          }))}
          loading={outcomes.isPending || objectiveQueries.some((q) => q.isPending)}
          taken={new Set(items.map((i) => i.objectiveId))}
          onClose={() => setPickerOpen(false)}
          onAdd={(ids) => {
            const r = addObjectives(items, ids);
            setItems(r.items);
            if (r.skipped > 0) toast.warning(t('addedSkipped', { added: r.added, skipped: r.skipped }));
            else toast.success(t('added', { count: r.added }));
          }}
        />
      )}
      {editingMeta && (
        <FlowMetaForm
          subjectId={data.subjectId}
          yearId={data.academicYearId}
          flow={{ id: data.id, name: data.name, levelCode: data.levelCode, phase: data.phase }}
          onClose={() => setEditingMeta(false)}
        />
      )}
      <ConfirmDelete
        name={deleting ? data.name : null}
        onClose={() => setDeleting(false)}
        pending={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync();
          } catch {
            // Galat tampil sebagai toast.
          }
        }}
      />
    </section>
  );
}

/** Dialog pemilih TP dari semua CP aktif mapel; TP yang sudah ada di ATP tidak ditawarkan lagi. */
function ObjectivePicker({
  outcomes,
  taken,
  loading,
  onClose,
  onAdd,
}: {
  outcomes: {
    id: string;
    code: string | null;
    phase: string;
    objectives: { id: string; code: string | null; description: string; active: boolean }[];
  }[];
  taken: Set<string>;
  loading: boolean;
  onClose: () => void;
  onAdd: (objectiveIds: string[]) => void;
}) {
  const t = useTranslations('teachingPlan');
  const [selected, setSelected] = useState<string[]>([]);
  const groups = outcomes
    .map((o) => ({ ...o, objectives: o.objectives.filter((ob) => ob.active && !taken.has(ob.id)) }))
    .filter((o) => o.objectives.length > 0);

  function toggle(id: string, on: boolean) {
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  }

  return (
    <FormDialog
      open
      size="wide"
      onOpenChange={(o) => !o && onClose()}
      title={t('pickerTitle')}
      description={t('pickerHelp')}
      submitLabel={t('pickerAdd', { count: selected.length })}
      disabled={selected.length === 0}
      onSubmit={async () => onAdd(selected)}
    >
      {loading && <ListSkeleton rows={2} stats={0} />}
      {!loading && groups.length === 0 && <p className="text-muted-foreground text-sm">{t('pickerEmpty')}</p>}
      <div className="grid gap-4">
        {groups.map((g) => (
          <fieldset key={g.id} className="grid gap-2">
            <legend className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
              {t('outcomeShort')}
              {g.code ? ` ${g.code}` : ''} | {t('phaseLabel', { phase: g.phase })}
            </legend>
            {g.objectives.map((ob) => (
              <div key={ob.id} className="flex items-start gap-3">
                <Checkbox
                  id={`tp-pick-${ob.id}`}
                  className="mt-0.5"
                  checked={selected.includes(ob.id)}
                  onCheckedChange={(v) => toggle(ob.id, v === true)}
                />
                <Label htmlFor={`tp-pick-${ob.id}`} className="grid cursor-pointer gap-0.5 font-normal">
                  {ob.code && <span className="text-muted-foreground text-xs">{ob.code}</span>}
                  <span className="text-sm">{ob.description}</span>
                </Label>
              </div>
            ))}
          </fieldset>
        ))}
      </div>
    </FormDialog>
  );
}
