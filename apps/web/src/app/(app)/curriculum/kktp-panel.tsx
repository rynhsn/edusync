'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Info, Pencil, Plus, ScanSearch, Target, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { TOUCH_SELECT } from '@/components/form-field-error';
import {
  ConfirmDelete,
  DataRows,
  ListSkeleton,
  type MenuAction,
  REVEAL,
  RowMenu,
} from '@/components/master-kit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { invalidateGradingConfig, syncedSemesterIdOf } from '@/lib/grading-config';
import {
  appliesTo,
  buildBody,
  type CriteriaDraft,
  type CriteriaMode,
  type CriteriaScope,
  draftKkm,
  draftsEqual,
  emptyDraft,
  emptyLevel,
  formatKkm,
  type Issue,
  MAX_RUBRIC_LEVELS,
  MODES,
  moveLevel,
  switchMode,
  toDraft,
  validateDraft,
} from '@/lib/kktp';
import { useSchoolLevels } from '@/lib/school-settings';
import { semesterLabel } from '@/lib/semester-label';
import { cn } from '@/lib/utils';

const MODE_TONE = { numeric: 'teal', interval: 'sky', descriptor: 'violet', rubric: 'amber' } as const;

interface Criteria {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  levelCode: string | null;
  programId: string | null;
  objectiveId: string | null;
  mode: CriteriaMode;
  threshold: number | null;
  note: string | null;
  active: boolean;
  effectiveThreshold: number | null;
  levels?: {
    id: string;
    label: string;
    descriptor: string | null;
    minScore: number | null;
    maxScore: number | null;
    isAchieved: boolean;
    sortOrder: number;
  }[];
}

/** Teks galat untuk pengguna; `report_final` diberi penjelasan khusus karena penyebabnya ada di rapor, bukan di isian. */
function useErrorText() {
  const te = useTranslations();
  const t = useTranslations('kktp');
  return (e: unknown) =>
    e instanceof ApiError && e.code === 'report_final' ? t('reportFinal') : te(errorKey(e));
}

/**
 * Toast sukses simpan/hapus KKTP. Bila server juga menulis-tembus ke aturan beku semester aktif (`syncedSemesterId`),
 * toast menambahkan penjelasannya.
 */
function useSyncedToast() {
  const t = useTranslations('kktp');
  return (message: string, body: unknown) => {
    if (syncedSemesterIdOf(body)) toast.success(message, { description: t('syncedToActive') });
    else toast.success(message);
  };
}

/** KKTP: kriteria ketuntasan per mapel/tingkat/jurusan, KKM efektif, dan pratinjau pemecah KKM. */
export function KktpPanel({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations('kktp');
  const errorText = useErrorText();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const levels = useSchoolLevels();
  const levelList = levels.data ?? [];
  const programs = useQuery({
    queryKey: ['programs', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/programs', { params: header })),
  });
  const programList = programs.data ?? [];
  const subjects = useQuery({
    queryKey: ['subjects', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  const subjectList = [...(subjects.data ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
  );

  const listKey = ['kktp', school.schoolId];
  const criteria = useQuery({
    queryKey: listKey,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/achievement-criteria', {
          params: { ...header, query: { includeRubric: 'true' } },
        }),
      ),
  });

  const [subjectFilter, setSubjectFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [dialog, setDialog] = useState<{ row: Criteria | null } | null>(null);
  const [deleting, setDeleting] = useState<Criteria | null>(null);

  const all = (criteria.data?.criteria ?? []) as Criteria[];
  const rows = all.filter(
    (r) =>
      (subjectFilter === '' || r.subjectId === subjectFilter) &&
      appliesTo(r, { levelCode: levelFilter, programId: programFilter }),
  );

  const levelLabel = (code: string | null) =>
    code === null ? t('allLevels') : (levelList.find((l) => l.code === code)?.label ?? code);
  const programName = (id: string | null) =>
    id === null ? t('allPrograms') : (programList.find((p) => p.id === id)?.name ?? '-');

  // KKM efektif memengaruhi rekap nilai, portal, dan rapor; perubahan juga bisa tertulis ke aturan beku semester aktif.
  const refresh = () => invalidateGradingConfig(queryClient, school.schoolId);
  const toastWithSync = useSyncedToast();

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/achievement-criteria/{id}', { params: { ...header, path: { id } } })),
    onSuccess: (removed) => {
      toastWithSync(t('deleted'), removed);
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const menu = (r: Criteria): MenuAction[] =>
    canWrite
      ? [
          { label: t('edit'), icon: Pencil, onSelect: () => setDialog({ row: r }) },
          {
            label: t('delete'),
            icon: Trash2,
            destructive: true,
            separated: true,
            onSelect: () => setDeleting(r),
          },
        ]
      : [];

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="kktp-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="kktp-title" className="font-heading text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('help')}</p>
        </div>
        {canWrite && (
          <Button onClick={() => setDialog({ row: null })}>
            <Plus className="size-4" aria-hidden /> {t('add')}
          </Button>
        )}
      </div>

      <Alert>
        <Info className="size-4" aria-hidden />
        <AlertTitle>{t('fallbackTitle')}</AlertTitle>
        <AlertDescription>
          <p>{t('fallbackBody')}</p>
          <p className="mt-1">{t('finalWarning')}</p>
          <p className="mt-1">{t('frozenWriteNote')}</p>
          <p className="mt-1">
            <Link href="/grades/settings" className="underline underline-offset-2">
              {t('schoolKkmLink')}
            </Link>
          </p>
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-f-subject">{t('subject')}</Label>
          <SelectField
            id="kktp-f-subject"
            className={TOUCH_SELECT}
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="">{t('allSubjects')}</option>
            {subjectList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-f-level">{t('appliesToLevel')}</Label>
          <SelectField
            id="kktp-f-level"
            className={TOUCH_SELECT}
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="">{t('anyLevel')}</option>
            {levelList.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-f-program">{t('appliesToProgram')}</Label>
          <SelectField
            id="kktp-f-program"
            className={TOUCH_SELECT}
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
          >
            <option value="">{t('anyProgram')}</option>
            {programList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {criteria.isPending && <ListSkeleton rows={3} stats={0} />}
      {criteria.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorText(criteria.error)}</AlertDescription>
        </Alert>
      )}
      {criteria.data && all.length === 0 && (
        <EmptyPanel
          icon={Target}
          tone={MODULE_TONE.master}
          title={t('empty')}
          body={canWrite ? t('emptyBody') : t('emptyReadOnly')}
        />
      )}
      {criteria.data && all.length > 0 && rows.length === 0 && (
        <EmptyPanel icon={Target} tone="slate" title={t('noMatch')} body={t('noMatchBody')} />
      )}
      {rows.length > 0 && (
        <DataRows
          cardsBelow="lg"
          rows={rows}
          rowKey={(r) => r.id}
          actionsHeader={t('rowActions')}
          actions={canWrite ? (r) => <RowMenu label={t('rowActions')} actions={menu(r)} /> : undefined}
          columns={[
            {
              key: 'subject',
              header: t('subject'),
              cell: (r) => (
                <div className="min-w-0">
                  <span className="font-medium">{r.subjectName}</span>
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {r.objectiveId && <ToneBadge tone="slate">{t('badgeObjective')}</ToneBadge>}
                    {!r.active && <ToneBadge tone="amber">{t('badgeInactive')}</ToneBadge>}
                  </span>
                </div>
              ),
            },
            {
              key: 'scope',
              header: t('scope'),
              cell: (r) => (
                <span className="text-sm">
                  {levelLabel(r.levelCode)} · {programName(r.programId)}
                </span>
              ),
            },
            {
              key: 'mode',
              header: t('mode'),
              cell: (r) => (
                <div className="grid gap-0.5">
                  <ToneBadge tone={MODE_TONE[r.mode]} dot={false} className="w-fit">
                    {t(`mode_${r.mode}`)}
                  </ToneBadge>
                  {r.mode !== 'numeric' && (r.levels?.length ?? 0) > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {t('levelCount', { count: r.levels?.length ?? 0 })}
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'kkm',
              header: t('effectiveKkm'),
              className: 'tabular-nums',
              cell: (r) =>
                r.effectiveThreshold === null ? (
                  <span className="text-muted-foreground text-sm">{t('noThreshold')}</span>
                ) : (
                  <span className="font-semibold tabular-nums">{formatKkm(r.effectiveThreshold)}</span>
                ),
            },
          ]}
        />
      )}

      <PreviewCard subjects={subjectList} levels={levelList} programs={programList} />

      {dialog && (
        <CriteriaForm
          key={dialog.row?.id ?? 'new'}
          row={dialog.row}
          all={all}
          subjects={subjectList}
          levels={levelList}
          programs={programList}
          defaultSubjectId={subjectFilter}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      <ConfirmDelete
        name={deleting ? `${deleting.subjectName} · ${levelLabel(deleting.levelCode)}` : null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
          } catch {
            // Galat tampil sebagai toast.
          }
        }}
      />
    </section>
  );
}

/** Pratinjau KKM: KKM efektif dan sumbernya untuk kombinasi mapel, tingkat, dan jurusan. */
function PreviewCard({
  subjects,
  levels,
  programs,
}: {
  subjects: { id: string; name: string }[];
  levels: { code: string; label: string }[];
  programs: { id: string; name: string }[];
}) {
  const t = useTranslations('kktp');
  const errorText = useErrorText();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [subjectChoice, setSubjectChoice] = useState('');
  const [levelCode, setLevelCode] = useState('');
  const [programId, setProgramId] = useState('');
  const subjectId = subjects.some((s) => s.id === subjectChoice) ? subjectChoice : (subjects[0]?.id ?? '');

  // Semester untuk pratinjau: bawaannya semester aktif; "aturan hari ini" (kosong) mengabaikan salinan beku.
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const semesterList = semesters.data ?? [];
  const [semesterChoice, setSemesterChoice] = useState<string | null>(null);
  const semesterId =
    semesterChoice !== null && (semesterChoice === '' || semesterList.some((s) => s.id === semesterChoice))
      ? semesterChoice
      : (semesterList.find((s) => s.isActive)?.id ?? '');
  const semesterName = semesterList.find((s) => s.id === semesterId);

  const resolved = useQuery({
    queryKey: ['kktp', 'resolve', school.schoolId, subjectId, levelCode, programId, semesterId],
    enabled: subjectId !== '' && !semesters.isPending,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/achievement-criteria/resolve', {
          params: {
            ...header,
            query: {
              subjectId,
              ...(levelCode ? { levelCode } : {}),
              ...(programId ? { programId } : {}),
              ...(semesterId ? { semesterId } : {}),
            },
          },
        }),
      ),
  });
  const r = resolved.data;

  return (
    <section className="bg-card grid gap-4 rounded-2xl border p-4" aria-labelledby="kktp-preview-title">
      <div className="flex items-start gap-3">
        <ScanSearch className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <h3 id="kktp-preview-title" className="font-heading text-base font-semibold">
            {t('previewTitle')}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">{t('previewHelp')}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-p-semester">{t('previewSemester')}</Label>
          <SelectField
            id="kktp-p-semester"
            className={TOUCH_SELECT}
            value={semesterId}
            onChange={(e) => setSemesterChoice(e.target.value)}
          >
            <option value="">{t('previewSemesterLive')}</option>
            {semesterList.map((s) => (
              <option key={s.id} value={s.id}>
                {semesterLabel(s)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-p-subject">{t('subject')}</Label>
          <SelectField
            id="kktp-p-subject"
            className={TOUCH_SELECT}
            value={subjectId}
            onChange={(e) => setSubjectChoice(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-p-level">{t('level')}</Label>
          <SelectField
            id="kktp-p-level"
            className={TOUCH_SELECT}
            value={levelCode}
            onChange={(e) => setLevelCode(e.target.value)}
          >
            <option value="">{t('noLevelChosen')}</option>
            {levels.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-p-program">{t('program')}</Label>
          <SelectField
            id="kktp-p-program"
            className={TOUCH_SELECT}
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
          >
            <option value="">{t('noProgramChosen')}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      <div aria-live="polite">
        {subjects.length === 0 && <p className="text-muted-foreground text-sm">{t('previewNoSubjects')}</p>}
        {resolved.isPending && subjectId !== '' && <ListSkeleton rows={1} stats={0} />}
        {resolved.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorText(resolved.error)}</AlertDescription>
          </Alert>
        )}
        {r && (
          <div className="bg-muted/40 flex flex-wrap items-center gap-4 rounded-xl border p-4">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase">{t('effectiveKkm')}</p>
              <p className="font-heading text-3xl leading-tight font-semibold tabular-nums">
                {formatKkm(r.kkm)}
              </p>
            </div>
            <div className="grid min-w-0 flex-1 gap-1 text-sm">
              <p className="flex flex-wrap items-center gap-1.5">
                <ToneBadge tone={r.scope === 'settings' ? 'slate' : 'emerald'} dot={false}>
                  {r.scope === 'settings' ? t('sourceSchool') : t('sourceCriteria')}
                </ToneBadge>
                {r.mode && (
                  <ToneBadge tone={MODE_TONE[r.mode]} dot={false}>
                    {t(`mode_${r.mode}`)}
                  </ToneBadge>
                )}
                <ToneBadge tone={r.frozen ? 'sky' : 'slate'} dot={false}>
                  {r.frozen && semesterName
                    ? t('previewFrozen', { semester: semesterLabel(semesterName) })
                    : t('previewLive')}
                </ToneBadge>
              </p>
              <p className="text-muted-foreground">
                {r.scope === 'settings'
                  ? t('sourceSchoolBody', { kkm: formatKkm(r.schoolKkm) })
                  : t(`scope_${r.scope}`)}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Pesan satu masalah isian; `n` adalah nomor level (mulai 1). */
function useIssueText() {
  const t = useTranslations('kktp');
  return (i: Issue) => {
    const n = (i.index ?? 0) + 1;
    switch (i.code) {
      case 'threshold_required':
        return t('issue_threshold_required');
      case 'threshold_invalid':
        return t('issue_threshold_invalid');
      case 'levels_required':
        return t('issue_levels_required');
      case 'too_many_levels':
        return t('issue_too_many_levels', { max: MAX_RUBRIC_LEVELS });
      case 'label_required':
        return t('issue_label_required', { n });
      case 'range_required':
        return t('issue_range_required', { n });
      case 'number_invalid':
        return t('issue_number_invalid', { n });
      case 'range_order':
        return t('issue_range_order', { n });
      case 'overlap':
        return t('issue_overlap', { a: n, b: (i.other ?? 0) + 1 });
    }
  };
}

const NEW_SCOPE = { subjectId: '', levelCode: '', programId: '' };

function CriteriaForm({
  row,
  all,
  subjects,
  levels,
  programs,
  defaultSubjectId,
  onClose,
  onSaved,
}: {
  row: Criteria | null;
  all: Criteria[];
  subjects: { id: string; name: string }[];
  levels: { code: string; label: string }[];
  programs: { id: string; name: string }[];
  defaultSubjectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('kktp');
  const errorText = useErrorText();
  const toastWithSync = useSyncedToast();
  const issueText = useIssueText();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };

  const [scope, setScope] = useState(
    row
      ? { subjectId: row.subjectId, levelCode: row.levelCode ?? '', programId: row.programId ?? '' }
      : { ...NEW_SCOPE, subjectId: defaultSubjectId || (subjects[0]?.id ?? '') },
  );
  const initial = row ? toDraft(row) : emptyDraft('numeric');
  const [draft, setDraft] = useState<CriteriaDraft>(initial);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issues = validateDraft(draft);
  // Tumpang tindih tampil langsung; masalah lain (kolom kosong) baru setelah mencoba menyimpan.
  const visible = issues.filter((i) => attempted || i.code === 'overlap');
  const levelIssues = (index: number) =>
    visible.filter((i) => i.index === index || (i.code === 'overlap' && i.other === index));
  const generalIssues = visible.filter((i) => i.index === undefined);
  const duplicate = all.find(
    (r) =>
      r.id !== row?.id &&
      r.objectiveId === (row?.objectiveId ?? null) &&
      r.subjectId === scope.subjectId &&
      (r.levelCode ?? '') === scope.levelCode &&
      (r.programId ?? '') === scope.programId,
  );

  const save = useMutation({
    mutationFn: async () => {
      const built = buildBody(
        {
          subjectId: scope.subjectId,
          levelCode: scope.levelCode === '' ? null : scope.levelCode,
          programId: scope.programId === '' ? null : scope.programId,
          objectiveId: row?.objectiveId ?? null,
        } satisfies CriteriaScope,
        draft,
      );
      if (!built.ok) throw new Error('invalid');
      if (row) {
        return unwrap(
          await api.PUT('/v1/achievement-criteria/{id}', {
            params: { ...header, path: { id: row.id } },
            body: built.body,
          }),
        );
      }
      return unwrap(await api.POST('/v1/achievement-criteria', { params: header, body: built.body }));
    },
    onSuccess: (saved) => {
      toastWithSync(row ? t('updated') : t('created'), saved);
      onSaved();
    },
    onError: (e) => {
      if (!(e instanceof ApiError)) return;
      setError(errorText(e));
    },
  });

  const setLevel = (index: number, patch: Partial<CriteriaDraft['levels'][number]>) =>
    setDraft((d) => ({ ...d, levels: d.levels.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
  const ranged = draft.mode === 'interval' || draft.mode === 'rubric';
  const dirty = !row || !draftsEqual(draft, initial) || row.subjectId !== scope.subjectId;

  return (
    <FormDialog
      open
      size="wide"
      onOpenChange={(o) => !o && onClose()}
      title={row ? t('edit') : t('add')}
      description={t('formHelp')}
      submitLabel={save.isPending ? t('saving') : t('save')}
      error={error}
      disabled={!dirty || scope.subjectId === ''}
      onSubmit={async () => {
        setError(null);
        if (issues.length > 0) {
          setAttempted(true);
          throw new Error('invalid');
        }
        await save.mutateAsync();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor="kktp-subject">{t('subject')}</Label>
          <SelectField
            id="kktp-subject"
            className={TOUCH_SELECT}
            value={scope.subjectId}
            onChange={(e) => setScope((s) => ({ ...s, subjectId: e.target.value }))}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-level">{t('level')}</Label>
          <SelectField
            id="kktp-level"
            className={TOUCH_SELECT}
            value={scope.levelCode}
            onChange={(e) => setScope((s) => ({ ...s, levelCode: e.target.value }))}
          >
            <option value="">{t('allLevels')}</option>
            {levels.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="kktp-program">{t('program')}</Label>
          <SelectField
            id="kktp-program"
            className={TOUCH_SELECT}
            value={scope.programId}
            onChange={(e) => setScope((s) => ({ ...s, programId: e.target.value }))}
          >
            <option value="">{t('allPrograms')}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      {duplicate && (
        <Alert>
          <AlertDescription>{t('duplicateScope')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="kktp-mode">{t('mode')}</Label>
        <SelectField
          id="kktp-mode"
          className={TOUCH_SELECT}
          value={draft.mode}
          onChange={(e) => setDraft((d) => switchMode(d, e.target.value as CriteriaMode))}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {t(`mode_${m}`)}
            </option>
          ))}
        </SelectField>
        <p className="text-muted-foreground text-xs">{t(`modeHelp_${draft.mode}`)}</p>
      </div>

      {draft.mode === 'numeric' && (
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="kktp-threshold">{t('threshold')}</Label>
          <Input
            id="kktp-threshold"
            inputMode="decimal"
            autoComplete="off"
            aria-required="true"
            aria-invalid={generalIssues.length > 0}
            placeholder={t('thresholdHint')}
            value={draft.threshold}
            onChange={(e) => setDraft((d) => ({ ...d, threshold: e.target.value }))}
          />
        </div>
      )}

      {draft.mode !== 'numeric' && (
        <section aria-labelledby="kktp-levels-title" className="grid gap-3">
          <p id="kktp-levels-title" className="text-sm font-medium">
            {t('levelsTitle')}
          </p>
          <p className="text-muted-foreground text-xs">
            {t(ranged ? 'levelsHelpRanged' : 'levelsHelpDescriptor')}
          </p>
          <ol className="grid gap-3">
            {draft.levels.map((l, i) => {
              const own = levelIssues(i);
              return (
                <li key={l.key} className="bg-muted/40 grid gap-3 rounded-xl border p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
                    <div className="grid content-start gap-1.5">
                      <Label htmlFor={`kktp-l-${l.key}-label`} className="text-xs">
                        {t('levelLabel', { n: i + 1 })}
                      </Label>
                      <Input
                        id={`kktp-l-${l.key}-label`}
                        maxLength={120}
                        autoComplete="off"
                        aria-invalid={own.some((x) => x.code === 'label_required')}
                        value={l.label}
                        onChange={(e) => setLevel(i, { label: e.target.value })}
                      />
                    </div>
                    <div className="grid content-start gap-1.5">
                      <Label htmlFor={`kktp-l-${l.key}-min`} className="text-xs">
                        {t('levelMin')}
                      </Label>
                      <Input
                        id={`kktp-l-${l.key}-min`}
                        inputMode="decimal"
                        autoComplete="off"
                        className="tabular-nums"
                        aria-invalid={own.some((x) => x.code !== 'label_required')}
                        value={l.min}
                        onChange={(e) => setLevel(i, { min: e.target.value })}
                      />
                    </div>
                    <div className="grid content-start gap-1.5">
                      <Label htmlFor={`kktp-l-${l.key}-max`} className="text-xs">
                        {t('levelMax')}
                      </Label>
                      <Input
                        id={`kktp-l-${l.key}-max`}
                        inputMode="decimal"
                        autoComplete="off"
                        className="tabular-nums"
                        aria-invalid={own.some((x) => x.code !== 'label_required')}
                        value={l.max}
                        onChange={(e) => setLevel(i, { max: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid content-start gap-1.5">
                    <Label htmlFor={`kktp-l-${l.key}-desc`} className="text-xs">
                      {t('levelDescriptor')}
                    </Label>
                    <Input
                      id={`kktp-l-${l.key}-desc`}
                      maxLength={500}
                      autoComplete="off"
                      value={l.descriptor}
                      onChange={(e) => setLevel(i, { descriptor: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`kktp-l-${l.key}-ok`}
                        checked={l.isAchieved}
                        onCheckedChange={(v) => setLevel(i, { isAchieved: v === true })}
                      />
                      <Label
                        htmlFor={`kktp-l-${l.key}-ok`}
                        className="cursor-pointer text-sm font-normal max-md:flex max-md:min-h-11 max-md:items-center"
                      >
                        {t('levelAchieved')}
                      </Label>
                    </div>
                    <div className="flex items-center">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('moveUp')}
                        title={t('moveUp')}
                        disabled={i === 0}
                        onClick={() => setDraft((d) => ({ ...d, levels: moveLevel(d.levels, i, -1) }))}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('moveDown')}
                        title={t('moveDown')}
                        disabled={i === draft.levels.length - 1}
                        onClick={() => setDraft((d) => ({ ...d, levels: moveLevel(d.levels, i, 1) }))}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('removeLevel')}
                        title={t('removeLevel')}
                        onClick={() =>
                          setDraft((d) => ({ ...d, levels: d.levels.filter((_, j) => j !== i) }))
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {own.length > 0 && (
                    <ul className="text-destructive grid gap-0.5 text-xs" role="alert">
                      {own.map((x) => (
                        <li key={`${x.code}-${x.index}-${x.other}`}>{issueText(x)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={draft.levels.length >= MAX_RUBRIC_LEVELS}
              onClick={() => setDraft((d) => ({ ...d, levels: [...d.levels, emptyLevel()] }))}
            >
              <Plus className="size-4" aria-hidden /> {t('addLevel')}
            </Button>
          </div>
          {draft.levels.length > 0 && (
            <p className="text-muted-foreground text-xs tabular-nums">
              {t('levelsPreview', { kkm: formatKkm(draftKkm(draft)) })}
            </p>
          )}
        </section>
      )}

      {generalIssues.length > 0 && (
        <ul className="text-destructive grid gap-0.5 text-sm" role="alert">
          {generalIssues.map((x) => (
            <li key={x.code}>{issueText(x)}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-2">
        <Label htmlFor="kktp-note">{t('note')}</Label>
        <Textarea
          id="kktp-note"
          rows={2}
          maxLength={500}
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="kktp-active"
          checked={draft.active}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v === true }))}
        />
        <Label
          htmlFor="kktp-active"
          className="cursor-pointer text-sm font-normal max-md:flex max-md:min-h-11 max-md:items-center"
        >
          {t('active')}
        </Label>
      </div>
    </FormDialog>
  );
}
