'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, CircleCheck, Hourglass, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, PersonCell, StatCard, ToneBadge } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { formatRupiah } from '@/lib/money';
import { ENTER, ListSkeleton, Money, StatSkeleton } from '../ui';

/** Pratinjau tagihan yang kena denda keterlambatan, dengan tombol untuk menerbitkan tagihan dendanya. */
export function LateFeesPanel() {
  const t = useTranslations('finance');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; total: number } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['finance-late-fees', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/finance/late-fees/preview', { params: header })),
  });

  const apply = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/finance/late-fees/apply', { params: header, body: { invoiceIds: null } })),
    onSuccess: (r) => {
      setApplyError(null);
      setConfirming(false);
      setResult(r);
      queryClient.invalidateQueries({ queryKey: ['finance-late-fees', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['finance', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['finance-arrears', school.schoolId] });
    },
    onError: (e) => {
      setConfirming(false);
      setApplyError(te(errorKey(e)));
    },
  });

  const data = preview.data;
  const items = data?.items ?? [];
  const canApply = can('finance:manage') && !!data?.enabled && (data?.pendingCount ?? 0) > 0;

  return (
    <>
      {preview.error && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(preview.error))}</AlertDescription>
        </Alert>
      )}
      {applyError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{applyError}</AlertDescription>
        </Alert>
      )}
      {preview.isPending && (
        <>
          <StatSkeleton count={2} />
          <ListSkeleton rows={3} />
        </>
      )}

      {data && !data.enabled && (
        <EmptyPanel
          icon={Hourglass}
          tone="rose"
          title={t('lateFeeDisabledTitle')}
          body={t('lateFeeDisabled')}
          action={
            can('finance:manage') ? (
              <Button variant="outline" nativeButton={false} render={<Link href="/finance/settings" />}>
                {t('lateFeeOpenSettings')}
              </Button>
            ) : undefined
          }
        />
      )}

      {data?.enabled && (
        <div className={`grid gap-6 ${ENTER}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-stretch">
            <StatCard
              label={t('lateFeePendingCount')}
              value={data.pendingCount}
              icon={ReceiptText}
              tone="sky"
            />
            <StatCard
              label={t('lateFeePendingTotal')}
              value={<Money value={data.pendingTotal} />}
              icon={AlarmClock}
              tone="rose"
            />
            {can('finance:manage') && (
              <div className="flex items-center">
                <Button
                  size="lg"
                  className="h-11 w-full px-5 sm:w-auto"
                  disabled={!canApply || apply.isPending}
                  onClick={() => setConfirming(true)}
                >
                  <AlarmClock className="size-4" /> {t('lateFeeApply')}
                </Button>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyPanel
              icon={CircleCheck}
              tone="emerald"
              title={t('lateFeeNone')}
              body={t('lateFeeNoneHint')}
            />
          ) : (
            <>
              <div className="bg-card hidden overflow-hidden rounded-2xl border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('lateFeeStudent')}</TableHead>
                      <TableHead>{t('lateFeeInvoice')}</TableHead>
                      <TableHead className="text-right">{t('lateFeeDue')}</TableHead>
                      <TableHead className="text-right">{t('lateFeeDaysLate')}</TableHead>
                      <TableHead className="text-right">{t('lateFeeOutstanding')}</TableHead>
                      <TableHead className="text-right">{t('lateFeeAmount')}</TableHead>
                      <TableHead>{t('status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => (
                      <TableRow key={i.invoiceId}>
                        <TableCell>
                          <PersonCell
                            name={i.studentName}
                            sub={[i.nis, i.className].filter(Boolean).join(' · ')}
                          />
                        </TableCell>
                        <TableCell>
                          <div>{i.title}</div>
                          <div className="text-muted-foreground text-xs">{i.feeTypeName}</div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCalendarDate(locale, i.dueDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{i.daysLate}</TableCell>
                        <TableCell className="text-right">
                          <Money value={i.outstanding} />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <Money value={i.lateFee} negative />
                        </TableCell>
                        <TableCell>
                          <ToneBadge tone={i.fined ? 'slate' : 'amber'}>
                            {i.fined ? t('lateFeeFined') : t('lateFeeNotFined')}
                          </ToneBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-medium">
                      <TableCell colSpan={5}>{t('lateFeePendingTotal')}</TableCell>
                      <TableCell className="text-right">
                        <Money value={data.pendingTotal} />
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <ul className="grid gap-2 md:hidden">
                {items.map((i) => (
                  <li key={i.invoiceId} className="bg-card grid gap-3 rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <PersonCell
                        name={i.studentName}
                        sub={[i.nis, i.className].filter(Boolean).join(' · ')}
                      />
                      <ToneBadge tone={i.fined ? 'slate' : 'amber'}>
                        {i.fined ? t('lateFeeFined') : t('lateFeeNotFined')}
                      </ToneBadge>
                    </div>
                    <p className="text-sm">
                      {i.title}
                      <span className="text-muted-foreground block text-xs">{i.feeTypeName}</span>
                    </p>
                    <dl className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">{t('lateFeeDaysLate')}</dt>
                        <dd className="font-medium tabular-nums">{i.daysLate}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('lateFeeOutstanding')}</dt>
                        <dd className="font-medium">
                          <Money value={i.outstanding} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('lateFeeAmount')}</dt>
                        <dd className="font-semibold">
                          <Money value={i.lateFee} negative />
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={t('lateFeeConfirmTitle')}
        description={t('lateFeeConfirmBody', {
          count: data?.pendingCount ?? 0,
          total: formatRupiah(data?.pendingTotal ?? 0),
        })}
        confirmLabel={t('lateFeeApply')}
        pending={apply.isPending}
        onOpenChange={(o) => !o && setConfirming(false)}
        onConfirm={() => apply.mutateAsync()}
      />

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{t('lateFeeResultTitle')}</DialogTitle>
          </DialogHeader>
          {result && (
            <ul className="grid gap-1 text-sm">
              <li className="font-medium text-emerald-700 dark:text-emerald-300">
                {t('lateFeeResultCreated', { count: result.created, total: formatRupiah(result.total) })}
              </li>
              <li className="text-muted-foreground">
                {t('lateFeeResultSkipped', { count: result.skipped })}
              </li>
            </ul>
          )}
          <DialogFooter>
            <Button onClick={() => setResult(null)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
