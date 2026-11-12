'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type FieldErrors, type FieldIssue, firstInvalid } from '@/lib/form-validation';
import { cn } from '@/lib/utils';

/** Tinggi sentuh minimal 44px di ponsel; di layar lebar kembali ke ukuran biasa. */
export const TOUCH_INPUT = 'h-11 md:h-8';
export const TOUCH_SELECT = 'data-[size=default]:h-11 md:data-[size=default]:h-8';

/** Galat satu isian: kode dari validasi klien (diterjemahkan) atau teks dari server (apa adanya). */
export type FieldMessage = FieldIssue | string | undefined;

/**
 * Pesan merah kecil di bawah isian, sama dengan pesan kata sandi di formulir pendaftaran. Tidak menampilkan apa pun
 * bila kosong. `id` adalah id isiannya; pesan ini ber-id `${id}-error` untuk `aria-describedby`.
 */
export function FieldError({
  id,
  issue,
  className,
}: {
  id: string;
  issue: FieldMessage;
  className?: string;
}) {
  const t = useTranslations('formValidation');
  const root = useTranslations() as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  if (!issue) return null;
  const text =
    typeof issue === 'string'
      ? issue
      : issue.code === 'custom'
        ? issue.key
          ? root(issue.key, issue.values)
          : t('required')
        : t(issue.code, { max: issue.max ?? 0, min: issue.min ?? 0 });
  return (
    <p id={`${id}-error`} aria-live="polite" className={cn('text-destructive text-xs', className)}>
      {text}
    </p>
  );
}

/** Bagian hook yang dibutuhkan FormDialog. */
export interface FormGate {
  /** Dipanggil saat kirim: menandai percobaan kirim, memfokuskan isian salah pertama, true bila semua benar. */
  attempt: () => boolean;
  /** Tampilkan ringkasan "Periksa kembali isian yang berwarna merah." */
  summary: boolean;
  reset: () => void;
}

export interface FormValidation<K extends string> extends FormGate {
  /** Pesan untuk satu isian, atau undefined bila belum waktunya tampil (belum disentuh dan belum coba kirim). */
  issue: (field: K) => FieldMessage;
  /** Atribut a11y dan id untuk isian: `id`, `aria-invalid`, `aria-describedby`, `onBlur`. */
  fieldProps: (field: K) => {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
    onBlur: () => void;
  };
  /** Id isian, untuk <FieldError id=...>. */
  idOf: (field: K) => string;
  touch: (field: K) => void;
  /** Galat dari server yang menyebut isiannya; hilang pada percobaan kirim berikutnya. */
  setServerErrors: (errors: Partial<Record<K, string>>) => void;
}

function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

/**
 * Validasi formulir dengan galat merah di bawah isian, sebagai pengganti gelembung validasi bawaan browser (yang sering
 * tidak muncul di ponsel). `errors` dihitung pemanggil dari isian saat ini lewat fungsi `validate*` di lib/form-validation;
 * galat baru tampil setelah isian ditinggalkan (blur) atau setelah percobaan kirim. Pasang `noValidate` di <form>
 * (FormDialog melakukannya bila diberi `validation`).
 */
export function useFormValidation<K extends string>({
  errors,
  order,
  idPrefix,
}: {
  errors: FieldErrors<K>;
  /** Urutan isian di layar, untuk menentukan isian salah pertama. */
  order: readonly K[];
  idPrefix: string;
}): FormValidation<K> {
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverErrors, setServer] = useState<Partial<Record<K, string>>>({});

  const idOf = (field: K) => `${idPrefix}-${field}`;
  const shows = (field: K) => errors[field] !== undefined && (submitAttempted || touched[field] === true);
  const issue = (field: K): FieldMessage => (shows(field) ? errors[field] : serverErrors[field]);
  const touch = (field: K) => setTouched((s) => (s[field] ? s : { ...s, [field]: true }));

  return {
    issue,
    idOf,
    touch,
    fieldProps: (field) => {
      const id = idOf(field);
      const invalid = issue(field) !== undefined;
      return {
        id,
        'aria-invalid': invalid,
        'aria-describedby': invalid ? `${id}-error` : undefined,
        onBlur: () => touch(field),
      };
    },
    attempt: () => {
      setSubmitAttempted(true);
      setServer({});
      const first = firstInvalid(errors, order);
      if (first === undefined) return true;
      focusField(idOf(first));
      return false;
    },
    summary: submitAttempted && Object.keys(errors).length > 0,
    setServerErrors: setServer,
    reset: () => {
      setTouched({});
      setSubmitAttempted(false);
      setServer({});
    },
  };
}
