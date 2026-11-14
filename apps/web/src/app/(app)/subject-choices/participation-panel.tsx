'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ListSkeleton } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyPanel, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { participationChanges, scoredWhenEnabling } from '@/lib/subject-choice';

/** Panel "Mapel yang dipilih murid": tandai mapel kelas yang hanya diikuti murid yang memilihnya. */
export function ParticipationPanel({ classId }: { classId: string }) {
  const t = useTranslations('subjectChoices');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [draft, setDraft] = useState<Map<string, 'all' | 'selected'>>(new Map());
  const [confirming, setConfirming] = useState(false);

  const q = useQuery({
    queryKey: ['subject-participation', school.schoolId, classId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes/{id}/subject-participation', {
          params: { ...header, path: { id: classId } },
        }),
      ),
  });

  const save = useMutation({
    mutationFn: async (subjects: { subjectId: string; mode: 'all' | 'selected' }[]) =>
      unwrap(
        await api.PUT('/v1/classes/{id}/subject-participation', {
          params: { ...header, path: { id: classId } },
          body: { subjects },
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['subject-participation', school.schoolId, classId], data);
      queryClient.invalidateQueries({ queryKey: ['subject-choices', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['student-subject-choices', school.schoolId] });
      setDraft(new Map());
      toast.success(t('participationSaved'));
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (q.isPending) return <ListSkeleton rows={4} stats={0} />;
  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(q.error))}</AlertDescription>
      </Alert>
    );
  }
  const data = q.data;
  const canManage = data.canManage;
  const subjects = data.subjects;
  const modeOf = (id: string, saved: 'all' | 'selected') => draft.get(id) ?? saved;
  const changes = participationChanges(subjects, draft);
  const scored = scoredWhenEnabling(subjects, changes);
  const nameOf = new Map(subjects.map((s) => [s.subjectId, s.name]));

  if (subjects.length === 0) {
    return <EmptyPanel icon={ListChecks} tone="violet" title={t('noSubjects')} body={t('noSubjectsBody')} />;
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t('participationIntro')}</p>
      {!canManage && (
        <Alert>
          <ShieldCheck aria-hidden />
          <AlertDescription>{t('readOnlyBody')}</AlertDescription>
        </Alert>
      )}
      <ul className="bg-card divide-y rounded-2xl border">
        {subjects.map((s) => {
          const selected = modeOf(s.subjectId, s.mode) === 'selected';
          const id = `part-${s.subjectId}`;
          return (
            <li key={s.subjectId}>
              <label
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 has-disabled:cursor-default"
              >
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={selected}
                  disabled={!canManage || save.isPending}
                  onCheckedChange={(v) => {
                    const mode = v ? 'selected' : 'all';
                    setDraft((cur) => {
                      const next = new Map(cur);
                      if (mode === s.mode) next.delete(s.subjectId);
                      else next.set(s.subjectId, mode);
                      return next;
                    });
                  }}
                />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm font-medium break-words">{s.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {s.code}
                    {s.scoredStudents > 0 && ` · ${t('scoredHint', { count: s.scoredStudents })}`}
                    {s.mode === 'selected' && ` · ${t('enrolledHint', { count: s.enrolledStudents })}`}
                  </span>
                </span>
                {selected ? (
                  <ToneBadge tone="violet">{t('modeSelected')}</ToneBadge>
                ) : (
                  <ToneBadge tone="slate">{t('modeAll')}</ToneBadge>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-xs">{t('participationHint')}</p>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button
            className="max-lg:min-h-11 max-sm:w-full"
            disabled={changes.length === 0 || save.isPending}
            onClick={() => (scored.length > 0 ? setConfirming(true) : save.mutate(changes))}
          >
            {t('participationSave')}
          </Button>
          {changes.length > 0 && (
            <Button variant="ghost" className="max-lg:min-h-11" onClick={() => setDraft(new Map())}>
              {t('discard')}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('confirmEnableTitle')}
        description={`${t('confirmEnableBody')} ${scored
          .map((s) =>
            t('confirmEnableItem', { name: nameOf.get(s.subjectId) ?? '', count: s.scoredStudents }),
          )
          .join(' ')}`}
        confirmLabel={t('confirmEnable')}
        pending={save.isPending}
        onConfirm={() => save.mutateAsync(changes)}
      />
    </div>
  );
}
