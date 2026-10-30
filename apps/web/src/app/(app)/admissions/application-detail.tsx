'use client';

import { ADMISSION_TRANSITIONS, type AdmissionStatus } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, GraduationCap, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { formatDateTime, STATUS_STYLE, StatusChip, sizeLabel } from './shared';

/** Peralihan sah (kontrak). Nama canTransition bentrok dengan modul PKL di ekspor kontrak, jadi dihitung dari tabelnya. */
const canMove = (from: AdmissionStatus, to: AdmissionStatus) =>
  ADMISSION_TRANSITIONS[from]?.includes(to) ?? false;

/** Tujuan peralihan yang dapat dipilih admin (daftar ulang punya jalur sendiri). */
const TARGETS = ['verified', 'accepted', 'rejected', 'withdrawn'] as const;

/** Catatan opsional untuk keputusan; memakai textarea gaya bidang isian. */
export function NoteField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations('admissions');
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t('note')}</Label>
      <textarea
        id={id}
        rows={3}
        maxLength={500}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('notePlaceholder')}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3"
      />
    </div>
  );
}

function base64ToBlobUrl(base64: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium break-words">{value || '-'}</dd>
    </div>
  );
}

/** Panel geser berisi detail pendaftar: data, dokumen, linimasa status, dan tindakan. */
export function ApplicationDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations('admissions');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('admission:manage');

  const detail = useQuery({
    queryKey: ['admissions', school.schoolId, 'application', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/admissions/applications/{id}', {
          params: { ...header, path: { id: id as string } },
        }),
      ),
  });
  const periods = useQuery({
    queryKey: ['admissions', school.schoolId, 'periods'],
    enabled: !!id,
    queryFn: async () => unwrap(await api.GET('/v1/admissions/periods', { params: header })),
  });
  const a = detail.data;
  const period = periods.data?.find((p) => p.id === a?.periodId);

  const [preview, setPreview] = useState<{ docId: string; url: string; mime: string; name: string } | null>(
    null,
  );
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [target, setTarget] = useState<(typeof TARGETS)[number] | null>(null);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [classId, setClassId] = useState('');

  // Pratinjau milik pendaftar sebelumnya dibuang saat panel pindah atau ditutup.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bereaksi pada pergantian pendaftar
  useEffect(() => {
    setPreview(null);
  }, [id]);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: enrollOpen,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const activeYear = years.data?.find((y) => y.isActive);
  const classes = useQuery({
    queryKey: ['classes', school.schoolId, activeYear?.id],
    enabled: enrollOpen && !!activeYear,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/classes', { params: { ...header, query: { academicYearId: activeYear?.id } } }),
      ),
  });
  const sameLevel = (classes.data ?? []).filter((c) => !period || c.level === period.level);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admissions', school.schoolId] });

  const changeStatus = useMutation({
    mutationFn: async (to: (typeof TARGETS)[number]) =>
      unwrap(
        await api.POST('/v1/admissions/applications/{id}/status', {
          params: { ...header, path: { id: id as string } },
          body: { to, note: note.trim() || null },
        }),
      ),
    onSuccess: () => {
      toast.success(t('statusChanged'));
      refresh();
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  const enroll = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/admissions/applications/{id}/enroll', {
          params: { ...header, path: { id: id as string } },
          body: { classId: classId || null },
        }),
      ),
    onSuccess: () => {
      toast.success(t('enrolledDone'));
      refresh();
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  async function openDoc(docId: string) {
    if (preview?.docId === docId) {
      setPreview(null);
      return;
    }
    setLoadingDoc(docId);
    try {
      const d = unwrap(
        await api.GET('/v1/admissions/applications/{id}/documents/{docId}', {
          params: { ...header, path: { id: id as string, docId } },
        }),
      );
      setPreview({ docId, url: base64ToBlobUrl(d.dataBase64, d.mime), mime: d.mime, name: d.fileName });
    } catch (e) {
      toast.error(te(errorKey(e)));
    } finally {
      setLoadingDoc(null);
    }
  }

  const available = a ? TARGETS.filter((to) => canMove(a.status as AdmissionStatus, to)) : [];
  const canEnroll = !!a && manage && a.status === 'accepted';

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="fixed top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 content-start gap-0 overflow-y-auto rounded-none p-0 data-open:zoom-in-100 data-open:slide-in-from-right-12 sm:max-w-xl"
      >
        <DialogHeader className="bg-card sticky top-0 z-10 flex-row items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <DialogTitle className="font-heading truncate text-lg">
              {a?.fullName ?? t('detailTitle')}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              {a ? (
                <>
                  <span className="font-mono text-xs">{a.regNumber}</span>
                  <StatusChip status={a.status as AdmissionStatus} />
                </>
              ) : (
                t('detailTitle')
              )}
            </DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label={t('close')} onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </DialogHeader>

        {detail.isPending && (
          <div className="grid gap-3 p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {detail.isError && (
          <div className="p-4">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{te(errorKey(detail.error))}</AlertDescription>
            </Alert>
          </div>
        )}

        {a && (
          <div className="grid gap-6 p-4">
            {a.studentId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-500/15 dark:text-teal-100">
                <span className="flex items-center gap-2 font-medium">
                  <GraduationCap className="size-4" aria-hidden /> {t('studentCreated')}
                </span>
                <Link href="/students" className="font-medium underline underline-offset-4">
                  {t('openStudents')}
                </Link>
              </div>
            )}

            {a.decisionNote && (
              <blockquote className="bg-muted/60 rounded-xl border-l-4 border-amber-500 p-3 text-sm">
                <span className="text-muted-foreground block text-xs font-medium uppercase">
                  {t('decisionNote')}
                </span>
                {a.decisionNote}
              </blockquote>
            )}

            <section>
              <h3 className="font-heading mb-2 text-sm font-semibold">{t('sectionStudent')}</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label={t('period')} value={a.periodName} />
                <Info label={t('gender')} value={t(`genderLabel.${a.gender}`)} />
                <Info
                  label={t('birth')}
                  value={[a.birthPlace, formatCalendarDate(locale, a.birthDate)].filter(Boolean).join(', ')}
                />
                <Info label={t('nisn')} value={a.nisn} />
                <Info label={t('previousSchool')} value={a.previousSchool} />
                <Info label={t('program')} value={a.programName} />
                <div className="sm:col-span-2">
                  <Info label={t('address')} value={a.address} />
                </div>
              </dl>
            </section>

            <section>
              <h3 className="font-heading mb-2 text-sm font-semibold">{t('sectionGuardian')}</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label={t('guardianName')} value={a.guardianName} />
                <Info label={t('guardianPhone')} value={a.guardianPhone} />
                <Info label={t('guardianEmail')} value={a.guardianEmail} />
              </dl>
            </section>

            <section>
              <h3 className="font-heading mb-2 text-sm font-semibold">
                {t('sectionDocuments')}{' '}
                <span className="text-muted-foreground font-normal">({a.documents.length})</span>
              </h3>
              {a.documents.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('noDocuments')}</p>
              ) : (
                <ul className="grid gap-2">
                  {a.documents.map((d) => (
                    <li key={d.id} className="rounded-xl border">
                      <div className="flex items-center gap-3 p-2.5">
                        <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                          <FileText className="text-muted-foreground size-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{t(`docKind.${d.kind}`)}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {d.fileName} ·{' '}
                            {d.mime === 'application/pdf'
                              ? 'PDF'
                              : d.mime.replace('image/', '').toUpperCase()}{' '}
                            · {sizeLabel(d.size)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loadingDoc === d.id}
                          onClick={() => openDoc(d.id)}
                        >
                          {loadingDoc === d.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Eye className="size-4" aria-hidden />
                          )}
                          {preview?.docId === d.id ? t('hidePreview') : t('preview')}
                        </Button>
                      </div>
                      {preview?.docId === d.id && (
                        <div className="bg-muted/40 border-t p-2">
                          {preview.mime === 'application/pdf' ? (
                            <iframe
                              title={preview.name}
                              src={preview.url}
                              className="h-96 w-full rounded-lg bg-white"
                            />
                          ) : (
                            // biome-ignore lint/performance/noImgElement: pratinjau dari blob lokal
                            <img
                              src={preview.url}
                              alt={preview.name}
                              className="mx-auto max-h-96 rounded-lg object-contain"
                            />
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="font-heading mb-3 text-sm font-semibold">{t('sectionLog')}</h3>
              <ol className="grid gap-0">
                {a.log.map((l, i) => (
                  <li key={l.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'mt-1 size-3 shrink-0 rounded-full ring-4 ring-background',
                          STATUS_STYLE[l.toStatus as AdmissionStatus]?.dot ?? 'bg-slate-400',
                        )}
                      />
                      {i < a.log.length - 1 && <span aria-hidden className="bg-border my-1 w-0.5 flex-1" />}
                    </div>
                    <div className={cn('min-w-0 pb-4', i === a.log.length - 1 && 'pb-0')}>
                      <p className="text-sm font-medium">
                        {t(`status.${l.toStatus as AdmissionStatus}`)}
                        {l.fromStatus === null && (
                          <span className="text-muted-foreground font-normal"> · {t('logCreated')}</span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">{formatDateTime(locale, l.createdAt)}</p>
                      {l.note && <p className="mt-0.5 text-sm text-pretty">{l.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {manage && (available.length > 0 || canEnroll) && (
              <section className="bg-card sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-2 border-t p-4">
                {available.map((to) => (
                  <Button
                    key={to}
                    type="button"
                    variant={to === 'rejected' || to === 'withdrawn' ? 'outline' : 'default'}
                    className={cn(to === 'rejected' && 'text-destructive')}
                    onClick={() => {
                      setNote('');
                      setFormError(null);
                      setTarget(to);
                    }}
                  >
                    {t(`action.${to === 'verified' && a.status === 'rejected' ? 'reopen' : to}`)}
                  </Button>
                ))}
                {canEnroll && (
                  <Button
                    type="button"
                    className="ml-auto bg-teal-600 text-white hover:bg-teal-700"
                    onClick={() => {
                      setClassId('');
                      setFormError(null);
                      setEnrollOpen(true);
                    }}
                  >
                    <GraduationCap className="size-4" aria-hidden /> {t('enroll')}
                  </Button>
                )}
              </section>
            )}
          </div>
        )}

        {/* Dialog keputusan: catatan opsional, terlihat pendaftar untuk diterima/ditolak. */}
        <FormDialog
          open={target !== null}
          onOpenChange={(o) => !o && setTarget(null)}
          title={target ? t(`confirmTitle.${target}`) : ''}
          description={target === 'accepted' || target === 'rejected' ? t('noteVisible') : undefined}
          submitLabel={target ? t(`action.${target}`) : t('save')}
          error={formError}
          onSubmit={async () => {
            if (target) await changeStatus.mutateAsync(target);
          }}
        >
          <NoteField id="decision-note" value={note} onChange={setNote} />
        </FormDialog>

        <FormDialog
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          title={t('enrollTitle')}
          description={t('enrollBody')}
          submitLabel={t('enroll')}
          error={formError}
          onSubmit={() => enroll.mutateAsync()}
        >
          <div className="grid gap-2">
            <Label htmlFor="enroll-class">{t('class')}</Label>
            <SelectField id="enroll-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('noClass')}</option>
              {sameLevel.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <p className="text-muted-foreground text-xs">
              {years.isPending || classes.isPending
                ? t('classesLoading')
                : sameLevel.length === 0
                  ? t('noClassesForLevel', { level: period?.level ?? '' })
                  : t('classHint', { level: period?.level ?? '' })}
            </p>
          </div>
        </FormDialog>
      </DialogContent>
    </Dialog>
  );
}
