'use client';

import {
  type CatalogItem,
  QuoteError,
  type QuoteLine,
  quoteUnits,
  slugify,
  withRequirements,
} from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, unwrap } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { errorKey } from '@/lib/errors';
import { checkPasswords } from '@/lib/password';
import { useConfig } from '@/lib/site';
import { cn } from '@/lib/utils';
import { SlugField, type SlugStatus } from './slug-field';

interface Unit {
  id: string;
  name: string;
  slug: string;
  slugTouched: boolean;
  modules: string[];
  tier: string;
}

const newUnit = (): Unit => ({
  id: crypto.randomUUID(),
  name: '',
  slug: '',
  slugTouched: false,
  modules: [],
  tier: 't300',
});

export function RegisterForm() {
  const t = useTranslations('register');
  const tm = useTranslations('modules');
  const tt = useTranslations('tiers');
  const te = useTranslations();
  const locale = useLocale();

  const [foundationName, setFoundationName] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [units, setUnits] = useState<Unit[]>([newUnit()]);
  const [slugStatus, setSlugStatus] = useState<Record<string, SlugStatus>>({});
  const [account, setAccount] = useState({ name: '', email: '', password: '', confirm: '' });
  const [touched, setTouched] = useState({ password: false });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const catalog = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => unwrap(await api.GET('/v1/catalog')),
  });

  const config = useConfig();

  // 401 berarti belum masuk, bukan kesalahan: form akan membuatkan akun.
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.GET('/v1/me');
      return res.response.status === 401 ? null : unwrap(res);
    },
  });
  const signedIn = me.data?.user;

  const items: CatalogItem[] = useMemo(
    () => (catalog.data?.items ?? []).map((i, sort) => ({ ...i, sort })),
    [catalog.data],
  );
  const modules = items.filter((i) => i.kind === 'module');
  const tiers = items.filter((i) => i.kind === 'tier');

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'su' ? 'id' : locale, {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const moduleName = (key: string, fallback: string) => (tm.has(key as never) ? tm(key as never) : fallback);
  const tierName = (key: string, fallback: string) => (tt.has(key as never) ? tt(key as never) : fallback);

  const yearlyMonths = catalog.data?.yearlyMonths;
  const quote = useMemo(() => {
    if (items.length === 0) return null;
    try {
      return quoteUnits(
        items,
        units.map((u) => ({ name: u.name || '…', modules: u.modules, tier: u.tier })),
        period,
        yearlyMonths ? { yearlyMonths } : {},
      );
    } catch (e) {
      if (e instanceof QuoteError) return null;
      throw e;
    }
  }, [items, units, period, yearlyMonths]);

  const lineLabel = (line: QuoteLine) => {
    const [prefix, key] = line.key.includes(': ')
      ? [line.key.split(': ')[0], line.key.split(': ')[1]]
      : ['', line.key];
    const base = key === 'core' ? tm('core') : tierName(key ?? '', moduleName(key ?? '', line.name));
    return prefix ? `${prefix}: ${base}` : base;
  };

  const update = (id: string, patch: Partial<Unit>) =>
    setUnits((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const setStatusFor = useCallback(
    (id: string, status: SlugStatus) => setSlugStatus((s) => (s[id] === status ? s : { ...s, [id]: status })),
    [],
  );

  const slugsOk =
    units.every((u) => slugStatus[`${u.id}-slug`] === 'available') &&
    new Set(units.map((u) => u.slug)).size === units.length;
  const passwordCheck = checkPasswords(account.password, account.confirm);
  // Kesalahan panjang baru ditampilkan setelah kolom ditinggalkan, supaya tidak muncul saat masih mengetik.
  const showShort = passwordCheck.tooShort && touched.password;
  const accountOk = signedIn || (account.name.trim().length >= 2 && account.email && passwordCheck.ok);
  const canSubmit =
    !pending &&
    quote &&
    slugsOk &&
    accountOk &&
    foundationName.trim().length >= 3 &&
    units.every((u) => u.name.trim().length >= 3);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (!signedIn) {
        const res = await authClient.signUp.email({
          name: account.name.trim(),
          email: account.email.trim(),
          password: account.password,
        });
        if (res.error) {
          const code = res.error.code ?? '';
          setError(
            code.includes('EXISTS')
              ? t('emailTaken')
              : code.includes('PASSWORD')
                ? t('weakPassword')
                : te('errors.unknown'),
          );
          return;
        }
      }
      const created = unwrap(
        await api.POST('/v1/registrations', {
          body: {
            foundationName: foundationName.trim(),
            period,
            units: units.map((u) => ({
              name: u.name.trim(),
              slug: u.slug,
              modules: u.modules,
              tier: u.tier,
            })),
          },
        }),
      );
      try {
        sessionStorage.setItem('edusync.pendingRegistration', created.registrationId);
      } catch {
        // Tanpa penyimpanan sesi, halaman status tetap bisa dibuka lewat tautan dari penyedia pembayaran.
      }
      window.location.assign(created.paymentUrl);
    } catch (e) {
      setError(te(errorKey(e)));
      if (!(e instanceof ApiError)) setError(te('errors.unknown'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto grid w-full max-w-6xl gap-8 p-4 pb-16 lg:grid-cols-[1fr_22rem]"
    >
      <div className="grid gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">{t('title')}</h1>
          <p className="text-muted-foreground mt-2 max-w-prose text-sm">{t('subtitle')}</p>
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('account')}</CardTitle>
          </CardHeader>
          <CardContent>
            {me.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : signedIn ? (
              <p className="text-sm">{t('signedInAs', { email: signedIn.email })}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Label htmlFor="name">{t('name')}</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={account.name}
                    onChange={(e) => setAccount({ ...account, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="email">{t('email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={account.email}
                    onChange={(e) => setAccount({ ...account, email: e.target.value })}
                    required
                  />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="password">{t('password')}</Label>
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    value={account.password}
                    onChange={(e) => setAccount({ ...account, password: e.target.value })}
                    onBlur={() => setTouched((s) => ({ ...s, password: true }))}
                    aria-invalid={showShort}
                    aria-describedby="password-hint"
                    required
                  />
                  <p
                    id="password-hint"
                    aria-live="polite"
                    className={cn('text-xs', showShort ? 'text-destructive' : 'text-muted-foreground')}
                  >
                    {showShort ? t('weakPassword') : t('passwordHint')}
                  </p>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="passwordConfirm">{t('passwordConfirm')}</Label>
                  <PasswordInput
                    id="passwordConfirm"
                    autoComplete="new-password"
                    value={account.confirm}
                    onChange={(e) => setAccount({ ...account, confirm: e.target.value })}
                    aria-invalid={passwordCheck.mismatch}
                    aria-describedby="password-confirm-hint"
                    required
                  />
                  <p
                    id="password-confirm-hint"
                    aria-live="polite"
                    className="text-destructive min-h-4 text-xs"
                  >
                    {passwordCheck.mismatch ? t('passwordMismatch') : ''}
                  </p>
                </div>
                <p className="text-muted-foreground text-sm sm:col-span-2">
                  {t('haveAccount')}{' '}
                  <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
                    {t('signIn')}
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('foundation')}</CardTitle>
            <CardDescription>{t('foundationHelp')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid content-start gap-2">
              <Label htmlFor="foundationName">{t('foundationName')}</Label>
              <Input
                id="foundationName"
                value={foundationName}
                onChange={(e) => setFoundationName(e.target.value)}
                required
                minLength={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <h2 className="font-heading text-xl font-semibold">{t('units')}</h2>
          {catalog.isPending && <Skeleton className="h-64 w-full" />}
          {catalog.isError && (
            <Alert variant="destructive">
              <AlertDescription>{te(errorKey(catalog.error))}</AlertDescription>
            </Alert>
          )}
          {catalog.data &&
            units.map((unit, index) => {
              const extra = withRequirements(unit.modules, items).filter((m) => !unit.modules.includes(m));
              return (
                <Card key={unit.id}>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{t('unit', { n: index + 1 })}</CardTitle>
                    {units.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setUnits((l) => l.filter((u) => u.id !== unit.id))}
                      >
                        <Trash2 className="size-4" /> {t('removeUnit')}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="grid gap-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid content-start gap-2">
                        <Label htmlFor={`${unit.id}-name`}>{t('unitName')}</Label>
                        <Input
                          id={`${unit.id}-name`}
                          value={unit.name}
                          onChange={(e) =>
                            update(unit.id, {
                              name: e.target.value,
                              ...(unit.slugTouched ? {} : { slug: slugify(e.target.value) }),
                            })
                          }
                          required
                          minLength={3}
                        />
                      </div>
                      <SlugField
                        id={`${unit.id}-slug`}
                        value={unit.slug}
                        onChange={(value) => update(unit.id, { slug: value, slugTouched: true })}
                        status={slugStatus[`${unit.id}-slug`]}
                        onStatus={setStatusFor}
                        baseDomain={config.data?.baseDomain}
                      />
                    </div>

                    {(catalog.data.plans?.length ?? 0) > 0 && (
                      <div className="grid gap-2">
                        <p className="text-sm font-medium">{t('plansTitle')}</p>
                        <div className="flex flex-wrap gap-2">
                          {catalog.data.plans.map((plan) => {
                            const picked =
                              plan.tier === unit.tier &&
                              plan.modules.length === unit.modules.length &&
                              plan.modules.every((m) => unit.modules.includes(m));
                            return (
                              <Button
                                key={plan.key}
                                type="button"
                                size="sm"
                                variant={picked ? 'default' : 'outline'}
                                aria-pressed={picked}
                                title={plan.description}
                                onClick={() =>
                                  update(unit.id, { modules: [...plan.modules], tier: plan.tier })
                                }
                              >
                                {plan.name}
                              </Button>
                            );
                          })}
                        </div>
                        <p className="text-muted-foreground text-xs">{t('plansNote')}</p>
                      </div>
                    )}

                    <fieldset className="grid content-start gap-2">
                      <legend className="text-sm font-medium">{t('modulesTitle')}</legend>
                      <p className="text-muted-foreground text-xs">{t('modulesNote')}</p>
                      <div className="mt-1 grid gap-2 sm:grid-cols-2">
                        {modules.map((m) => {
                          const checked = unit.modules.includes(m.key) || extra.includes(m.key);
                          return (
                            <label
                              key={m.key}
                              htmlFor={`mod-${unit.id}-${m.key}`}
                              className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors',
                                checked ? 'border-primary/50 bg-accent/50' : 'hover:bg-muted/50',
                              )}
                            >
                              <Checkbox
                                id={`mod-${unit.id}-${m.key}`}
                                checked={checked}
                                disabled={extra.includes(m.key)}
                                onCheckedChange={(next) =>
                                  update(unit.id, {
                                    modules: next
                                      ? [...unit.modules, m.key]
                                      : unit.modules.filter((x) => x !== m.key),
                                  })
                                }
                              />
                              <span className="flex-1">{moduleName(m.key, m.name)}</span>
                              <span className="text-muted-foreground text-xs tabular-nums">
                                +{money.format(m.priceMonthly)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {extra.length > 0 && (
                        <p className="text-muted-foreground text-xs">
                          {t('alsoIncluded', { modules: extra.map((k) => moduleName(k, k)).join(', ') })}
                        </p>
                      )}
                    </fieldset>

                    <div className="grid content-start gap-2 sm:max-w-xs">
                      <Label htmlFor={`${unit.id}-tier`}>{t('tier')}</Label>
                      <SelectField
                        id={`${unit.id}-tier`}
                        value={unit.tier}
                        onChange={(e) => update(unit.id, { tier: e.target.value })}
                      >
                        {tiers.map((tier) => (
                          <option key={tier.key} value={tier.key}>
                            {tierName(tier.key, tier.name)}
                            {tier.priceMonthly > 0 ? ` (+${money.format(tier.priceMonthly)})` : ''}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          {catalog.data && units.length < 10 && (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              onClick={() => setUnits((l) => [...l, newUnit()])}
            >
              <Plus className="size-4" /> {t('addUnit')}
            </Button>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{t('summary')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <fieldset className="grid content-start gap-2">
              <legend className="text-sm font-medium">{t('period')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['monthly', 'yearly'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={period === p}
                    onClick={() => setPeriod(p)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm transition-colors',
                      period === p
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    {t(p)}
                  </button>
                ))}
              </div>
              {period === 'yearly' && (catalog.data?.yearlyMonths ?? 10) < 12 && (
                <p className="text-primary text-xs font-medium">
                  {t('yearlyNote', {
                    months: catalog.data?.yearlyMonths ?? 10,
                    saved: 12 - (catalog.data?.yearlyMonths ?? 10),
                  })}
                </p>
              )}
            </fieldset>

            <ul className="grid gap-2 text-sm">
              {quote?.lines.map((line) => (
                <li key={line.key} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{lineLabel(line)}</span>
                  <span className="tabular-nums">{money.format(line.amount)}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between border-t pt-4">
              <span className="font-medium">{t('total')}</span>
              <span className="font-heading text-2xl font-semibold tabular-nums">
                {quote ? money.format(quote.total) : '–'}
              </span>
            </div>

            <Button type="submit" size="lg" className="h-10" disabled={!canSubmit}>
              {pending ? t('submitting') : t('submit')}
            </Button>
            <p className="text-muted-foreground text-xs">{t('priceNote')}</p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
