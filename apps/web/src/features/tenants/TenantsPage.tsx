import { useMemo, useState, type FormEvent } from 'react';
import { Building2, CircleAlert, Clock3, LoaderCircle, Plus, RefreshCw, Search } from 'lucide-react';
import type { PlatformTenant } from '@edusync/contracts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createTenant, retryTenantProvisioning, updateTenantStatus } from '@/lib/platform-api';
import { canManageTenantStatus, type PlatformAccess } from '@/features/access';
import { EmptyState, Field, FormError, Loading, TenantStatus, formatDate } from '@/features/shared';
import { useTranslation } from '@/i18n';

export function TenantsPage({
  tenants,
  loading,
  canCreate,
  access = canCreate ? 'admin' : 'readonly',
  onCreated,
  onUpdated,
}: {
  tenants: PlatformTenant[];
  loading: boolean;
  canCreate: boolean;
  access?: PlatformAccess;
  onCreated: (tenant: PlatformTenant, adminName: string) => void;
  onUpdated?: (tenant: PlatformTenant, message: string, tone?: 'success' | 'warning') => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const { locale, t } = useTranslation();

  const canManageStatus = canManageTenantStatus(access);
  const showActions = canCreate || canManageStatus;
  const failedTenants = useMemo(() => tenants.filter((tenant) => tenant.status === 'provisioning_failed' || Boolean(tenant.provisioningError)), [tenants]);
  const filtered = useMemo(
    () => tenants.filter((tenant) => `${tenant.name} ${tenant.slug} ${tenant.status} ${tenant.adminName ?? ''} ${tenant.adminEmail ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())),
    [tenants, query],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const tenant = await createTenant({
        name: String(form.get('name')),
        slug: String(form.get('slug')),
        adminName: String(form.get('adminName')),
        adminEmail: String(form.get('adminEmail')),
      });
      onCreated(tenant, String(form.get('adminName')));
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('tenants.createError'));
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async (tenant: PlatformTenant) => {
    setActionBusyId(tenant.id);
    setActionError('');
    try {
      const updated = await retryTenantProvisioning(tenant.id);
      onUpdated?.(updated, t('tenants.retrySuccess', { name: updated.name }), 'success');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('tenants.retryError'));
    } finally {
      setActionBusyId('');
    }
  };

  const handleStatusChange = async (tenant: PlatformTenant, nextStatus: 'active' | 'suspended') => {
    setActionBusyId(tenant.id);
    setActionError('');
    try {
      const updated = await updateTenantStatus(tenant.id, nextStatus);
      onUpdated?.(
        updated,
        t(nextStatus === 'suspended' ? 'tenants.statusUpdatedSuspended' : 'tenants.statusUpdatedActive', { name: updated.name }),
        nextStatus === 'suspended' ? 'warning' : 'success',
      );
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('tenants.statusUpdateError'));
    } finally {
      setActionBusyId('');
    }
  };

  const renderActions = (tenant: PlatformTenant) => {
    const isBusy = actionBusyId === tenant.id;
    return <div className="flex flex-wrap items-center gap-2">
      {canCreate && tenant.status === 'provisioning_failed' && (
        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void handleRetry(tenant)}>
          {isBusy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {isBusy ? t('tenants.retryingProvisioning') : t('tenants.retryProvisioning')}
        </Button>
      )}
      {canManageStatus && (tenant.status === 'active' || tenant.status === 'suspended') && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant={tenant.status === 'active' ? 'outline' : 'secondary'} disabled={isBusy}>
              {isBusy && <LoaderCircle size={14} className="animate-spin" />}
              {tenant.status === 'active' ? t('tenants.suspend') : t('tenants.reactivate')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t(tenant.status === 'active' ? 'tenants.suspendTitle' : 'tenants.reactivateTitle', { name: tenant.name })}</AlertDialogTitle>
              <AlertDialogDescription>{t(tenant.status === 'active' ? 'tenants.suspendDescription' : 'tenants.reactivateDescription', { name: tenant.name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleStatusChange(tenant, tenant.status === 'active' ? 'suspended' : 'active')}>
                {tenant.status === 'active' ? t('tenants.suspend') : t('tenants.reactivate')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>;
  };

  return <Card>
    <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle>{access === 'user' ? t('tenants.myWorkspacesTitle') : t('tenants.title')}</CardTitle>
        <CardDescription>{t('tenants.count', { count: tenants.length })}</CardDescription>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="w-full pl-9 sm:w-64" placeholder={t('tenants.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('tenants.searchLabel')} />
        </div>
        {canCreate && <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setError(''); }}>
          <DialogTrigger asChild><Button><Plus size={16} />{t('common.createWorkspace')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('tenants.createTitle')}</DialogTitle><DialogDescription>{t('tenants.createDescription')}</DialogDescription></DialogHeader>
            <form className="space-y-4" onSubmit={(event) => void submit(event)}>
              <Field label={t('tenants.fieldSchoolName')} name="name" required minLength={2} maxLength={160} placeholder={t('tenants.placeholderSchoolName')} />
              <div>
                <Label htmlFor="slug">{t('tenants.fieldSlug')}</Label>
                <div className="mt-1 flex items-center">
                  <Input id="slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} placeholder={t('tenants.placeholderSlug')} />
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">.edusync.school</span>
                </div>
              </div>
              <Field label={t('tenants.fieldAdminName')} name="adminName" required minLength={2} maxLength={100} placeholder={t('common.fullName')} />
              <Field label={t('tenants.fieldAdminEmail')} name="adminEmail" type="email" required placeholder={t('tenants.placeholderAdminEmail')} />
              <Alert variant="warning"><Clock3 size={16} /><AlertTitle>{t('tenants.activationTitle')}</AlertTitle><AlertDescription>{t('tenants.activationDescription')}</AlertDescription></Alert>
              {error && <Alert variant="destructive"><CircleAlert size={16} /><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}{busy ? t('tenants.provisioning') : t('common.createWorkspace')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>
    </CardHeader>
    <CardContent>
      {actionError && <FormError message={actionError} />}
      {failedTenants.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <CircleAlert size={16} />
          <AlertTitle>{t('tenants.errorBannerTitle')}</AlertTitle>
          <AlertDescription className="space-y-2">
            {failedTenants.map((tenant) => (
              <div key={tenant.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span><strong>{tenant.name}</strong> ({tenant.slug}.edusync.school): {tenant.provisioningError ?? t('tenants.noteUnavailable')}</span>
                {canCreate && tenant.status === 'provisioning_failed' && (
                  <Button size="sm" variant="outline" disabled={actionBusyId === tenant.id} onClick={() => void handleRetry(tenant)}>
                    {actionBusyId === tenant.id ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {actionBusyId === tenant.id ? t('tenants.retryingProvisioning') : t('tenants.retryProvisioning')}
                  </Button>
                )}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}
      {loading && tenants.length === 0 ? <Loading label={t('tenants.loading')} /> : filtered.length === 0 ? <EmptyState icon={<Building2 size={21} />} title={query ? t('tenants.emptyQueryTitle') : t('overview.emptyTitle')} description={query ? t('tenants.emptyQueryDescription') : t('tenants.emptyDescription')} action={!query && canCreate ? <Button onClick={() => setOpen(true)}><Plus size={16} />{t('common.createWorkspace')}</Button> : undefined} /> : <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="pb-3 pr-4">{t('tenants.colSchool')}</th>
                <th className="pb-3 pr-4">{t('tenants.fieldSlug')}</th>
                <th className="pb-3 pr-4">{t('tenants.colAdminContact')}</th>
                <th className="pb-3 pr-4">{t('tenants.colStatus')}</th>
                <th className="pb-3 pr-4">{t('tenants.colCreated')}</th>
                <th className="pb-3 pr-4">{t('tenants.colNote')}</th>
                {showActions && <th className="pb-3">{t('tenants.colActions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((tenant) => <tr key={tenant.id} className="align-top">
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent font-bold text-accent-foreground">{tenant.name.slice(0, 1).toUpperCase()}</span>
                    <span className="font-semibold">{tenant.name}</span>
                  </div>
                </td>
                <td className="py-4 pr-4 text-muted-foreground">{tenant.slug}.edusync.school</td>
                <td className="py-4 pr-4 text-xs text-muted-foreground">
                  {tenant.adminName || tenant.adminEmail ? (
                    <div>
                      {tenant.adminName && <p className="font-medium text-foreground">{tenant.adminName}</p>}
                      {tenant.adminEmail && <p>{tenant.adminEmail}</p>}
                    </div>
                  ) : '—'}
                </td>
                <td className="py-4 pr-4"><TenantStatus status={tenant.status} /></td>
                <td className="py-4 pr-4 text-muted-foreground">{formatDate(tenant.createdAt, locale)}</td>
                <td className="max-w-xs py-4 text-xs">
                  {tenant.provisioningError
                    ? <span className="font-medium text-danger-foreground">{tenant.provisioningError}</span>
                    : <span className="text-muted-foreground">{tenant.schoolTenantId ? t('tenants.serviceConnected') : t('tenants.noteUnavailable')}</span>}
                </td>
                {showActions && <td className="py-4">{renderActions(tenant)}</td>}
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">
          {filtered.map((tenant) => <article key={tenant.id} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent font-bold text-accent-foreground">{tenant.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <p className="text-sm font-semibold">{tenant.name}</p>
                  <p className="text-xs text-muted-foreground">{tenant.slug}.edusync.school</p>
                </div>
              </div>
              <TenantStatus status={tenant.status} />
            </div>
            {(tenant.adminName || tenant.adminEmail) && (
              <p className="mt-2 text-xs text-muted-foreground">{[tenant.adminName, tenant.adminEmail].filter(Boolean).join(' · ')}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{t('tenants.createdOn', { date: formatDate(tenant.createdAt, locale) })}</p>
            {tenant.provisioningError && <p className="mt-2 text-xs font-medium text-danger-foreground">{tenant.provisioningError}</p>}
            {showActions && <div className="mt-3">{renderActions(tenant)}</div>}
          </article>)}
        </div>
      </>}
      <div className="mt-4 flex justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{t('tenants.showing', { shown: filtered.length, total: tenants.length })}</span>
        <span>{t('tenants.apiMaximum')}</span>
      </div>
    </CardContent>
  </Card>;
}

