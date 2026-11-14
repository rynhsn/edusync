'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Lock, LockOpen, Pencil, Printer, Save, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard, StatGrid, type Tone, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import {
  linkableStudents,
  linkChanged,
  linkedTo,
  type MeetingDetail,
  type MeetingKind,
  type MinutesLabels,
  minutesPrintHtml,
  suggestRetained,
} from '@/lib/council-meeting';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { useRefreshMinutes } from './minutes-form';

export const KIND_TONE: Record<MeetingKind, Tone> = {
  promotion: 'emerald',
  graduation: 'violet',
  other: 'slate',
};

/** Cetak lewat iframe tersembunyi (tanpa jendela baru yang dapat diblokir); pengguna dapat memilih "Simpan sebagai PDF". */
function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px] font-medium uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

/** Pilih murid yang keputusannya dibahas di berita acara ini (hanya draf, hanya pemegang promotion:manage). */
function LinkPicker({ meeting }: { meeting: MeetingDetail }) {
  const t = useTranslations('minutes');
  const tp = useTranslations('promotion');
  const te = useTranslations();
  const { school } = useSchool();
  const refresh = useRefreshMinutes();
  const header = { header: schoolHeader(school.schoolId) };
  const q = useQuery({
    queryKey: ['promotions', school.schoolId, meeting.academicYearId, 'minutes-link'],
    refetchOnWindowFocus: false,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/academic-years/{id}/promotions', {
          params: { ...header, path: { id: meeting.academicYearId } },
        }),
      ),
  });
  const list = q.data ? linkableStudents(q.data) : [];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loadedFor, setLoadedFor] = useState('');
  // Himpunan awal = yang sudah tertaut; dimuat ulang setelah data segar atau berita acara lain.
  useEffect(() => {
    if (q.data) {
      const key = `${meeting.id}:${q.dataUpdatedAt}`;
      if (key !== loadedFor) {
        setLoadedFor(key);
        setPicked(linkedTo(linkableStudents(q.data), meeting.id));
      }
    }
  }, [q.data, q.dataUpdatedAt, meeting.id, loadedFor]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/council-meetings/{id}/decisions', {
          params: { ...header, path: { id: meeting.id } },
          body: { studentIds: [...picked] },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('linkSaved', { linked: r.linked, unlinked: r.unlinked }));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const label = {
    promote: tp('decisionPromote'),
    retain: tp('decisionRetain'),
    graduate: tp('decisionGraduate'),
  } as const;
  const tone = { promote: 'emerald', retain: 'amber', graduate: 'violet' } as const;
  const changed = linkChanged(list, meeting.id, picked);

  return (
    <section className="grid gap-2 border-t pt-4" aria-labelledby="minutes-link-title">
      <h3 id="minutes-link-title" className="font-heading text-sm font-semibold">
        {t('linkTitle')}
      </h3>
      <p className="text-muted-foreground text-xs">{t('linkHint')}</p>
      {q.isPending && <Skeleton className="h-24 w-full rounded-xl" />}
      {q.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(q.error))}</AlertDescription>
        </Alert>
      )}
      {q.data && list.length === 0 && <p className="text-muted-foreground text-sm">{t('linkEmpty')}</p>}
      {list.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-8"
              onClick={() => setPicked(suggestRetained(list, meeting.id))}
            >
              {t('linkSuggest')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 md:h-8"
              onClick={() => setPicked(new Set())}
            >
              {t('linkClear')}
            </Button>
          </div>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
            {list.map((s) => {
              const other = s.meetingId !== null && s.meetingId !== meeting.id;
              const id = `link-${s.studentId}`;
              return (
                <li key={s.studentId}>
                  <label
                    htmlFor={id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={picked.has(s.studentId)}
                      onCheckedChange={(v) =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (v === true) next.add(s.studentId);
                          else next.delete(s.studentId);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {s.className}
                        {other && ` · ${t('linkedElsewhere')}`}
                      </span>
                    </span>
                    <ToneBadge tone={tone[s.decision]} dot={false}>
                      {label[s.decision]}
                    </ToneBadge>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs tabular-nums">
              {t('linkPicked', { count: picked.size })}
            </p>
            <Button
              type="button"
              className="h-11 md:h-8"
              disabled={!changed || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save className="size-4" aria-hidden /> {save.isPending ? t('saving') : t('linkSave')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** Detail berita acara: isi, peserta, rekap keputusan, penautan murid, cetak, finalisasi, buka kembali, hapus. */
export function MinutesDetailDialog({
  id,
  yearName,
  onClose,
  onEdit,
}: {
  id: string | null;
  yearName: string;
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  const t = useTranslations('minutes');
  const tp = useTranslations('promotion');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const refresh = useRefreshMinutes();
  const manage = can('promotion:manage');
  const show = (iso: string) => formatCalendarDate(locale, iso);
  const [confirm, setConfirm] = useState<'finalize' | 'reopen' | 'delete' | null>(null);

  const q = useQuery({
    queryKey: ['council-meetings', school.schoolId, 'detail', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/council-meetings/{id}', { params: { ...header, path: { id: id as string } } }),
      ),
  });
  const d = q.data;
  const draft = d?.status === 'draft';

  const act = useMutation({
    mutationFn: async (kind: 'finalize' | 'reopen' | 'delete') => {
      const params = { ...header, path: { id: id as string } };
      if (kind === 'finalize')
        return unwrap(await api.POST('/v1/council-meetings/{id}/finalize', { params }));
      if (kind === 'reopen') return unwrap(await api.POST('/v1/council-meetings/{id}/reopen', { params }));
      return unwrap(await api.DELETE('/v1/council-meetings/{id}', { params }));
    },
    onSuccess: (_r, kind) => {
      toast.success(t(kind === 'finalize' ? 'finalized' : kind === 'reopen' ? 'reopened' : 'deleted'));
      refresh();
      if (kind === 'delete') onClose();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function print() {
    if (!d) return;
    const labels: MinutesLabels = {
      title: t('printTitle'),
      kind: t('fieldKind'),
      heldOn: t('fieldHeldOn'),
      location: t('fieldLocation'),
      class: t('fieldClass'),
      allClasses: t('allClasses'),
      agenda: t('fieldAgenda'),
      attendees: t('attendeesTitle'),
      colNo: t('colNo'),
      colName: t('attendeeNameShort'),
      colPosition: t('attendeePositionShort'),
      colRole: t('attendeeRoleShort'),
      colSignature: t('colSignature'),
      roles: { chair: t('roles.chair'), secretary: t('roles.secretary'), member: t('roles.member') },
      decisionsTitle: t('digestTitle'),
      colClass: t('colClassName'),
      colPromote: tp('decisionPromote'),
      colRetain: tp('decisionRetain'),
      colGraduate: tp('decisionGraduate'),
      colTotal: t('colTotal'),
      retainedTitle: t('retainedTitle'),
      colStudent: t('colStudent'),
      colReason: t('colReason'),
      colFollowUp: t('colFollowUp'),
      noRetained: t('noRetained'),
      summary: t('fieldSummary'),
      chair: t('signChair'),
      secretary: t('signSecretary'),
      draftNote: t('printDraftNote'),
      printedOn: t('printedOn'),
      none: tm('none'),
    };
    printHtml(
      minutesPrintHtml(d, labels, {
        schoolName: school.schoolName,
        yearName,
        kindName: t(`kinds.${d.kind}`),
        heldOnText: show(d.heldOn),
        printedOn: show(new Date().toISOString().slice(0, 10)),
      }),
    );
  }

  const confirmCopy = {
    finalize: {
      title: t('finalizeTitle'),
      body: t('finalizeBody'),
      label: t('finalize'),
      destructive: false,
    },
    reopen: { title: t('reopenTitle'), body: t('reopenBody'), label: t('reopen'), destructive: false },
    delete: { title: t('deleteTitle'), body: t('deleteBody'), label: t('delete'), destructive: true },
  } as const;
  const copy = confirm ? confirmCopy[confirm] : null;

  return (
    <>
      <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{d ? d.title : t('detailTitle')}</DialogTitle>
            <DialogDescription>{d ? `${t(`kinds.${d.kind}`)} · ${show(d.heldOn)}` : ' '}</DialogDescription>
          </DialogHeader>
          {q.isPending && id && <Skeleton className="h-48 w-full rounded-xl" />}
          {q.isError && (
            <Alert variant="destructive">
              <AlertDescription>{tm('loadError')}</AlertDescription>
            </Alert>
          )}
          {d && (
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={KIND_TONE[d.kind]}>{t(`kinds.${d.kind}`)}</ToneBadge>
                <ToneBadge tone={draft ? 'amber' : 'emerald'}>
                  {!draft && <Lock aria-hidden className="size-3" />}
                  {draft ? t('statusDraft') : t('statusFinal')}
                </ToneBadge>
              </div>
              {!draft && (
                <Alert>
                  <AlertDescription>{t('lockedNote')}</AlertDescription>
                </Alert>
              )}

              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Item label={t('fieldClass')}>{d.className ?? t('allClasses')}</Item>
                <Item label={t('fieldLocation')}>{d.location ?? tm('none')}</Item>
                <Item label={t('fieldChair')}>{d.chairName ?? tm('none')}</Item>
                <Item label={t('fieldSecretary')}>{d.secretaryName ?? tm('none')}</Item>
                {d.agenda && (
                  <div className="sm:col-span-2">
                    <Item label={t('fieldAgenda')}>{d.agenda}</Item>
                  </div>
                )}
                {d.summary && (
                  <div className="sm:col-span-2">
                    <Item label={t('fieldSummary')}>{d.summary}</Item>
                  </div>
                )}
              </dl>

              <section className="grid gap-2 border-t pt-4" aria-labelledby="minutes-att-title">
                <h3 id="minutes-att-title" className="font-heading text-sm font-semibold">
                  {t('attendeesTitle')}
                </h3>
                {d.attendees.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('noAttendees')}</p>
                ) : (
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {d.attendees.map((a, i) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: daftar peserta statis, tanpa id
                        key={`${a.name}-${i}`}
                        className="rounded-lg border px-3 py-1.5 text-sm"
                      >
                        <span className="font-medium">{a.name}</span>
                        <span className="text-muted-foreground block text-xs">
                          {t(`roles.${a.role}`)}
                          {a.positionTitle ? ` · ${a.positionTitle}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="grid gap-3 border-t pt-4" aria-labelledby="minutes-digest-title">
                <h3 id="minutes-digest-title" className="font-heading text-sm font-semibold">
                  {t('digestTitle')}
                </h3>
                <p className="text-muted-foreground text-xs">{d.frozen ? t('frozenNote') : t('liveNote')}</p>
                {d.digest.totals.total === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('noLinked')}</p>
                ) : (
                  <>
                    <StatGrid>
                      <StatCard
                        tone="emerald"
                        label={tp('decisionPromote')}
                        value={d.digest.totals.promote}
                      />
                      <StatCard tone="amber" label={tp('decisionRetain')} value={d.digest.totals.retain} />
                      <StatCard
                        tone="violet"
                        label={tp('decisionGraduate')}
                        value={d.digest.totals.graduate}
                      />
                    </StatGrid>
                    <ul className="grid gap-1.5">
                      {d.digest.classes.map((c) => (
                        <li
                          key={c.classId}
                          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {tp('decisionPromote')} {c.promote} · {tp('decisionRetain')} {c.retain} ·{' '}
                            {tp('decisionGraduate')} {c.graduate}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h4 className="text-sm font-medium">{t('retainedTitle')}</h4>
                {d.digest.retained.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('noRetained')}</p>
                ) : (
                  <ul className="grid gap-2">
                    {d.digest.retained.map((r) => (
                      <li key={r.studentId} className="rounded-xl border p-3 text-sm">
                        <p className="font-medium">
                          {r.name} <span className="text-muted-foreground font-normal">· {r.className}</span>
                        </p>
                        <p className={cn('mt-1 break-words', !r.reason && 'text-muted-foreground')}>
                          <span className="text-muted-foreground text-xs">{t('colReason')}: </span>
                          {r.reason ?? tm('none')}
                        </p>
                        <p className={cn('break-words', !r.followUp && 'text-muted-foreground')}>
                          <span className="text-muted-foreground text-xs">{t('colFollowUp')}: </span>
                          {r.followUp ?? tm('none')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {manage && draft && <LinkPicker meeting={d} />}

              <div
                className={cn(
                  '-mx-4 -mb-4 flex flex-wrap justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4',
                  'max-sm:sticky max-sm:-bottom-4 max-sm:z-10 max-sm:[&>*]:flex-1',
                )}
              >
                <Button type="button" variant="outline" className="h-11 md:h-8" onClick={print}>
                  <Printer className="size-4" aria-hidden /> {t('print')}
                </Button>
                {manage && draft && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-8"
                    onClick={() => onEdit(d.id)}
                  >
                    <Pencil className="size-4" aria-hidden /> {t('edit')}
                  </Button>
                )}
                {manage && draft && (
                  <Button type="button" className="h-11 md:h-8" onClick={() => setConfirm('finalize')}>
                    <Lock className="size-4" aria-hidden /> {t('finalize')}
                  </Button>
                )}
                {manage && !draft && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-8"
                    onClick={() => setConfirm('reopen')}
                  >
                    <LockOpen className="size-4" aria-hidden /> {t('reopen')}
                  </Button>
                )}
                {manage && draft && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive h-11 md:h-8"
                    onClick={() => setConfirm('delete')}
                  >
                    <Trash2 className="size-4" aria-hidden /> {t('delete')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={copy?.title ?? ''}
        description={copy?.body ?? ''}
        confirmLabel={copy?.label ?? ''}
        destructive={copy?.destructive ?? false}
        pending={act.isPending}
        onConfirm={async () => {
          if (confirm) await act.mutateAsync(confirm);
        }}
      />
    </>
  );
}
