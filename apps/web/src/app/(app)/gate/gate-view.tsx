'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ScanLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300',
  late: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  excused: 'bg-sky-600/15 text-sky-700 dark:text-sky-300',
  sick: 'bg-violet-600/15 text-violet-700 dark:text-violet-300',
  absent: 'bg-red-600/15 text-red-700 dark:text-red-300',
};
const SUMMARY = ['present', 'late', 'excused', 'sick', 'absent', 'notYet'] as const;
const KINDS = ['in', 'out', 'excused', 'sick', 'absent'] as const;

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '–';

/** Gerbang hari ini: ringkasan kehadiran, pindai kartu, dan koreksi manual oleh guru piket. Menyegarkan sendiri. */
export function GateView() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const date = todayIso();
  const scanRef = useRef<HTMLInputElement>(null);
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [code, setCode] = useState('');

  const me = useQuery({
    queryKey: ['duty-me', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/duty-roster/me', { params: header })),
  });
  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const daily = useQuery({
    queryKey: ['gate-daily', school.schoolId, date, classId],
    refetchInterval: 10_000,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/gate/daily', {
          params: { ...header, query: { date, ...(classId ? { classId } : {}) } },
        }),
      ),
  });
  const canCover = me.data?.canCover ?? false;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['gate-daily', school.schoolId] });

  const scan = useMutation({
    mutationFn: async (value: string) =>
      unwrap(await api.POST('/v1/gate/scan', { params: header, body: { code: value } })),
    onSuccess: (r) => {
      toast.success(`${r.student.name} — ${t(`result.${r.result}`)}`);
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
    onSettled: () => {
      setCode('');
      scanRef.current?.focus();
    },
  });
  const mark = useMutation({
    mutationFn: async (v: { studentId: string; kind: (typeof KINDS)[number] }) =>
      unwrap(await api.POST('/v1/gate/manual', { params: header, body: { ...v, note: null } })),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const students = (daily.data?.students ?? []).filter((s) =>
    q.trim() ? s.name.toLowerCase().includes(q.trim().toLowerCase()) : true,
  );
  const summary = daily.data?.summary;

  return (
    <PageBody>
      <PageHeader
        title={t('gateTitle')}
        description={t('gateSubtitle')}
        actions={
          me.data && (
            <Badge variant={me.data.onDuty ? 'default' : 'outline'}>
              {me.data.onDuty ? t('youOnDuty') : me.data.canCover ? t('youManager') : t('notOnDuty')}
            </Badge>
          )
        }
      />

      {daily.data?.closed && (
        <Alert>
          <AlertDescription>{t('closedToday', { title: daily.data.closed.title })}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SUMMARY.map((k) => (
            <Card key={k} className="gap-1 p-4">
              <span className="text-muted-foreground text-xs">{t(`summary.${k}`)}</span>
              <span className="font-heading text-2xl font-semibold tabular-nums">{summary[k]}</span>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canCover && (
          <form
            className="relative sm:w-72"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) scan.mutate(code.trim());
            }}
          >
            <ScanLine className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              ref={scanRef}
              aria-label={t('scanLabel')}
              className="pl-8"
              placeholder={t('scanPlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </form>
        )}
        <SelectField
          aria-label={t('class')}
          className="sm:w-48"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">{t('allClasses')}</option>
          {(classes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <Input
          aria-label={t('search')}
          className="sm:w-56"
          placeholder={t('search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {daily.isPending && <Skeleton className="h-48 w-full" />}
      {daily.data && students.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noStudents')}</Card>
      )}
      {students.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('student')}</TableHead>
                <TableHead>{t('class')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('checkIn')}</TableHead>
                <TableHead>{t('checkOut')}</TableHead>
                {canCover && <TableHead className="w-28" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.studentId}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.nis && <div className="text-muted-foreground font-mono text-xs">{s.nis}</div>}
                  </TableCell>
                  <TableCell>{s.className}</TableCell>
                  <TableCell>
                    {s.status ? (
                      <Badge className={cn('border-0', STATUS_STYLE[s.status])}>
                        {t(`status_${s.status}`)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">{t('summary.notYet')}</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{clock(s.checkInAt)}</TableCell>
                  <TableCell className="tabular-nums">{clock(s.checkOutAt)}</TableCell>
                  {canCover && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
                          {t('mark')} <ChevronDown className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {KINDS.map((kind) => (
                            <DropdownMenuItem
                              key={kind}
                              onClick={() => mark.mutate({ studentId: s.studentId, kind })}
                            >
                              {t(`kind.${kind}`)}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageBody>
  );
}
