'use client';

import { PHASES } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Target, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ConfirmDelete, ListSkeleton, type MenuAction, REVEAL, RowMenu } from '@/components/master-kit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { groupByPhase, reorderObjectives } from '@/lib/teaching-plan';
import { cn } from '@/lib/utils';

type Phase = (typeof PHASES)[number];

interface Outcome {
  id: string;
  subjectId: string;
  phase: Phase;
  code: string | null;
  description: string;
  version: number;
  supersedesId: string | null;
  active: boolean;
  objectiveCount: number;
}

interface Objective {
  id: string;
  outcomeId: string;
  code: string | null;
  description: string;
  sortOrder: number;
  version: number;
  supersedesId: string | null;
  active: boolean;
}

/** Lencana versi: nomor versi, "menggantikan" bila hasil versi baru, dan "versi lama" bila sudah digantikan/nonaktif. */
function VersionBadges({ row }: { row: { version: number; supersedesId: string | null; active: boolean } }) {
  const t = useTranslations('teachingPlan');
  return (
    <>
      {row.version > 1 && <ToneBadge tone="sky">{t('badgeVersion', { version: row.version })}</ToneBadge>}
      {row.supersedesId && <ToneBadge tone="violet">{t('badgeReplaces')}</ToneBadge>}
      {!row.active && <ToneBadge tone="amber">{t('badgeOld')}</ToneBadge>}
    </>
  );
}

/** Capaian pembelajaran (CP) per fase dan tujuan pembelajaran (TP) di bawahnya untuk satu mapel. */
export function OutcomesPanel({ subjectId, canWrite }: { subjectId: string; canWrite: boolean }) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<{ outcome: Outcome | null } | null>(null);

  const outcomes = useQuery({
    queryKey: ['teaching-plan', 'outcomes', school.schoolId, subjectId, showInactive],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/subjects/{subjectId}/outcomes', {
          params: {
            ...header,
            path: { subjectId },
            query: { includeInactive: showInactive ? 'true' : 'false' },
          },
        }),
      ),
  });
  const list = (outcomes.data?.outcomes ?? []) as Outcome[];
  const groups = groupByPhase(list, PHASES);

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="tp-outcomes-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tp-outcomes-title" className="font-heading text-lg font-semibold">
            {t('outcomesTitle')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('outcomesHelp')}</p>
        </div>
        {canWrite && (
          <Button onClick={() => setDialog({ outcome: null })}>
            <Plus className="size-4" aria-hidden /> {t('addOutcome')}
          </Button>
        )}
      </div>

      <Alert>
        <TriangleAlert className="size-4" aria-hidden />
        <AlertTitle>{t('versionWarningTitle')}</AlertTitle>
        <AlertDescription>{t('versionWarning')}</AlertDescription>
      </Alert>

      <div className="flex items-center gap-2">
        <Checkbox
          id="tp-show-inactive"
          checked={showInactive}
          onCheckedChange={(v) => setShowInactive(v === true)}
        />
        <Label
          htmlFor="tp-show-inactive"
          className="cursor-pointer text-sm font-normal max-md:flex max-md:min-h-11 max-md:items-center"
        >
          {t('showInactive')}
        </Label>
      </div>

      {outcomes.isPending && <ListSkeleton rows={3} stats={0} />}
      {outcomes.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(outcomes.error))}</AlertDescription>
        </Alert>
      )}
      {outcomes.data && list.length === 0 && (
        <EmptyPanel
          icon={Target}
          tone={MODULE_TONE.academic}
          title={t('emptyOutcomes')}
          body={canWrite ? t('emptyOutcomesBody') : t('emptyOutcomesReadOnly')}
        />
      )}

      {groups.map((g) => (
        <div key={g.phase} className="grid gap-3">
          <h3 className="font-heading text-base font-semibold">{t('phaseLabel', { phase: g.phase })}</h3>
          {g.rows.map((o) => (
            <OutcomeCard
              key={o.id}
              outcome={o}
              canWrite={canWrite}
              showInactive={showInactive}
              onEdit={() => setDialog({ outcome: o })}
            />
          ))}
        </div>
      ))}

      {dialog && (
        <OutcomeForm
          key={dialog.outcome?.id ?? 'new'}
          subjectId={subjectId}
          outcome={dialog.outcome}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function useInvalidatePlan() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['teaching-plan'] });
}

function OutcomeCard({
  outcome,
  canWrite,
  showInactive,
  onEdit,
}: {
  outcome: Outcome;
  canWrite: boolean;
  showInactive: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const invalidate = useInvalidatePlan();
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);

  const setActive = useMutation({
    mutationFn: async (active: boolean) =>
      unwrap(
        await api.PUT('/v1/outcomes/{id}', {
          params: { ...header, path: { id: outcome.id } },
          body: {
            phase: outcome.phase,
            code: outcome.code,
            description: outcome.description,
            active,
          },
        }),
      ),
    onSuccess: (_r, active) => {
      toast.success(active ? t('activated') : t('deactivated'));
      invalidate();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/outcomes/{id}', { params: { ...header, path: { id: outcome.id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      invalidate();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const actions: MenuAction[] = canWrite
    ? [
        ...(outcome.active ? [{ label: t('edit'), icon: Pencil, onSelect: onEdit }] : []),
        {
          label: outcome.active ? t('deactivate') : t('activate'),
          icon: outcome.active ? EyeOff : Eye,
          onSelect: () => setActive.mutate(!outcome.active),
        },
        {
          label: t('delete'),
          icon: Trash2,
          destructive: true,
          separated: true,
          onSelect: () => setDeleting(true),
        },
      ]
    : [];

  return (
    <div className={cn('bg-card grid gap-3 rounded-2xl border p-4', !outcome.active && 'opacity-80')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <ToneBadge tone="teal" dot={false}>
              {t('outcomeShort')}
              {outcome.code ? ` ${outcome.code}` : ''}
            </ToneBadge>
            <VersionBadges row={outcome} />
          </div>
          <p className="mt-2 text-sm whitespace-pre-line">{outcome.description}</p>
        </div>
        <RowMenu label={t('rowActions')} actions={actions} />
      </div>

      <ObjectivesList outcome={outcome} canWrite={canWrite} showInactive={showInactive} />

      {canWrite && outcome.active && (
        <div>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> {t('addObjective')}
          </Button>
        </div>
      )}
      {adding && <ObjectiveForm outcomeId={outcome.id} objective={null} onClose={() => setAdding(false)} />}
      <ConfirmDelete
        name={deleting ? (outcome.code ?? t('outcomeShort')) : null}
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
    </div>
  );
}

function ObjectivesList({
  outcome,
  canWrite,
  showInactive,
}: {
  outcome: Outcome;
  canWrite: boolean;
  showInactive: boolean;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const invalidate = useInvalidatePlan();
  const [editing, setEditing] = useState<Objective | null>(null);
  const [deleting, setDeleting] = useState<Objective | null>(null);

  const objectives = useQuery({
    queryKey: ['teaching-plan', 'objectives', school.schoolId, outcome.id, showInactive],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/outcomes/{id}/objectives', {
          params: {
            ...header,
            path: { id: outcome.id },
            query: { includeInactive: showInactive ? 'true' : 'false' },
          },
        }),
      ),
  });
  const list = (objectives.data?.objectives ?? []) as Objective[];

  const setActive = useMutation({
    mutationFn: async (o: Objective) =>
      unwrap(
        await api.PUT('/v1/objectives/{id}', {
          params: { ...header, path: { id: o.id } },
          body: { code: o.code, description: o.description, active: !o.active },
        }),
      ),
    onSuccess: (_r, o) => {
      toast.success(o.active ? t('deactivated') : t('activated'));
      invalidate();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const move = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: -1 | 1 }) => {
      // Hanya TP aktif yang diurutkan; yang nonaktif tidak ikut digeser.
      const active = list.filter((o) => o.active);
      for (const u of reorderObjectives(active, id, delta)) {
        const o = list.find((x) => x.id === u.id);
        if (!o) continue;
        unwrap(
          await api.PUT('/v1/objectives/{id}', {
            params: { ...header, path: { id: o.id } },
            body: { description: o.description, sortOrder: u.sortOrder },
          }),
        );
      }
    },
    onSettled: () => invalidate(),
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (o: Objective) =>
      unwrap(await api.DELETE('/v1/objectives/{id}', { params: { ...header, path: { id: o.id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      invalidate();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (objectives.isPending) return <ListSkeleton rows={1} stats={0} />;
  if (objectives.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(objectives.error))}</AlertDescription>
      </Alert>
    );
  }

  const activeList = list.filter((o) => o.active);
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t('objectives')} ({t('objectiveCount', { count: activeList.length })})
      </p>
      {list.length === 0 && <p className="text-muted-foreground text-sm">{t('noObjectives')}</p>}
      <ol className="grid gap-2">
        {list.map((o) => {
          const ai = activeList.findIndex((x) => x.id === o.id);
          const actions: MenuAction[] = canWrite
            ? [
                ...(o.active ? [{ label: t('edit'), icon: Pencil, onSelect: () => setEditing(o) }] : []),
                {
                  label: o.active ? t('deactivate') : t('activate'),
                  icon: o.active ? EyeOff : Eye,
                  onSelect: () => setActive.mutate(o),
                  disabled: !o.active && !outcome.active,
                },
                {
                  label: t('delete'),
                  icon: Trash2,
                  destructive: true,
                  separated: true,
                  onSelect: () => setDeleting(o),
                },
              ]
            : [];
          return (
            <li
              key={o.id}
              className={cn(
                'bg-muted/40 flex flex-wrap items-start gap-2 rounded-xl border px-3 py-2 sm:flex-nowrap',
                !o.active && 'opacity-70',
              )}
            >
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {o.code && (
                    <ToneBadge tone="slate" dot={false}>
                      {o.code}
                    </ToneBadge>
                  )}
                  <VersionBadges row={o} />
                </div>
                <p className="mt-1 text-sm whitespace-pre-line">{o.description}</p>
              </div>
              {canWrite && o.active && (
                <div className="flex shrink-0 items-center max-sm:ml-auto">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('moveUp')}
                    title={t('moveUp')}
                    disabled={ai <= 0 || move.isPending}
                    onClick={() => move.mutate({ id: o.id, delta: -1 })}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('moveDown')}
                    title={t('moveDown')}
                    disabled={ai < 0 || ai >= activeList.length - 1 || move.isPending}
                    onClick={() => move.mutate({ id: o.id, delta: 1 })}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              )}
              <RowMenu label={t('rowActions')} actions={actions} />
            </li>
          );
        })}
      </ol>
      {editing && (
        <ObjectiveForm
          key={editing.id}
          outcomeId={outcome.id}
          objective={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDelete
        name={deleting ? (deleting.code ?? t('objectiveShort')) : null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting);
          } catch {
            // Galat tampil sebagai toast.
          }
        }}
      />
    </div>
  );
}

function OutcomeForm({
  subjectId,
  outcome,
  onClose,
}: {
  subjectId: string;
  outcome: Outcome | null;
  onClose: () => void;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const invalidate = useInvalidatePlan();
  const [phase, setPhase] = useState<Phase>(outcome?.phase ?? 'E');
  const [code, setCode] = useState(outcome?.code ?? '');
  const [description, setDescription] = useState(outcome?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = { phase, code: code.trim() === '' ? null : code.trim(), description: description.trim() };
      if (outcome) {
        return unwrap(
          await api.PUT('/v1/outcomes/{id}', {
            params: { ...header, path: { id: outcome.id } },
            body,
          }),
        );
      }
      return unwrap(
        await api.POST('/v1/subjects/{subjectId}/outcomes', {
          params: { ...header, path: { subjectId } },
          body,
        }),
      );
    },
    onSuccess: (res) => {
      const versioned = 'versioned' in res && res.versioned;
      toast.success(versioned ? t('outcomeVersioned', { version: res.version }) : t('outcomeSaved'));
      invalidate();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={outcome ? t('editOutcome') : t('addOutcome')}
      description={outcome ? t('editWarning') : undefined}
      submitLabel={save.isPending ? t('saving') : t('save')}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="tp-co-phase">{t('phase')}</Label>
          <SelectField
            id="tp-co-phase"
            className={TOUCH_SELECT}
            value={phase}
            onChange={(e) => setPhase(e.target.value as Phase)}
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {t('phaseLabel', { phase: p })}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="tp-co-code">{t('code')}</Label>
          <Input
            id="tp-co-code"
            value={code}
            maxLength={40}
            placeholder={t('codeHint')}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tp-co-desc">{t('outcomeDescription')}</Label>
        <Textarea
          id="tp-co-desc"
          required
          rows={6}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}

function ObjectiveForm({
  outcomeId,
  objective,
  onClose,
}: {
  outcomeId: string;
  objective: Objective | null;
  onClose: () => void;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const invalidate = useInvalidatePlan();
  const [code, setCode] = useState(objective?.code ?? '');
  const [description, setDescription] = useState(objective?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = { code: code.trim() === '' ? null : code.trim(), description: description.trim() };
      if (objective) {
        return unwrap(
          await api.PUT('/v1/objectives/{id}', {
            params: { ...header, path: { id: objective.id } },
            body,
          }),
        );
      }
      return unwrap(
        await api.POST('/v1/outcomes/{id}/objectives', {
          params: { ...header, path: { id: outcomeId } },
          body,
        }),
      );
    },
    onSuccess: (res) => {
      const versioned = 'versioned' in res && res.versioned;
      toast.success(versioned ? t('objectiveVersioned', { version: res.version }) : t('objectiveSaved'));
      invalidate();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={objective ? t('editObjective') : t('addObjective')}
      description={objective ? t('editWarning') : undefined}
      submitLabel={save.isPending ? t('saving') : t('save')}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="grid gap-2 sm:max-w-48">
        <Label htmlFor="tp-obj-code">{t('code')}</Label>
        <Input
          id="tp-obj-code"
          value={code}
          maxLength={40}
          placeholder={t('codeHint')}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tp-obj-desc">{t('objectiveDescription')}</Label>
        <Textarea
          id="tp-obj-desc"
          required
          rows={4}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
