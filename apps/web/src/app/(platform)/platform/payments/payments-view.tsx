'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useStaff } from '../../platform-shell';

type Provider = 'dev' | 'midtrans';
type Mode = 'sandbox' | 'production';

export function PaymentsView() {
  const t = useTranslations('platformPayments');
  const te = useTranslations();
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const canEdit = role === 'admin';

  const settings = useQuery({
    queryKey: ['platform-payment-settings'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/payment-settings')),
  });

  const [provider, setProvider] = useState<Provider>('dev');
  const [mode, setMode] = useState<Mode>('sandbox');
  const [serverKey, setServerKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setProvider(settings.data.provider);
      setMode(settings.data.mode);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/platform/payment-settings', {
          body: { provider, mode, ...(serverKey.trim() ? { serverKey: serverKey.trim() } : {}) },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setServerKey('');
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['platform-payment-settings'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (settings.isPending) return <Skeleton className="h-64 w-full" />;
  if (!settings.data) return null;
  const s = settings.data;

  async function copyWebhook() {
    await navigator.clipboard.writeText(s.webhookUrl);
    toast.success(t('copied'));
  }

  return (
    <div className="grid w-full gap-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        {!canEdit && <p className="text-muted-foreground mt-1 text-sm">{t('readOnly')}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('provider')}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            {t('source')}:{' '}
            <Badge variant="outline">
              {s.source === 'database' ? t('sourceDatabase') : t('sourceEnvironment')}
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid max-w-2xl gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="pay-provider">{t('provider')}</Label>
              <SelectField
                id="pay-provider"
                value={provider}
                disabled={!canEdit}
                onChange={(e) => setProvider(e.target.value as Provider)}
              >
                {s.devAllowed && <option value="dev">{t('providerDev')}</option>}
                <option value="midtrans">{t('providerMidtrans')}</option>
              </SelectField>
              {!s.devAllowed && <p className="text-muted-foreground text-xs">{t('devBlocked')}</p>}
            </div>

            {provider === 'midtrans' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="pay-mode">{t('mode')}</Label>
                  <SelectField
                    id="pay-mode"
                    value={mode}
                    disabled={!canEdit}
                    onChange={(e) => setMode(e.target.value as Mode)}
                  >
                    <option value="sandbox">{t('modeSandbox')}</option>
                    <option value="production">{t('modeProduction')}</option>
                  </SelectField>
                  {mode === 'production' && (
                    <Alert>
                      <AlertDescription>{t('productionWarning')}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="pay-key">{t('serverKey')}</Label>
                  <PasswordInput
                    id="pay-key"
                    autoComplete="off"
                    disabled={!canEdit}
                    value={serverKey}
                    placeholder={s.hasServerKey ? `•••• ${s.serverKeyHint ?? ''}` : ''}
                    onChange={(e) => setServerKey(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    {s.hasServerKey
                      ? t('serverKeyKept', { hint: s.serverKeyHint ?? '' })
                      : t('serverKeyNone')}
                    {' · '}
                    {t('serverKeyHint')}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="pay-webhook">{t('webhook')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="pay-webhook"
                      readOnly
                      value={s.webhookUrl.replace(/[^/]+$/, 'midtrans')}
                      className="font-mono text-xs"
                    />
                    <Button type="button" variant="outline" onClick={copyWebhook}>
                      <Copy className="size-4" /> {t('copy')}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">{t('webhookHint')}</p>
                </div>
              </>
            )}

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {canEdit && (
              <div>
                <Button type="submit" disabled={save.isPending}>
                  {t('save')}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
