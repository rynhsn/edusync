'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useStaff } from '../../platform-shell';

type Provider = 'whatsapp' | 'log';

const MESSAGE_STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped'] as const;
const ACCOUNT_STATUSES = ['ready', 'qr', 'connecting', 'failed', 'disconnected'] as const;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-heading text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

export function PlatformMessagingView() {
  const t = useTranslations('platformMessaging');
  const te = useTranslations();
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const canEdit = role === 'admin';

  const settings = useQuery({
    queryKey: ['platform-messaging'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/messaging')),
    refetchInterval: 15000,
  });

  const [enabled, setEnabled] = useState(true);
  const [provider, setProvider] = useState<Provider>('whatsapp');
  const [maxQueued, setMaxQueued] = useState(1000);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Salin dari server hanya saat tidak ada perubahan yang belum disimpan (data disegarkan berkala).
  useEffect(() => {
    if (settings.data && !dirty) {
      setEnabled(settings.data.enabled);
      setProvider(settings.data.provider as Provider);
      setMaxQueued(settings.data.maxQueuedPerSchool);
    }
  }, [settings.data, dirty]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/platform/messaging', {
          body: { enabled, provider, maxQueuedPerSchool: maxQueued },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setDirty(false);
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['platform-messaging'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (settings.isPending) return <Skeleton className="h-64 w-full" />;
  if (!settings.data) return null;
  const s = settings.data;

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={canEdit ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('settingsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid max-w-2xl gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Label className="flex items-center gap-2 font-medium">
              <Checkbox
                checked={enabled}
                disabled={!canEdit}
                onCheckedChange={(next) => {
                  setEnabled(next);
                  setDirty(true);
                }}
              />
              {t('enabled')}
            </Label>
            <p className="text-muted-foreground -mt-3 text-xs">{t('enabledHint')}</p>

            <div className="grid gap-2">
              <Label htmlFor="msg-provider">{t('provider')}</Label>
              <SelectField
                id="msg-provider"
                value={provider}
                disabled={!canEdit}
                onChange={(e) => {
                  setProvider(e.target.value as Provider);
                  setDirty(true);
                }}
              >
                <option value="whatsapp">{t('providerWhatsapp')}</option>
                <option value="log">{t('providerLog')}</option>
              </SelectField>
              <p className="text-muted-foreground text-xs">{t('providerHint')}</p>
            </div>

            <div className="grid gap-2 sm:w-1/2">
              <Label htmlFor="msg-max-queued">{t('maxQueued')}</Label>
              <Input
                id="msg-max-queued"
                type="number"
                min={1}
                disabled={!canEdit}
                value={maxQueued}
                onChange={(e) => {
                  setMaxQueued(Number(e.target.value));
                  setDirty(true);
                }}
              />
              <p className="text-muted-foreground text-xs">{t('maxQueuedHint')}</p>
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {canEdit && (
              <div>
                <Button type="submit" disabled={!dirty || maxQueued < 1 || save.isPending}>
                  {t('save')}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('stats24h')}</CardTitle>
          <CardDescription>{t('stats24hHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {MESSAGE_STATUSES.map((k) => (
              <Stat
                key={k}
                label={t(`msgStatus.${k}`)}
                value={Number((s.messages24h as Record<string, number>)[k] ?? 0)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('accounts')}</CardTitle>
          <CardDescription>{t('accountsHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ACCOUNT_STATUSES.map((k) => (
              <Stat key={k} label={t(`accountStatus.${k}`)} value={Number(s.accounts[k] ?? 0)} />
            ))}
          </div>
        </CardContent>
      </Card>
    </PageBody>
  );
}
