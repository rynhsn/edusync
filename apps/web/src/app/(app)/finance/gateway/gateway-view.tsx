'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, CreditCard, Link2, PlugZap, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { PageBody, PageHeader } from '@/components/page-header';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  buildGatewayBody,
  canSaveGateway,
  type GatewayForm,
  type GatewayMode,
  keyPrefixes,
} from '@/lib/online-charge';
import { ListSkeleton, SectionCard } from '../ui';

const EMPTY: GatewayForm = { enabled: false, mode: 'sandbox', merchantId: '', clientKey: '', serverKey: '' };

/** Pengaturan pembayaran online ke akun Midtrans milik sekolah sendiri. */
export function GatewayView() {
  const t = useTranslations('finance');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('finance:manage');
  const queryKey = ['finance', school.schoolId, 'gateway'];

  const [form, setForm] = useState<GatewayForm>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; reason: string | null } | null>(null);

  const gateway = useQuery({
    queryKey,
    enabled: manage,
    queryFn: async () => unwrap(await api.GET('/v1/finance/gateway', { params: header })),
  });
  const data = gateway.data;

  // Isi formulir sekali dari data tersimpan; kunci server tidak pernah datang dari server.
  useEffect(() => {
    if (!data || loaded) return;
    setForm({
      enabled: data.enabled,
      mode: data.mode,
      merchantId: data.merchantId ?? '',
      clientKey: data.clientKey ?? '',
      serverKey: '',
    });
    setLoaded(true);
  }, [data, loaded]);

  const save = useMutation({
    mutationFn: async (v: GatewayForm) =>
      unwrap(await api.PUT('/v1/finance/gateway', { params: header, body: buildGatewayBody(v) })),
    onSuccess: (saved) => {
      toast.success(t('gwSaved'));
      setError(null);
      setTest(null);
      setForm((f) => ({ ...f, serverKey: '', enabled: saved.enabled, mode: saved.mode }));
      queryClient.setQueryData(queryKey, saved);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const runTest = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/finance/gateway/test', { params: header })),
    onSuccess: (r) => setTest(r),
    onError: (e) => setTest({ ok: false, reason: te(errorKey(e)) }),
  });

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('gwCopied'));
    } catch {
      toast.error(t('gwCopyFailed'));
    }
  }

  const prefixes = keyPrefixes(form.mode);
  const hasKey = data?.hasServerKey ?? false;
  const valid = canSaveGateway(form, hasKey);

  return (
    <PageBody>
      <PageHeader
        icon={CreditCard}
        tone={MODULE_TONE.finance}
        title={t('gwTitle')}
        description={t('gwSubtitle')}
        actions={<BackLink href="/finance" />}
      />

      {!manage && (
        <Alert variant="destructive">
          <AlertDescription>{te('errors.forbidden')}</AlertDescription>
        </Alert>
      )}

      {manage && gateway.isPending && <ListSkeleton rows={4} />}
      {manage && gateway.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(gateway.error))}</AlertDescription>
        </Alert>
      )}

      {manage && data && (
        <>
          <SectionCard
            icon={PlugZap}
            tone="sky"
            title={t('gwAccount')}
            description={t('gwAccountHint')}
            actions={
              <ToneBadge tone={data.ready ? 'emerald' : 'slate'}>
                {data.ready ? t('gwReady') : t('gwNotReady')}
              </ToneBadge>
            }
          >
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                save.mutate(form);
              }}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  id="gw-enabled"
                  checked={form.enabled}
                  onCheckedChange={(v) => setForm({ ...form, enabled: v === true })}
                />
                <Label htmlFor="gw-enabled">{t('gwEnabled')}</Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="gw-mode">{t('gwMode')}</Label>
                  <SelectField
                    id="gw-mode"
                    value={form.mode}
                    onChange={(e) => setForm({ ...form, mode: e.target.value as GatewayMode })}
                  >
                    <option value="sandbox">{t('gwModeSandbox')}</option>
                    <option value="production">{t('gwModeProduction')}</option>
                  </SelectField>
                  <p className="text-muted-foreground text-xs">
                    {form.mode === 'sandbox' ? t('gwModeSandboxHint') : t('gwModeProductionHint')}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gw-merchant">{t('gwMerchantId')}</Label>
                  <Input
                    id="gw-merchant"
                    maxLength={64}
                    autoComplete="off"
                    value={form.merchantId}
                    onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gw-client">{t('gwClientKey')}</Label>
                  <Input
                    id="gw-client"
                    maxLength={200}
                    autoComplete="off"
                    placeholder={`${prefixes.client}…`}
                    value={form.clientKey}
                    onChange={(e) => setForm({ ...form, clientKey: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gw-server">{t('gwServerKey')}</Label>
                  <PasswordInput
                    id="gw-server"
                    maxLength={200}
                    autoComplete="new-password"
                    placeholder={hasKey ? t('gwServerKeySaved') : `${prefixes.server}…`}
                    value={form.serverKey}
                    onChange={(e) => setForm({ ...form, serverKey: e.target.value })}
                  />
                  <p className="text-muted-foreground text-xs">
                    {hasKey ? t('gwServerKeyKeep') : t('gwServerKeyNew')}
                  </p>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={!valid || save.isPending}>
                  {save.isPending ? t('gwSaving') : t('gwSave')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hasKey || runTest.isPending}
                  onClick={() => {
                    setTest(null);
                    runTest.mutate();
                  }}
                >
                  {runTest.isPending ? t('gwTesting') : t('gwTest')}
                </Button>
                {!valid && <span className="text-muted-foreground text-xs">{t('gwKeyRequired')}</span>}
              </div>

              {test && (
                <Alert variant={test.ok ? 'default' : 'destructive'} aria-live="polite">
                  {test.ok ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}
                  <AlertDescription>
                    {test.ok ? t('gwTestOk') : t('gwTestFail', { reason: test.reason ?? t('gwTestUnknown') })}
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-muted-foreground text-xs">{t('gwTestHint')}</p>
            </form>
          </SectionCard>

          <SectionCard icon={Link2} tone="violet" title={t('gwWebhook')} description={t('gwWebhookHint')}>
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label={t('gwWebhook')}
                value={data.webhookUrl}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={() => copyUrl(data.webhookUrl)}>
                <Copy className="size-4" aria-hidden /> {t('gwCopy')}
              </Button>
            </div>
            <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
              <li>{t('gwStep1')}</li>
              <li>{t('gwStep2')}</li>
              <li>{t('gwStep3')}</li>
              <li>{t('gwStep4')}</li>
            </ol>
          </SectionCard>
        </>
      )}
    </PageBody>
  );
}
