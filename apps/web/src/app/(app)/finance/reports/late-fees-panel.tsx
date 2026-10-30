'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { formatRupiah } from '@/lib/money';

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
      {preview.isPending && <Skeleton className="h-48 w-full" />}

      {data && !data.enabled && (
        <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center text-sm">
          <Hourglass className="size-8 text-rose-500/70" aria-hidden="true" />
          <p className="text-muted-foreground max-w-md">{t('lateFeeDisabled')}</p>
          {can('finance:manage') && (
            <Button variant="outline" nativeButton={false} render={<Link href="/finance/settings" />}>
              {t('lateFeeOpenSettings')}
            </Button>
          )}
        </Card>
      )}

      {data?.enabled && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-muted-foreground text-xs">{t('lateFeePendingCount')}</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">{data.pendingCount}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-muted-foreground text-xs">{t('lateFeePendingTotal')}</p>
              <p className="font-heading text-2xl font-semibold text-rose-600 tabular-nums dark:text-rose-400">
                {formatRupiah(data.pendingTotal)}
              </p>
            </div>
            <div className="flex items-center md:col-span-2 md:justify-end">
              {can('finance:manage') && (
                <Button disabled={!canApply || apply.isPending} onClick={() => setConfirming(true)}>
                  {t('lateFeeApply')}
                </Button>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <Card className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center text-sm">
              <CheckCircle2 className="size-8 text-emerald-500/70" aria-hidden="true" />
              {t('lateFeeNone')}
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
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
                          <div className="font-medium">{i.studentName}</div>
                          <div className="text-muted-foreground text-xs">
                            {[i.nis, i.className].filter(Boolean).join(' · ')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{i.title}</div>
                          <div className="text-muted-foreground text-xs">{i.feeTypeName}</div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCalendarDate(locale, i.dueDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{i.daysLate}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatRupiah(i.outstanding)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-rose-600 tabular-nums dark:text-rose-400">
                          {formatRupiah(i.lateFee)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={i.fined ? 'secondary' : 'outline'}>
                            {i.fined ? t('lateFeeFined') : t('lateFeeNotFined')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-medium">
                      <TableCell colSpan={5}>{t('lateFeePendingTotal')}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(data.pendingTotal)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
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
