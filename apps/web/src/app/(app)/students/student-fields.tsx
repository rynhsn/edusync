'use client';

import { useTranslations } from 'next-intl';
import { FieldError, type FormValidation, TOUCH_INPUT, TOUCH_SELECT } from '@/components/form-field-error';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import type { StudentField } from '@/lib/form-validation';

/** Isian data murid yang dipakai bersama oleh formulir tambah/ubah siswa dan formulir mutasi masuk. */
export const STATUSES = ['active', 'graduated', 'transferred', 'dropped'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_KEY = {
  active: 'statusActive',
  graduated: 'statusGraduated',
  transferred: 'statusTransferred',
  dropped: 'statusDropped',
} as const;

const RELIGIONS = ['islam', 'christian', 'catholic', 'hindu', 'buddhist', 'confucian', 'other'] as const;
type Religion = (typeof RELIGIONS)[number];

export interface Draft {
  name: string;
  nis: string;
  nisn: string;
  nik: string;
  gender: 'L' | 'P';
  birthPlace: string;
  birthDate: string;
  religion: Religion | '';
  address: string;
  phone: string;
  email: string;
  status: Status;
  classId: string;
}
export const EMPTY: Draft = {
  name: '',
  nis: '',
  nisn: '',
  nik: '',
  gender: 'L',
  birthPlace: '',
  birthDate: '',
  religion: '',
  address: '',
  phone: '',
  email: '',
  status: 'active',
  classId: '',
};

export const clean = (d: Draft) => ({
  name: d.name,
  nis: d.nis.trim() || null,
  nisn: d.nisn.trim() || null,
  nik: d.nik.trim(),
  gender: d.gender,
  birthPlace: d.birthPlace.trim(),
  birthDate: d.birthDate || null,
  religion: d.religion || null,
  address: d.address.trim(),
  phone: d.phone.trim(),
  email: d.email.trim(),
  status: d.status,
});

export function StudentFields({
  idPrefix,
  draft,
  classes,
  onChange,
  v,
  lean = false,
}: {
  idPrefix: string;
  draft: Draft;
  classes: { id: string; name: string }[];
  onChange: (d: Draft) => void;
  /** Validasi galat-merah; id isian = `${idPrefix}-${field}`. */
  v: FormValidation<StudentField>;
  /** Tanpa status dan kelas (mutasi masuk: status pasti aktif, kelas dipilih di bagian mutasi). */
  lean?: boolean;
}) {
  const t = useTranslations('students');
  const tm = useTranslations('masterData');
  const tc = useTranslations('common');
  const f = (k: keyof Draft) => `${idPrefix}-${k}`;
  const thisYear = new Date().getFullYear();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={f('name')}>{tm('name')}</Label>
        <Input
          {...v.fieldProps('name')}
          className={TOUCH_INPUT}
          aria-required="true"
          autoComplete="off"
          maxLength={120}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <FieldError id={f('name')} issue={v.issue('name')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('nis')}>{t('nis')}</Label>
        <Input
          {...v.fieldProps('nis')}
          className={TOUCH_INPUT}
          maxLength={30}
          value={draft.nis}
          onChange={(e) => onChange({ ...draft, nis: e.target.value })}
        />
        <FieldError id={f('nis')} issue={v.issue('nis')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('nisn')}>{t('nisn')}</Label>
        <Input
          {...v.fieldProps('nisn')}
          className={TOUCH_INPUT}
          maxLength={30}
          value={draft.nisn}
          onChange={(e) => onChange({ ...draft, nisn: e.target.value })}
        />
        <FieldError id={f('nisn')} issue={v.issue('nisn')} />
      </div>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={f('nik')}>{t('nik')}</Label>
        <Input
          {...v.fieldProps('nik')}
          className={TOUCH_INPUT}
          inputMode="numeric"
          maxLength={16}
          value={draft.nik}
          onChange={(e) => onChange({ ...draft, nik: e.target.value.replace(/\D/g, '') })}
        />
        <FieldError id={f('nik')} issue={v.issue('nik')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('gender')}>{t('gender')}</Label>
        <SelectField
          id={f('gender')}
          className={TOUCH_SELECT}
          value={draft.gender}
          onChange={(e) => onChange({ ...draft, gender: e.target.value as 'L' | 'P' })}
        >
          <option value="L">{t('male')}</option>
          <option value="P">{t('female')}</option>
        </SelectField>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('birthPlace')}>{t('birthPlace')}</Label>
        <Input
          {...v.fieldProps('birthPlace')}
          className={TOUCH_INPUT}
          maxLength={80}
          value={draft.birthPlace}
          onChange={(e) => onChange({ ...draft, birthPlace: e.target.value })}
        />
        <FieldError id={f('birthPlace')} issue={v.issue('birthPlace')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('birthDate')}>{t('birthDate')}</Label>
        <DatePicker
          {...v.fieldProps('birthDate')}
          className={TOUCH_INPUT}
          value={draft.birthDate}
          onChange={(date) => {
            onChange({ ...draft, birthDate: date });
            v.touch('birthDate');
          }}
          clearable
          yearRange={{ from: thisYear - 40, to: thisYear }}
        />
        <FieldError id={f('birthDate')} issue={v.issue('birthDate')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('religion')}>{t('religion')}</Label>
        <SelectField
          id={f('religion')}
          className={TOUCH_SELECT}
          value={draft.religion}
          onChange={(e) => onChange({ ...draft, religion: e.target.value as Religion | '' })}
        >
          <option value="">{t('noReligion')}</option>
          {RELIGIONS.map((r) => (
            <option key={r} value={r}>
              {t(`religions.${r}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {!lean && (
        <div className="grid content-start gap-2">
          <Label htmlFor={f('status')}>{t('status')}</Label>
          <SelectField
            id={f('status')}
            className={TOUCH_SELECT}
            value={draft.status}
            onChange={(e) => onChange({ ...draft, status: e.target.value as Status })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_KEY[s])}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {classes.length > 0 && (
        <div className="grid content-start gap-2">
          <Label htmlFor={f('classId')}>{t('class')}</Label>
          <SelectField
            id={f('classId')}
            className={TOUCH_SELECT}
            value={draft.classId}
            onChange={(e) => onChange({ ...draft, classId: e.target.value })}
          >
            <option value="">{t('noClass')}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      <p className="font-heading border-t pt-4 text-sm font-semibold sm:col-span-2">{t('contactTitle')}</p>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('phone')}>{t('phone')}</Label>
        <Input
          {...v.fieldProps('phone')}
          className={TOUCH_INPUT}
          inputMode="tel"
          autoComplete="off"
          maxLength={30}
          value={draft.phone}
          onChange={(e) => onChange({ ...draft, phone: e.target.value })}
        />
        <FieldError id={f('phone')} issue={v.issue('phone')} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={f('email')}>{t('email')}</Label>
        <Input
          {...v.fieldProps('email')}
          className={TOUCH_INPUT}
          type="email"
          inputMode="email"
          autoComplete="off"
          maxLength={254}
          value={draft.email}
          onChange={(e) => onChange({ ...draft, email: e.target.value })}
        />
        <FieldError id={f('email')} issue={v.issue('email')} />
      </div>
      <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">{t('contactHint')}</p>
      <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">{tc('loginIdentityHint')}</p>
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor={f('address')}>{t('address')}</Label>
        <Textarea
          {...v.fieldProps('address')}
          rows={2}
          maxLength={300}
          value={draft.address}
          onChange={(e) => onChange({ ...draft, address: e.target.value })}
        />
        <FieldError id={f('address')} issue={v.issue('address')} />
      </div>
    </div>
  );
}
