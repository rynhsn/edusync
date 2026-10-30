'use client';

import { rangeAyahCount, SURAHS, validRange } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { KINDS, type Kind, QUALITIES, QUALITY_STYLE, type Quality, todayIso } from './shared';

export interface StudentOption {
  id: string;
  name: string;
}

interface Props {
  students: StudentOption[];
  /** Siswa awal (mis. dari halaman siswa). Bila `lockStudent`, tidak bisa diganti. */
  studentId?: string;
  lockStudent?: boolean;
  /** Dipanggil setelah setoran tersimpan. */
  onSaved?: () => void;
  /** Id unik agar label dan isian tidak bentrok bila dua formulir ada di halaman. */
  idPrefix?: string;
}

const clampAyah = (surah: number, v: number) => {
  const max = SURAHS[surah - 1]?.ayahCount ?? 1;
  return Math.min(max, Math.max(1, Math.trunc(v) || 1));
};

/**
 * Formulir setoran cepat. Nilai awal cerdas: begitu siswa dipilih, rentang diisi dari ayat lanjutan hafalannya
 * (`next` pada progres), sehingga ustaz cukup menyesuaikan ayat akhir.
 */
export function EntryForm({
  students,
  studentId: initialStudent = '',
  lockStudent,
  onSaved,
  idPrefix = 'entry',
}: Props) {
  const t = useTranslations('tahfidz');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const [studentId, setStudentId] = useState(initialStudent);
  const [date, setDate] = useState(todayIso());
  const [kind, setKind] = useState<Kind>('ziyadah');
  const [surahFrom, setSurahFrom] = useState(1);
  const [ayahFrom, setAyahFrom] = useState(1);
  const [surahTo, setSurahTo] = useState(1);
  const [ayahTo, setAyahTo] = useState(1);
  const [quality, setQuality] = useState<Quality>('fluent');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Nilai awal cerdas hanya diterapkan sekali per siswa; setelah itu ustaz yang menentukan.
  const appliedFor = useRef<string>('');

  useEffect(() => setStudentId(initialStudent), [initialStudent]);

  const progress = useQuery({
    queryKey: ['tahfidz-progress', school.schoolId, studentId],
    enabled: !!studentId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/tahfidz/students/{studentId}/progress', {
          params: { ...header, path: { studentId }, query: {} },
        }),
      ),
  });
  const next = progress.data?.next ?? null;

  useEffect(() => {
    if (!studentId || !progress.data || appliedFor.current === studentId) return;
    appliedFor.current = studentId;
    if (next) {
      setSurahFrom(next.surah);
      setAyahFrom(next.ayah);
      setSurahTo(next.surah);
      setAyahTo(next.ayah);
    }
  }, [studentId, progress.data, next]);

  const valid = validRange(surahFrom, ayahFrom, surahTo, ayahTo);
  const count = valid ? rangeAyahCount(surahFrom, ayahFrom, surahTo, ayahTo) : 0;

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/tahfidz/entries', {
          params: header,
          body: {
            studentId,
            date,
            kind,
            surahFrom,
            ayahFrom,
            surahTo,
            ayahTo,
            quality,
            note: note.trim() || null,
          },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setNote('');
      toast.success(t('entrySaved'));
      // Ayat lanjutan berubah: izinkan nilai awal cerdas diterapkan ulang dari progres terbaru.
      appliedFor.current = '';
      for (const k of ['tahfidz-entries', 'tahfidz-progress', 'tahfidz-summary', 'tahfidz-halaqah'])
        queryClient.invalidateQueries({ queryKey: [k, school.schoolId] });
      onSaved?.();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const surahOptions = SURAHS.map((s) => (
    <option key={s.number} value={String(s.number)}>
      {s.number}. {s.name} ({s.arabic})
    </option>
  ));

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (studentId && valid) save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-student`}>{t('student')}</Label>
          <SelectField
            id={`${idPrefix}-student`}
            disabled={lockStudent}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">{t('chooseStudent')}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-date`}>{t('date')}</Label>
          <DatePicker id={`${idPrefix}-date`} value={date} onChange={setDate} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label id={`${idPrefix}-kind-label`}>{t('kind')}</Label>
        {/* biome-ignore lint/a11y/useSemanticElements: kelompok tombol toggle, bukan isian formulir */}
        <div
          role="group"
          aria-labelledby={`${idPrefix}-kind-label`}
          className="bg-muted/50 grid w-full grid-cols-2 rounded-xl border p-1 sm:w-fit"
        >
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'focus-visible:ring-ring/50 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-5 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
                kind === k
                  ? k === 'ziyadah'
                    ? 'bg-chart-5 text-white shadow-sm dark:text-black'
                    : 'bg-chart-2 text-black shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {k === 'ziyadah' ? <Sparkles className="size-4" /> : <RotateCcw className="size-4" />}
              {t(`kindName.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-surah-from`}>{t('surahFrom')}</Label>
          <SelectField
            id={`${idPrefix}-surah-from`}
            value={String(surahFrom)}
            onChange={(e) => {
              const s = Number(e.target.value);
              setSurahFrom(s);
              setAyahFrom(clampAyah(s, ayahFrom));
              if (s > surahTo) {
                setSurahTo(s);
                setAyahTo(clampAyah(s, ayahTo));
              }
            }}
          >
            {surahOptions}
          </SelectField>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-ayah-from`}>{t('ayahFrom')}</Label>
          <Input
            id={`${idPrefix}-ayah-from`}
            type="number"
            inputMode="numeric"
            min={1}
            max={SURAHS[surahFrom - 1]?.ayahCount ?? 1}
            value={ayahFrom}
            onChange={(e) => setAyahFrom(clampAyah(surahFrom, Number(e.target.value)))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-surah-to`}>{t('surahTo')}</Label>
          <SelectField
            id={`${idPrefix}-surah-to`}
            value={String(surahTo)}
            onChange={(e) => {
              const s = Number(e.target.value);
              setSurahTo(s);
              setAyahTo(clampAyah(s, ayahTo));
            }}
          >
            {surahOptions}
          </SelectField>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-ayah-to`}>{t('ayahTo')}</Label>
          <Input
            id={`${idPrefix}-ayah-to`}
            type="number"
            inputMode="numeric"
            min={1}
            max={SURAHS[surahTo - 1]?.ayahCount ?? 1}
            value={ayahTo}
            onChange={(e) => setAyahTo(clampAyah(surahTo, Number(e.target.value)))}
          />
        </div>
      </div>
      <p
        className={cn('-mt-2 text-sm', valid ? 'text-muted-foreground' : 'text-destructive')}
        aria-live="polite"
      >
        {valid ? t('rangeCount', { count }) : t('rangeInvalid')}
      </p>

      <div className="grid gap-2">
        <Label id={`${idPrefix}-quality-label`}>{t('quality')}</Label>
        {/* biome-ignore lint/a11y/useSemanticElements: kelompok tombol toggle, bukan isian formulir */}
        <div role="group" aria-labelledby={`${idPrefix}-quality-label`} className="grid grid-cols-3 gap-2">
          {QUALITIES.map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={quality === q}
              onClick={() => setQuality(q)}
              className={cn(
                'focus-visible:ring-ring/50 flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3',
                quality === q ? QUALITY_STYLE[q].on : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <span className={cn('size-2.5 rounded-full', QUALITY_STYLE[q].dot)} />
              {t(`qualityName.${q}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-note`}>{t('note')}</Label>
        <Input
          id={`${idPrefix}-note`}
          maxLength={300}
          value={note}
          placeholder={t('notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!studentId || !valid || save.isPending}>
          <Check className="size-4" /> {t('saveEntry')}
        </Button>
      </div>
    </form>
  );
}

/** Dialog berisi formulir setoran; menutup sendiri setelah tersimpan. */
export function EntryDialog({
  trigger,
  title,
  description,
  ...form
}: Props & { trigger: React.ReactElement; title: string; description?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <EntryForm
          {...form}
          onSaved={() => {
            form.onSaved?.();
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
