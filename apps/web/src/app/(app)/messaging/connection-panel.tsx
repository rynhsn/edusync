'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { OK_BADGE, useMessagingCtx, WARN_BADGE } from './shared';

type AccountStatus = 'disconnected' | 'connecting' | 'qr' | 'ready' | 'failed';

const STATUS_STYLE: Record<
  AccountStatus,
  { variant: 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  ready: { variant: 'secondary', className: OK_BADGE },
  qr: { variant: 'secondary', className: WARN_BADGE },
  connecting: { variant: 'secondary' },
  failed: { variant: 'destructive' },
  disconnected: { variant: 'outline' },
};

/** Gambar QR dibuat di sisi klien dari string yang dikirim API. */
function QrImage({ value }: { value: string }) {
  const t = useTranslations('messaging');
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: 288, margin: 2 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!src) return <Skeleton className="size-72" />;
  return (
    // biome-ignore lint/performance/noImgElement: data URL, tidak perlu optimasi next/image
    <img src={src} alt={t('qrAlt')} width={288} height={288} className="rounded-lg border bg-white" />
  );
}

function TestMessage({ ready }: { ready: boolean }) {
  const t = useTranslations('messaging');
  const te = useTranslations();
  const { header, canManage } = useMessagingCtx();
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/messaging/test', { params: header, body: { phone: phone.trim(), text } })),
    onSuccess: () => {
      setError(null);
      toast.success(t('testQueued'));
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const enabled = canManage && ready;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{t('testTitle')}</CardTitle>
        <CardDescription>{ready ? t('testHint') : t('testNeedsReady')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-xl gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="test-phone">{t('testPhone')}</Label>
            <Input
              id="test-phone"
              inputMode="tel"
              placeholder="0812xxxxxxxx"
              disabled={!enabled}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="test-text">{t('testText')}</Label>
            <Input
              id="test-text"
              maxLength={500}
              disabled={!enabled}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div>
            <Button type="submit" disabled={!enabled || !phone.trim() || !text.trim() || send.isPending}>
              {t('testSend')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function ConnectionPanel() {
  const t = useTranslations('messaging');
  const te = useTranslations();
  const { school, header, canManage } = useMessagingCtx();
  const queryClient = useQueryClient();
  const key = ['messaging-account', school.schoolId];

  const account = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/messaging/account', { params: header })),
    // Polling hanya saat menunggu sambungan (status antara, atau sambungan sudah diminta tetapi belum siap);
    // TanStack menjeda otomatis ketika tab disembunyikan.
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      const waiting = d.status === 'connecting' || d.status === 'qr';
      const requestedButNotReady = d.desiredState === 'on' && d.status !== 'ready' && d.status !== 'failed';
      return waiting || requestedButNotReady ? 3000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const connect = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/messaging/account/connect', { params: header })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const disconnect = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/messaging/account/disconnect', { params: header })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (account.isPending) return <Skeleton className="h-64 w-full" />;
  if (!account.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{te(errorKey(account.error))}</AlertDescription>
      </Alert>
    );
  }
  const a = account.data;
  const status = a.status as AccountStatus;
  const style = STATUS_STYLE[status];
  const canConnect = status === 'disconnected' || status === 'failed';
  const canDisconnect = status !== 'disconnected' || a.desiredState === 'on';

  return (
    <div className="grid gap-6">
      {a.provider === 'log' && (
        <Alert>
          <Info />
          <AlertDescription>{t('providerLog')}</AlertDescription>
        </Alert>
      )}
      {a.provider === 'disabled' && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>{t('providerInactive')}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading flex flex-wrap items-center gap-2 text-lg">
            {t('connectionTitle')}
            <Badge variant={style.variant} className={style.className}>
              {t(`status.${status}`)}
            </Badge>
          </CardTitle>
          <CardDescription>{t('connectionHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {a.phone && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t('connectedPhone')}: </span>
              <span className="font-mono">{a.phone}</span>
            </p>
          )}
          {a.lastError && status !== 'ready' && (
            <Alert variant="destructive">
              <AlertDescription>
                {t('lastError')}: {a.lastError}
              </AlertDescription>
            </Alert>
          )}

          {status === 'qr' && a.qr && (
            <div className="flex flex-wrap items-start gap-6">
              <QrImage value={a.qr} />
              <div className="grid max-w-sm gap-2">
                <p className="text-sm font-medium">{t('qrTitle')}</p>
                <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
                  <li>{t('qrStep1')}</li>
                  <li>{t('qrStep2')}</li>
                  <li>{t('qrStep3')}</li>
                  <li>{t('qrStep4')}</li>
                </ol>
                <p className="text-muted-foreground text-xs">{t('qrRefresh')}</p>
              </div>
            </div>
          )}
          {status === 'connecting' && <Skeleton className="h-6 w-56" />}

          <div className="flex flex-wrap gap-2">
            {canConnect && (
              <Button disabled={!canManage || connect.isPending} onClick={() => connect.mutate()}>
                {t('connect')}
              </Button>
            )}
            {canDisconnect && (
              <Button
                variant="outline"
                disabled={!canManage || disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                {t('disconnect')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Alert>
        <TriangleAlert />
        <AlertDescription>{t('riskNote')}</AlertDescription>
      </Alert>

      <TestMessage ready={status === 'ready'} />
    </div>
  );
}
