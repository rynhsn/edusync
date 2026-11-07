'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, FileSpreadsheet, IdCard, Plus, ScanLine, Search, Trash2, UserX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu, ENTER, stagger } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FORM_GRID } from '@/components/form-field';
import { FieldError, TOUCH_INPUT, TOUCH_SELECT, useFormValidation } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, MODULE_TONE, PersonCell, StatCard, StatGrid, Toolbar } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { withoutBlur } from '@/lib/area-rules';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { CARD_ORDER, type CardField, validateCard } from './card-validation';
import { QuickRegister } from './quick-register';

/** Halaman Kartu RFID: daftar kartu, daftar cepat per kelas, impor Excel, dan hapus. */
export function CardsView() {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'list' | 'quick'>('list');
  const [studentId, setStudentId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const allowed = can('attendance:configure');
  const validation = useFormValidation<CardField>({
    errors: validateCard({ studentId, code }),
    order: CARD_ORDER,
    idPrefix: 'card',
  });

  const students = useQuery({
    queryKey: ['students', school.schoolId, 'pick', search],
    enabled: allowed,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students', {
          params: { ...header, query: { limit: 100, ...(search.trim() ? { q: search.trim() } : {}) } },
        }),
      ),
  });
  const activeStudents = useQuery({
    queryKey: ['students', school.schoolId, 'active-total'],
    enabled: allowed,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { limit: 1, status: 'active' } } })),
  });
  const cards = useQuery({
    queryKey: ['attendance-cards', school.schoolId],
    enabled: allowed,
    queryFn: async () => unwrap(await api.GET('/v1/attendance/cards', { params: { ...header, query: {} } })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attendance-cards', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/attendance/cards', { params: header, body: { studentId, code } })),
    onSuccess: () => {
      setCode('');
      setError(null);
      toast.success(t('cardAdded'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/attendance/cards/{id}', { params: { ...header, path: { id } } })),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (!allowed) {
    return (
      <PageBody>
        <PageHeader
          icon={CreditCard}
          tone={MODULE_TONE.attendance}
          title={t('cardsTitle')}
          actions={<BackLink href="/attendance" />}
        />
        <Alert variant="destructive">
          <AlertDescription>{t('noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const all = cards.data ?? [];
  const fq = filter.trim().toLowerCase();
  const shown = all.filter((c) => fq === '' || c.studentName.toLowerCase().includes(fq));
  const total = activeStudents.data?.total;
  const withoutCard = total === undefined ? undefined : Math.max(0, total - all.length);

  return (
    <PageBody>
      <PageHeader
        icon={CreditCard}
        tone={MODULE_TONE.attendance}
        title={t('cardsTitle')}
        description={t('cardsHint')}
        actions={<BackLink href="/attendance" />}
      />
      <StatGrid className="lg:grid-cols-2">
        <StatCard
          icon={IdCard}
          tone="emerald"
          label={t('statRegistered')}
          value={cards.isPending ? '…' : all.length}
        />
        <StatCard
          icon={UserX}
          tone={withoutCard ? 'amber' : 'slate'}
          label={t('statWithoutCard')}
          value={withoutCard ?? '…'}
        />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={mode === 'quick' ? 'secondary' : 'default'}
          onClick={() => setMode(mode === 'quick' ? 'list' : 'quick')}
        >
          <ScanLine className="size-4" /> {t('quick.button')}
        </Button>
        <Link href="/attendance/cards/import" className={buttonVariants({ variant: 'outline' })}>
          <FileSpreadsheet className="size-4" /> {t('cardImport.link')}
        </Link>
        <FormDialog
          trigger={
            <Button variant="outline">
              <Plus className="size-4" /> {t('addCard')}
            </Button>
          }
          title={t('addCard')}
          submitLabel={t('create')}
          error={error}
          onOpenChange={() => {
            setStudentId('');
            setCode('');
            setError(null);
          }}
          validation={validation}
          onSubmit={() => create.mutateAsync()}
        >
          <div className={FORM_GRID}>
            <div className="grid content-start gap-2 sm:col-span-2">
              <Label htmlFor="card-search">{t('searchStudent')}</Label>
              <Input
                id="card-search"
                className={TOUCH_INPUT}
                value={search}
                placeholder={t('searchStudentPlaceholder')}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="grid content-start gap-2 sm:col-span-2">
              <Label htmlFor={validation.idOf('studentId')}>{t('student')}</Label>
              <SelectField
                {...withoutBlur(validation.fieldProps('studentId'))}
                className={TOUCH_SELECT}
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  validation.touch('studentId');
                }}
              >
                <option value="">{t('chooseStudent')}</option>
                {(students.data?.items ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.nis ? ` (${s.nis})` : ''}
                  </option>
                ))}
              </SelectField>
              <FieldError id={validation.idOf('studentId')} issue={validation.issue('studentId')} />
            </div>
            <div className="grid content-start gap-2 sm:col-span-2">
              <Label htmlFor={validation.idOf('code')}>{t('cardCode')}</Label>
              <Input
                {...validation.fieldProps('code')}
                className={TOUCH_INPUT}
                aria-required="true"
                autoComplete="off"
                value={code}
                maxLength={64}
                placeholder={t('cardCodePlaceholder')}
                onChange={(e) => setCode(e.target.value)}
              />
              <FieldError id={validation.idOf('code')} issue={validation.issue('code')} />
            </div>
          </div>
        </FormDialog>
      </div>

      {mode === 'quick' && <QuickRegister />}

      {cards.isPending && <Skeleton className="h-48 rounded-2xl" aria-busy />}
      {cards.data?.length === 0 && (
        <EmptyPanel
          icon={CreditCard}
          tone={MODULE_TONE.attendance}
          title={t('noCards')}
          body={t('noCardsBody')}
        />
      )}
      {cards.data && cards.data.length > 0 && (
        <section className="grid gap-3">
          <Toolbar className="gap-3">
            <div className="relative min-w-44 flex-1 sm:max-w-xs">
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                aria-label={t('searchCards')}
                placeholder={t('searchCards')}
                className="pl-9"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <p className="text-muted-foreground ml-auto text-xs tabular-nums" aria-live="polite">
              {t('cardsCount', { count: all.length })}
            </p>
          </Toolbar>
          <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
            {shown.map((c, i) => (
              <li
                key={c.id}
                style={stagger(i)}
                className={cn(
                  ENTER,
                  'hover:bg-muted/40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]',
                )}
              >
                <PersonCell name={c.studentName} />
                <code className="text-muted-foreground order-last col-span-2 font-mono text-xs break-all sm:order-none sm:col-span-1">
                  {c.code}
                </code>
                <ActionMenu
                  label={t('cardActionsFor', { name: c.studentName })}
                  items={[
                    {
                      label: t('delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setDeleting({ id: c.id, name: c.studentName }),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={t('confirmDeleteCard', { name: deleting?.name ?? '' })}
        description={t('confirmDeleteCardBody')}
        confirmLabel={t('delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </PageBody>
  );
}
