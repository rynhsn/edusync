'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/page-header';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useStaff } from '../../platform-shell';
import { QueryError } from '../platform-kit';

export function EmailView() {
  const t = useTranslations('platformEmail');
  const te = useTranslations();
  const { role } = useStaff();
  const queryClient = useQueryClient();
  const canEdit = role === 'admin';

  const settings = useQuery({
    queryKey: ['platform-smtp-settings'],
    queryFn: async () => unwrap(await api.GET('/v1/platform/smtp-settings')),
  });

  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [from, setFrom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setHost(s.host);
    setPort(String(s.port));
    setSecure(s.secure);
    setUser(s.user);
    setFrom(s.from);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/platform/smtp-settings', {
          body: {
            host: host.trim(),
            port: Number(port),
            secure,
            from: from.trim(),
            ...(user.trim() ? { user: user.trim() } : { clearAuth: true }),
            ...(password.trim() ? { password: password.trim() } : {}),
          },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setPassword('');
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['platform-smtp-settings'] });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const test = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/platform/smtp-settings/test', { body: { to: testTo.trim() } })),
    onSuccess: () => {
      setTestError(null);
      toast.success(t('testSent'));
    },
    // Pesan dari server SMTP ikut ditampilkan supaya penyebabnya terlihat (salah sandi, port tertutup, dsb).
    onError: (e) => setTestError(`${te(errorKey(e))} (${e instanceof Error ? e.message : ''})`),
  });

  if (settings.isPending) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!settings.data) return <QueryError error={settings.error} onRetry={() => settings.refetch()} />;
  const s = settings.data;

  function fill(preset: 'mailpit' | 'smtp') {
    if (preset === 'mailpit') {
      setHost('localhost');
      setPort('1025');
      setSecure(false);
      setUser('');
      setPassword('');
    } else {
      setHost('');
      setPort('587');
      setSecure(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        icon={Mail}
        tone="sky"
        title={t('title')}
        description={canEdit ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{t('title')}</CardTitle>
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
            {canEdit && (
              <div className="grid content-start gap-2">
                <Label>{t('presets')}</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fill('mailpit')}>
                    {t('presetMailpit')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => fill('smtp')}>
                    {t('presetSmtp')}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">{t('presetMailpitHint')}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="grid content-start gap-2">
                <Label htmlFor="smtp-host">{t('host')}</Label>
                <Input
                  id="smtp-host"
                  required
                  disabled={!canEdit}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="smtp-port">{t('port')}</Label>
                <Input
                  id="smtp-port"
                  required
                  inputMode="numeric"
                  disabled={!canEdit}
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="smtp-secure"
                checked={secure}
                disabled={!canEdit}
                onCheckedChange={(v) => setSecure(v === true)}
              />
              <Label htmlFor="smtp-secure" className="font-normal">
                {t('secure')}
              </Label>
            </div>

            <div className="grid content-start gap-2">
              <Label htmlFor="smtp-user">{t('user')}</Label>
              <Input
                id="smtp-user"
                autoComplete="off"
                disabled={!canEdit}
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t('userHint')}</p>
            </div>

            {user.trim() && (
              <div className="grid content-start gap-2">
                <Label htmlFor="smtp-password">{t('password')}</Label>
                <PasswordInput
                  id="smtp-password"
                  autoComplete="new-password"
                  disabled={!canEdit}
                  value={password}
                  placeholder={s.hasPassword ? '••••••••' : ''}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {s.hasPassword ? t('passwordKept') : t('passwordNone')} {t('passwordHint')}
                </p>
              </div>
            )}

            <div className="grid content-start gap-2">
              <Label htmlFor="smtp-from">{t('from')}</Label>
              <Input
                id="smtp-from"
                required
                disabled={!canEdit}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t('fromHint')}</p>
            </div>

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

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{t('testTitle')}</CardTitle>
            <CardDescription>{t('testHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid max-w-2xl gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                test.mutate();
              }}
            >
              <div className="grid content-start gap-2">
                <Label htmlFor="smtp-test-to">{t('testTo')}</Label>
                <Input
                  id="smtp-test-to"
                  type="email"
                  required
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
              </div>
              {testError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{testError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Button type="submit" variant="outline" disabled={test.isPending}>
                  <Send className="size-4" /> {t('testSend')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </PageBody>
  );
}
