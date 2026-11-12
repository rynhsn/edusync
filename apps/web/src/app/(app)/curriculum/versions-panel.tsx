'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { School } from 'lucide-react';
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
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, MODULE_TONE } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { diffVersions, type VersionDraft } from '@/lib/curriculum-grid';
import { errorKey } from '@/lib/errors';
import { useSchoolLevels } from '@/lib/school-settings';
import { cn } from '@/lib/utils';

/** Kurikulum acuan yang dipakai tiap tingkat pada satu tahun ajaran, beserta tanggal berlakunya. */
export function VersionsPanel({ yearId, canWrite }: { yearId: string; canWrite: boolean }) {
  const t = useTranslations('curriculum');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const levels = useSchoolLevels();
  const bank = useQuery({
    queryKey: ['reference-curricula', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/reference/curricula', { params: header })),
  });
  const versionsKey = ['curriculum-versions', school.schoolId, yearId];
  const versions = useQuery({
    queryKey: versionsKey,
    enabled: !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/curriculum/versions', {
          params: { ...header, path: { id: yearId } },
        }),
      ),
  });

  const [draftState, setDraftState] = useState<{
    yearId: string;
    edits: Record<string, Partial<VersionDraft>>;
  }>({
    yearId,
    edits: {},
  });
  const edits = draftState.yearId === yearId ? draftState.edits : {};
  const setField = (levelCode: string, field: keyof VersionDraft, value: string) =>
    setDraftState({ yearId, edits: { ...edits, [levelCode]: { ...edits[levelCode], [field]: value } } });

  const saved = versions.data?.versions ?? [];
  const savedByLevel = new Map(saved.map((v) => [v.levelCode, v]));
  const levelList = levels.data ?? [];
  // Tingkat yang sudah punya versi tetapi tidak lagi ada di daftar tingkat tetap ditampilkan.
  const rows = [
    ...levelList.map((l) => ({ code: l.code, label: l.label })),
    ...saved
      .filter((v) => !levelList.some((l) => l.code === v.levelCode))
      .map((v) => ({ code: v.levelCode, label: v.levelCode })),
  ];
  const curricula = bank.data?.curricula ?? [];
  const items = diffVersions(saved, edits);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/academic-years/{id}/curriculum/versions', {
          params: { ...header, path: { id: yearId } },
          body: { versions: items },
        }),
      ),
    onSuccess: (res) => {
      toast.success(t('versionsSaved', res));
      setDraftState({ yearId, edits: {} });
      queryClient.invalidateQueries({ queryKey: versionsKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (levels.isPending || bank.isPending || versions.isPending) return <ListSkeleton rows={4} stats={0} />;
  if (levels.isError || bank.isError || versions.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }
  if (rows.length === 0) {
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
    <section className={cn('grid gap-4', REVEAL)} aria-labelledby="curriculum-versions-title">
      <div>
        <h2 id="curriculum-versions-title" className="font-heading text-lg font-semibold">
          {t('tabVersions')}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('versionsHelp')}</p>
      </div>

      <div className="bg-card overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">{t('colLevel')}</TableHead>
              <TableHead>{t('colCurriculum')}</TableHead>
              <TableHead className="w-48">{t('colEffective')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const prev = savedByLevel.get(r.code);
              const key = edits[r.code]?.curriculumKey ?? prev?.curriculumKey ?? '';
              const date = edits[r.code]?.effectiveFrom ?? prev?.effectiveFrom ?? '';
              return (
                <TableRow key={r.code}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell>
                    <SelectField
                      className={cn('min-w-56', TOUCH_SELECT)}
                      aria-label={t('versionFor', { level: r.label })}
                      value={key}
                      disabled={!canWrite}
                      onChange={(e) => setField(r.code, 'curriculumKey', e.target.value)}
                    >
                      <option value="">{t('notSet')}</option>
                      {curricula.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.name}
                        </option>
                      ))}
                    </SelectField>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      aria-label={t('dateFor', { level: r.label })}
                      disabled={!canWrite || key === ''}
                      value={key === '' ? '' : date}
                      onChange={(e) => setField(r.code, 'effectiveFrom', e.target.value)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <Button disabled={items.length === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t('saving') : t('saveVersions')}
          </Button>
          <Button
            variant="outline"
            disabled={items.length === 0 || save.isPending}
            onClick={() => setDraftState({ yearId, edits: {} })}
          >
            {t('discard')}
          </Button>
          <span className="text-muted-foreground text-sm">
            {items.length > 0 ? t('changed', { count: items.length }) : t('noChanges')}
          </span>
        </div>
      )}
    </section>
  );
}
