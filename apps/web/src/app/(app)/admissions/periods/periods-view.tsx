'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Copy, ExternalLink, Pencil, Plus, Printer, Trash2, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StudentIllustration } from '@/app/apply/illustrations';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import '@/app/apply/apply.css';

interface Draft {
  name: string;
  level: string;
  academicYearId: string;
  opensOn: string;
  closesOn: string;
  quota: string;
  active: boolean;
}

const EMPTY: Draft = {
  name: '',
  level: '',
  academicYearId: '',
  opensOn: '',
  closesOn: '',
  quota: '',
  active: true,
};

const todayJakarta = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

/** Posisi hari ini pada rentang buka-tutup, 0-100. */
function windowProgress(opensOn: string, closesOn: string, today: string) {
  const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const span = ms(closesOn) - ms(opensOn);
  if (today <= opensOn) return 0;
  if (today >= closesOn || span <= 0) return 100;
  return Math.round(((ms(today) - ms(opensOn)) / span) * 100);
}

function PeriodFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const t = useTranslations('admissions');
  const tm = useTranslations('masterData');
  const { school } = useSchool();
  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    queryFn: async () =>
      unwrap(await api.GET('/v1/academic-years', { params: { header: schoolHeader(school.schoolId) } })),
  });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          maxLength={120}
          placeholder={t('periodNamePlaceholder')}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-level`}>{t('level')}</Label>
        <Input
          id={`${idPrefix}-level`}
          required
          maxLength={30}
          placeholder="7"
          value={draft.level}
          onChange={(e) => onChange({ ...draft, level: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-year`}>{t('academicYear')}</Label>
        <SelectField
          id={`${idPrefix}-year`}
          value={draft.academicYearId}
          onChange={(e) => onChange({ ...draft, academicYearId: e.target.value })}
        >
          <option value="">{t('chooseYear')}</option>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-opens`}>{t('opensOn')}</Label>
        <DatePicker
          id={`${idPrefix}-opens`}
          value={draft.opensOn}
          onChange={(v) => onChange({ ...draft, opensOn: v })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-closes`}>{t('closesOn')}</Label>
        <DatePicker
          id={`${idPrefix}-closes`}
          value={draft.closesOn}
          onChange={(v) => onChange({ ...draft, closesOn: v })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-quota`}>{t('quota')}</Label>
        <Input
          id={`${idPrefix}-quota`}
          inputMode="numeric"
          placeholder={t('quotaPlaceholder')}
          value={draft.quota}
          onChange={(e) => onChange({ ...draft, quota: e.target.value.replace(/\D/g, '') })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-active`}>{t('colStatus')}</Label>
        <SelectField
          id={`${idPrefix}-active`}
          value={draft.active ? 'active' : 'inactive'}
          onChange={(e) => onChange({ ...draft, active: e.target.value === 'active' })}
        >
          <option value="active">{t('periodActive')}</option>
          <option value="inactive">{t('periodInactive')}</option>
        </SelectField>
      </div>
    </div>
  );
}

const toBody = (d: Draft) => ({
  name: d.name.trim(),
  level: d.level.trim(),
  academicYearId: d.academicYearId,
  opensOn: d.opensOn,
  closesOn: d.closesOn,
  quota: d.quota ? Number(d.quota) : null,
  active: d.active,
});

const complete = (d: Draft) =>
  !!(d.name.trim() && d.level.trim() && d.academicYearId && d.opensOn && d.closesOn);

export function PeriodsView() {
  const t = useTranslations('admissions');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('admission:manage');

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [today, setToday] = useState('');

  const link = origin ? `${origin}/apply` : '';
  useEffect(() => {
    setOrigin(window.location.origin);
    setToday(todayJakarta());
  }, []);
  useEffect(() => {
    if (!link) return;
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: 640, color: { dark: '#0f3d3a', light: '#ffffff' } })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(''));
    return () => {
      alive = false;
    };
  }, [link]);

  const list = useQuery({
    queryKey: ['admissions', school.schoolId, 'periods'],
    queryFn: async () => unwrap(await api.GET('/v1/admissions/periods', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admissions', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/admissions/periods', { params: header, body: toBody(draft) })),
    onSuccess: () => {
      toast.success(t('periodCreated'));
      setDraft(EMPTY);
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const save = useMutation({
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/admissions/periods/{id}', {
          params: { ...header, path: { id: v.id } },
          body: toBody(v),
        }),
      ),
    onSuccess: () => {
      toast.success(t('periodSaved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/admissions/periods/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('periodDeleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t('linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  const periods = list.data ?? [];
  const openNow = periods.filter((p) => p.open);

  return (
    <PageBody>
      <PageHeader
        title={t('periodsTitle')}
        description={manage ? t('periodsSubtitle') : `${t('periodsSubtitle')} ${t('readOnly')}`}
        actions={
          manage && (
            <FormDialog
              size="wide"
              trigger={
                <Button>
                  <Plus className="size-4" aria-hidden /> {t('addPeriod')}
                </Button>
              }
              title={t('addPeriod')}
              submitLabel={t('add')}
              disabled={!complete(draft)}
              error={error}
              onOpenChange={() => {
                setDraft(EMPTY);
                setError(null);
              }}
              onSubmit={() => create.mutateAsync()}
            >
              <PeriodFields idPrefix="new" draft={draft} onChange={setDraft} />
            </FormDialog>
          )
        }
      />

      {/* Tautan pendaftaran publik */}
      <section
        aria-label={t('publicLink')}
        className="apply-root ap-hero-bg grid items-center gap-5 overflow-hidden rounded-2xl border p-5 sm:grid-cols-[1fr_auto] sm:p-6"
      >
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold">{t('publicLink')}</h2>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm text-pretty">{t('publicLinkBody')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="bg-background min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-sm sm:flex-none">
              {link || '…'}
            </code>
            <Button type="button" variant="outline" disabled={!link} onClick={copyLink}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? t('copied') : t('copy')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!link}
              nativeButton={false}
              render={<a href="/apply" target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="size-4" aria-hidden /> {t('openLink')}
            </Button>
            <Button type="button" disabled={!qr} onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> {t('printPoster')}
            </Button>
          </div>
        </div>
        {qr && (
          // biome-ignore lint/performance/noImgElement: kode QR dibuat di klien sebagai data URL
          <img
            src={qr}
            alt={t('qrAlt')}
            className="mx-auto size-36 rounded-xl border bg-white p-1.5 shadow-sm"
          />
        )}
      </section>

      {list.isPending && (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      )}
      {list.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}

      {list.isSuccess && periods.length === 0 && (
        <div className="apply-root bg-card flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
          <StudentIllustration className="w-36" />
          <h2 className="font-heading text-lg font-semibold">{t('emptyNoPeriodTitle')}</h2>
          <p className="text-muted-foreground max-w-md text-sm text-pretty">{t('emptyNoPeriodBody')}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {periods.map((p) => {
          const progress = today ? windowProgress(p.opensOn, p.closesOn, today) : 0;
          const phase = !today
            ? 'upcoming'
            : today < p.opensOn
              ? 'upcoming'
              : today > p.closesOn
                ? 'ended'
                : 'running';
          const quotaPct = p.quota ? Math.min(100, Math.round((p.quotaUsed / p.quota) * 100)) : 0;
          return (
            <article
              key={p.id}
              className={cn(
                'bg-card relative overflow-hidden rounded-2xl border p-5',
                p.open && 'border-emerald-500/40 shadow-sm',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute inset-y-0 left-0 w-1.5',
                  p.open ? 'bg-emerald-500' : p.active ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600',
                )}
              />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-heading truncate text-lg font-semibold">{p.name}</h3>
                  <p className="text-muted-foreground text-sm">
                    {t('levelLabel', { level: p.level })} · {p.academicYearName}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {p.open ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                      {t('phaseOpen')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{p.active ? t(`phase.${phase}`) : t('periodInactive')}</Badge>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="size-3.5" aria-hidden /> {formatCalendarDate(locale, p.opensOn)}
                  </span>
                  <span>{formatCalendarDate(locale, p.closesOn)}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t('windowProgress')}
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="bg-muted relative mt-1.5 h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="h-full rounded-full bg-[var(--ap-orange,#f08a2e)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Users className="size-3.5" aria-hidden /> {t('applicants')}
                  </p>
                  <p className="font-heading text-xl font-semibold tabular-nums">{p.applicationCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t('quotaUsed')}</p>
                  <p className="font-heading text-xl font-semibold tabular-nums">
                    {p.quota ? `${p.quotaUsed} / ${p.quota}` : t('quotaUnlimited')}
                  </p>
                </div>
              </div>
              {p.quota ? (
                <div
                  role="progressbar"
                  aria-label={t('quotaUsed')}
                  aria-valuenow={quotaPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="bg-muted mt-2 h-2 overflow-hidden rounded-full"
                >
                  <div
                    className={cn(
                      'h-full rounded-full',
                      quotaPct >= 100 ? 'bg-rose-500' : quotaPct >= 85 ? 'bg-amber-500' : 'bg-emerald-500',
                    )}
                    style={{ width: `${quotaPct}%` }}
                  />
                </div>
              ) : null}

              {manage && (
                <div className="mt-4 flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('editPeriod', { name: p.name })}
                    onClick={() => {
                      setError(null);
                      setEditing({
                        id: p.id,
                        name: p.name,
                        level: p.level,
                        academicYearId: p.academicYearId,
                        opensOn: p.opensOn,
                        closesOn: p.closesOn,
                        quota: p.quota ? String(p.quota) : '',
                        active: p.active,
                      });
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('deletePeriod', { name: p.name })}
                    onClick={() => setDeleting(p.id)}
                  >
                    <Trash2 className="text-destructive size-4" aria-hidden />
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {editing && (
        <FormDialog
          size="wide"
          open
          title={t('editPeriodTitle')}
          submitLabel={t('save')}
          disabled={!complete(editing)}
          error={error}
          onOpenChange={(o) => !o && setEditing(null)}
          onSubmit={() => save.mutateAsync(editing)}
        >
          <PeriodFields idPrefix="edit" draft={editing} onChange={(d) => setEditing({ ...editing, ...d })} />
        </FormDialog>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={t('deleteConfirm')}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting);
        }}
      />

      {/* Poster A4 sederhana: hanya tampil saat dicetak. */}
      <div
        className="print-area hidden text-center print:block"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        <p style={{ fontSize: '14pt', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c2610f' }}>
          {t('posterKicker')}
        </p>
        <h1 style={{ fontSize: '34pt', fontWeight: 800, marginTop: '4mm', lineHeight: 1.1 }}>
          {t('posterTitle')}
        </h1>
        <h2 style={{ fontSize: '24pt', fontWeight: 600, marginTop: '4mm', color: '#0f3d3a' }}>
          {school.schoolName}
        </h2>
        {qr && (
          // biome-ignore lint/performance/noImgElement: kode QR untuk poster cetak
          <img src={qr} alt="" style={{ width: '110mm', height: '110mm', margin: '12mm auto 6mm' }} />
        )}
        <p style={{ fontSize: '16pt', fontWeight: 600 }}>{t('posterScan')}</p>
        <p style={{ fontSize: '15pt', fontFamily: 'monospace', marginTop: '3mm' }}>{link}</p>
        {openNow.length > 0 && (
          <p style={{ fontSize: '13pt', marginTop: '10mm' }}>
            {openNow
              .map(
                (p) =>
                  `${p.name} (${formatCalendarDate(locale, p.opensOn)} – ${formatCalendarDate(locale, p.closesOn)})`,
              )
              .join(' · ')}
          </p>
        )}
      </div>
    </PageBody>
  );
}
