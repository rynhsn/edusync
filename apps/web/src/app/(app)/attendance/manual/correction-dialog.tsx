'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { getSchoolTimezone } from '@/lib/school-time';
import {
  buildCorrection,
  type CorrectionForm,
  type DailyRow,
  type DailyStatus,
  initialCorrection,
} from './manual-logic';

const STATUSES: DailyStatus[] = ['present', 'late', 'excused', 'sick', 'absent'];

/**
 * Koreksi satu siswa pada satu tanggal: hapus/ubah jam datang dan pulang, atau tetapkan status izin/sakit/alpa
 * beserta catatannya (PUT /v1/gate/daily/{studentId}). Hanya bidang yang berubah dikirim.
 */
export function CorrectionDialog({
  row,
  date,
  onClose,
}: {
  row: DailyRow;
  date: string;
  onClose: () => void;
}) {
  const t = useTranslations('manualAttendance');
  const tg = useTranslations('gate');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const [before] = useState(() => initialCorrection(row, getSchoolTimezone()));
  const [form, setForm] = useState<CorrectionForm>(before);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<CorrectionForm>) => setForm((f) => ({ ...f, ...patch }));

  async function submit() {
    setError(null);
    const built = buildCorrection(date, before, form);
    if (!built.ok) {
      const msg =
        built.error === 'invalid_time'
          ? t('timeInvalid')
          : built.error === 'order'
            ? t('correction.order')
            : t('correction.noChange');
      setError(msg);
      throw new Error(built.error);
    }
    try {
      const res = unwrap(
        await api.PUT('/v1/gate/daily/{studentId}', {
          params: { header: schoolHeader(school.schoolId), path: { studentId: row.studentId } },
          body: built.body,
        }),
      );
      toast.success(res.removed ? t('correction.removed') : t('correction.saved'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gate-daily', school.schoolId] }),
        queryClient.invalidateQueries({ queryKey: ['manual-classes', school.schoolId] }),
      ]);
    } catch (e) {
      setError(te(errorKey(e)));
      throw e;
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('correction.title', { name: row.name })}
      description={t('correction.description', { date })}
      submitLabel={t('correction.save')}
      error={error}
      onSubmit={submit}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="corr-in">{t('correction.checkIn')}</Label>
          <Input
            id="corr-in"
            inputMode="numeric"
            placeholder={t('timePlaceholder')}
            value={form.checkIn}
            onChange={(e) => set({ checkIn: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={form.checkIn === ''}
            onClick={() => set({ checkIn: '' })}
          >
            {t('correction.clearIn')}
          </Button>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="corr-out">{t('correction.checkOut')}</Label>
          <Input
            id="corr-out"
            inputMode="numeric"
            placeholder={t('timePlaceholder')}
            value={form.checkOut}
            onChange={(e) => set({ checkOut: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={form.checkOut === ''}
            onClick={() => set({ checkOut: '' })}
          >
            {t('correction.clearOut')}
          </Button>
        </div>
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="corr-status">{t('correction.status')}</Label>
        <SelectField
          id="corr-status"
          value={form.status}
          onChange={(e) => set({ status: e.target.value as DailyStatus | '' })}
        >
          <option value="">{t('correction.statusAuto')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tg(`status_${s}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="corr-note">{t('correction.note')}</Label>
        <Textarea
          id="corr-note"
          maxLength={500}
          placeholder={t('correction.notePlaceholder')}
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </FormDialog>
  );
}
