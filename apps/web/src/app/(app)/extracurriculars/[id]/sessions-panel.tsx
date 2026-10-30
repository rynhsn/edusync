'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { ATT_STATUSES, type AttStatus, todayIso } from '../shared';

const ACTIVE_STYLE: Record<AttStatus, string> = {
  present: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600/90',
  excused: 'bg-sky-600 text-white border-sky-600 hover:bg-sky-600/90',
  sick: 'bg-amber-500 text-white border-amber-500 hover:bg-amber-500/90',
  absent: 'bg-red-600 text-white border-red-600 hover:bg-red-600/90',
};

/** Lembar absensi satu pertemuan ekskul. */
function SessionSheet({ sessionId, id, onClose }: { sessionId: string; id: string; onClose: () => void }) {
  const t = useTranslations('extracurricular');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [marks, setMarks] = useState<Record<string, AttStatus | null>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const sheet = useQuery({
    queryKey: ['extracurricular-attendance', school.schoolId, sessionId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/extracurricular-sessions/{sessionId}/attendance', {
          params: { ...header, path: { sessionId } },
        }),
      ),
  });
  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.students.map((s) => [s.studentId, s.status])));
    setNotes(Object.fromEntries(sheet.data.students.map((s) => [s.studentId, s.note ?? ''])));
    setDirty(false);
  }, [sheet.data]);

  const save = useMutation({
    mutationFn: async () => {
      const records = Object.entries(marks)
        .filter((entry): entry is [string, AttStatus] => entry[1] !== null)
        .map(([studentId, status]) => ({ studentId, status, note: notes[studentId]?.trim() || null }));
      return unwrap(
        await api.PUT('/v1/extracurricular-sessions/{sessionId}/attendance', {
          params: { ...header, path: { sessionId } },
          body: { records },
        }),
      );
    },
    onSuccess: () => {
      toast.success(t('attendanceSaved', { count: Object.values(marks).filter((m) => m !== null).length }));
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['extracurricular-sessions', school.schoolId, id] });
      queryClient.invalidateQueries({ queryKey: ['extracurricular-attendance', school.schoolId, sessionId] });
      queryClient.invalidateQueries({ queryKey: ['extracurricular-report', school.schoolId, id] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (sheet.isPending) return <Skeleton className="h-48 w-full" />;
  if (!sheet.data) return null;
  const { students, canRecord } = sheet.data;
  const filled = Object.values(marks).filter((m) => m !== null).length;
  const set = (sid: string, status: AttStatus) => {
    setMarks((m) => ({ ...m, [sid]: status }));
    setDirty(true);
  };

  return (
    <Card className="gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button size="sm" variant="ghost" onClick={onClose}>
          ← {t('back')}
        </Button>
        {canRecord && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMarks(Object.fromEntries(students.map((s) => [s.studentId, 'present' as AttStatus])));
                setDirty(true);
              }}
            >
              {t('allPresent')}
            </Button>
            <Button disabled={!dirty || filled === 0 || save.isPending} onClick={() => save.mutate()}>
              {t('saveAttendance')}
            </Button>
          </div>
        )}
      </div>
      {!canRecord && (
        <Alert>
          <AlertDescription>{t('readOnlySheet')}</AlertDescription>
        </Alert>
      )}
      {students.length === 0 && <p className="text-muted-foreground text-sm">{t('noMembers')}</p>}
      {students.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('student')}</TableHead>
              <TableHead>{t('note')}</TableHead>
              <TableHead className="text-right">{t('attStatus')}</TableHead>
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
                  <Input
                    aria-label={`${t('note')} ${s.name}`}
                    className="h-8 min-w-32"
                    maxLength={200}
                    disabled={!canRecord}
                    value={notes[s.studentId] ?? ''}
                    onChange={(e) => {
                      setNotes((n) => ({ ...n, [s.studentId]: e.target.value }));
                      setDirty(true);
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <fieldset className="m-0 inline-flex gap-1 border-0 p-0">
                    <legend className="sr-only">{`${t('attStatus')} ${s.name}`}</legend>
                    {ATT_STATUSES.map((st) => (
                      <Button
                        key={st}
                        size="sm"
                        variant="outline"
                        disabled={!canRecord}
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
      )}
      {dirty && <p className="text-muted-foreground text-sm">{t('unsaved')}</p>}
    </Card>
  );
}

export function SessionsPanel({ id, canWrite }: { id: string; canWrite: boolean }) {
  const t = useTranslations('extracurricular');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['extracurricular-sessions', school.schoolId, id];
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState({ date: todayIso(), topic: '' });
  const [error, setError] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/extracurriculars/{id}/sessions', { params: { ...header, path: { id } } })),
  });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/extracurriculars/{id}/sessions', {
          params: { ...header, path: { id } },
          body: { date: draft.date, topic: draft.topic.trim() || null },
        }),
      ),
    onSuccess: () => {
      toast.success(t('sessionCreated'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (sessionId: string) =>
      unwrap(
        await api.DELETE('/v1/extracurricular-sessions/{sessionId}', {
          params: { ...header, path: { sessionId } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('sessionDeleted'));
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['extracurricular-report', school.schoolId, id] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (open) return <SessionSheet sessionId={open} id={id} onClose={() => setOpen(null)} />;

  return (
    <div className="grid gap-3">
      {canWrite && (
        <div className="flex justify-end">
          <FormDialog
            trigger={
              <Button>
                <Plus className="size-4" /> {t('newSession')}
              </Button>
            }
            title={t('newSession')}
            submitLabel={t('newSession')}
            disabled={!draft.date}
            error={error}
            onOpenChange={() => {
              setDraft({ date: todayIso(), topic: '' });
              setError(null);
            }}
            onSubmit={() => create.mutateAsync()}
          >
            <div className="grid gap-2">
              <Label htmlFor="ek-session-date">{t('sessionDate')}</Label>
              <DatePicker
                id="ek-session-date"
                value={draft.date}
                onChange={(v) => setDraft((d) => ({ ...d, date: v }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ek-session-topic">{t('topic')}</Label>
              <Input
                id="ek-session-topic"
                maxLength={200}
                placeholder={t('topicHint')}
                value={draft.topic}
                onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))}
              />
            </div>
          </FormDialog>
        </div>
      )}
      {sessions.isPending && <Skeleton className="h-40 w-full" />}
      {sessions.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{t('noSessions')}</Card>
      )}
      {sessions.data && sessions.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('sessionDate')}</TableHead>
                <TableHead>{t('topic')}</TableHead>
                <TableHead>{t('attStatus')}</TableHead>
                <TableHead className="w-44" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.data.map((s) => {
                const done = s.total > 0 && s.filled >= s.total;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium tabular-nums">{s.date}</TableCell>
                    <TableCell>
                      {s.topic ?? <span className="text-muted-foreground">{t('noTopic')}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={done ? 'default' : 'outline'}>
                        {t('filled', { filled: s.filled, total: s.total })}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant={done ? 'outline' : 'default'} onClick={() => setOpen(s.id)}>
                        {t('openSheet')}
                      </Button>
                      {canWrite && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${t('deleteTitle')} ${s.date}`}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(s.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
