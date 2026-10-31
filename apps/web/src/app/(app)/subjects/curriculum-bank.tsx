'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookCopy, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

/** Salin mapel dari bank data kurikulum ke daftar mapel sekolah. */
export function CurriculumBank() {
  const t = useTranslations('curriculumBank');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const [curriculumKey, setCurriculumKey] = useState('');
  const [levelGroup, setLevelGroup] = useState('');
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);

  const bank = useQuery({
    queryKey: ['reference-curricula', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/reference/curricula', { params: header })),
  });

  const levelsQuery = useQuery({
    queryKey: ['reference-levels', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/reference/levels', { params: header })),
  });
  const updatesQuery = useQuery({
    queryKey: ['reference-updates', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/reference/curricula/updates', { params: header })),
  });
  const updates = updatesQuery.data?.updates ?? [];

  const curricula = bank.data?.curricula ?? [];
  const current = curricula.find((c) => c.key === (curriculumKey || curricula[0]?.key));
  const level = current?.levels.find((l) => l.levelGroup === (levelGroup || current.levels[0]?.levelGroup));
  const picked = level?.subjects.filter((s) => !unchecked.has(s.code)) ?? [];
  const wasAdopted = bank.data?.adopted.some(
    (a) => a.curriculumKey === current?.key && a.levelGroup === level?.levelGroup,
  );

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['subjects', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['reference-curricula', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['reference-updates', school.schoolId] });
  };

  /** Adopsi hanya mapel acuan baru; mapel sekolah yang sudah ada (dan sudah diubah) tidak disentuh. */
  const adoptNew = useMutation({
    mutationFn: async (u: (typeof updates)[number]) =>
      unwrap(
        await api.POST('/v1/curricula/adopt', {
          params: header,
          body: {
            curriculumKey: u.curriculumKey,
            levelGroup: u.levelGroup,
            subjectCodes: u.newSubjects.map((x) => x.code),
          },
        }),
      ),
    onSuccess: (res) => {
      setProblem(null);
      toast.success(t('adopted', res));
      refreshAll();
    },
    onError: (e) => setProblem(te(errorKey(e))),
  });

  const adopt = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/curricula/adopt', {
          params: header,
          body: {
            curriculumKey: current?.key as string,
            levelGroup: level?.levelGroup as string,
            subjectCodes: picked.map((s) => s.code),
          },
        }),
      ),
    onSuccess: (res) => {
      setProblem(null);
      toast.success(t('adopted', res));
      refreshAll();
    },
    onError: (e) => setProblem(te(errorKey(e))),
  });

  if (!current || !level) return null;
  const levelLabel = (l: string) => levelsQuery.data?.levels.find((x) => x.key === l)?.name ?? l;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline">
            <BookCopy className="size-4" /> {t('title')}
          </Button>
        }
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{t('title')}</DialogTitle>
          <DialogDescription>{t('hint')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {updates.length > 0 && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-50 p-3 dark:bg-violet-500/10">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-violet-600 dark:text-violet-300" /> {t('updatesTitle')}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">{t('updatesHint')}</p>
              <ul className="mt-2 grid gap-2">
                {updates.map((u) => (
                  <li
                    key={`${u.curriculumKey}-${u.levelGroup}`}
                    className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {u.curriculumName} · {levelLabel(u.levelGroup)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {u.newSubjects.map((x) => `${x.name} (${x.code})`).join(', ')}
                      </p>
                    </div>
                    <Button size="sm" disabled={adoptNew.isPending} onClick={() => adoptNew.mutate(u)}>
                      {t('adoptNew', { count: u.newSubjects.length })}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="bank-curriculum">{t('curriculum')}</Label>
              <SelectField
                id="bank-curriculum"
                value={current.key}
                onChange={(e) => {
                  setCurriculumKey(e.target.value);
                  setLevelGroup('');
                  setUnchecked(new Set());
                }}
              >
                {curricula.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bank-level">{t('level')}</Label>
              <SelectField
                id="bank-level"
                value={level.levelGroup}
                onChange={(e) => {
                  setLevelGroup(e.target.value);
                  setUnchecked(new Set());
                }}
              >
                {current.levels.map((l) => (
                  <option key={l.levelGroup} value={l.levelGroup}>
                    {levelLabel(l.levelGroup)}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">{current.description}</p>
          {wasAdopted && <Badge variant="secondary">{t('alreadyAdopted')}</Badge>}

          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => setUnchecked(new Set())}>
              {t('selectAll')}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {level.subjects.map((s) => (
              <label key={s.code} htmlFor={`bank-${s.code}`} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`bank-${s.code}`}
                  checked={!unchecked.has(s.code)}
                  onCheckedChange={() => {
                    const next = new Set(unchecked);
                    if (next.has(s.code)) next.delete(s.code);
                    else next.add(s.code);
                    setUnchecked(next);
                  }}
                />
                {s.name} <span className="text-muted-foreground font-mono text-xs">{s.code}</span>
              </label>
            ))}
          </div>
          {problem && <p className="text-destructive text-sm">{problem}</p>}
          <div>
            <Button disabled={picked.length === 0 || adopt.isPending} onClick={() => adopt.mutate()}>
              {picked.length === 0 ? t('none') : t('adopt')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
