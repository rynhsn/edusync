'use client';

import { type SubjectGroup, totalPeriodsByLevel } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock, Layers, ListChecks, School } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { ListSkeleton, REVEAL } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, MODULE_TONE, StatCard, StatGrid, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import {
  type AllocationRow,
  diffAllocations,
  effectiveDraft,
  type PeriodDraft,
  parsePeriods,
  sumPeriods,
} from '@/lib/curriculum-grid';
import { errorKey } from '@/lib/errors';
import { useSchoolLevels } from '@/lib/school-settings';
import { cn } from '@/lib/utils';

/** Grid jam pelajaran (JP) per mapel untuk satu tahun ajaran, tingkat, dan (opsional) jurusan. */
export function StructurePanel({ yearId, canWrite }: { yearId: string; canWrite: boolean }) {
  const t = useTranslations('curriculum');
  const ts = useTranslations('subjects');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const levels = useSchoolLevels();
  const levelList = levels.data ?? [];
  const [levelChoice, setLevelChoice] = useState('');
  const levelCode = levelList.some((l) => l.code === levelChoice) ? levelChoice : (levelList[0]?.code ?? '');
  const [programChoice, setProgramChoice] = useState('');

  const programs = useQuery({
    queryKey: ['programs', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/programs', { params: header })),
  });
  const programList = programs.data ?? [];
  const programId = programList.some((p) => p.id === programChoice) ? programChoice : '';

  const subjects = useQuery({
    queryKey: ['subjects', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });

  const allocKey = ['curriculum-allocations', school.schoolId, yearId, levelCode];
  const allocations = useQuery({
    queryKey: allocKey,
    enabled: !!yearId && !!levelCode,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/curriculum/allocations', {
          params: { ...header, path: { id: yearId }, query: { levelCode } },
        }),
      ),
  });

  // Suntingan berlaku untuk satu cakupan (tahun, tingkat, jurusan); berpindah cakupan memulai suntingan baru.
  const scope = `${yearId}|${levelCode}|${programId}`;
  const [draftState, setDraftState] = useState<{
    scope: string;
    edits: Record<string, Partial<PeriodDraft>>;
  }>({ scope, edits: {} });
  const edits = draftState.scope === scope ? draftState.edits : {};
  const setField = (subjectId: string, field: keyof PeriodDraft, value: string) =>
    setDraftState({ scope, edits: { ...edits, [subjectId]: { ...edits[subjectId], [field]: value } } });

  const all = allocations.data?.allocations ?? [];
  const saved: (AllocationRow & { id: string })[] = all
    .filter((a) => (a.programId ?? '') === programId)
    .map((a) => ({
      id: a.id,
      subjectId: a.subjectId,
      weeklyPeriods: a.weeklyPeriods,
      yearlyPeriods: a.yearlyPeriods,
      note: a.note,
    }));
  const savedBySubject = new Map(saved.map((r) => [r.subjectId, r]));

  // Mapel nonaktif tetap tampil bila sudah punya alokasi di cakupan ini.
  const rows = [...(subjects.data ?? [])]
    .filter((s) => s.active !== false || savedBySubject.has(s.id))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  const subjectIds = rows.map((s) => s.id);

  const { items, invalid } = diffAllocations(levelCode, programId || null, saved, edits);
  const totals = sumPeriods(saved, edits, subjectIds);
  const dirty = items.length > 0 || invalid.length > 0;

  const programName = (id: string | null) =>
    id ? (programList.find((p) => p.id === id)?.name ?? '-') : t('allPrograms');
  const perProgram = totalPeriodsByLevel(all);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/academic-years/{id}/curriculum/allocations', {
          params: { ...header, path: { id: yearId } },
          body: { allocations: items },
        }),
      ),
    onSuccess: (res) => {
      toast.success(t('saved', res));
      setDraftState({ scope, edits: {} });
      queryClient.invalidateQueries({ queryKey: allocKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (levels.isPending) return <ListSkeleton rows={4} stats={0} />;
  if (levelList.length === 0) {
    return (
      <EmptyPanel
        icon={School}
        tone={MODULE_TONE.master}
        title={t('noLevels')}
        body={t('noLevelsBody')}
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/school-settings" />}>
            {t('levelsLink')}
          </Button>
        }
      />
    );
  }

  return (
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="curriculum-structure-title">
      <div>
        <h2 id="curriculum-structure-title" className="font-heading text-lg font-semibold">
          {t('tabStructure')}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('structureHelp')}</p>
      </div>

      <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="cur-level">{t('level')}</Label>
          <SelectField
            id="cur-level"
            className={TOUCH_SELECT}
            value={levelCode}
            onChange={(e) => setLevelChoice(e.target.value)}
          >
            {levelList.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="cur-program">{t('program')}</Label>
          <SelectField
            id="cur-program"
            className={TOUCH_SELECT}
            value={programId}
            onChange={(e) => setProgramChoice(e.target.value)}
          >
            <option value="">{t('allPrograms')}</option>
            {programList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      <StatGrid className="grid-cols-1 sm:grid-cols-3">
        <StatCard icon={Clock} tone="teal" label={t('statWeekly')} value={totals.weekly} />
        <StatCard icon={Layers} tone="sky" label={t('statYearly')} value={totals.yearly} />
        <StatCard
          icon={ListChecks}
          tone="violet"
          label={t('statFilled')}
          value={totals.filled}
          hint={t('statFilledHint', { count: rows.length })}
        />
      </StatGrid>

      {perProgram.length > 1 && (
        <div className="bg-card rounded-2xl border p-3">
          <p className="text-sm font-medium">{t('totalsTitle')}</p>
          <ul className="text-muted-foreground mt-1 grid gap-0.5 text-sm">
            {perProgram.map((p) => (
              <li key={p.programId ?? 'all'} className="tabular-nums">
                {t('totalsRow', {
                  program: programName(p.programId),
                  weekly: p.weeklyPeriods,
                  yearly: p.yearlyPeriods,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(subjects.isPending || allocations.isPending) && <ListSkeleton rows={5} stats={0} />}
      {(subjects.isError || allocations.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {subjects.data && rows.length === 0 && (
        <EmptyPanel
          icon={BookOpen}
          tone={MODULE_TONE.master}
          title={t('noSubjects')}
          body={t('noSubjectsBody')}
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/subjects" />}>
              {t('subjectsLink')}
            </Button>
          }
        />
      )}

      {allocations.data && rows.length > 0 && (
        <div className="bg-card overflow-x-auto rounded-2xl border">
          <Table aria-label={t('gridLabel')}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">{t('colCode')}</TableHead>
                <TableHead>{t('colSubject')}</TableHead>
                <TableHead>{t('colGroup')}</TableHead>
                <TableHead className="w-32">{t('colWeekly')}</TableHead>
                <TableHead className="w-32">{t('colYearly')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const d = effectiveDraft(savedBySubject.get(s.id), edits[s.id]);
                const bad = (text: string) => parsePeriods(text) === 'invalid';
                return (
                  <TableRow key={s.id} className={cn(s.active === false && 'text-muted-foreground')}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell>
                      <span className="font-medium">{s.name}</span>
                      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                        {s.isLocalContent && <ToneBadge tone="amber">{t('localContent')}</ToneBadge>}
                        {s.active === false && <ToneBadge tone="slate">{t('inactiveSubject')}</ToneBadge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.subjectGroup ? ts(`groups.${s.subjectGroup as SubjectGroup}`) : '-'}
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        className="w-24 tabular-nums"
                        aria-label={t('weeklyFor', { name: s.name })}
                        aria-invalid={bad(d.weekly)}
                        readOnly={!canWrite}
                        value={d.weekly}
                        onChange={(e) => setField(s.id, 'weekly', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        className="w-24 tabular-nums"
                        aria-label={t('yearlyFor', { name: s.name })}
                        aria-invalid={bad(d.yearly)}
                        readOnly={!canWrite}
                        value={d.yearly}
                        onChange={(e) => setField(s.id, 'yearly', e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canWrite && allocations.data && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <Button
            disabled={items.length === 0 || invalid.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t('saving') : t('save')}
          </Button>
          <Button
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() => setDraftState({ scope, edits: {} })}
          >
            {t('discard')}
          </Button>
          <span className="text-muted-foreground text-sm">
            {items.length > 0 ? t('changed', { count: items.length }) : t('noChanges')}
          </span>
          {invalid.length > 0 && <span className="text-destructive text-sm">{t('invalidRows')}</span>}
        </div>
      )}
    </section>
  );
}
