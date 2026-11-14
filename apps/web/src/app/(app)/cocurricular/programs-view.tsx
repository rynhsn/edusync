'use client';

import { COCURRICULAR_PROGRAM_STATUSES } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { ListSkeleton } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, MODULE_TONE, ToneBadge, Toolbar } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { EMPTY_PROGRAM, type ProgramDraft, programBody, programValid } from '@/lib/cocurricular';
import { errorKey } from '@/lib/errors';
import { ProgramFields } from './program-form';

export const STATUS_TONE = { draft: 'slate', active: 'emerald', closed: 'amber' } as const;

/** Daftar program kokurikuler per tahun ajaran (tahap 4.2). */
export function CocurricularProgramsView() {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const canRead = can('cocurricular:read');
  const canManage = can('cocurricular:manage');
  const canYears = can('academic_year:read');

  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<ProgramDraft>(EMPTY_PROGRAM);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: canRead && canYears,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const programs = useQuery({
    queryKey: ['cocurricular-programs', school.schoolId, yearId, semesterId, status],
    enabled: canRead,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/cocurricular/programs', {
          params: {
            ...header,
            query: {
              ...(yearId ? { academicYearId: yearId } : {}),
              ...(semesterId ? { semesterId } : {}),
              ...(status ? { status: status as (typeof COCURRICULAR_PROGRAM_STATUSES)[number] } : {}),
            },
          },
        }),
      ),
  });
  const effectiveYear = yearId || programs.data?.academicYearId || '';
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, effectiveYear],
    enabled: canRead && canYears && !!effectiveYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/semesters', { params: { ...header, query: { academicYearId: effectiveYear } } }),
      ),
  });
  const periods = useQuery({
    queryKey: ['cocurricular-periods', school.schoolId, effectiveYear],
    enabled: canRead && !!effectiveYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/cocurricular/periods-summary', {
          params: { ...header, query: { academicYearId: effectiveYear } },
        }),
      ),
  });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/cocurricular/programs', {
          params: header,
          body: { academicYearId: effectiveYear, ...programBody(draft) },
        }),
      ),
    onSuccess: async (r) => {
      toast.success(t('programCreated'));
      await queryClient.invalidateQueries({ queryKey: ['cocurricular-programs', school.schoolId] });
      await queryClient.invalidateQueries({ queryKey: ['cocurricular-periods', school.schoolId] });
      router.push(`/cocurricular/${r.id}`);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const openCreate = () => {
    setDraft(EMPTY_PROGRAM);
    setCreateOpen(true);
  };
  const head = (
    <PageHeader
      icon={Sparkles}
      tone={MODULE_TONE.academic}
      title={t('programsTitle')}
      description={canManage ? t('programsSubtitle') : `${t('programsSubtitle')} ${t('programsReadOnly')}`}
      actions={
        canManage && (
          <Button className="max-sm:hidden" disabled={!effectiveYear} onClick={openCreate}>
            <Plus className="size-4" aria-hidden /> {t('newProgram')}
          </Button>
        )
      }
    />
  );
  if (!canRead) {
    return (
      <PageBody>
        {head}
        <EmptyPanel icon={ShieldCheck} tone="slate" title={t('noAccess')} body={t('noAccessBody')} />
      </PageBody>
    );
  }

  const list = programs.data?.programs ?? [];
  const semesterName = (id: string | null) =>
    id === null ? t('wholeYear') : (semesters.data?.find((s) => s.id === id)?.name ?? '-');
  const warnings = (periods.data?.levels ?? []).filter((l) => l.exceeds);
  const filtered = yearId !== '' || semesterId !== '' || status !== '';

  return (
    <PageBody className={canManage ? 'max-sm:pb-20' : undefined}>
      {head}

      <Toolbar className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="co-year">{t('yearLabel')}</Label>
          <SelectField
            id="co-year"
            value={effectiveYear}
            disabled={!canYears || !years.data}
            onChange={(e) => {
              setYearId(e.target.value);
              setSemesterId('');
            }}
          >
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.isActive ? `${y.name} ${t('activeSuffix')}` : y.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="co-semester">{t('semesterFilter')}</Label>
          <SelectField
            id="co-semester"
            value={semesterId}
            disabled={!canYears || !semesters.data}
            onChange={(e) => setSemesterId(e.target.value)}
          >
            <option value="">{t('allSemesters')}</option>
            {(semesters.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="co-status">{t('statusFilter')}</Label>
          <SelectField id="co-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('allStatuses')}</option>
            {COCURRICULAR_PROGRAM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`progStatus.${s}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </Toolbar>

      {warnings.map((l) => (
        <Alert
          key={l.levelCode}
          className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription className="text-inherit">
            {t('periodsWarn', {
              level: l.levelCode,
              planned: l.plannedPeriods.toLocaleString(locale),
              allocated: (l.allocatedPeriods ?? 0).toLocaleString(locale),
            })}
          </AlertDescription>
        </Alert>
      ))}

      {programs.error && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(programs.error))}</AlertDescription>
        </Alert>
      )}
      {programs.isPending && <ListSkeleton rows={3} stats={0} />}

      {programs.data && programs.data.academicYearId === null && (
        <EmptyPanel icon={Sparkles} tone="slate" title={t('programsEmpty')} body={t('noYear')} />
      )}
      {programs.data && programs.data.academicYearId !== null && list.length === 0 && (
        <EmptyPanel
          icon={Sparkles}
          tone={MODULE_TONE.academic}
          title={filtered ? t('noMatch') : t('programsEmpty')}
          body={filtered ? undefined : canManage ? t('programsEmptyBody') : t('programsEmptyBodyRead')}
          action={
            canManage && !filtered ? (
              <Button className="max-sm:hidden" onClick={openCreate}>
                <Plus className="size-4" aria-hidden /> {t('newProgram')}
              </Button>
            ) : undefined
          }
        />
      )}

      {list.length > 0 && (
        <>
          <ul className="grid gap-3 lg:hidden">
            {list.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/cocurricular/${p.id}`}
                  aria-label={t('openProgram', { title: p.title })}
                  className="bg-card hover:bg-muted/40 focus-visible:ring-ring/60 grid min-h-11 gap-2 rounded-2xl border p-4 outline-none focus-visible:ring-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-heading font-semibold break-words">{p.title}</p>
                      {p.theme && <p className="text-muted-foreground text-sm break-words">{p.theme}</p>}
                    </div>
                    <ChevronRight aria-hidden className="text-muted-foreground mt-1 size-4 shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <ToneBadge tone={STATUS_TONE[p.status]}>{t(`progStatus.${p.status}`)}</ToneBadge>
                    <ToneBadge tone="violet" dot={false}>
                      {t(`progForm.${p.form}`)}
                    </ToneBadge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {semesterName(p.semesterId)}
                    {p.plannedPeriods !== null && ` · ${t('periodsValue', { count: p.plannedPeriods })}`}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('countClasses', { count: p.classCount })} ·{' '}
                    {t('countTargets', { count: p.targetCount })} ·{' '}
                    {t('countFacilitators', { count: p.facilitatorCount })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="bg-card hidden overflow-hidden rounded-2xl border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colProgram')}</TableHead>
                  <TableHead>{t('colForm')}</TableHead>
                  <TableHead>{t('colSemester')}</TableHead>
                  <TableHead>{t('colPeriods')}</TableHead>
                  <TableHead>{t('colContent')}</TableHead>
                  <TableHead>{t('fStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-xs whitespace-normal">
                      <Link
                        href={`/cocurricular/${p.id}`}
                        className="font-medium break-words hover:underline"
                      >
                        {p.title}
                      </Link>
                      {p.theme && <p className="text-muted-foreground text-xs break-words">{p.theme}</p>}
                    </TableCell>
                    <TableCell className="whitespace-normal">{t(`progForm.${p.form}`)}</TableCell>
                    <TableCell className="whitespace-normal">{semesterName(p.semesterId)}</TableCell>
                    <TableCell>
                      {p.plannedPeriods === null ? '-' : t('periodsValue', { count: p.plannedPeriods })}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-normal text-xs">
                      {t('countClasses', { count: p.classCount })} ·{' '}
                      {t('countTargets', { count: p.targetCount })} ·{' '}
                      {t('countFacilitators', { count: p.facilitatorCount })}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={STATUS_TONE[p.status]}>{t(`progStatus.${p.status}`)}</ToneBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {canManage && (
        <>
          <div className="bg-background/90 sticky bottom-3 z-10 rounded-2xl border p-2 shadow-lg backdrop-blur sm:hidden">
            <Button className="h-11 w-full" disabled={!effectiveYear} onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> {t('newProgram')}
            </Button>
          </div>
          <FormDialog
            size="wide"
            open={createOpen}
            title={t('createTitle')}
            description={t('createHint')}
            submitLabel={t('createSubmit')}
            disabled={!programValid(draft) || create.isPending}
            onOpenChange={setCreateOpen}
            onSubmit={() => create.mutateAsync()}
          >
            <ProgramFields
              idPrefix="co-new"
              draft={draft}
              onChange={setDraft}
              semesters={semesters.data ?? []}
            />
          </FormDialog>
        </>
      )}
    </PageBody>
  );
}
