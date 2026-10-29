'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';

const STATUSES = ['present', 'excused', 'sick', 'absent'] as const;
type Status = (typeof STATUSES)[number];

const ACTIVE_STYLE: Record<Status, string> = {
  present: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600/90',
  excused: 'bg-sky-600 text-white border-sky-600 hover:bg-sky-600/90',
  sick: 'bg-amber-500 text-white border-amber-500 hover:bg-amber-500/90',
  absent: 'bg-red-600 text-white border-red-600 hover:bg-red-600/90',
};

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function AttendanceView() {
  const t = useTranslations('attendance');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('attendance:manage');

  const today = isoOf(new Date());
  const [tab, setTab] = useState<'sheet' | 'recap'>('sheet');
  const [classChoice, setClassChoice] = useState('');
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [marks, setMarks] = useState<Record<string, Status | null>>({});
  const [dirty, setDirty] = useState(false);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: !!activeYear && can('class:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const classList = classes.data ?? [];
  const classId = classChoice || classList[0]?.id || '';

  const sheet = useQuery({
    queryKey: ['attendance', school.schoolId, classId, date],
    enabled: !!classId && !!date && tab === 'sheet',
    queryFn: async () =>
      unwrap(await api.GET('/v1/attendance', { params: { ...header, query: { classId, date } } })),
  });
  const recap = useQuery({
    queryKey: ['attendance-recap', school.schoolId, classId, from, to],
    enabled: !!classId && !!from && !!to && from <= to && tab === 'recap',
    queryFn: async () =>
      unwrap(await api.GET('/v1/attendance/recap', { params: { ...header, query: { classId, from, to } } })),
  });

  // Isian lokal mengikuti data server tiap kali kelas atau tanggal berganti.
  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.students.map((s) => [s.studentId, s.status])));
    setDirty(false);
  }, [sheet.data]);

  const save = useMutation({
    mutationFn: async () => {
      const records = Object.entries(marks)
        .filter((entry): entry is [string, Status] => entry[1] !== null)
        .map(([studentId, status]) => ({ studentId, status, note: null }));
      return unwrap(await api.PUT('/v1/attendance', { params: header, body: { classId, date, records } }));
    },
    onSuccess: (res) => {
      toast.success(t('saved', { count: res.saved }));
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['attendance', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-recap', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const students = sheet.data?.students ?? [];
  const closed = sheet.data?.closed;
  const filled = Object.values(marks).filter((m) => m !== null).length;
  const set = (id: string, status: Status) => {
    setMarks((m) => ({ ...m, [id]: status }));
    setDirty(true);
  };

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          tab === 'sheet' &&
          manage &&
          students.length > 0 &&
          !closed && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setMarks(Object.fromEntries(students.map((s) => [s.studentId, 'present' as Status])));
                  setDirty(true);
                }}
              >
                {t('allPresent')}
              </Button>
              <Button disabled={!dirty || filled === 0 || save.isPending} onClick={() => save.mutate()}>
                {t('save')}
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SelectField
          aria-label={t('class')}
          className="sm:w-52"
          value={classId}
          onChange={(e) => setClassChoice(e.target.value)}
        >
          {classList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        {tab === 'sheet' ? (
          <div className="sm:w-56">
            <DatePicker aria-label={t('date')} value={date} onChange={(v) => v && setDate(v)} />
          </div>
        ) : (
          <>
            <div className="sm:w-52">
              <DatePicker aria-label={t('from')} value={from} onChange={(v) => v && setFrom(v)} />
            </div>
            <span className="text-muted-foreground text-sm">–</span>
            <div className="sm:w-52">
              <DatePicker aria-label={t('to')} value={to} onChange={(v) => v && setTo(v)} />
            </div>
          </>
        )}
        <div className="ml-auto flex rounded-lg border p-0.5">
          {(['sheet', 'recap'] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={tab === m ? 'secondary' : 'ghost'}
              aria-pressed={tab === m}
              onClick={() => setTab(m)}
            >
              {m === 'sheet' ? t('title') : t('recap')}
            </Button>
          ))}
        </div>
      </div>

      {(years.isPending || classes.isPending) && <Skeleton className="h-48 w-full" />}
      {!years.isPending && !classes.isPending && classList.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noClasses')}</Card>
      )}

      {tab === 'sheet' && closed && (
        <Alert>
          <AlertDescription>
            {t('closed', {
              title: closed.title,
              kind: closed.type === 'holiday' ? t('kindHoliday') : t('kindBreak'),
            })}
          </AlertDescription>
        </Alert>
      )}

      {tab === 'sheet' && sheet.data && students.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noStudents')}</Card>
      )}

      {tab === 'sheet' && students.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>{t('student')}</TableHead>
                <TableHead className="text-right">{t('status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s, i) => (
                <TableRow key={s.studentId}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.nis && <div className="text-muted-foreground font-mono text-xs">{s.nis}</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    <fieldset className="m-0 inline-flex gap-1 border-0 p-0">
                      <legend className="sr-only">{`${t('status')} ${s.name}`}</legend>
                      {STATUSES.map((st) => (
                        <Button
                          key={st}
                          size="sm"
                          variant="outline"
                          disabled={!manage || !!closed}
                          aria-pressed={marks[s.studentId] === st}
                          title={t(st)}
                          className={cn('min-w-9', marks[s.studentId] === st && ACTIVE_STYLE[st])}
                          onClick={() => set(s.studentId, st)}
                        >
                          <span className="sm:hidden">{t(`short.${st}`)}</span>
                          <span className="hidden sm:inline">{t(st)}</span>
                        </Button>
                      ))}
                    </fieldset>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {tab === 'sheet' && dirty && <p className="text-muted-foreground text-sm">{t('unsaved')}</p>}

      {tab === 'recap' && recap.data && (
        <>
          <p className="text-muted-foreground text-sm">{t('daysFilled', { count: recap.data.days })}</p>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('student')}</TableHead>
                  {STATUSES.map((st) => (
                    <TableHead key={st} className="text-right">
                      {t(st)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recap.data.students.map((s) => (
                  <TableRow key={s.studentId}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    {STATUSES.map((st) => (
                      <TableCell key={st} className="text-right tabular-nums">
                        {s[st]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell>{t('totalRow')}</TableCell>
                  {STATUSES.map((st) => (
                    <TableCell key={st} className="text-right tabular-nums">
                      {recap.data.students.reduce((sum, s) => sum + s[st], 0)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </PageBody>
  );
}
