'use client';

import { RUBRIC_LEVEL_LIMIT } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Save, ShieldCheck, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ListSkeleton } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import {
  type ItemDraft,
  itemsBody,
  itemsValid,
  type LevelDraft,
  levelsBody,
  levelsValid,
  moveItem,
  refLabel,
  sameDrafts,
} from '@/lib/cocurricular';
import { errorKey } from '@/lib/errors';

type Header = { header: { 'x-school-id': string } };

/** Bilah simpan lengket di bawah: indikator "belum disimpan", batal, dan simpan. */
function SaveBar({
  dirty,
  valid,
  pending,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  valid: boolean;
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations('cocurricular');
  return (
    <div className="bg-card sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 shadow-sm">
      <p className="text-sm" aria-live="polite">
        {dirty ? (
          <span className="font-medium text-amber-700 dark:text-amber-300">{t('unsaved')}</span>
        ) : (
          <span className="text-muted-foreground">{t('allSaved')}</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:*:flex-1">
        <Button variant="outline" disabled={!dirty || pending} onClick={onDiscard}>
          {t('discard')}
        </Button>
        <Button disabled={!dirty || !valid || pending} onClick={onSave}>
          <Save className="size-4" aria-hidden /> {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}

interface Framework {
  key: string;
  kind: 'dimension' | 'value';
  labelId: string;
  labelEn: string;
  labelSu: string;
  source: string;
  verification: 'official' | 'secondary';
}

function FrameworksSection({
  frameworks,
  server,
  canManage,
  header,
  schoolId,
}: {
  frameworks: Framework[];
  server: ItemDraft[];
  canManage: boolean;
  header: Header;
  schoolId: string;
}) {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ItemDraft[] | null>(null);
  const current = draft ?? server;
  const dirty = draft !== null && !sameDrafts(draft, server);
  const edit = (fn: (list: ItemDraft[]) => ItemDraft[]) => setDraft(fn(current));
  const patch = (key: string, over: Partial<ItemDraft>) =>
    edit((list) => list.map((i) => (i.key === key ? { ...i, ...over } : i)));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cocurricular-items', schoolId] });

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/cocurricular/profile-items', {
          params: header,
          body: { items: itemsBody(current) },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('saved'));
      await refresh();
      setDraft(null);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const adopt = useMutation({
    mutationFn: async (frameworkKey: string) =>
      unwrap(
        await api.POST('/v1/cocurricular/profile-items/adopt', { params: header, body: { frameworkKey } }),
      ),
    onSuccess: async (r) => {
      toast.success(r.added > 0 ? t('adoptedCount', { count: r.added }) : t('adoptedNone'));
      await refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (frameworks.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('noFrameworks')}</p>;
  }

  return (
    <div className="grid gap-4">
      {frameworks.map((f) => {
        const rows = current.filter((i) => i.frameworkKey === f.key);
        const title = refLabel(f, locale);
        return (
          <section
            key={f.key}
            aria-labelledby={`fw-${f.key}`}
            className="bg-card grid gap-3 rounded-2xl border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id={`fw-${f.key}`} className="font-heading text-base font-semibold">
                  {title}
                </h3>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t(f.kind === 'dimension' ? 'kindDimension' : 'kindValue')} ·{' '}
                  {t('source', { source: f.source })}
                </p>
              </div>
              <ToneBadge tone={f.verification === 'secondary' ? 'amber' : 'emerald'}>
                {t(f.verification === 'secondary' ? 'secondary' : 'official')}
              </ToneBadge>
            </div>

            {f.verification === 'secondary' ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t('secondaryNote')}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">{t('spellingNote')}</p>
            )}

            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={rows.length === 0 ? 'default' : 'outline'}
                  disabled={dirty || adopt.isPending}
                  onClick={() => adopt.mutate(f.key)}
                  className="max-sm:w-full"
                >
                  <Sparkles className="size-4" aria-hidden />{' '}
                  {adopt.isPending ? t('adopting') : rows.length === 0 ? t('adopt') : t('adoptMore')}
                </Button>
                {dirty && <span className="text-muted-foreground text-xs">{t('adoptBlocked')}</span>}
              </div>
            )}

            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('itemsEmpty')}</p>
            ) : (
              <ul className="grid gap-2">
                {rows.map((i) => (
                  <li
                    key={i.key}
                    className="grid gap-2 rounded-xl border p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end"
                  >
                    <div className="grid min-w-0 gap-1.5">
                      <Label htmlFor={`il-${i.key}`}>{t('itemLabel')}</Label>
                      <Input
                        id={`il-${i.key}`}
                        value={i.label}
                        maxLength={120}
                        disabled={!canManage}
                        onChange={(e) => patch(i.key, { label: e.target.value })}
                      />
                    </div>
                    <div className="grid min-w-0 gap-1.5">
                      <Label htmlFor={`id-${i.key}`}>{t('itemDescription')}</Label>
                      <Input
                        id={`id-${i.key}`}
                        value={i.description}
                        maxLength={1000}
                        disabled={!canManage}
                        onChange={(e) => patch(i.key, { description: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
                        <Checkbox
                          id={`ia-${i.key}`}
                          checked={i.active}
                          disabled={!canManage}
                          onCheckedChange={(v) => patch(i.key, { active: v === true })}
                        />
                        <Label htmlFor={`ia-${i.key}`}>{t('itemActive')}</Label>
                      </div>
                      <ToneBadge tone={i.refCode ? 'slate' : 'violet'}>
                        {t(i.refCode ? 'fromReference' : 'custom')}
                      </ToneBadge>
                      {canManage && !i.refCode && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('removeItem', { label: i.label })}
                          onClick={() => edit((list) => list.filter((x) => x.key !== i.key))}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canManage && (
              <div>
                <Button
                  variant="outline"
                  className="max-sm:w-full"
                  onClick={() =>
                    edit((list) => [
                      ...list,
                      {
                        key: `new-${Date.now().toString(36)}-${list.length}`,
                        frameworkKey: f.key,
                        refCode: null,
                        code: `c-${Date.now().toString(36)}`,
                        label: t('newItemLabel'),
                        description: '',
                        active: true,
                      },
                    ])
                  }
                >
                  <Plus className="size-4" aria-hidden /> {t('addItem')}
                </Button>
              </div>
            )}
          </section>
        );
      })}

      {canManage && (
        <SaveBar
          dirty={dirty}
          valid={itemsValid(current)}
          pending={save.isPending}
          onSave={() => save.mutate()}
          onDiscard={() => setDraft(null)}
        />
      )}
    </div>
  );
}

function RubricSection({
  server,
  canManage,
  header,
  schoolId,
}: {
  server: LevelDraft[];
  canManage: boolean;
  header: Header;
  schoolId: string;
}) {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LevelDraft[] | null>(null);
  const current = draft ?? server;
  const dirty = draft !== null && !sameDrafts(draft, server);
  const patch = (key: string, over: Partial<LevelDraft>) =>
    setDraft(current.map((l) => (l.key === key ? { ...l, ...over } : l)));
  const atLimit = current.length >= RUBRIC_LEVEL_LIMIT;

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/cocurricular/rubric-levels', {
          params: header,
          body: { levels: levelsBody(current) },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('saved'));
      await queryClient.invalidateQueries({ queryKey: ['cocurricular-rubric', schoolId] });
      setDraft(null);
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const fillSample = () =>
    setDraft(
      (['SB', 'B', 'C', 'K'] as const).map((code) => ({
        key: `sample-${code}`,
        code,
        label: t(`sample.${code}`),
        description: '',
        active: true,
      })),
    );

  return (
    <div className="grid gap-3">
      {current.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('rubricEmpty')}</p>
      ) : (
        <ul className="grid gap-2">
          {current.map((l, index) => (
            <li
              key={l.key}
              className="bg-card grid gap-2 rounded-xl border p-3 xl:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end"
            >
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={`lc-${l.key}`}>{t('levelCode')}</Label>
                <Input
                  id={`lc-${l.key}`}
                  value={l.code}
                  maxLength={10}
                  disabled={!canManage}
                  onChange={(e) => patch(l.key, { code: e.target.value })}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={`ll-${l.key}`}>{t('levelLabel')}</Label>
                <Input
                  id={`ll-${l.key}`}
                  value={l.label}
                  maxLength={60}
                  disabled={!canManage}
                  onChange={(e) => patch(l.key, { label: e.target.value })}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={`ld-${l.key}`}>{t('levelDescription')}</Label>
                <Input
                  id={`ld-${l.key}`}
                  value={l.description}
                  maxLength={500}
                  disabled={!canManage}
                  onChange={(e) => patch(l.key, { description: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <div className="mr-2 flex min-h-11 items-center gap-2 text-sm md:min-h-8">
                  <Checkbox
                    id={`la-${l.key}`}
                    checked={l.active}
                    disabled={!canManage}
                    onCheckedChange={(v) => patch(l.key, { active: v === true })}
                  />
                  <Label htmlFor={`la-${l.key}`}>{t('levelActive')}</Label>
                </div>
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      aria-label={t('moveUp', { label: l.label })}
                      onClick={() => setDraft(moveItem(current, index, -1))}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === current.length - 1}
                      aria-label={t('moveDown', { label: l.label })}
                      onClick={() => setDraft(moveItem(current, index, 1))}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('removeLevel', { label: l.label })}
                      onClick={() => setDraft(current.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2 max-sm:*:w-full">
            <Button
              variant="outline"
              disabled={atLimit}
              onClick={() =>
                setDraft([
                  ...current,
                  {
                    key: `new-${Date.now().toString(36)}-${current.length}`,
                    code: '',
                    label: '',
                    description: '',
                    active: true,
                  },
                ])
              }
            >
              <Plus className="size-4" aria-hidden /> {t('addLevel')}
            </Button>
            {current.length === 0 && (
              <Button variant="outline" onClick={fillSample}>
                <Sparkles className="size-4" aria-hidden /> {t('fillSample')}
              </Button>
            )}
          </div>
          {atLimit && (
            <p className="text-muted-foreground text-xs">{t('limitReached', { max: RUBRIC_LEVEL_LIMIT })}</p>
          )}
          <p className="text-muted-foreground text-xs">{t('sampleNote')}</p>
          <SaveBar
            dirty={dirty}
            valid={levelsValid(current)}
            pending={save.isPending}
            onSave={() => save.mutate()}
            onDiscard={() => setDraft(null)}
          />
        </div>
      )}
    </div>
  );
}

/** Pengaturan kokurikuler (tahap 4.1): adopsi kerangka profil, ubah label butir, dan atur rubrik tingkat capaian. */
export function CocurricularSettingsView() {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const canRead = can('cocurricular:read');
  const canManage = can('cocurricular:manage');

  const frameworks = useQuery({
    queryKey: ['cocurricular-frameworks', school.schoolId],
    enabled: canRead,
    queryFn: async () => unwrap(await api.GET('/v1/reference/profile-frameworks', { params: header })),
  });
  const items = useQuery({
    queryKey: ['cocurricular-items', school.schoolId],
    enabled: canRead,
    queryFn: async () => unwrap(await api.GET('/v1/cocurricular/profile-items', { params: header })),
  });
  const levels = useQuery({
    queryKey: ['cocurricular-rubric', school.schoolId],
    enabled: canRead,
    queryFn: async () => unwrap(await api.GET('/v1/cocurricular/rubric-levels', { params: header })),
  });

  const head = (
    <PageHeader icon={Sparkles} tone={MODULE_TONE.academic} title={t('title')} description={t('subtitle')} />
  );
  if (!canRead) {
    return (
      <PageBody>
        {head}
        <EmptyPanel icon={ShieldCheck} tone="slate" title={t('noAccess')} body={t('noAccessBody')} />
      </PageBody>
    );
  }

  const error = frameworks.error ?? items.error ?? levels.error;
  const ready = frameworks.data && items.data && levels.data;
  return (
    <PageBody>
      {head}
      {!canManage && (
        <Alert>
          <AlertDescription>{t('readOnly')}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(error))}</AlertDescription>
        </Alert>
      )}
      {!ready && !error && <ListSkeleton rows={3} stats={0} />}
      {ready && (
        <>
          <section aria-labelledby="co-fw-title" className="grid gap-3">
            <div>
              <h2 id="co-fw-title" className="font-heading text-lg font-semibold">
                {t('frameworksTitle')}
              </h2>
              <p className="text-muted-foreground text-sm">{t('frameworksIntro')}</p>
            </div>
            <FrameworksSection
              frameworks={frameworks.data.frameworks}
              server={items.data.items.map((i) => ({
                key: i.id,
                id: i.id,
                frameworkKey: i.frameworkKey,
                refCode: i.refCode,
                code: i.code,
                label: i.label,
                description: i.description ?? '',
                active: i.active,
              }))}
              canManage={canManage}
              header={header}
              schoolId={school.schoolId}
            />
          </section>
          <section aria-labelledby="co-rubric-title" className="grid gap-3">
            <div>
              <h2 id="co-rubric-title" className="font-heading text-lg font-semibold">
                {t('rubricTitle')}
              </h2>
              <p className="text-muted-foreground text-sm">{t('rubricIntro')}</p>
            </div>
            <RubricSection
              server={levels.data.levels.map((l) => ({
                key: l.id,
                id: l.id,
                code: l.code,
                label: l.label,
                description: l.description ?? '',
                active: l.active,
              }))}
              canManage={canManage}
              header={header}
              schoolId={school.schoolId}
            />
          </section>
        </>
      )}
    </PageBody>
  );
}
