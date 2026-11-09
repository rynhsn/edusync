'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FieldError, type FormValidation, TOUCH_INPUT } from '@/components/form-field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { GuardianField, GuardianValues } from '../app/(app)/students/guardian-validation';

export const EMPTY_GUARDIAN_VALUES: GuardianValues = {
  name: '',
  nik: '',
  phone: '',
  email: '',
  occupation: '',
  address: '',
};

/** Isian wali menjadi badan permintaan API (kosong menjadi null untuk NIK, alamat, pekerjaan). */
export const guardianPayload = (v: GuardianValues) => ({
  name: v.name,
  nik: v.nik.trim() || null,
  phone: v.phone,
  email: v.email,
  address: v.address.trim() || null,
  occupation: v.occupation.trim() || null,
});

/**
 * Isian wali berkelompok: Identitas, Kontak, Alamat, dengan galat-merah di tiap isian. Dipakai formulir tambah dan
 * ubah di panel wali siswa, serta dialog ubah di halaman Data wali. Letakkan di dalam grid `sm:grid-cols-2`.
 */
export function GuardianFields({
  values,
  onChange,
  v,
  nikPlaceholder,
  relation,
}: {
  values: GuardianValues;
  onChange: (next: GuardianValues) => void;
  v: FormValidation<GuardianField>;
  /** NIK tersamar untuk petunjuk bila NIK utuh tidak dikirim server. */
  nikPlaceholder?: string | null;
  /** Pilihan hubungan (hanya formulir tambah). */
  relation?: ReactNode;
}) {
  const t = useTranslations('guardians');
  const tc = useTranslations('common');
  return (
    <>
      <p className="font-heading text-sm font-semibold sm:col-span-2">{tc('sectionIdentity')}</p>
      <div className="grid content-start gap-2">
        <Label htmlFor={v.idOf('name')}>{t('name')}</Label>
        <Input
          {...v.fieldProps('name')}
          className={TOUCH_INPUT}
          aria-required="true"
          autoComplete="off"
          maxLength={120}
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
        />
        <FieldError id={v.idOf('name')} issue={v.issue('name')} />
      </div>
      {relation}
      <div className="grid content-start gap-2">
        <Label htmlFor={v.idOf('nik')}>{t('nik')}</Label>
        <Input
          {...v.fieldProps('nik')}
          className={TOUCH_INPUT}
          inputMode="numeric"
          autoComplete="off"
          maxLength={16}
          placeholder={nikPlaceholder ?? undefined}
          value={values.nik}
          onChange={(e) => onChange({ ...values, nik: e.target.value.replace(/\D/g, '') })}
        />
        <FieldError id={v.idOf('nik')} issue={v.issue('nik')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={v.idOf('occupation')}>{t('occupation')}</Label>
        <Input
          {...v.fieldProps('occupation')}
          className={TOUCH_INPUT}
          autoComplete="off"
          maxLength={120}
          value={values.occupation}
          onChange={(e) => onChange({ ...values, occupation: e.target.value })}
        />
        <FieldError id={v.idOf('occupation')} issue={v.issue('occupation')} />
      </div>
      <p className="font-heading border-t pt-3 text-sm font-semibold sm:col-span-2">{tc('sectionContact')}</p>
      <div className="grid content-start gap-2">
        <Label htmlFor={v.idOf('phone')}>{t('phone')}</Label>
        <Input
          {...v.fieldProps('phone')}
          className={TOUCH_INPUT}
          inputMode="tel"
          autoComplete="off"
          maxLength={30}
          value={values.phone}
          onChange={(e) => onChange({ ...values, phone: e.target.value })}
        />
        <FieldError id={v.idOf('phone')} issue={v.issue('phone')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={v.idOf('email')}>{t('email')}</Label>
        <Input
          {...v.fieldProps('email')}
          className={TOUCH_INPUT}
          type="email"
          inputMode="email"
          autoComplete="off"
          maxLength={254}
          value={values.email}
          onChange={(e) => onChange({ ...values, email: e.target.value })}
        />
        <FieldError id={v.idOf('email')} issue={v.issue('email')} />
      </div>
      <p className="text-muted-foreground -mt-1.5 text-xs sm:col-span-2">{t('phoneHint')}</p>
      <p className="text-muted-foreground -mt-1.5 text-xs sm:col-span-2">{tc('loginIdentityHint')}</p>
      <p className="font-heading border-t pt-3 text-sm font-semibold sm:col-span-2">{tc('sectionAddress')}</p>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={v.idOf('address')}>{t('address')}</Label>
        <Textarea
          {...v.fieldProps('address')}
          rows={2}
          maxLength={300}
          value={values.address}
          onChange={(e) => onChange({ ...values, address: e.target.value })}
        />
        <FieldError id={v.idOf('address')} issue={v.issue('address')} />
      </div>
    </>
  );
}
