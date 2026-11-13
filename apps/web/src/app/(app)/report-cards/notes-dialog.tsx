'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, useFormValidation } from '@/components/form-field-error';
import { Label } from '@/components/ui/label';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { SECTION_NOTE_MAX } from '@/lib/report-v2';
import { validateHomeroomNote, validateSections } from './report-card-validation';
import { useReportCard } from './report-data';
import { Textarea } from './textarea';

const NOTE_MAX = 500;

type Field = 'note' | 'cocurricularNote' | 'developmentNote';

interface Target {
  studentId: string;
  name: string;
}

/**
 * Catatan rapor satu murid: catatan wali kelas, catatan kokurikuler, dan (hanya kelas bermode deskriptif) catatan
 * perkembangan. Hanya isian yang berubah yang dikirim.
 */
export function NotesDialog({
  semesterId,
  target,
  onClose,
}: {
  semesterId: string;
  target: Target | null;
  onClose: () => void;
}) {
  const t = useTranslations('reportCards');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const doc = useReportCard(semesterId, target?.studentId ?? null);
  const [note, setNote] = useState('');
  const [cocurricular, setCocurricular] = useState('');
  const [development, setDevelopment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const loaded = doc.data;
  const descriptive = loaded?.reportMode === 'descriptive';
  const validation = useFormValidation<Field>({
    errors: {
      ...validateHomeroomNote(note),
      ...validateSections({ cocurricularNote: cocurricular, developmentNote: development }),
    },
    order: ['note', 'cocurricularNote', 'developmentNote'],
    idPrefix: 'rc',
  });

  // Isi awal diambil dari rapor yang sudah ada; ulang setiap kali dialog dibuka untuk siswa lain.
  useEffect(() => {
    if (target) {
      setNote(loaded?.homeroomNote ?? '');
      setCocurricular(loaded?.cocurricularNote ?? '');
      setDevelopment(loaded?.developmentNote ?? '');
      setError(null);
    }
  }, [target, loaded]);

  const save = useMutation({
    mutationFn: async () => {
      const header = { header: schoolHeader(school.schoolId) };
      const studentId = target?.studentId ?? '';
      if (note.trim() !== (loaded?.homeroomNote ?? '').trim()) {
        unwrap(
          await api.PUT('/v1/report-cards/note', {
            params: header,
            body: { semesterId, studentId, note: note.trim() },
          }),
        );
      }
      const sections = {
        ...(cocurricular.trim() !== (loaded?.cocurricularNote ?? '').trim()
          ? { cocurricularNote: cocurricular.trim() }
          : {}),
        ...(descriptive && development.trim() !== (loaded?.developmentNote ?? '').trim()
          ? { developmentNote: development.trim() }
          : {}),
      };
      if (Object.keys(sections).length > 0) {
        unwrap(
          await api.PUT('/v1/report-cards/sections', {
            params: header,
            body: { semesterId, studentId, ...sections },
          }),
        );
      }
    },
    onSuccess: () => {
      toast.success(t('noteSaved'));
      queryClient.invalidateQueries({ queryKey: ['report-cards', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId, semesterId] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const field = (
    name: Field,
    label: string,
    value: string,
    set: (v: string) => void,
    max: number,
    hint?: string,
  ) => (
    <div className="grid content-start gap-2">
      <Label htmlFor={validation.idOf(name)}>{label}</Label>
      <Textarea
        {...validation.fieldProps(name)}
        rows={name === 'note' ? 5 : 4}
        maxLength={max}
        disabled={!loaded}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      <FieldError id={validation.idOf(name)} issue={validation.issue(name)} />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      <p className="text-muted-foreground text-right text-xs tabular-nums">
        {value.length}/{max}
      </p>
    </div>
  );

  return (
    <FormDialog
      open={!!target}
      title={t('notesTitle')}
      description={target?.name}
      submitLabel={t('save')}
      error={error}
      validation={validation}
      disabled={!loaded || save.isPending}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onSubmit={() => save.mutateAsync()}
    >
      <div className="grid content-start gap-4">
        {field('note', t('homeroomNote'), note, setNote, NOTE_MAX)}
        {field(
          'cocurricularNote',
          t('cocurricular'),
          cocurricular,
          setCocurricular,
          SECTION_NOTE_MAX,
          t('cocurricularHint'),
        )}
        {descriptive &&
          field(
            'developmentNote',
            t('development'),
            development,
            setDevelopment,
            SECTION_NOTE_MAX,
            t('developmentHint'),
          )}
      </div>
    </FormDialog>
  );
}
