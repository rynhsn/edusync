'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Eye, LogIn, LogOut, Pencil, Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataRows, ListSkeleton, MonoText, REVEAL, RowMenu } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, MODULE_TONE, PersonCell, ToneBadge, Toolbar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { normalizeReason } from '@/lib/transfer';
import { TransferDetailDialog } from './transfer-detail';
import { TransferEditDialog, TransferInDialog, TransferOutDialog } from './transfer-forms';

const PAGE = 25;

export function TransfersView() {
  const t = useTranslations('transfers');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('student:manage');
  const show = (iso: string) => formatCalendarDate(locale, iso);

  const [yearId, setYearId] = useState('');
  const [direction, setDirection] = useState<'' | 'in' | 'out'>('');
  const [page, setPage] = useState(0);
  const [outOpen, setOutOpen] = useState(false);
  const [inOpen, setInOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const years = useQuery({
    queryKey: ['academic-years', school.schoolId],
    enabled: can('academic_year:read'),
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });

  const query = {
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(direction ? { direction } : {}),
    limit: PAGE,
    offset: page * PAGE,
  };
  const list = useQuery({
    queryKey: ['student-transfers', school.schoolId, query],
    queryFn: async () => unwrap(await api.GET('/v1/student-transfers', { params: { ...header, query } })),
  });
  type Row = NonNullable<typeof list.data>['items'][number];
  const [editing, setEditing] = useState<Row | null>(null);
  const [cancelling, setCancelling] = useState<Row | null>(null);

  const cancel = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/student-transfers/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('cancelled'));
      for (const key of ['student-transfers', 'students', 'classes', 'student-history'])
        queryClient.invalidateQueries({ queryKey: [key, school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const hasFilters = !!(yearId || direction);

  const kindLabel = (r: Row) =>
    r.direction === 'in' ? t('directionIn') : r.kind === 'dropped' ? t('kindDropped') : t('directionOut');

  return (
    <PageBody>
      <PageHeader
        icon={ArrowRightLeft}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          manage && (
            <>
              <Button variant="outline" onClick={() => setInOpen(true)}>
                <LogIn className="size-4" /> {t('recordIn')}
              </Button>
              <Button onClick={() => setOutOpen(true)}>
                <LogOut className="size-4" /> {t('recordOut')}
              </Button>
            </>
          )
        }
      />

      <Toolbar>
        {years.data && years.data.length > 0 && (
          <SelectField
            aria-label={t('yearFilter')}
            className="sm:w-52"
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('allYears')}</option>
            {years.data.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField
          aria-label={t('directionFilter')}
          className="sm:w-52"
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value as '' | 'in' | 'out');
            setPage(0);
          }}
        >
          <option value="">{t('allDirections')}</option>
          <option value="in">{t('directionIn')}</option>
          <option value="out">{t('directionOut')}</option>
        </SelectField>
        {list.data && (
          <span className="text-muted-foreground ml-auto px-1 text-sm tabular-nums">
            {t('total', { count: total })}
          </span>
        )}
      </Toolbar>

      {list.isPending && <ListSkeleton rows={5} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data?.items.length === 0 &&
        (hasFilters ? (
          <EmptyPanel
            icon={ArrowRightLeft}
            tone={MODULE_TONE.master}
            title={t('emptyFilteredTitle')}
            body={t('emptyFilteredBody')}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setYearId('');
                  setDirection('');
                  setPage(0);
                }}
              >
                {t('clearFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyPanel
            icon={ArrowRightLeft}
            tone={MODULE_TONE.master}
            title={t('emptyTitle')}
            body={t('emptyBody')}
          />
        ))}

      {list.data && list.data.items.length > 0 && (
        <DataRows
          rows={list.data.items}
          rowKey={(r) => r.id}
          cardsBelow="lg"
          actionsHeader={tm('actions')}
          onRowClick={(r) => setDetailId(r.id)}
          columns={[
            {
              key: 'student',
              header: t('colStudent'),
              cell: (r) => <PersonCell name={r.studentName} sub={r.className} />,
            },
            {
              key: 'direction',
              header: t('colDirection'),
              cell: (r) => (
                <ToneBadge tone={r.direction === 'in' ? 'emerald' : r.kind === 'dropped' ? 'slate' : 'amber'}>
                  {kindLabel(r)}
                </ToneBadge>
              ),
            },
            {
              key: 'date',
              header: t('colDate'),
              cell: (r) => <span className="tabular-nums">{show(r.effectiveOn)}</span>,
            },
            {
              key: 'reason',
              header: t('colReason'),
              cell: (r) => t(`reasons.${normalizeReason(r.reason)}`),
            },
            {
              key: 'school',
              header: t('colSchool'),
              cell: (r) =>
                r.counterpartSchoolName ?? <span className="text-muted-foreground">{tm('none')}</span>,
            },
            {
              key: 'letter',
              header: t('colLetter'),
              cell: (r) => <MonoText>{r.letterNumber ?? tm('none')}</MonoText>,
            },
          ]}
          actions={(r) => (
            <RowMenu
              label={tm('actionsFor', { name: r.studentName })}
              actions={[
                { label: t('viewDetail'), icon: Eye, onSelect: () => setDetailId(r.id) },
                ...(manage
                  ? [
                      { label: t('editNote'), icon: Pencil, onSelect: () => setEditing(r) },
                      ...(r.direction === 'out'
                        ? [
                            {
                              label: t('cancelTransfer'),
                              icon: Undo2,
                              destructive: true,
                              separated: true,
                              onSelect: () => setCancelling(r),
                            },
                          ]
                        : []),
                    ]
                  : []),
              ]}
            />
          )}
        />
      )}

      {list.data && pages > 1 && (
        <div className={`flex flex-wrap items-center justify-end gap-2 text-sm ${REVEAL}`}>
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {te('students.prev')}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {page + 1} / {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            {te('students.next')}
          </Button>
        </div>
      )}

      <TransferOutDialog open={outOpen} onOpenChange={setOutOpen} />
      <TransferInDialog open={inOpen} onOpenChange={setInOpen} />
      <TransferEditDialog transfer={editing} onClose={() => setEditing(null)} />
      <TransferDetailDialog id={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={t('cancelTitle', { name: cancelling?.studentName ?? '' })}
        description={t('cancelBody')}
        confirmLabel={t('cancelConfirm')}
        destructive
        pending={cancel.isPending}
        onConfirm={async () => {
          if (cancelling) await cancel.mutateAsync(cancelling.id);
        }}
      />
    </PageBody>
  );
}
