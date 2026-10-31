'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import type { Locale } from '@/i18n/config';
import { ApiError, api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { useApply } from '../shared';
import { type DocFile, DocumentsStep } from './documents-step';
import { SuccessView } from './success-view';

interface Draft {
  periodId: string;
  fullName: string;
  gender: '' | 'L' | 'P';
  birthPlace: string;
  birthDate: string;
  nisn: string;
  previousSchool: string;
  address: string;
  programId: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
}

const EMPTY: Draft = {
  periodId: '',
  fullName: '',
  gender: '',
  birthPlace: '',
  birthDate: '',
  nisn: '',
  previousSchool: '',
  address: '',
  programId: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
};

type Errors = Partial<Record<keyof Draft | 'consent', string>>;

const STEP_KEYS = ['student', 'guardian', 'documents', 'review'] as const;

/** Kemajuan sementara di sessionStorage (tanpa dokumen). Semua akses dibungkus try/catch karena bisa diblokir. */
function loadDraft(key: string): { draft: Draft; step: number } | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft?: Partial<Draft>; step?: number };
    return { draft: { ...EMPTY, ...parsed.draft }, step: Math.min(Math.max(parsed.step ?? 0, 0), 2) };
  } catch {
    return null;
  }
}
function saveDraft(key: string, value: { draft: Draft; step: number }) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Penyimpanan tidak tersedia: formulir tetap berjalan tanpa kemajuan tersimpan.
  }
}
function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Diabaikan.
  }
}

/** Isian dengan label, petunjuk, dan pesan galat yang tersambung ke kontrolnya. */
function Field({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden className="text-[var(--ap-orange)]">
            {' '}
            *
          </span>
        )}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

function Stepper({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="flex items-center gap-2" aria-label="steps">
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className="flex min-w-0 flex-1 items-center gap-2"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-[var(--ap-orange)] text-white shadow-md ring-4 ring-[var(--ap-orange)]/20',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                'truncate text-sm font-medium',
                active ? 'block' : 'hidden sm:block',
                !active && 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <span
                aria-hidden
                className={cn('h-0.5 min-w-3 flex-1 rounded-full', done ? 'bg-primary' : 'bg-border')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ApplyForm() {
  const t = useTranslations('apply');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const search = useSearchParams();
  const { slug, info } = useApply();
  const storageKey = `apply:draft:${slug}`;

  const openPeriods = info.periods.filter((p) => p.open);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [missingDocs, setMissingDocs] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const [ready, setReady] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    regNumber: string;
    trackingCode: string;
    submittedAt: string;
  } | null>(null);

  // Pulihkan kemajuan sementara sekali setelah dipasang, lalu pilih periode dari tautan atau satu-satunya yang dibuka.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya sekali saat dipasang
  useEffect(() => {
    const saved = loadDraft(storageKey);
    const wanted = search.get('period');
    const pick =
      openPeriods.find((p) => p.id === (wanted ?? saved?.draft.periodId))?.id ??
      (openPeriods.length === 1 ? openPeriods[0]?.id : '') ??
      '';
    setDraft({ ...(saved?.draft ?? EMPTY), periodId: pick ?? '' });
    if (saved) setStep(saved.step);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !result) saveDraft(storageKey, { draft, step });
  }, [ready, result, draft, step, storageKey]);

  // Lepaskan URL pratinjau dokumen saat formulir ditinggalkan.
  const docsRef = useRef(docs);
  docsRef.current = docs;
  useEffect(
    () => () => {
      for (const d of docsRef.current) if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    },
    [],
  );

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }, []);

  const validate = useCallback(
    (which: number): Errors => {
      const e: Errors = {};
      const req = t('form.required');
      if (which === 0) {
        if (!draft.periodId) e.periodId = req;
        if (draft.fullName.trim().length < 3) e.fullName = draft.fullName.trim() ? t('form.tooShort') : req;
        if (!draft.gender) e.gender = req;
        if (!draft.birthPlace.trim()) e.birthPlace = req;
        if (!draft.birthDate) e.birthDate = req;
        else if (draft.birthDate > new Date().toISOString().slice(0, 10)) e.birthDate = t('form.futureDate');
        if (draft.nisn && !/^\d{10}$/.test(draft.nisn)) e.nisn = t('form.nisnInvalid');
      }
      if (which === 1) {
        if (draft.guardianName.trim().length < 3)
          e.guardianName = draft.guardianName.trim() ? t('form.tooShort') : req;
        const digits = draft.guardianPhone.replace(/[\s-]/g, '');
        if (!digits) e.guardianPhone = req;
        else if (!/^(\+62|62|0)8\d{7,12}$/.test(digits)) e.guardianPhone = t('form.phoneInvalid');
        if (draft.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.guardianEmail))
          e.guardianEmail = t('form.emailInvalid');
      }
      if (which === 3 && !consent) e.consent = t('form.consentRequired');
      return e;
    },
    [draft, consent, t],
  );

  function go(next: number) {
    setDirection(next > step ? 'forward' : 'back');
    setStep(next);
    setSubmitError(null);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function onNext() {
    if (step === 2) {
      const missing = info.documentTypes.filter((d) => d.required && !docs.some((x) => x.kind === d.key));
      setMissingDocs(missing.map((d) => d.key));
      if (missing.length > 0) return;
    }
    const found = validate(step);
    setErrors(found);
    if (Object.keys(found).length === 0) go(step + 1);
  }

  const submit = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/public/admission/{slug}/apply', {
          params: { path: { slug } },
          body: {
            periodId: draft.periodId,
            fullName: draft.fullName.trim().replace(/\s+/g, ' '),
            gender: draft.gender as 'L' | 'P',
            birthPlace: draft.birthPlace.trim(),
            birthDate: draft.birthDate,
            ...(draft.nisn ? { nisn: draft.nisn } : {}),
            ...(draft.previousSchool.trim() ? { previousSchool: draft.previousSchool.trim() } : {}),
            ...(draft.address.trim() ? { address: draft.address.trim() } : {}),
            ...(draft.programId ? { programId: draft.programId } : {}),
            guardianName: draft.guardianName.trim(),
            guardianPhone: draft.guardianPhone.replace(/[\s-]/g, ''),
            ...(draft.guardianEmail ? { guardianEmail: draft.guardianEmail.trim() } : {}),
            documents: docs.map((d) => ({ kind: d.kind, fileName: d.fileName, dataBase64: d.dataBase64 })),
            website: honeypot,
          },
        }),
      ),
    onSuccess: (res) => {
      clearDraft(storageKey);
      setResult({
        regNumber: res.regNumber,
        trackingCode: res.trackingCode,
        submittedAt: new Date().toISOString(),
      });
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    },
    onError: (e) => {
      setSubmitError(te(errorKey(e)));
      const code = e instanceof ApiError ? e.code : undefined;
      // Galat yang berasal dari data diri dikembalikan ke langkah pertama agar bisa diperbaiki.
      if (code === 'nisn_taken') {
        setErrors({ nisn: te(errorKey(e)) });
        go(0);
        setSubmitError(null);
      }
    },
  });

  const period = info.periods.find((p) => p.id === draft.periodId);
  const programName = info.programs.find((p) => p.id === draft.programId)?.name;
  const labels = useMemo(() => STEP_KEYS.map((k) => t(`form.steps.${k}`)), [t]);

  if (result) {
    return (
      <SuccessView
        result={result}
        schoolName={info.school.name}
        fullName={draft.fullName.trim()}
        periodName={period?.name ?? ''}
      />
    );
  }

  if (openPeriods.length === 0) {
    return (
      <div className="ap-rise mx-auto w-full max-w-md flex-1 p-8 text-center">
        <h1 className="font-heading text-2xl font-semibold">{t('closedTitle')}</h1>
        <p className="text-muted-foreground mt-2">{t('closedBody')}</p>
        <Link href="/apply" className={cn(buttonVariants({ variant: 'outline' }), 'mt-5')}>
          {t('backHome')}
        </Link>
      </div>
    );
  }

  const err = (k: keyof Errors) => errors[k];
  const aria = (k: keyof Errors) => ({
    'aria-invalid': err(k) ? true : undefined,
    'aria-describedby': err(k) ? `${k}-error` : undefined,
  });

  return (
    <div ref={topRef} className="mx-auto w-full max-w-2xl scroll-mt-4 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{t('form.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('form.stepOf', { current: step + 1, total: STEP_KEYS.length })}
        </p>
      </div>
      <Stepper current={step} labels={labels} />

      <form
        className="bg-card relative mt-6 rounded-3xl border p-5 shadow-sm sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) return onNext();
          const found = validate(3);
          setErrors(found);
          if (Object.keys(found).length === 0) submit.mutate();
        }}
        noValidate
      >
        {/* Pancing bot: tersembunyi dari pengguna dan pembaca layar, tidak bisa difokus. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>

        <div key={step} className={direction === 'forward' ? 'ap-step-forward' : 'ap-step-back'}>
          {step === 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <StepTitle title={t('form.studentTitle')} body={t('form.studentBody')} />
              {openPeriods.length > 1 && (
                <Field
                  id="periodId"
                  label={t('form.period')}
                  required
                  error={err('periodId')}
                  className="sm:col-span-2"
                >
                  <SelectField
                    id="periodId"
                    value={draft.periodId}
                    onChange={(e) => set('periodId', e.target.value)}
                  >
                    <option value="">{t('form.choose')}</option>
                    {openPeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
              )}
              <Field
                id="fullName"
                label={t('form.fullName')}
                required
                error={err('fullName')}
                className="sm:col-span-2"
              >
                <Input
                  id="fullName"
                  className="h-11"
                  autoComplete="name"
                  maxLength={120}
                  value={draft.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                  {...aria('fullName')}
                />
              </Field>
              <Field id="gender" label={t('form.gender')} required error={err('gender')}>
                <fieldset className="grid grid-cols-2 gap-2">
                  <legend className="sr-only">{t('form.gender')}</legend>
                  {(['L', 'P'] as const).map((g) => (
                    <label
                      key={g}
                      className={cn(
                        'has-focus-visible:ring-ring/50 flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors has-focus-visible:ring-3',
                        draft.gender === g
                          ? 'border-[var(--ap-orange)] bg-[var(--ap-orange-soft)] text-[var(--ap-orange-ink)]'
                          : 'hover:bg-muted',
                      )}
                    >
                      <input
                        type="radio"
                        name="gender"
                        className="sr-only"
                        checked={draft.gender === g}
                        onChange={() => set('gender', g)}
                      />
                      {t(`form.gender${g}`)}
                    </label>
                  ))}
                </fieldset>
              </Field>
              <Field id="birthDate" label={t('form.birthDate')} required error={err('birthDate')}>
                <DatePicker
                  id="birthDate"
                  className="h-11"
                  value={draft.birthDate}
                  onChange={(v) => set('birthDate', v)}
                  yearRange={{ from: new Date().getFullYear() - 30, to: new Date().getFullYear() }}
                />
              </Field>
              <Field id="birthPlace" label={t('form.birthPlace')} required error={err('birthPlace')}>
                <Input
                  id="birthPlace"
                  className="h-11"
                  maxLength={80}
                  value={draft.birthPlace}
                  {...aria('birthPlace')}
                  onChange={(e) => set('birthPlace', e.target.value)}
                />
              </Field>
              <Field id="nisn" label={t('form.nisn')} hint={t('form.nisnHint')} error={err('nisn')}>
                <Input
                  id="nisn"
                  className="h-11"
                  inputMode="numeric"
                  maxLength={10}
                  value={draft.nisn}
                  onChange={(e) => set('nisn', e.target.value.replace(/\D/g, ''))}
                  {...aria('nisn')}
                />
              </Field>
              <Field id="previousSchool" label={t('form.previousSchool')} className="sm:col-span-2">
                <Input
                  id="previousSchool"
                  className="h-11"
                  maxLength={120}
                  value={draft.previousSchool}
                  onChange={(e) => set('previousSchool', e.target.value)}
                />
              </Field>
              <Field id="address" label={t('form.address')} className="sm:col-span-2">
                <Input
                  id="address"
                  className="h-11"
                  autoComplete="street-address"
                  maxLength={300}
                  value={draft.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </Field>
              {info.programs.length > 0 && (
                <Field
                  id="programId"
                  label={t('form.program')}
                  hint={t('form.programHint')}
                  className="sm:col-span-2"
                >
                  <SelectField
                    id="programId"
                    value={draft.programId}
                    onChange={(e) => set('programId', e.target.value)}
                  >
                    <option value="">{t('form.noProgram')}</option>
                    {info.programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </SelectField>
                </Field>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-5">
              <StepTitle title={t('form.guardianTitle')} body={t('form.guardianBody')} />
              <Field id="guardianName" label={t('form.guardianName')} required error={err('guardianName')}>
                <Input
                  id="guardianName"
                  className="h-11"
                  autoComplete="off"
                  maxLength={120}
                  value={draft.guardianName}
                  onChange={(e) => set('guardianName', e.target.value)}
                  {...aria('guardianName')}
                />
              </Field>
              <Field
                id="guardianPhone"
                label={t('form.guardianPhone')}
                required
                hint={t('form.guardianPhoneHint')}
                error={err('guardianPhone')}
              >
                <Input
                  id="guardianPhone"
                  className="h-11"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={20}
                  placeholder="08xxxxxxxxxx"
                  value={draft.guardianPhone}
                  onChange={(e) => set('guardianPhone', e.target.value)}
                  {...aria('guardianPhone')}
                />
              </Field>
              <Field id="guardianEmail" label={t('form.guardianEmail')} error={err('guardianEmail')}>
                <Input
                  id="guardianEmail"
                  className="h-11"
                  type="email"
                  autoComplete="email"
                  maxLength={120}
                  value={draft.guardianEmail}
                  onChange={(e) => set('guardianEmail', e.target.value)}
                  {...aria('guardianEmail')}
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5">
              <StepTitle title={t('docs.title')} body={t('docs.body')} />
              <DocumentsStep
                types={info.documentTypes}
                docs={docs}
                missing={missingDocs}
                onChange={setDocs}
              />
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-5">
              <StepTitle title={t('form.reviewTitle')} body={t('form.reviewBody')} />
              <ReviewBlock
                title={t('form.steps.student')}
                onEdit={() => go(0)}
                editLabel={t('form.edit')}
                rows={[
                  [t('form.period'), period?.name],
                  [t('form.fullName'), draft.fullName.trim()],
                  [t('form.gender'), draft.gender ? t(`form.gender${draft.gender}`) : ''],
                  [
                    t('form.birthDate'),
                    [
                      draft.birthPlace.trim(),
                      draft.birthDate ? formatCalendarDate(locale, draft.birthDate) : '',
                    ]
                      .filter(Boolean)
                      .join(', '),
                  ],
                  [t('form.nisn'), draft.nisn],
                  [t('form.previousSchool'), draft.previousSchool],
                  [t('form.address'), draft.address],
                  [t('form.program'), programName],
                ]}
              />
              <ReviewBlock
                title={t('form.steps.guardian')}
                onEdit={() => go(1)}
                editLabel={t('form.edit')}
                rows={[
                  [t('form.guardianName'), draft.guardianName.trim()],
                  [t('form.guardianPhone'), draft.guardianPhone],
                  [t('form.guardianEmail'), draft.guardianEmail],
                ]}
              />
              <ReviewBlock
                title={t('form.steps.documents')}
                onEdit={() => go(2)}
                editLabel={t('form.edit')}
                rows={info.documentTypes.map((k) => [
                  k.label,
                  docs.find((d) => d.kind === k.key)?.fileName ?? t('docs.notUploaded'),
                ])}
              />
              <div className="grid gap-1.5">
                <div className="flex items-start gap-3 rounded-xl border bg-[var(--ap-teal-soft)]/60 p-4">
                  <Checkbox
                    id="consent"
                    checked={consent}
                    onCheckedChange={(v) => {
                      setConsent(v === true);
                      setErrors((x) => ({ ...x, consent: undefined }));
                    }}
                    aria-invalid={err('consent') ? true : undefined}
                    className="mt-0.5"
                  />
                  <Label htmlFor="consent" className="text-sm leading-snug font-normal">
                    {t('form.consent')}
                  </Label>
                </div>
                {err('consent') && (
                  <p role="alert" className="text-destructive text-xs font-medium">
                    {err('consent')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {submitError && (
          <Alert variant="destructive" role="alert" className="mt-5">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => go(step - 1)} disabled={submit.isPending}>
              <ArrowLeft className="size-4" aria-hidden /> {t('form.back')}
            </Button>
          ) : (
            <Link href="/apply" className={buttonVariants({ variant: 'ghost' })}>
              <ArrowLeft className="size-4" aria-hidden /> {t('form.cancel')}
            </Link>
          )}
          {step < 3 ? (
            <Button
              type="submit"
              size="lg"
              className="h-11 bg-[var(--ap-orange)] px-6 text-white hover:bg-[var(--ap-orange)]/90"
            >
              {t('form.next')} <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              disabled={submit.isPending}
              className="h-11 bg-[var(--ap-orange)] px-6 text-white hover:bg-[var(--ap-orange)]/90"
            >
              {submit.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              {submit.isPending ? t('form.sending') : t('form.submit')}
            </Button>
          )}
        </div>
      </form>
      <p className="text-muted-foreground mt-4 text-center text-xs">{t('form.draftNote')}</p>
    </div>
  );
}

function StepTitle({ title, body }: { title: string; body: string }) {
  return (
    <div className="sm:col-span-2">
      <h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mt-1 text-sm text-pretty">{body}</p>
    </div>
  );
}

function ReviewBlock({
  title,
  rows,
  onEdit,
  editLabel,
}: {
  title: string;
  rows: (string | undefined)[][];
  onEdit: () => void;
  editLabel: string;
}) {
  const shown = rows.filter((r) => r[1]);
  return (
    <section className="rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          {editLabel}
        </Button>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
        {shown.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
