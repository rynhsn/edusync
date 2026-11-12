'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, GitBranch, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { type Column, DataRows, ListSkeleton, REVEAL } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { FlowEditor, FlowStatusBadge } from './flow-editor';
import { FlowMetaForm } from './flow-meta-form';

/** Daftar alur tujuan pembelajaran (ATP) satu mapel per tahun ajaran; membuka editor untuk satu ATP. */
export function FlowsPanel({
  subjectId,
  subjectName,
  canWrite,
}: {
  subjectId: string;
  subjectName: string;
  canWrite: boolean;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [yearChoice, setYearChoice] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: can('academic_year:read'),
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const yearList = years.data ?? [];
  const yearId =
    yearList.find((y) => y.id === yearChoice)?.id ??
    yearList.find((y) => y.isActive)?.id ??
    yearList[0]?.id ??
    '';

  const flows = useQuery({
    queryKey: ['teaching-plan', 'flows', school.schoolId, subjectId, yearId],
    enabled: !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/learning-flows', {
          params: { ...header, query: { subjectId, academicYearId: yearId } },
        }),
      ),
  });
  const list = flows.data?.flows ?? [];

  if (openId) {
    return (
      <FlowEditor
        key={openId}
        flowId={openId}
        canWrite={canWrite}
        onBack={() => setOpenId(null)}
        onOpen={(id) => setOpenId(id)}
      />
    );
  }

  const columns: Column<(typeof list)[number]>[] = [
    {
      key: 'name',
      header: t('colName'),
      cell: (f) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{f.name}</span>
          {f.version > 1 && <ToneBadge tone="sky">{t('badgeVersion', { version: f.version })}</ToneBadge>}
          {f.supersedesId && <ToneBadge tone="violet">{t('badgeReplaces')}</ToneBadge>}
        </div>
      ),
    },
    { key: 'level', header: t('colLevel'), cell: (f) => f.levelCode ?? '-' },
    {
      key: 'phase',
      header: t('colPhase'),
      cell: (f) => (f.phase ? t('phaseLabel', { phase: f.phase }) : '-'),
    },
    { key: 'status', header: t('colStatus'), cell: (f) => <FlowStatusBadge status={f.status} /> },
    { key: 'items', header: t('colItems'), cell: (f) => t('itemsCount', { count: f.itemCount }) },
  ];

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="tp-flows-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tp-flows-title" className="font-heading text-lg font-semibold">
            {t('flowsTitle')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('flowsHelp', { subject: subjectName })}
          </p>
        </div>
        {canWrite && yearId && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> {t('newFlow')}
          </Button>
        )}
      </div>

      {years.isPending && can('academic_year:read') && <ListSkeleton rows={2} stats={0} />}
      {years.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(years.error))}</AlertDescription>
        </Alert>
      )}
      {years.data && yearList.length === 0 && (
        <EmptyPanel
          icon={CalendarDays}
          tone={MODULE_TONE.academic}
          title={t('noYears')}
          body={t('noYearsBody')}
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/academic-years" />}>
              {t('yearsLink')}
            </Button>
          }
        />
      )}

      {yearList.length > 0 && (
        <div className="grid content-start gap-2 sm:max-w-xs">
          <Label htmlFor="tp-year">{t('year')}</Label>
          <SelectField
            id="tp-year"
            className={TOUCH_SELECT}
            value={yearId}
            onChange={(e) => setYearChoice(e.target.value)}
          >
            {yearList.map((y) => (
              <option key={y.id} value={y.id}>
                {y.isActive ? `${y.name} (${t('activeSuffix')})` : y.name}
              </option>
            ))}
          </SelectField>
        </div>
      )}

      {flows.isPending && !!yearId && <ListSkeleton rows={3} stats={0} />}
      {flows.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(flows.error))}</AlertDescription>
        </Alert>
      )}
      {flows.data && list.length === 0 && (
        <EmptyPanel
          icon={GitBranch}
          tone={MODULE_TONE.academic}
          title={t('emptyFlows')}
          body={canWrite ? t('emptyFlowsBody') : t('emptyFlowsReadOnly')}
        />
      )}
      {list.length > 0 && (
        <DataRows
          rows={list}
          rowKey={(f) => f.id}
          columns={columns}
          actionsHeader={t('rowActions')}
          onRowClick={(f) => setOpenId(f.id)}
          actions={(f) => (
            <Button variant="ghost" size="sm" onClick={() => setOpenId(f.id)}>
              {t('open')}
            </Button>
          )}
        />
      )}

      {creating && yearId && (
        <FlowMetaForm
          subjectId={subjectId}
          yearId={yearId}
          flow={null}
          onClose={() => setCreating(false)}
          onCreated={(id) => setOpenId(id)}
        />
      )}
    </section>
  );
}
