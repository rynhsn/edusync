'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Landmark, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FORM_GRID, FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyPanel, IconTile, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { ListSkeleton, RowMenu, SectionCard } from '../ui';

const MAX_ACCOUNTS = 10;

interface Draft {
  id: string | null;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note: string;
  active: boolean;
}
const EMPTY: Draft = { id: null, bankName: '', accountNumber: '', accountHolder: '', note: '', active: true };

/** Nomor rekening yang sah: angka, spasi, atau tanda hubung, 5 sampai 30 karakter dengan minimal 5 angka. */
const numberValid = (v: string) => {
  const s = v.trim();
  return /^[0-9][0-9 -]*$/.test(s) && s.length >= 5 && s.length <= 30 && s.replace(/\D/g, '').length >= 5;
};

/** Rekening bank sekolah untuk pembayaran transfer: tambah, ubah, aktif/nonaktif, urutan, dan hapus. */
export function BankAccountsCard() {
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
    queryKey: ['finance-bank-accounts', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/finance/bank-accounts', { params: header })),
  });
  const items = list.data?.items ?? [];
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['finance-bank-accounts', school.schoolId] });

  const save = useMutation({
    mutationFn: async (v: Draft) => {
      const body = {
        bankName: v.bankName.trim(),
        accountNumber: v.accountNumber.trim(),
        accountHolder: v.accountHolder.trim(),
        note: v.note.trim() || null,
        active: v.active,
      };
      if (v.id) {
        return unwrap(
          await api.PATCH('/v1/finance/bank-accounts/{id}', {
            params: { ...header, path: { id: v.id } },
            body,
          }),
        );
      }
      return unwrap(await api.POST('/v1/finance/bank-accounts', { params: header, body }));
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
        await api.PATCH('/v1/finance/bank-accounts/{id}', {
          params: { ...header, path: { id: m.id } },
          body: { active: m.active },
        }),
      ),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(await api.PUT('/v1/finance/bank-accounts/order', { params: header, body: { ids } })),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/finance/bank-accounts/{id}', { params: { ...header, path: { id } } })),
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

  const invalid =
    draft.bankName.trim().length < 2 ||
    draft.accountHolder.trim().length < 2 ||
    !numberValid(draft.accountNumber);

  const fields = (
    <div className={FORM_GRID}>
      <FormField label={t('baBank')} htmlFor="ba-bank" hint={t('baBankHint')}>
        <Input
          id="ba-bank"
          required
          maxLength={60}
          value={draft.bankName}
          onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
        />
      </FormField>
      <FormField label={t('baNumber')} htmlFor="ba-number" hint={t('baNumberHint')}>
        <Input
          id="ba-number"
          required
          inputMode="numeric"
          autoComplete="off"
          maxLength={30}
          value={draft.accountNumber}
          onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })}
        />
      </FormField>
      <FormField className="sm:col-span-2" label={t('baHolder')} htmlFor="ba-holder">
        <Input
          id="ba-holder"
          required
          maxLength={100}
          value={draft.accountHolder}
          onChange={(e) => setDraft({ ...draft, accountHolder: e.target.value })}
        />
      </FormField>
      <FormField className="sm:col-span-2" label={t('baNote')} htmlFor="ba-note" hint={t('baNoteHint')}>
        <Input
          id="ba-note"
          maxLength={200}
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </FormField>
    </div>
  );

  return (
    <SectionCard
      icon={Landmark}
      tone="teal"
      title={t('baTitle')}
      description={`${t('baHint')} ${t('baLimit')}`}
      actions={
        <FormDialog
          trigger={
            <Button disabled={items.length >= MAX_ACCOUNTS}>
              <Plus className="size-4" /> {t('baAdd')}
            </Button>
          }
          title={t('baAdd')}
          submitLabel={tm('add')}
          size="wide"
          error={error}
          disabled={invalid}
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
      {list.isPending && <ListSkeleton rows={2} />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {list.data && items.length === 0 && (
        <EmptyPanel icon={Landmark} tone="teal" title={t('baEmptyTitle')} body={t('baEmptyBody')} />
      )}
      {items.length > 0 && (
        <ul className="grid content-start gap-2">
          {items.map((m, i) => (
            <li
              key={m.id}
              className={`bg-background flex items-center gap-3 rounded-xl border p-3 ${m.active ? '' : 'opacity-70'}`}
            >
              <IconTile icon={Landmark} tone={m.active ? 'teal' : 'slate'} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.bankName}</p>
                <p className="text-muted-foreground truncate font-mono text-sm">{m.accountNumber}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {t('baHolder')}: {m.accountHolder}
                  {m.note ? ` · ${m.note}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ToneBadge tone={m.active ? 'emerald' : 'slate'}>
                    {m.active ? t('active') : t('inactive')}
                  </ToneBadge>
                </div>
              </div>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('baMoveUp', { name: m.bankName })}
                  title={t('baMoveUp', { name: m.bankName })}
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('baMoveDown', { name: m.bankName })}
                  title={t('baMoveDown', { name: m.bankName })}
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
                      onClick: () =>
                        openEdit({
                          id: m.id,
                          bankName: m.bankName,
                          accountNumber: m.accountNumber,
                          accountHolder: m.accountHolder,
                          note: m.note ?? '',
                          active: m.active,
                        }),
                    },
                    {
                      key: 'toggle',
                      label: m.active ? t('baDeactivate') : t('baActivate'),
                      icon: Power,
                      onClick: () => toggle.mutate({ id: m.id, active: !m.active }),
                    },
                    {
                      key: 'delete',
                      label: tm('delete'),
                      icon: Trash2,
                      destructive: true,
                      onClick: () => setDeleting({ id: m.id, label: `${m.bankName} ${m.accountNumber}` }),
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
        title={t('baEdit')}
        submitLabel={tm('save')}
        size="wide"
        error={error}
        disabled={invalid}
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
        description={t('baDeleteHint')}
        confirmLabel={tm('delete')}
        pending={remove.isPending}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />
    </SectionCard>
  );
}
