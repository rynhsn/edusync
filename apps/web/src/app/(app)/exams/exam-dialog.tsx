'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { TimeField } from '@/components/ui/time-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

export interface ExamLike {
  id: string;
  examTypeId: string | null;
  title: string;
  semesterId: string;
  subjectId: string;
  classIds: string[];
  mode: 'cbt' | 'paper' | 'both';
  examDate: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  status: 'draft' | 'ready';
}

interface Draft {
  id: string | null;
  examTypeId: string;
  title: string;
  titleEdited: boolean;
  semesterId: string;
  subjectId: string;
  classIds: string[];
  mode: 'cbt' | 'paper' | 'both';
  examDate: string;
  startTime: string;
  durationMinutes: string;
  status: 'draft' | 'ready';
}

const MODES = ['paper', 'cbt', 'both'] as const;

/** Dialog buat/ubah ujian, dipakai daftar ujian dan halaman susun. `exam` kosong = ujian baru. */
export function ExamDialog({
  open,
  onOpenChange,
  exam,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: ExamLike | null;
  defaults?: { semesterId?: string; subjectId?: string };
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations('examList');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ['exam-types', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/exam/types', { params: header })),
  });
  const subjects = useQuery({
    queryKey: ['exam-subjects', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/exam/subjects', { params: header })),
  });
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });

  const typeList = (types.data ?? []).filter((x) => x.active || x.id === exam?.examTypeId);
  const subjectList = subjects.data ?? [];
  const semesterList = semesters.data ?? [];

  // Isi awal dibuat sekali setiap dialog dibuka (render-time reset, bukan efek).
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    setSeen(true);
    setError(null);
    const sem = semesterList.find((s) => s.isActive) ?? semesterList[0];
    setDraft(
      exam
        ? {
            id: exam.id,
            examTypeId: exam.examTypeId ?? '',
            title: exam.title,
            titleEdited: true,
            semesterId: exam.semesterId,
            subjectId: exam.subjectId,
            classIds: exam.classIds,
            mode: exam.mode,
            examDate: exam.examDate ?? '',
            startTime: exam.startTime ?? '',
            durationMinutes: exam.durationMinutes ? String(exam.durationMinutes) : '',
            status: exam.status,
          }
        : {
            id: null,
            examTypeId: typeList[0]?.id ?? '',
            title: '',
            titleEdited: false,
            semesterId: defaults?.semesterId || sem?.id || '',
            subjectId: defaults?.subjectId || subjectList[0]?.id || '',
            classIds: [],
            mode: 'paper',
            examDate: '',
            startTime: '',
            durationMinutes: '',
            status: 'draft',
          },
    );
  }
  if (!open && seen) setSeen(false);

  const semester = semesterList.find((s) => s.id === draft?.semesterId);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, semester?.academicYearId],
    enabled: !!semester && can('class:read'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', {
          params: { ...header, query: { academicYearId: semester?.academicYearId } },
        }),
      ),
  });
  const classList = classes.data ?? [];

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        examTypeId: d.examTypeId || null,
        title: d.title.trim(),
        semesterId: d.semesterId,
        subjectId: d.subjectId,
        classIds: d.classIds,
        mode: d.mode,
        examDate: d.examDate || null,
        startTime: d.startTime || null,
        durationMinutes: d.durationMinutes ? Number(d.durationMinutes) : null,
        status: d.status,
      };
      if (d.id) {
        return unwrap(await api.PUT('/v1/exams/{id}', { params: { ...header, path: { id: d.id } }, body }));
      }
      return unwrap(await api.POST('/v1/exams', { params: header, body }));
    },
    onSuccess: (r, d) => {
      toast.success(d.id ? t('saved') : t('created'));
      onSaved?.(r.id);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  /** Judul usulan "ASAS Matematika" selama pengguna belum mengetiknya sendiri. */
  const suggest = (d: Draft): Draft => {
    if (d.titleEdited) return d;
    const short = typeList.find((x) => x.id === d.examTypeId)?.shortName ?? '';
    const sub = subjectList.find((s) => s.id === d.subjectId)?.name ?? '';
    return { ...d, title: [short, sub].filter(Boolean).join(' ') };
  };
  const set = (patch: Partial<Draft>) => draft && setDraft(suggest({ ...draft, ...patch }));

  const valid =
    !!draft && !!draft.title.trim() && !!draft.semesterId && !!draft.subjectId && draft.classIds.length > 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={exam ? t('editExam') : t('addExam')}
      submitLabel={t('save')}
      size="wide"
      error={error}
      disabled={!valid}
      onSubmit={() => save.mutateAsync(draft as Draft)}
    >
      {draft && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="ex-type">{t('type')}</Label>
            <SelectField
              id="ex-type"
              value={draft.examTypeId}
              onChange={(e) => set({ examTypeId: e.target.value })}
            >
              <option value="">{t('noType')}</option>
              {typeList.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.shortName} · {x.name}
                </option>
              ))}
            </SelectField>
            {types.data && types.data.length === 0 && (
              <p className="text-muted-foreground text-xs">
                {t('noTypesHint')}{' '}
                <Link href="/exams/types" className="text-foreground underline">
                  {t('openTypes')}
                </Link>
              </p>
            )}
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="ex-subject">{t('subject')}</Label>
            <SelectField
              id="ex-subject"
              value={draft.subjectId}
              onChange={(e) => set({ subjectId: e.target.value })}
              disabled={!!draft.id}
            >
              {subjectList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            {draft.id && <p className="text-muted-foreground text-xs">{t('subjectLocked')}</p>}
          </div>
          <div className="grid content-start gap-2 sm:col-span-2">
            <Label htmlFor="ex-title">{t('examTitle')}</Label>
            <Input
              id="ex-title"
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value, titleEdited: true })}
            />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="ex-semester">{t('semester')}</Label>
            <SelectField
              id="ex-semester"
              value={draft.semesterId}
              onChange={(e) => setDraft({ ...draft, semesterId: e.target.value, classIds: [] })}
            >
              {semesterList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.startsOn.slice(0, 4)}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="ex-mode">{t('mode')}</Label>
            <SelectField
              id="ex-mode"
              value={draft.mode}
              onChange={(e) => set({ mode: e.target.value as Draft['mode'] })}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`mode_${m}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0 sm:col-span-2">
            <legend className="mb-1 text-sm leading-none font-medium">{t('classes')}</legend>
            {classList.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t('noClasses')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {classList.map((c) => (
                  // biome-ignore lint/a11y/noLabelWithoutControl: kontrolnya Checkbox Base UI di dalam label.
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={draft.classIds.includes(c.id)}
                      onCheckedChange={(v) =>
                        set({
                          classIds:
                            v === true ? [...draft.classIds, c.id] : draft.classIds.filter((x) => x !== c.id),
                        })
                      }
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="grid content-start gap-2">
            <Label htmlFor="ex-date">{t('date')}</Label>
            <DatePicker
              id="ex-date"
              clearable
              value={draft.examDate}
              onChange={(v) => set({ examDate: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid content-start gap-2">
              <Label htmlFor="ex-start">{t('startTime')}</Label>
              <TimeField id="ex-start" value={draft.startTime} onChange={(v) => set({ startTime: v })} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="ex-duration">{t('duration')}</Label>
              <Input
                id="ex-duration"
                type="number"
                min={5}
                max={600}
                value={draft.durationMinutes}
                onChange={(e) => set({ durationMinutes: e.target.value })}
              />
            </div>
          </div>
          <div className="grid content-start gap-2 sm:col-span-2">
            <Label htmlFor="ex-status">{t('status')}</Label>
            <SelectField
              id="ex-status"
              value={draft.status}
              onChange={(e) => set({ status: e.target.value as Draft['status'] })}
            >
              <option value="draft">{t('status_draft')}</option>
              <option value="ready">{t('status_ready')}</option>
            </SelectField>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
