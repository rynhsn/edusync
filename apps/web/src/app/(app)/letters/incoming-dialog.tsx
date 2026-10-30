'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { TextArea } from './placeholder-chips';
import { useHeader } from './shared';

export interface IncomingInitial {
  id: string;
  number: string;
  subject: string;
  party: string;
  letterDate: string;
  body: string | null;
  dispositionNote: string | null;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Pencatatan surat masuk dan disposisinya (baru, atau ubah bila `initial` diberikan). */
export function IncomingDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: IncomingInitial;
}) {
  const t = useTranslations('letters');
  const te = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { school } = useSchool();
  const { header } = useHeader();

  const [number, setNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [party, setParty] = useState('');
  const [letterDate, setLetterDate] = useState(today());
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Isian dikosongkan (atau diisi dari surat yang diubah) setiap dialog dibuka.
  useEffect(() => {
    if (!open) return;
    setNumber(initial?.number ?? '');
    setSubject(initial?.subject ?? '');
    setParty(initial?.party ?? '');
    setLetterDate(initial?.letterDate ?? today());
    setBody(initial?.body ?? '');
    setNote(initial?.dispositionNote ?? '');
    setError(null);
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async () => {
      const common = {
        subject: subject.trim(),
        party: party.trim(),
        letterDate,
        body: body.trim() || null,
        dispositionNote: note.trim() || null,
      };
      if (initial) {
        return unwrap(
          await api.PUT('/v1/letters/{id}', { params: { header, path: { id: initial.id } }, body: common }),
        );
      }
      return unwrap(
        await api.POST('/v1/letters', {
          params: { header },
          body: { direction: 'incoming', number: number.trim() || null, ...common },
        }),
      );
    },
    onSuccess: (saved) => {
      toast.success(initial ? t('incomingUpdated') : t('incomingRecorded'));
      queryClient.invalidateQueries({ queryKey: ['letters', school.schoolId] });
      if (!initial) router.push(`/letters/${saved.id}`);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? t('incomingEditTitle') : t('incomingNewTitle')}
      description={t('incomingDescription')}
      submitLabel={t('save')}
      size="wide"
      error={error}
      disabled={!subject.trim() || !party.trim()}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!initial && (
          <div className="grid gap-1.5">
            <Label htmlFor="in-number">{t('incomingNumber')}</Label>
            <Input
              id="in-number"
              maxLength={100}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={t('incomingNumberHint')}
            />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="in-date">{t('receivedDate')}</Label>
          <DatePicker id="in-date" value={letterDate} onChange={setLetterDate} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="in-subject">{t('subject')}</Label>
          <Input
            id="in-subject"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="in-party">{t('sender')}</Label>
          <Input
            id="in-party"
            required
            maxLength={200}
            value={party}
            onChange={(e) => setParty(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="in-body">{t('incomingBody')}</Label>
          <TextArea
            id="in-body"
            rows={4}
            maxLength={20000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="in-note">{t('disposition')}</Label>
          <TextArea
            id="in-note"
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('dispositionHint')}
          />
        </div>
      </div>
    </FormDialog>
  );
}
