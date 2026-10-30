'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { pklKey, usePklPartners } from '../shared';

interface Draft {
  id: string | null;
  name: string;
  field: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
  active: boolean;
}
const EMPTY: Draft = {
  id: null,
  name: '',
  field: '',
  address: '',
  contactName: '',
  phone: '',
  email: '',
  active: true,
};

/** Mitra industri PKL: kartu dan CRUD. */
export function PartnersView() {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('pkl:manage');
  const partners = usePklPartners();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        name: d.name.trim(),
        field: d.field.trim() || null,
        address: d.address.trim() || null,
        contactName: d.contactName.trim() || null,
        phone: d.phone.trim() || null,
        email: d.email.trim() || null,
        active: d.active,
      };
      if (d.id) {
        return unwrap(
          await api.PUT('/v1/pkl/partners/{id}', { params: { ...header, path: { id: d.id } }, body }),
        );
      }
      return unwrap(await api.POST('/v1/pkl/partners', { params: header, body }));
    },
    onSuccess: (_r, d) => {
      toast.success(d.id ? t('saved') : t('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/pkl/partners/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function openNew() {
    setDraft(EMPTY);
    setError(null);
    setOpen(true);
  }

  const list = partners.data ?? [];

  return (
    <PageBody>
      <PageHeader
        title={t('partnersTitle')}
        description={manage ? t('partnersSubtitle') : `${t('partnersSubtitle')} ${t('readOnly')}`}
        actions={
          manage && (
            <Button onClick={openNew}>
              <Plus className="size-4" aria-hidden /> {t('addPartner')}
            </Button>
          )
        }
      />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? t('editPartner') : t('addPartner')}
        submitLabel={t('save')}
        size="wide"
        error={error}
        disabled={!draft.name.trim()}
        onSubmit={() => save.mutateAsync(draft)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="pt-name">{t('partnerName')}</Label>
            <Input
              id="pt-name"
              required
              maxLength={160}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pt-field">{t('partnerField')}</Label>
            <Input
              id="pt-field"
              maxLength={120}
              value={draft.field}
              onChange={(e) => setDraft({ ...draft, field: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pt-contact">{t('partnerContact')}</Label>
            <Input
              id="pt-contact"
              maxLength={120}
              value={draft.contactName}
              onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pt-phone">{t('partnerPhone')}</Label>
            <Input
              id="pt-phone"
              type="tel"
              maxLength={30}
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pt-email">{t('partnerEmail')}</Label>
            <Input
              id="pt-email"
              type="email"
              maxLength={254}
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="pt-address">{t('partnerAddress')}</Label>
            <Input
              id="pt-address"
              maxLength={300}
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="pt-active"
              checked={draft.active}
              onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
            />
            <Label htmlFor="pt-active">{t('partnerActive')}</Label>
          </div>
        </div>
      </FormDialog>

      {partners.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {partners.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-orange-300 bg-orange-50/50 px-6 py-12 text-center dark:border-orange-500/30 dark:bg-orange-500/5">
          <Building2 className="size-10 text-orange-500" aria-hidden />
          <h2 className="font-heading text-lg font-semibold">{t('emptyPartnersTitle')}</h2>
          <p className="text-muted-foreground max-w-md text-sm">{t('emptyPartnersBody')}</p>
          {manage && (
            <Button onClick={openNew}>
              <Plus className="size-4" aria-hidden /> {t('addPartner')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <article
              key={p.id}
              className={cn(
                'bg-card relative grid content-start gap-3 overflow-hidden rounded-xl border p-4 transition-shadow hover:shadow-md',
                !p.active && 'opacity-70',
              )}
            >
              <span
                aria-hidden
                className={cn('absolute inset-x-0 top-0 h-1', p.active ? 'bg-orange-500' : 'bg-slate-400')}
              />
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200">
                  <Building2 className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading truncate text-base font-semibold">{p.name}</h2>
                  <p className="text-muted-foreground truncate text-xs">{p.field ?? t('noField')}</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    p.active
                      ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-200',
                  )}
                >
                  {p.active ? t('active') : t('inactive')}
                </span>
              </div>
              <ul className="text-muted-foreground grid gap-1 text-xs">
                {p.contactName && (
                  <li className="flex items-center gap-1.5">
                    <UserRound className="size-3.5 shrink-0" aria-hidden /> {p.contactName}
                  </li>
                )}
                {p.phone && (
                  <li className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0" aria-hidden /> {p.phone}
                  </li>
                )}
                {p.email && (
                  <li className="flex items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0" aria-hidden />{' '}
                    <span className="truncate">{p.email}</span>
                  </li>
                )}
                {p.address && (
                  <li className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {p.address}
                  </li>
                )}
              </ul>
              <div className="flex items-center justify-between border-t pt-2.5">
                <span className="text-sm">
                  <span className="font-heading text-lg font-semibold tabular-nums">{p.placementCount}</span>{' '}
                  <span className="text-muted-foreground text-xs">{t('placementsCount')}</span>
                </span>
                {manage && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t('editPartner')}: ${p.name}`}
                      onClick={() => {
                        setDraft({
                          id: p.id,
                          name: p.name,
                          field: p.field ?? '',
                          address: p.address ?? '',
                          contactName: p.contactName ?? '',
                          phone: p.phone ?? '',
                          email: p.email ?? '',
                          active: p.active,
                        });
                        setError(null);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <ConfirmDialog
                      destructive
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${t('deletePartner')}: ${p.name}`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      }
                      title={t('confirm.partnerTitle')}
                      description={p.name}
                      confirmLabel={t('deletePartner')}
                      pending={remove.isPending}
                      onConfirm={() => remove.mutateAsync(p.id)}
                    />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </PageBody>
  );
}
