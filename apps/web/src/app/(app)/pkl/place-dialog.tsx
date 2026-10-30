'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Search, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { PersonAvatar, pklKey, usePklPartners, usePklPeriods } from './shared';

interface Result {
  created: number;
  skipped: number;
}

/** Dialog "Tempatkan siswa": pilih periode, mitra, pembimbing, lalu siswa (banyak sekaligus). */
export function PlaceDialog({ defaultPeriodId }: { defaultPeriodId: string }) {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const [open, setOpen] = useState(false);
  const [periodId, setPeriodId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [indName, setIndName] = useState('');
  const [indPhone, setIndPhone] = useState('');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const periods = usePklPeriods();
  const partners = usePklPartners();
  const effectivePeriod = periodId || defaultPeriodId || periods.data?.[0]?.id || '';
  const period = periods.data?.find((p) => p.id === effectivePeriod);
  const activePartners = (partners.data ?? []).filter((p) => p.active);

  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId],
    enabled: open && can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: header })),
  });
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, period?.academicYearId],
    enabled: open && can('class:read') && !!period,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', {
          params: { ...header, query: { academicYearId: period?.academicYearId as string } },
        }),
      ),
  });
  const students = useQuery({
    queryKey: ['students', school.schoolId, 'pkl-picker', classId, q],
    enabled: open && can('student:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students', {
          params: {
            ...header,
            query: { status: 'active', limit: 100, ...(classId ? { classId } : {}), ...(q ? { q } : {}) },
          },
        }),
      ),
  });
  const list = students.data?.items ?? [];
  const allShownPicked = list.length > 0 && list.every((s) => picked.has(s.id));

  function reset() {
    setPeriodId('');
    setPartnerId('');
    setTeacherId('');
    setIndName('');
    setIndPhone('');
    setClassId('');
    setSearch('');
    setPicked(new Map());
    setError(null);
    setResult(null);
  }

  function toggle(id: string, name: string, on: boolean) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(id, name);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setPicked((prev) => {
      const next = new Map(prev);
      for (const s of list) {
        if (on) next.set(s.id, s.name);
        else next.delete(s.id);
      }
      return next;
    });
  }

  const place = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/pkl/placements', {
          params: header,
          body: {
            periodId: effectivePeriod,
            partnerId,
            studentIds: [...picked.keys()],
            supervisorTeacherId: teacherId || null,
            industrySupervisorName: indName.trim() || null,
            industrySupervisorPhone: indPhone.trim() || null,
          },
        }),
      ),
    onSuccess: (r) => {
      setError(null);
      setResult({ created: r.created.length, skipped: r.skipped.length });
      queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const ready = !!effectivePeriod && !!partnerId && picked.size > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <UserPlus className="size-4" aria-hidden /> {t('placeStudents')}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{t('placeTitle')}</DialogTitle>
          <DialogDescription>{t('placeDescription')}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid justify-items-center gap-3 py-6 text-center" role="status">
            <CheckCircle2 className="size-12 text-teal-600" aria-hidden />
            <p className="font-heading text-lg font-semibold">
              {t('placeDoneTitle', { count: result.created })}
            </p>
            {result.skipped > 0 && (
              <p className="text-muted-foreground max-w-sm text-sm">
                {t('placeSkipped', { count: result.skipped })}
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={reset}>
                {t('placeMore')}
              </Button>
              <Button onClick={() => setOpen(false)}>{t('done')}</Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) place.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="pl-period">{t('period')}</Label>
                <SelectField
                  id="pl-period"
                  value={effectivePeriod}
                  onChange={(e) => {
                    setPeriodId(e.target.value);
                    setClassId('');
                  }}
                >
                  {(periods.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pl-partner">{t('partner')}</Label>
                <SelectField
                  id="pl-partner"
                  value={partnerId}
                  placeholder={t('choosePartner')}
                  onChange={(e) => setPartnerId(e.target.value)}
                >
                  {activePartners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="pl-teacher">{t('supervisor')}</Label>
                <SelectField
                  id="pl-teacher"
                  value={teacherId}
                  disabled={!can('teacher:read')}
                  onChange={(e) => setTeacherId(e.target.value)}
                >
                  <option value="">{t('noSupervisor')}</option>
                  {(teachers.data ?? [])
                    .filter((x) => x.status === 'active')
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pl-ind-name">{t('industrySupervisorName')}</Label>
                <Input
                  id="pl-ind-name"
                  maxLength={120}
                  value={indName}
                  onChange={(e) => setIndName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pl-ind-phone">{t('industrySupervisorPhone')}</Label>
                <Input
                  id="pl-ind-phone"
                  type="tel"
                  maxLength={30}
                  value={indPhone}
                  onChange={(e) => setIndPhone(e.target.value)}
                />
              </div>
            </div>

            <fieldset className="grid gap-2 rounded-xl border p-3">
              <legend className="px-1 text-sm font-medium">
                {t('chooseStudents')}{' '}
                <span className="text-muted-foreground font-normal">
                  ({t('pickedCount', { count: picked.size })})
                </span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <SelectField
                  aria-label={t('classFilter')}
                  value={classId}
                  disabled={!can('class:read')}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  <option value="">{t('allClasses')}</option>
                  {(classes.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
                <div className="relative">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    className="pl-8"
                    value={search}
                    aria-label={t('searchStudent')}
                    placeholder={t('searchStudent')}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 px-1 pt-1">
                <Checkbox
                  id="pl-all"
                  checked={allShownPicked}
                  disabled={list.length === 0}
                  onCheckedChange={(v) => toggleAll(v === true)}
                />
                <Label htmlFor="pl-all" className="text-xs">
                  {t('selectAllShown')}
                </Label>
              </div>
              <ul className="max-h-56 overflow-y-auto rounded-lg border">
                {students.isPending ? (
                  <li className="p-3">
                    <Skeleton className="h-6 w-full" />
                  </li>
                ) : list.length === 0 ? (
                  <li className="text-muted-foreground p-4 text-center text-sm">{t('noStudents')}</li>
                ) : (
                  list.map((s) => (
                    <li
                      key={s.id}
                      className="hover:bg-muted/50 flex items-center gap-2.5 border-b px-3 py-2 last:border-b-0"
                    >
                      <Checkbox
                        id={`pl-s-${s.id}`}
                        checked={picked.has(s.id)}
                        onCheckedChange={(v) => toggle(s.id, s.name, v === true)}
                      />
                      <Label
                        htmlFor={`pl-s-${s.id}`}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                      >
                        <PersonAvatar name={s.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{s.name}</span>
                          <span className="text-muted-foreground block truncate text-xs font-normal">
                            {s.className ?? '-'}
                            {s.nis ? ` · ${s.nis}` : ''}
                          </span>
                        </span>
                      </Label>
                    </li>
                  ))
                )}
              </ul>
              {(students.data?.total ?? 0) > list.length && (
                <p className="text-muted-foreground px-1 text-xs">{t('narrowSearch')}</p>
              )}
            </fieldset>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={!ready || place.isPending}>
                {t('placeSubmit', { count: picked.size })}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
