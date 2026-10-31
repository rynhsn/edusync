'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CreditCard, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconTile, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { methodIcon } from '../shared';
import { ListSkeleton, RowMenu, SectionCard } from '../ui';

interface Draft {
  id: string | null;
  label: string;
  active: boolean;
}
const EMPTY: Draft = { id: null, label: '', active: true };

/** Metode pembayaran sekolah: tambah, ubah label, aktif/nonaktif, urutan, dan hapus (bila belum terpakai). */
export function PaymentMethodsCard() {
  const t = useTranslations('finance');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);

  const list = useQuery({
    queryKey: ['finance-payment-methods', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/finance/payment-methods', { params: header })),
  });
  const items = list.data?.items ?? [];
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['finance-payment-methods', school.schoolId] });

  const save = useMutation({
    mutationFn: async (v: Draft) => {
      const label = v.label.trim();
      if (v.id) {
        return unwrap(
          await api.PATCH('/v1/finance/payment-methods/{id}', {
            params: { ...header, path: { id: v.id } },
            body: { label, active: v.active },
          }),
        );
      }
      return unwrap(
        await api.POST('/v1/finance/payment-methods', { params: header, body: { label, active: v.active } }),
      );
    },
    onSuccess: (_d, v) => {
      toast.success(v.id ? tm('saved') : tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const toggle = useMutation({
    mutationFn: async (m: { id: string; active: boolean }) =>
      unwrap(
        await api.PATCH('/v1/finance/payment-methods/{id}', {
          params: { ...header, path: { id: m.id } },
          body: { active: m.active },
        }),
      ),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(await api.PUT('/v1/finance/payment-methods/order', { params: header, body: { ids } })),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/finance/payment-methods/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function move(index: number, delta: -1 | 1) {
    const ids = items.map((m) => m.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  }

  function openEdit(d: Draft) {
    setError(null);
    setDraft(d);
    setEditing(true);
  }

  const fields = (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="pm-label">{t('pmLabel')}</Label>
        <Input
          id="pm-label"
          required
          maxLength={40}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        {!draft.id && <p className="text-muted-foreground text-xs">{t('pmLabelHint')}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="pm-active"
          checked={draft.active}
          onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
        />
        <Label htmlFor="pm-active">{t('active')}</Label>
      </div>
    </div>
  );

  return (
    <SectionCard
      icon={CreditCard}
      tone="sky"
      title={t('pmTitle')}
      description={t('pmHint')}
      actions={
        <FormDialog
          trigger={
            <Button>
              <Plus className="size-4" /> {t('pmAdd')}
            </Button>
          }
          title={t('pmAdd')}
          submitLabel={tm('add')}
          error={error}
          disabled={!draft.label.trim()}
          onOpenChange={() => {
            setDraft(EMPTY);
            setError(null);
          }}
          onSubmit={() => save.mutateAsync(draft)}
        >
          {fields}
        </FormDialog>
      }
    >
      {list.isPending && <ListSkeleton rows={3} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((m, i) => (
            <li
              key={m.id}
              className={`bg-background flex items-center gap-3 rounded-xl border p-3 ${m.active ? '' : 'opacity-70'}`}
            >
              <IconTile icon={methodIcon(m.key)} tone={m.active ? 'sky' : 'slate'} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground font-mono text-xs">{m.key}</span>
                  <ToneBadge tone={m.active ? 'emerald' : 'slate'}>
                    {m.active ? t('active') : t('inactive')}
                  </ToneBadge>
                  {m.paymentCount > 0 && (
                    <ToneBadge tone="amber" dot={false}>
                      {t('pmUsed', { count: m.paymentCount })}
                    </ToneBadge>
                  )}
                </div>
              </div>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('pmMoveUp', { name: m.label })}
                  title={t('pmMoveUp', { name: m.label })}
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('pmMoveDown', { name: m.label })}
                  title={t('pmMoveDown', { name: m.label })}
                  disabled={i === items.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <RowMenu
                  label={t('rowActions')}
                  items={[
                    {
                      key: 'edit',
                      label: tm('edit'),
                      icon: Pencil,
                      onClick: () => openEdit({ id: m.id, label: m.label, active: m.active }),
                    },
                    {
                      key: 'toggle',
                      label: m.active ? t('pmDeactivate') : t('pmActivate'),
                      icon: Power,
                      onClick: () => toggle.mutate({ id: m.id, active: !m.active }),
                    },
                    {
                      key: 'delete',
                      label: tm('delete'),
                      icon: Trash2,
                      destructive: true,
                      onClick: () => setDeleting({ id: m.id, label: m.label }),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        open={editing}
        title={t('pmEdit')}
        submitLabel={tm('save')}
        error={error}
        disabled={!draft.label.trim()}
        onOpenChange={(o) => {
          setEditing(o);
          if (!o) setDraft(EMPTY);
        }}
        onSubmit={() => save.mutateAsync(draft)}
      >
        {fields}
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        destructive
        title={`${tm('delete')} · ${deleting?.label ?? ''}`}
        description={t('pmDeleteHint')}
        confirmLabel={tm('delete')}
        pending={remove.isPending}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />
    </SectionCard>
  );
}
