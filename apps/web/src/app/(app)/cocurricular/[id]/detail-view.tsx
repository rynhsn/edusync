'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  Link2,
  ListChecks,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { ListSkeleton } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import {
  type FacilitatorDraft,
  facilitatorsBody,
  facilitatorsValid,
  type ProgramDraft,
  programBody,
  programValid,
  refLabel,
  sameDrafts,
  sameIds,
  toggleId,
} from '@/lib/cocurricular';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { ProgramFields } from '../program-form';
import { STATUS_TONE } from '../programs-view';
import { SaveBar } from '../settings/settings-view';
import { AssessmentTab, EvidenceTab } from './assessment-tab';

type Header = { header: { 'x-school-id': string } };

const fetchProgram = async (header: Header, id: string) =>
  unwrap(await api.GET('/v1/cocurricular/programs/{id}', { params: { ...header, path: { id } } }));
type Program = Awaited<ReturnType<typeof fetchProgram>>;

const TABS = ['summary', 'classes', 'targets', 'assessment', 'evidence'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICONS = {
  summary: ListChecks,
  classes: Users,
  targets: Target,
  assessment: ClipboardCheck,
  evidence: Link2,
} as const;
const TAB_LABEL = {
  summary: 'tabSummary',
  classes: 'tabClasses',
  targets: 'tabTargets',
  assessment: 'tabAssessment',
  evidence: 'tabEvidence',
} as const;

/** Menyimpan hasil PUT (detail terbaru) ke cache dan menyegarkan daftar serta peringatan JP. */
function useProgramCache(schoolId: string, id: string) {
  const queryClient = useQueryClient();
  return async (detail: Program) => {
    queryClient.setQueryData(['cocurricular-program', schoolId, id], detail);
    await queryClient.invalidateQueries({ queryKey: ['cocurricular-programs', schoolId] });
    await queryClient.invalidateQueries({ queryKey: ['cocurricular-periods', schoolId] });
  };
}

function SummaryTab({ program, semesterName }: { program: Program; semesterName: string | null }) {
  const t = useTranslations('cocurricular');
  const rows: [string, string][] = [
    [t('fForm'), t(`progForm.${program.form}`)],
    [t('fSemester'), program.semesterId === null ? t('wholeYear') : (semesterName ?? '-')],
    [t('fTheme'), program.theme ?? t('notSet')],
    [
      t('fPeriods'),
      program.plannedPeriods === null ? t('notSet') : t('periodsValue', { count: program.plannedPeriods }),
    ],
    [t('fStatus'), t(`progStatus.${program.status}`)],
    [t('fShowInReport'), program.showInReport ? t('yes') : t('no')],
  ];
  return (
    <section className="bg-card grid gap-4 rounded-2xl border p-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{k}</dt>
            <dd className="text-sm font-medium break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{t('fDescription')}</p>
        <p className="text-sm break-words whitespace-pre-line">{program.description ?? t('notSet')}</p>
      </div>
    </section>
  );
}

function ClassesSection({
  program,
  canManage,
  header,
  schoolId,
}: {
  program: Program;
  canManage: boolean;
  header: Header;
  schoolId: string;
}) {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const { can } = useSchool();
  const cache = useProgramCache(schoolId, program.id);
  const editable = canManage && can('class:read');
  const server = program.classes.map((c) => c.classId);
  const [draft, setDraft] = useState<string[] | null>(null);
  const current = draft ?? server;
  const dirty = draft !== null && !sameIds(draft, server);

  const yearClasses = useQuery({
    queryKey: ['classes', schoolId, program.academicYearId],
    enabled: editable,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', {
          params: { ...header, query: { academicYearId: program.academicYearId } },
        }),
      ),
  });
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/cocurricular/programs/{id}/classes', {
          params: { ...header, path: { id: program.id } },
          body: { classIds: current },
        }),
      ),
    onSuccess: async (d) => {
      toast.success(t('savedChanges'));
      await cache(d);
      setDraft(null);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <section aria-labelledby="co-cls-title" className="grid gap-3">
      <div>
        <h2 id="co-cls-title" className="font-heading text-lg font-semibold">
          {t('classesTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('classesIntro')}</p>
      </div>
      {!editable ? (
        program.classes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('classesNone')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {program.classes.map((c) => (
              <li key={c.classId}>
                <ToneBadge tone="sky" dot={false}>
                  {t('classOption', { name: c.name, level: c.level })}
                </ToneBadge>
              </li>
            ))}
          </ul>
        )
      ) : yearClasses.isPending ? (
        <ListSkeleton rows={2} stats={0} />
      ) : (yearClasses.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('classesEmpty')}</p>
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(yearClasses.data ?? []).map((c) => (
              <li
                key={c.id}
                className="bg-card flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"
              >
                <Checkbox
                  id={`cls-${c.id}`}
                  checked={current.includes(c.id)}
                  onCheckedChange={() => setDraft(toggleId(current, c.id))}
                />
                <Label htmlFor={`cls-${c.id}`} className="min-h-11 flex-1 break-words">
                  {t('classOption', { name: c.name, level: c.level })}
                </Label>
              </li>
            ))}
          </ul>
          <SaveBar
            dirty={dirty}
            valid
            pending={save.isPending}
            onSave={() => save.mutate()}
            onDiscard={() => setDraft(null)}
          />
        </>
      )}
    </section>
  );
}

const toDraft = (program: Program): FacilitatorDraft[] =>
  program.facilitators.map((f, i) => ({
    key: `f${i}-${f.teacherId}-${f.classId ?? ''}`,
    teacherId: f.teacherId,
    classId: f.classId ?? '',
    role: f.role,
  }));

function FacilitatorsSection({
  program,
  canManage,
  header,
  schoolId,
}: {
  program: Program;
  canManage: boolean;
  header: Header;
  schoolId: string;
}) {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const { can } = useSchool();
  const cache = useProgramCache(schoolId, program.id);
  const editable = canManage && can('teacher:read');
  const server = toDraft(program);
  const [draft, setDraft] = useState<FacilitatorDraft[] | null>(null);
  const current = draft ?? server;
  const dirty = draft !== null && !sameDrafts(draft, server);
  const programClassIds = new Set(program.classes.map((c) => c.classId));
  const valid = facilitatorsValid(current, programClassIds);

  const teachers = useQuery({
    queryKey: ['teachers', schoolId, 'cocurricular'],
    enabled: editable,
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: { ...header, query: {} } })),
  });
  // Guru yang sudah tercatat tetap muncul di pilihan walau tidak ada di daftar (mis. nonaktif).
  const teacherOptions = new Map<string, string>(
    program.facilitators.map((f) => [f.teacherId, f.teacherName]),
  );
  for (const x of teachers.data ?? []) teacherOptions.set(x.id, x.name);
  const teacherName = (id: string) => teacherOptions.get(id) ?? '-';
  const className = (id: string) => program.classes.find((c) => c.classId === id)?.name ?? '-';

  const patch = (key: string, over: Partial<FacilitatorDraft>) =>
    setDraft(current.map((f) => (f.key === key ? { ...f, ...over } : f)));
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/cocurricular/programs/{id}/facilitators', {
          params: { ...header, path: { id: program.id } },
          body: { facilitators: facilitatorsBody(current) },
        }),
      ),
    onSuccess: async (d) => {
      toast.success(t('savedChanges'));
      await cache(d);
      setDraft(null);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <section aria-labelledby="co-fac-title" className="grid gap-3">
      <div>
        <h2 id="co-fac-title" className="font-heading text-lg font-semibold">
          {t('facTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('facIntro')}</p>
      </div>

      {!editable ? (
        program.facilitators.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('facEmpty')}</p>
        ) : (
          <ul className="grid gap-2">
            {program.facilitators.map((f) => (
              <li
                key={`${f.teacherId}-${f.classId ?? ''}`}
                className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
              >
                <span className="min-w-0 font-medium break-words">{f.teacherName}</span>
                <ToneBadge tone={f.role === 'coordinator' ? 'violet' : 'sky'} dot={false}>
                  {f.role === 'coordinator' ? t('roleCoordinator') : t('roleFacilitator')}
                </ToneBadge>
                <span className="text-muted-foreground text-xs">
                  {f.classId === null ? t('allClasses') : className(f.classId)}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {program.classes.length === 0 && (
            <p className="text-muted-foreground text-xs">{t('facNeedClasses')}</p>
          )}
          {current.length === 0 && <p className="text-muted-foreground text-sm">{t('facEmpty')}</p>}
          <ul className="grid gap-2">
            {current.map((f) => (
              <li
                key={f.key}
                className="bg-card grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)_auto] md:items-end"
              >
                <FormField label={t('facTeacher')} htmlFor={`ft-${f.key}`}>
                  <SelectField
                    id={`ft-${f.key}`}
                    value={f.teacherId}
                    placeholder={t('pickTeacher')}
                    onChange={(e) => patch(f.key, { teacherId: e.target.value })}
                  >
                    {[...teacherOptions.entries()].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </SelectField>
                </FormField>
                <FormField label={t('facRole')} htmlFor={`fr-${f.key}`}>
                  <SelectField
                    id={`fr-${f.key}`}
                    value={f.role}
                    onChange={(e) => {
                      const role = e.target.value as FacilitatorDraft['role'];
                      patch(f.key, { role, classId: role === 'coordinator' ? '' : f.classId });
                    }}
                  >
                    <option value="coordinator">{t('roleCoordinator')}</option>
                    <option value="facilitator">{t('roleFacilitator')}</option>
                  </SelectField>
                </FormField>
                <FormField label={t('facClass')} htmlFor={`fc-${f.key}`}>
                  {f.role === 'coordinator' ? (
                    <p className="text-muted-foreground flex min-h-11 items-center text-sm md:min-h-8">
                      {t('allClasses')}
                    </p>
                  ) : (
                    <SelectField
                      id={`fc-${f.key}`}
                      value={f.classId}
                      placeholder={t('pickClass')}
                      onChange={(e) => patch(f.key, { classId: e.target.value })}
                    >
                      {program.classes.map((c) => (
                        <option key={c.classId} value={c.classId}>
                          {c.name}
                        </option>
                      ))}
                    </SelectField>
                  )}
                </FormField>
                <Button
                  variant="ghost"
                  size="icon"
                  className="max-md:h-11 max-md:w-full"
                  aria-label={t('removeFacilitator', { name: teacherName(f.teacherId) })}
                  onClick={() => setDraft(current.filter((x) => x.key !== f.key))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button
              variant="outline"
              className="h-11 max-sm:w-full md:h-8"
              onClick={() =>
                setDraft([
                  ...current,
                  {
                    key: `new-${Date.now().toString(36)}-${current.length}`,
                    teacherId: '',
                    classId: '',
                    role: program.classes.length === 0 ? 'coordinator' : 'facilitator',
                  },
                ])
              }
            >
              <Plus className="size-4" aria-hidden /> {t('addFacilitator')}
            </Button>
          </div>
          {dirty && !valid && <p className="text-destructive text-xs">{t('facInvalid')}</p>}
          <SaveBar
            dirty={dirty}
            valid={valid}
            pending={save.isPending}
            onSave={() => save.mutate()}
            onDiscard={() => setDraft(null)}
          />
        </>
      )}
    </section>
  );
}

function TargetsTab({
  program,
  canManage,
  header,
  schoolId,
}: {
  program: Program;
  canManage: boolean;
  header: Header;
  schoolId: string;
}) {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const locale = useLocale();
  const cache = useProgramCache(schoolId, program.id);
  const server = program.targets.map((x) => x.profileItemId);
  const [draft, setDraft] = useState<string[] | null>(null);
  const current = draft ?? server;
  const dirty = draft !== null && !sameIds(draft, server);

  const items = useQuery({
    queryKey: ['cocurricular-items', schoolId],
    enabled: canManage,
    queryFn: async () => unwrap(await api.GET('/v1/cocurricular/profile-items', { params: header })),
  });
  const frameworks = useQuery({
    queryKey: ['cocurricular-frameworks', schoolId],
    enabled: canManage,
    queryFn: async () => unwrap(await api.GET('/v1/reference/profile-frameworks', { params: header })),
  });
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/cocurricular/programs/{id}/targets', {
          params: { ...header, path: { id: program.id } },
          body: { profileItemIds: current },
        }),
      ),
    onSuccess: async (d) => {
      toast.success(t('savedChanges'));
      await cache(d);
      setDraft(null);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const frameworkTitle = (key: string) => {
    const f = frameworks.data?.frameworks.find((x) => x.key === key);
    return f ? refLabel(f, locale) : key;
  };
  // Butir aktif, ditambah butir yang sudah menjadi sasaran walau kini nonaktif (boleh tetap, tidak boleh dipilih baru).
  const selectable = (items.data?.items ?? []).filter((i) => i.active || server.includes(i.id));
  const groups = new Map<string, typeof selectable>();
  for (const i of selectable) groups.set(i.frameworkKey, [...(groups.get(i.frameworkKey) ?? []), i]);

  const readOnly = !canManage;
  const readGroups = new Map<string, Program['targets']>();
  for (const x of program.targets)
    readGroups.set(x.frameworkKey, [...(readGroups.get(x.frameworkKey) ?? []), x]);

  return (
    <section aria-labelledby="co-tgt-title" className="grid gap-3">
      <div>
        <h2 id="co-tgt-title" className="font-heading text-lg font-semibold">
          {t('targetsTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('targetsIntro')}</p>
      </div>
      {readOnly ? (
        program.targets.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('targetsNone')}</p>
        ) : (
          [...readGroups.entries()].map(([key, rows]) => (
            <div key={key} className="bg-card grid gap-2 rounded-2xl border p-4">
              <h3 className="font-heading text-sm font-semibold">{key}</h3>
              <ul className="flex flex-wrap gap-2">
                {rows.map((x) => (
                  <li key={x.profileItemId}>
                    <ToneBadge tone="violet" dot={false}>
                      {x.label}
                    </ToneBadge>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )
      ) : items.isPending ? (
        <ListSkeleton rows={3} stats={0} />
      ) : groups.size === 0 ? (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-sm">{t('targetsEmpty')}</p>
          <div>
            <Button
              variant="outline"
              className="h-11 max-sm:w-full md:h-8"
              nativeButton={false}
              render={<Link href="/cocurricular/settings" />}
            >
              <Sparkles className="size-4" aria-hidden /> {t('targetsLink')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {[...groups.entries()].map(([key, rows]) => (
            <div key={key} className="bg-card grid gap-2 rounded-2xl border p-4">
              <h3 className="font-heading text-sm font-semibold">{frameworkTitle(key)}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {rows.map((i) => (
                  <li key={i.id} className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm">
                    <Checkbox
                      id={`tg-${i.id}`}
                      checked={current.includes(i.id)}
                      onCheckedChange={() => setDraft(toggleId(current, i.id))}
                    />
                    <Label htmlFor={`tg-${i.id}`} className="min-h-11 flex-1 break-words">
                      {i.label}
                    </Label>
                    {!i.active && (
                      <ToneBadge tone="amber" dot={false}>
                        {t('inactiveItem')}
                      </ToneBadge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <SaveBar
            dirty={dirty}
            valid
            pending={save.isPending}
            onSave={() => save.mutate()}
            onDiscard={() => setDraft(null)}
          />
        </>
      )}
    </section>
  );
}

const draftOf = (p: Program): ProgramDraft => ({
  semesterId: p.semesterId ?? '',
  form: p.form,
  title: p.title,
  theme: p.theme ?? '',
  description: p.description ?? '',
  plannedPeriods: p.plannedPeriods === null ? '' : String(p.plannedPeriods),
  showInReport: p.showInReport,
  status: p.status,
});

/** Detail dan kelola satu program kokurikuler: ringkasan, rombel dan fasilitator, butir sasaran (4.2), penilaian dan bukti (4.3). */
export function CocurricularProgramDetailView({ id }: { id: string }) {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const canManage = can('cocurricular:manage');
  const [tab, setTab] = useState<Tab>('summary');
  const [editing, setEditing] = useState<ProgramDraft | null>(null);

  const program = useQuery({
    queryKey: ['cocurricular-program', school.schoolId, id],
    enabled: can('cocurricular:read'),
    queryFn: () => fetchProgram(header, id),
  });
  const cache = useProgramCache(school.schoolId, id);
  const p = program.data;
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, p?.academicYearId],
    enabled: !!p && can('academic_year:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/semesters', {
          params: { ...header, query: { academicYearId: p?.academicYearId as string } },
        }),
      ),
  });

  const update = useMutation({
    mutationFn: async (d: ProgramDraft) =>
      unwrap(
        await api.PUT('/v1/cocurricular/programs/{id}', {
          params: { ...header, path: { id } },
          body: programBody(d),
        }),
      ),
    onSuccess: async (d) => {
      toast.success(t('programUpdated'));
      await cache(d);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/cocurricular/programs/{id}', { params: { ...header, path: { id } } })),
    onSuccess: async () => {
      toast.success(t('programDeleted'));
      queryClient.removeQueries({ queryKey: ['cocurricular-program', school.schoolId, id] });
      await queryClient.invalidateQueries({ queryKey: ['cocurricular-programs', school.schoolId] });
      await queryClient.invalidateQueries({ queryKey: ['cocurricular-periods', school.schoolId] });
      router.push('/cocurricular');
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const back = <BackLink href="/cocurricular" label={t('backToList')} />;
  if (program.isPending) {
    return (
      <PageBody>
        <ListSkeleton rows={3} stats={0} />
      </PageBody>
    );
  }
  if (!p) {
    return (
      <PageBody>
        <PageHeader title={t('programsTitle')} actions={back} />
        <Alert variant="destructive">
          <AlertDescription>{program.error ? te(errorKey(program.error)) : t('notFound')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  const semesterName = semesters.data?.find((s) => s.id === p.semesterId)?.name ?? null;

  return (
    <PageBody>
      <PageHeader
        icon={Sparkles}
        tone={MODULE_TONE.academic}
        title={p.title}
        description={p.theme ?? undefined}
        actions={
          <>
            <ToneBadge tone={STATUS_TONE[p.status]}>{t(`progStatus.${p.status}`)}</ToneBadge>
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setEditing(draftOf(p))}>
                  <Pencil className="size-4" aria-hidden /> {t('editProgram')}
                </Button>
                <ConfirmDialog
                  destructive
                  title={t('deleteTitle', { title: p.title })}
                  description={t('deleteBody')}
                  confirmLabel={t('deleteConfirm')}
                  pending={remove.isPending}
                  onConfirm={() => remove.mutateAsync()}
                  trigger={
                    <Button variant="outline">
                      <Trash2 className="size-4" aria-hidden /> {t('deleteProgram')}
                    </Button>
                  }
                />
              </>
            )}
            {back}
          </>
        }
      />

      <div
        role="tablist"
        aria-label={t('programsTitle')}
        className="bg-muted grid w-full grid-cols-3 gap-0.5 rounded-xl p-0.5 lg:flex lg:w-fit"
      >
        {TABS.map((k) => {
          const Icon = TAB_ICONS[k];
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'focus-visible:ring-ring/60 inline-flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[10px] px-2 py-1.5 text-center text-xs font-medium outline-none transition-colors focus-visible:ring-2 sm:flex-row sm:gap-1.5 sm:text-sm',
                tab === k
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{t(TAB_LABEL[k])}</span>
            </button>
          );
        })}
      </div>

      {tab === 'summary' && <SummaryTab program={p} semesterName={semesterName} />}
      {tab === 'classes' && (
        <div className="grid gap-6">
          <ClassesSection program={p} canManage={canManage} header={header} schoolId={school.schoolId} />
          <FacilitatorsSection program={p} canManage={canManage} header={header} schoolId={school.schoolId} />
        </div>
      )}
      {tab === 'targets' && (
        <TargetsTab program={p} canManage={canManage} header={header} schoolId={school.schoolId} />
      )}

      {tab === 'assessment' && (
        <AssessmentTab programId={p.id} targets={p.targets} header={header} schoolId={school.schoolId} />
      )}
      {tab === 'evidence' && <EvidenceTab programId={p.id} header={header} schoolId={school.schoolId} />}

      {canManage && (
        <FormDialog
          size="wide"
          open={!!editing}
          title={t('editTitle')}
          submitLabel={t('save')}
          disabled={!editing || !programValid(editing) || update.isPending}
          onOpenChange={(open) => !open && setEditing(null)}
          onSubmit={() => (editing ? update.mutateAsync(editing) : Promise.resolve())}
        >
          {editing && (
            <ProgramFields
              idPrefix="co-edit"
              draft={editing}
              onChange={setEditing}
              semesters={semesters.data ?? []}
            />
          )}
        </FormDialog>
      )}
    </PageBody>
  );
}
