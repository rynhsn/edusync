'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

/** "1, 5, 30" -> [1, 5, 30]; null bila ada isian yang bukan bilangan bulat 1..10080 atau jumlahnya di luar 1..10. */
function parseBackoff(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 1 || parts.length > 10) return null;
  const nums = parts.map(Number);
  return nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 10080) ? nums : null;
}

const inRange = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

const CHROME_ICON = { detected: CircleCheck, not_configured: CircleHelp, not_found: CircleAlert } as const;
const CHROME_TONE = {
  detected: 'text-emerald-600 dark:text-emerald-400',
  not_configured: 'text-amber-600 dark:text-amber-400',
  not_found: 'text-destructive',
} as const;

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
  const [backoffText, setBackoffText] = useState('1, 5, 30, 120, 360');
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [expiryHours, setExpiryHours] = useState(24);
  const [staleTapHours, setStaleTapHours] = useState(6);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Salin dari server hanya saat tidak ada perubahan yang belum disimpan (data disegarkan berkala).
  useEffect(() => {
    if (settings.data && !dirty) {
      setEnabled(settings.data.enabled);
      setProvider(settings.data.provider as Provider);
      setMaxQueued(settings.data.maxQueuedPerSchool);
      setBackoffText(settings.data.retry.backoffMinutes.join(', '));
      setMaxAttempts(settings.data.retry.maxAttempts);
      setExpiryHours(settings.data.retry.expiryHours);
      setStaleTapHours(settings.data.retry.staleTapHours);
    }
  }, [settings.data, dirty]);

  const backoff = parseBackoff(backoffText);
  const retryValid =
    backoff !== null &&
    inRange(maxAttempts, 1, 20) &&
    inRange(expiryHours, 1, 168) &&
    inRange(staleTapHours, 1, 72);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/platform/messaging', {
          body: {
            enabled,
            provider,
            maxQueuedPerSchool: maxQueued,
            retry: {
              backoffMinutes: backoff ?? [],
              maxAttempts,
              expiryHours,
              staleTapHours,
            },
          },
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
  const chrome = s.runtime?.chrome.status;
  const ChromeIcon = chrome ? CHROME_ICON[chrome] : CircleHelp;
  // Laporan worker lebih tua dari ini (menit) dianggap basi: worker mungkin mati.
  const stale = s.runtime ? Date.now() - new Date(s.runtime.checkedAt).getTime() > 15 * 60_000 : false;

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

            <fieldset className="grid gap-4 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">{t('retryTitle')}</legend>
              <p className="text-muted-foreground -mt-1 text-xs">{t('retryHint')}</p>
              <div className="grid gap-2">
                <Label htmlFor="msg-backoff">{t('backoff')}</Label>
                <Input
                  id="msg-backoff"
                  inputMode="numeric"
                  disabled={!canEdit}
                  value={backoffText}
                  aria-invalid={backoff === null}
                  onChange={(e) => {
                    setBackoffText(e.target.value);
                    setDirty(true);
                  }}
                />
                <p
                  className={backoff === null ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
                >
                  {backoff === null ? t('backoffInvalid') : t('backoffHint')}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="msg-attempts">{t('maxAttempts')}</Label>
                  <Input
                    id="msg-attempts"
                    type="number"
                    min={1}
                    max={20}
                    disabled={!canEdit}
                    value={maxAttempts}
                    onChange={(e) => {
                      setMaxAttempts(Number(e.target.value));
                      setDirty(true);
                    }}
                  />
                  <p className="text-muted-foreground text-xs">{t('maxAttemptsHint')}</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="msg-expiry">{t('expiryHours')}</Label>
                  <Input
                    id="msg-expiry"
                    type="number"
                    min={1}
                    max={168}
                    disabled={!canEdit}
                    value={expiryHours}
                    onChange={(e) => {
                      setExpiryHours(Number(e.target.value));
                      setDirty(true);
                    }}
                  />
                  <p className="text-muted-foreground text-xs">{t('expiryHoursHint')}</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="msg-stale">{t('staleTapHours')}</Label>
                  <Input
                    id="msg-stale"
                    type="number"
                    min={1}
                    max={72}
                    disabled={!canEdit}
                    value={staleTapHours}
                    onChange={(e) => {
                      setStaleTapHours(Number(e.target.value));
                      setDirty(true);
                    }}
                  />
                  <p className="text-muted-foreground text-xs">{t('staleTapHoursHint')}</p>
                </div>
              </div>
            </fieldset>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {canEdit && (
              <div>
                <Button type="submit" disabled={!dirty || maxQueued < 1 || !retryValid || save.isPending}>
                  {t('save')}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('runtimeTitle')}</CardTitle>
          <CardDescription>{t('runtimeHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t('chrome')}</span>
            <Badge variant="outline" className={chrome ? CHROME_TONE[chrome] : undefined}>
              <ChromeIcon className="size-3.5" aria-hidden="true" />
              {chrome ? t(`chromeStatus.${chrome}`) : t('chromeStatus.unknown')}
            </Badge>
            {s.runtime && (
              <span className="text-muted-foreground text-xs">
                {t('checkedAt', { time: new Date(s.runtime.checkedAt).toLocaleString() })}
                {stale ? ` · ${t('runtimeStale')}` : ''}
              </span>
            )}
          </div>
          {chrome === 'detected' && s.runtime?.chrome.path && (
            <p className="text-muted-foreground font-mono text-xs break-all">{s.runtime.chrome.path}</p>
          )}
          {(chrome === 'not_configured' || chrome === 'not_found') && (
            <Alert role="status">
              <AlertDescription>{t('chromeFix')}</AlertDescription>
            </Alert>
          )}
          {chrome === 'not_found' && s.runtime?.chrome.path && (
            <p className="text-muted-foreground font-mono text-xs break-all">{s.runtime.chrome.path}</p>
          )}
          {!s.runtime && <p className="text-muted-foreground text-xs">{t('runtimeNone')}</p>}
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
