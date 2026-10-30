'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
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
const GATE_STYLE: Record<string, string> = {
  present: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300',
  late: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  excused: 'bg-sky-600/15 text-sky-700 dark:text-sky-300',
  sick: 'bg-violet-600/15 text-violet-700 dark:text-violet-300',
  absent: 'bg-red-600/15 text-red-700 dark:text-red-300',
};

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

function LessonSheet({ entryId, date, onClose }: { entryId: string; date: string; onClose: () => void }) {
  const t = useTranslations('gate');
  const ta = useTranslations('attendance');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [marks, setMarks] = useState<Record<string, Status | null>>({});
  const [dirty, setDirty] = useState(false);

  const sheet = useQuery({
    queryKey: ['lesson-sheet', school.schoolId, entryId, date],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/lesson-attendance', {
          params: { ...header, query: { scheduleEntryId: entryId, date } },
        }),
      ),
  });
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
      return unwrap(
        await api.PUT('/v1/lesson-attendance', {
          params: header,
          body: { scheduleEntryId: entryId, date, records },
        }),
      );
    },
    onSuccess: (r) => {
      toast.success(
        r.substitute ? t('savedSubstitute', { count: r.saved }) : ta('saved', { count: r.saved }),
      );
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['lessons', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['lesson-sheet', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (sheet.isPending) return <Skeleton className="h-48 w-full" />;
  if (!sheet.data) return null;
  const { students, canRecord, substitute } = sheet.data;
  const filled = Object.values(marks).filter((m) => m !== null).length;
  const set = (id: string, status: Status) => {
    setMarks((m) => ({ ...m, [id]: status }));
    setDirty(true);
  };

  return (
    <Card className="gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            ← {t('back')}
          </Button>
          {substitute && canRecord && <Badge variant="outline">{t('substituteBadge')}</Badge>}
        </div>
        {canRecord && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMarks(Object.fromEntries(students.map((s) => [s.studentId, 'present' as Status])));
                setDirty(true);
              }}
            >
              {ta('allPresent')}
            </Button>
            <Button disabled={!dirty || filled === 0 || save.isPending} onClick={() => save.mutate()}>
              {ta('save')}
            </Button>
          </div>
        )}
      </div>
      {!canRecord && (
        <Alert>
          <AlertDescription>{t('notYourLesson')}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{ta('student')}</TableHead>
            <TableHead>{t('atGate')}</TableHead>
            <TableHead className="text-right">{ta('status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((s) => (
            <TableRow key={s.studentId}>
              <TableCell>
                <div className="font-medium">{s.name}</div>
                {s.nis && <div className="text-muted-foreground font-mono text-xs">{s.nis}</div>}
              </TableCell>
              <TableCell>
                {s.gate ? (
                  <Badge className={cn('border-0', GATE_STYLE[s.gate])}>{t(`status_${s.gate}`)}</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">{t('noTap')}</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <fieldset className="m-0 inline-flex gap-1 border-0 p-0">
                  <legend className="sr-only">{`${ta('status')} ${s.name}`}</legend>
                  {STATUSES.map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant="outline"
                      disabled={!canRecord}
                      aria-pressed={marks[s.studentId] === st}
                      title={ta(st)}
                      className={cn('min-w-9', marks[s.studentId] === st && ACTIVE_STYLE[st])}
                      onClick={() => set(s.studentId, st)}
                    >
                      <span className="sm:hidden">{ta(`short.${st}`)}</span>
                      <span className="hidden sm:inline">{ta(st)}</span>
                    </Button>
                  ))}
                </fieldset>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {dirty && <p className="text-muted-foreground text-sm">{ta('unsaved')}</p>}
    </Card>
  );
}

/** Absensi per jam pelajaran: daftar jam pada satu tanggal, lalu lembar absensi satu jam. */
export function LessonsView() {
  const t = useTranslations('gate');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [date, setDate] = useState(todayIso());
  const [open, setOpen] = useState<string | null>(null);

  const lessons = useQuery({
    queryKey: ['lessons', school.schoolId, date],
    queryFn: async () => unwrap(await api.GET('/v1/lessons', { params: { ...header, query: { date } } })),
  });

  return (
    <PageBody>
      <PageHeader
        title={t('lessonsTitle')}
        description={lessons.data?.canCover ? t('lessonsSubtitleCover') : t('lessonsSubtitle')}
        actions={
          <div className="w-52">
            <DatePicker
              aria-label={t('date')}
              value={date}
              onChange={(v) => {
                if (v) {
                  setDate(v);
                  setOpen(null);
                }
              }}
            />
          </div>
        }
      />
      {lessons.isPending && <Skeleton className="h-40 w-full" />}
      {lessons.data?.closed && (
        <Alert>
          <AlertDescription>{t('closedToday', { title: lessons.data.closed.title })}</AlertDescription>
        </Alert>
      )}
      {lessons.data && lessons.data.lessons.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noLessons')}</Card>
      )}
      {open ? (
        <LessonSheet entryId={open} date={date} onClose={() => setOpen(null)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lessons.data?.lessons.map((l) => {
            const done = l.total > 0 && l.filled >= l.total;
            return (
              <Card key={l.id} className="gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {l.subjectName} · {l.className}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {t('period', { n: l.periodNumber })} · {l.startsAt}–{l.endsAt}
                    </div>
                    <div className="text-muted-foreground text-sm">{l.teacherName}</div>
                  </div>
                  {l.mine && <Badge variant="secondary">{t('mine')}</Badge>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={done ? 'default' : 'outline'}>
                    {t('filled', { filled: l.filled, total: l.total })}
                  </Badge>
                  <Button size="sm" variant={done ? 'outline' : 'default'} onClick={() => setOpen(l.id)}>
                    {l.mine ? t('fill') : t('cover')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageBody>
  );
}
