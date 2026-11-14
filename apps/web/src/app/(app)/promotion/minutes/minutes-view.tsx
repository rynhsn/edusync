'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, FilePlus2, FileSignature, Lock, Pencil, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { DataRows, ListSkeleton, RowMenu } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, MODULE_TONE, ToneBadge, Toolbar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { MeetingListItem } from '@/lib/council-meeting';
import { formatCalendarDate } from '@/lib/format-date';
import { KIND_TONE, MinutesDetailDialog } from './minutes-detail';
import { MeetingFormDialog } from './minutes-form';

/** Daftar berita acara musyawarah dewan pendidik per tahun ajaran, dengan buat, ubah, cetak, finalisasi, dan hapus. */
export function MinutesView() {
  const t = useTranslations('minutes');
  const tm = useTranslations('masterData');
  const tp = useTranslations('promotion');
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const readable = can('report_card:read_all');
  const manage = can('promotion:manage');
  const show = (iso: string) => formatCalendarDate(locale, iso);

  const [yearChoice, setYearChoice] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; id: string | null } | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: readable,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });
  const list = years.data ?? [];
  const year = list.find((y) => y.id === yearChoice) ?? list.find((y) => y.isActive) ?? list[0];
  const yearId = year?.id ?? '';

  const meetings = useQuery({
    queryKey: ['council-meetings', school.schoolId, yearId],
    enabled: readable && !!yearId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/council-meetings', { params: { ...header, query: { academicYearId: yearId } } }),
      ),
  });
  const items = meetings.data?.items ?? [];

  if (!readable) {
    return (
      <PageBody>
        <PageHeader
          icon={FileSignature}
          tone={MODULE_TONE.academic}
          title={t('title')}
          description={t('subtitle')}
          actions={<BackLink href="/promotion" label={t('backToPromotion')} />}
        />
        <EmptyPanel icon={ShieldCheck} tone="slate" title={t('noAccess')} body={t('noAccessBody')} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        icon={FileSignature}
        tone={MODULE_TONE.academic}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          <>
            <BackLink href="/promotion" label={t('backToPromotion')} />
            {manage && year && (
              <Button onClick={() => setForm({ mode: 'create', id: null })}>
                <FilePlus2 className="size-4" aria-hidden /> {t('create')}
              </Button>
            )}
          </>
        }
      />

      <Toolbar>
        {list.length > 0 && (
          <SelectField
            aria-label={t('yearFilter')}
            className="sm:w-60"
            value={yearId}
            onChange={(e) => setYearChoice(e.target.value)}
          >
            {list.map((y) => (
              <option key={y.id} value={y.id}>
                {y.isActive ? `${y.name} (${tp('activeSuffix')})` : y.name}
              </option>
            ))}
          </SelectField>
        )}
        {meetings.data && (
          <span className="text-muted-foreground ml-auto px-1 text-sm tabular-nums">
            {t('total', { count: items.length })}
          </span>
        )}
      </Toolbar>

      {(years.isPending || (meetings.isPending && !!yearId)) && <ListSkeleton rows={4} />}
      {(years.isError || meetings.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {years.data && list.length === 0 && (
        <EmptyPanel
          icon={FileSignature}
          tone={MODULE_TONE.academic}
          title={t('noYears')}
          body={t('noYearsBody')}
        />
      )}
      {meetings.data && items.length === 0 && (
        <EmptyPanel
          icon={FileSignature}
          tone={MODULE_TONE.academic}
          title={t('emptyTitle')}
          body={manage ? t('emptyBody') : t('emptyBodyReadOnly')}
          action={
            manage ? (
              <Button onClick={() => setForm({ mode: 'create', id: null })}>
                <FilePlus2 className="size-4" aria-hidden /> {t('create')}
              </Button>
            ) : undefined
          }
        />
      )}

      {items.length > 0 && (
        <DataRows<MeetingListItem>
          rows={items}
          rowKey={(r) => r.id}
          cardsBelow="lg"
          actionsHeader={tm('actions')}
          onRowClick={(r) => setDetailId(r.id)}
          columns={[
            {
              key: 'title',
              header: t('colTitle'),
              cell: (r) => (
                <span className="grid gap-1">
                  <span className="font-medium">{r.title}</span>
                  <span>
                    <ToneBadge tone={KIND_TONE[r.kind]}>{t(`kinds.${r.kind}`)}</ToneBadge>
                  </span>
                </span>
              ),
            },
            {
              key: 'date',
              header: t('colDate'),
              cell: (r) => <span className="tabular-nums">{show(r.heldOn)}</span>,
            },
            { key: 'class', header: t('colClass'), cell: (r) => r.className ?? t('allClasses') },
            {
              key: 'linked',
              header: t('colLinked'),
              cell: (r) => <span className="tabular-nums">{t('linkedCount', { count: r.linkedCount })}</span>,
            },
            {
              key: 'status',
              header: t('colStatus'),
              cell: (r) => (
                <ToneBadge tone={r.status === 'final' ? 'emerald' : 'amber'}>
                  {r.status === 'final' && <Lock aria-hidden className="size-3" />}
                  {r.status === 'final' ? t('statusFinal') : t('statusDraft')}
                </ToneBadge>
              ),
            },
          ]}
          actions={(r) => (
            <RowMenu
              label={tm('actionsFor', { name: r.title })}
              actions={[
                { label: t('open'), icon: Eye, onSelect: () => setDetailId(r.id) },
                ...(manage && r.status === 'draft'
                  ? [{ label: t('edit'), icon: Pencil, onSelect: () => setForm({ mode: 'edit', id: r.id }) }]
                  : []),
              ]}
            />
          )}
        />
      )}

      <MeetingFormDialog
        open={form !== null}
        mode={form?.mode ?? 'create'}
        yearId={yearId}
        yearName={year?.name ?? ''}
        meetingId={form?.id ?? null}
        onClose={() => setForm(null)}
        onSaved={(id) => {
          setForm(null);
          setDetailId(id);
        }}
      />
      <MinutesDetailDialog
        id={detailId}
        yearName={year?.name ?? ''}
        onClose={() => setDetailId(null)}
        onEdit={(id) => {
          setDetailId(null);
          setForm({ mode: 'edit', id });
        }}
      />
    </PageBody>
  );
}
