'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CreditCard, Layers, Power, PowerOff, Receipt, School } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  EducationProfileSelect,
  useEducationProfileName,
  useEducationProfiles,
} from '@/components/education-profile-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile, type Tone, ToneBadge, UserAvatar } from '@/components/ui-kit';
import type { Locale } from '@/i18n/config';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { useStaff } from '../platform-shell';
import { type Foundation, QueryError, SUB_KEY, SUB_TONE, useMoney } from './platform-kit';

const INVOICE_TONE: Record<string, Tone> = {
  open: 'amber',
  paid: 'emerald',
  expired: 'slate',
  void: 'slate',
};

function Section({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof School;
  title: string;
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-2.5">
      <div className="flex items-center gap-2.5">
        <IconTile icon={Icon} tone={tone} className="size-8 rounded-lg [&_svg]:size-4" />
        <h3 className="font-heading text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

/** Jenjang unit (satu unit satu jenjang): staf admin dapat mengisi atau mengganti; server mengunci bila sudah ada tahun ajaran. */
function UnitProfile({
  schoolId,
  profile,
  canEdit,
}: {
  schoolId: string;
  profile: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('platform');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const profiles = useEducationProfiles();
  const nameOf = useEducationProfileName();
  const save = useMutation({
    mutationFn: async (educationProfile: string) =>
      unwrap(
        await api.PUT('/v1/platform/schools/{id}/education-profile', {
          params: { path: { id: schoolId } },
          body: { educationProfile },
        }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      for (const key of ['foundations', 'foundation', 'audit']) {
        queryClient.invalidateQueries({ queryKey: [`platform-${key}`] });
      }
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const current = profiles.data?.find((p) => p.key === profile);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">
        {t('unitProfile')}: {profile ? nameOf(profile, current?.name ?? profile) : t('unitProfileEmpty')}
      </span>
      {canEdit && (
        <div className="w-56">
          <EducationProfileSelect
            value={profile ?? ''}
            onChange={(key) => key !== profile && save.mutate(key)}
            disabled={save.isPending}
          />
        </div>
      )}
    </div>
  );
}

/** Detail yayasan dalam dialog: langganan, unit (dengan tindakan tangguhkan/aktifkan), invoice, dan modul aktif. */
export function FoundationDetail({
  foundation,
  open,
  onOpenChange,
  onAct,
}: {
  foundation: Foundation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAct: (school: Foundation['schools'][number], action: 'suspend' | 'reactivate') => void;
}) {
  const t = useTranslations('platform');
  const tm = useTranslations('modules');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const money = useMoney();
  const { role } = useStaff();
  const id = foundation?.id;

  const detail = useQuery({
    queryKey: ['platform-foundation', id],
    queryFn: async () =>
      unwrap(await api.GET('/v1/platform/foundations/{id}', { params: { path: { id: id as string } } })),
    enabled: open && !!id,
  });

  const moduleLabel = (key: string) => (tm.has(key as never) ? tm(key as never) : key);
  const day = (iso: string) => formatCalendarDate(locale, iso.slice(0, 10));
  const sub = foundation?.subscription ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-2xl">
        {foundation && (
          <>
            <DialogHeader className="flex-row items-center gap-3 pr-8">
              <UserAvatar name={foundation.name} size="lg" />
              <div className="min-w-0">
                <DialogTitle className="font-heading truncate text-lg">{foundation.name}</DialogTitle>
                <DialogDescription className="font-mono text-xs">{foundation.slug}</DialogDescription>
              </div>
            </DialogHeader>

            <Section icon={CalendarClock} title={t('detailSubscription')} tone="violet">
              {sub ? (
                <div className="bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3 text-sm">
                  <ToneBadge tone={SUB_TONE[sub.status]}>{t(SUB_KEY[sub.status])}</ToneBadge>
                  <span>{sub.period === 'yearly' ? t('periodYearly') : t('periodMonthly')}</span>
                  <span className="text-muted-foreground">
                    {t('periodEnd', { date: day(sub.currentPeriodEnd) })}
                  </span>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t('noSubscription')}</p>
              )}
            </Section>

            <Section icon={School} title={`${t('detailUnits')} (${foundation.schools.length})`} tone="teal">
              <ul className="divide-y rounded-xl border">
                {foundation.schools.map((s) => {
                  const active = s.status === 'active';
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="text-muted-foreground font-mono text-xs">{s.slug}</p>
                        <p className="text-muted-foreground text-xs">
                          {s.npsn ? t('unitNpsn', { npsn: s.npsn }) : t('unitNpsnEmpty')}
                        </p>
                        <UnitProfile
                          schoolId={s.id}
                          profile={s.educationProfile}
                          canEdit={role === 'admin'}
                        />
                        {!active && (
                          <p className="text-muted-foreground mt-1 text-xs break-words">
                            {s.suspendedReason === 'staff' && s.suspendedNote
                              ? t('suspendedNote', { note: s.suspendedNote })
                              : t('billingNote')}
                            {s.suspendedAt && ` · ${t('suspendedSince', { date: day(s.suspendedAt) })}`}
                            {s.suspendedBy && ` · ${t('suspendedBy', { name: s.suspendedBy })}`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <ToneBadge tone={active ? 'emerald' : 'rose'}>
                          {active ? t('unitActive') : t('unitSuspended')}
                          {s.suspendedReason === 'billing' && ` · ${t('byBilling')}`}
                          {s.suspendedReason === 'staff' && ` · ${t('byStaff')}`}
                        </ToneBadge>
                        {role === 'admin' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onAct(s, active ? 'suspend' : 'reactivate')}
                          >
                            {active ? <PowerOff /> : <Power />}
                            {active ? t('suspend') : t('reactivate')}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {role !== 'admin' && <p className="text-muted-foreground text-xs">{t('readOnly')}</p>}
            </Section>

            {detail.isPending && <Skeleton className="h-32 w-full rounded-xl" />}
            {detail.isError && <QueryError error={detail.error} onRetry={() => detail.refetch()} />}
            {detail.data && (
              <>
                <Section icon={Receipt} title={t('detailInvoices')} tone="amber">
                  {detail.data.invoices.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t('noInvoices')}</p>
                  ) : (
                    <ul className="divide-y rounded-xl border">
                      {detail.data.invoices.map((i) => (
                        <li
                          key={i.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                        >
                          <div>
                            <p className="font-medium tabular-nums">{money.format(i.amount)}</p>
                            <p className="text-muted-foreground text-xs">
                              {t(i.kind === 'registration' ? 'invoiceRegistration' : 'invoiceRenewal')} ·{' '}
                              {format.dateTime(new Date(i.createdAt), { dateStyle: 'medium' })}
                            </p>
                          </div>
                          <ToneBadge tone={INVOICE_TONE[i.status] ?? 'slate'}>
                            {t(`invoiceStatus.${i.status}`)}
                          </ToneBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section icon={CreditCard} title={t('detailPayments')} tone="sky">
                  {detail.data.payments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t('noPayments')}</p>
                  ) : (
                    <ul className="divide-y rounded-xl border">
                      {detail.data.payments.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                        >
                          <span className="font-mono text-xs">
                            {p.provider === 'complimentary' ? t('paymentComplimentary') : p.provider}
                          </span>
                          <span className="tabular-nums">{money.format(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section icon={Layers} title={t('detailModules')} tone="violet">
                  {detail.data.modules.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t('noModules')}</p>
                  ) : (
                    <div className="grid content-start gap-2">
                      {foundation.schools.map((s) => {
                        const mods = (detail.data?.modules ?? []).filter((m) => m.schoolId === s.id);
                        if (mods.length === 0) return null;
                        return (
                          <div key={s.id} className="rounded-xl border p-3">
                            <p className="mb-2 text-xs font-medium">{s.name}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {mods.map((m) => (
                                <ToneBadge key={m.moduleKey} tone="violet" dot={false}>
                                  {moduleLabel(m.moduleKey)}
                                </ToneBadge>
                              ))}
                            </div>
                            <p className="text-muted-foreground mt-2 text-xs">
                              {t('validUntil', { date: day(mods[0]?.validUntil ?? '') })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
