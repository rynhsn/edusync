'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { FormDialog } from '@/components/form-dialog';
import { TOUCH_INPUT, TOUCH_SELECT } from '@/components/form-field-error';
import { ConfirmDelete, ListSkeleton } from '@/components/master-kit';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { EmptyPanel, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey, errorKeyIn } from '@/lib/errors';

type Kind = 'field' | 'program' | 'concentration';

interface Draft {
  kind: Kind;
  /** Ada = ubah; kosong = tambah. */
  id?: string;
  /** Bidang (untuk program) atau program keahlian (untuk konsentrasi). */
  parentId: string;
  code: string;
  name: string;
  dapodikCode: string;
  sourceRef: string;
  active: boolean;
}

const blank = (kind: Kind, parentId = ''): Draft => ({
  kind,
  parentId,
  code: '',
  name: '',
  dapodikCode: '',
  sourceRef: '',
  active: true,
});

const TITLE_KEY = {
  field: ['addField', 'editField'],
  program: ['addProgram', 'editProgram'],
  concentration: ['addConcentration', 'editConcentration'],
} as const;

/**
 * Struktur keahlian SMK: Bidang -> Program -> Konsentrasi Keahlian, diisi sekolah (tanpa daftar bawaan). Satu kolom bertingkat yang
 * dapat dibuka (target sentuh 44 px) di semua lebar layar; tiap konsentrasi menampilkan jurusan (unit kelas) yang tertaut.
 */
export function ExpertiseView() {
  const t = useTranslations('vocational');
  const tm = useTranslations('masterData');
  const tc = useTranslations('classes');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('class:manage');
  const base = ['vocational', school.schoolId] as const;

  const fields = useQuery({
    queryKey: [...base, 'fields'],
    queryFn: async () => unwrap(await api.GET('/v1/vocational/fields', { params: header })),
  });
  const programsX = useQuery({
    queryKey: [...base, 'programs'],
    queryFn: async () => unwrap(await api.GET('/v1/vocational/programs-of-expertise', { params: header })),
  });
  const concentrations = useQuery({
    queryKey: [...base, 'concentrations'],
    queryFn: async () => unwrap(await api.GET('/v1/vocational/concentrations', { params: header })),
  });
  const units = useQuery({
    queryKey: ['programs', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/programs', { params: header })),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ kind: Kind; id: string; name: string } | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: base });
    queryClient.invalidateQueries({ queryKey: ['programs', school.schoolId] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const common = {
        code: d.code.trim(),
        name: d.name.trim(),
        dapodikCode: d.dapodikCode.trim() || null,
        active: d.active,
      };
      if (d.kind === 'field') {
        const body = { ...common, sourceRef: d.sourceRef.trim() || null };
        return unwrap(
          d.id
            ? await api.PUT('/v1/vocational/fields/{id}', { params: { ...header, path: { id: d.id } }, body })
            : await api.POST('/v1/vocational/fields', { params: header, body }),
        );
      }
      if (d.kind === 'program') {
        const body = { ...common, fieldId: d.parentId };
        return unwrap(
          d.id
            ? await api.PUT('/v1/vocational/programs-of-expertise/{id}', {
                params: { ...header, path: { id: d.id } },
                body,
              })
            : await api.POST('/v1/vocational/programs-of-expertise', { params: header, body }),
        );
      }
      const body = { ...common, vocationalProgramId: d.parentId };
      return unwrap(
        d.id
          ? await api.PUT('/v1/vocational/concentrations/{id}', {
              params: { ...header, path: { id: d.id } },
              body,
            })
          : await api.POST('/v1/vocational/concentrations', { params: header, body }),
      );
    },
    onSuccess: (_r, d) => {
      toast.success(d.id ? tm('saved') : tm('created'));
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async (d: { kind: Kind; id: string }) => {
      const p = { params: { ...header, path: { id: d.id } } };
      if (d.kind === 'field') return unwrap(await api.DELETE('/v1/vocational/fields/{id}', p));
      if (d.kind === 'program') {
        return unwrap(await api.DELETE('/v1/vocational/programs-of-expertise/{id}', p));
      }
      return unwrap(await api.DELETE('/v1/vocational/concentrations/{id}', p));
    },
    onSuccess: () => {
      toast.success(tm('deleted'));
      setDeleting(null);
      refresh();
    },
    onError: (e) => {
      toast.error(te(errorKeyIn(e, 'expertise')));
      setDeleting(null);
    },
  });

  const link = useMutation({
    mutationFn: async (v: { programId: string; concentrationId: string | null }) =>
      unwrap(
        await api.PUT('/v1/programs/{id}/concentration', {
          params: { ...header, path: { id: v.programId } },
          body: { concentrationId: v.concentrationId },
        }),
      ),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const loading = fields.isPending || programsX.isPending || concentrations.isPending;
  const failed = fields.isError || programsX.isError || concentrations.isError;
  const fieldRows = fields.data ?? [];
  const progRows = programsX.data ?? [];
  const concRows = concentrations.data ?? [];

  const open = (d: Draft) => {
    setError(null);
    setDraft(d);
  };

  const rowActions = (kind: Kind, id: string, name: string, edit: Draft) =>
    manage && (
      // biome-ignore lint/a11y/noStaticElementInteractions: mencegah klik tombol ikut membuka/menutup <summary> induknya
      // biome-ignore lint/a11y/useKeyWithClickEvents: pembungkus hanya menahan klik; tombol di dalamnya yang interaktif
      <span className="flex shrink-0 items-center" onClick={(e) => e.preventDefault()}>
        <Button
          size="icon"
          variant="ghost"
          className="size-11 md:size-8"
          aria-label={`${tm('edit')} ${name}`}
          onClick={() => open(edit)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-11 md:size-8"
          aria-label={`${tm('delete')} ${name}`}
          onClick={() => setDeleting({ kind, id, name })}
        >
          <Trash2 className="size-4" />
        </Button>
      </span>
    );

  const meta = (code: string, dapodik: string | null, active: boolean) => (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
      <span className="font-mono">{code}</span>
      {dapodik && <span>{t('dapodikShort', { code: dapodik })}</span>}
      {!active && <ToneBadge tone="slate">{t('inactive')}</ToneBadge>}
    </span>
  );

  const addButton = (label: string, d: Draft) =>
    manage && (
      <Button variant="outline" className="h-11 w-full sm:w-fit md:h-8" onClick={() => open(d)}>
        <Plus className="size-4" /> {label}
      </Button>
    );

  return (
    <PageBody>
      <PageHeader
        icon={Briefcase}
        tone={MODULE_TONE.master}
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={<BackLink href="/classes" label={t('backToClasses')} />}
      />
      <Alert>
        <AlertDescription>{t('sourceHint')}</AlertDescription>
      </Alert>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : failed ? (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      ) : fieldRows.length === 0 ? (
        <EmptyPanel
          icon={Briefcase}
          tone="teal"
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={addButton(t('addField'), blank('field'))}
        />
      ) : (
        <div className="grid gap-4">
          {fieldRows.map((f) => (
            <Card key={f.id} className="gap-3 p-3 sm:p-4">
              <details open className="group grid gap-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="font-heading block text-base font-semibold break-words">{f.name}</span>
                    {meta(f.code, f.dapodikCode, f.active)}
                    {f.sourceRef && (
                      <span className="text-muted-foreground block text-xs">
                        {t('sourceShort', { ref: f.sourceRef })}
                      </span>
                    )}
                  </span>
                  {rowActions('field', f.id, f.name, {
                    ...blank('field'),
                    id: f.id,
                    code: f.code,
                    name: f.name,
                    dapodikCode: f.dapodikCode ?? '',
                    sourceRef: f.sourceRef ?? '',
                    active: f.active,
                  })}
                </summary>
                <div className="grid gap-3 border-l-2 pl-3">
                  {progRows
                    .filter((p) => p.fieldId === f.id)
                    .map((p) => (
                      <details key={p.id} open className="grid gap-2">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0">
                            <span className="block font-medium break-words">{p.name}</span>
                            {meta(p.code, p.dapodikCode, p.active)}
                          </span>
                          {rowActions('program', p.id, p.name, {
                            ...blank('program', f.id),
                            id: p.id,
                            code: p.code,
                            name: p.name,
                            dapodikCode: p.dapodikCode ?? '',
                            active: p.active,
                          })}
                        </summary>
                        <div className="grid gap-2 border-l-2 pl-3">
                          {concRows
                            .filter((c) => c.vocationalProgramId === p.id)
                            .map((c) => {
                              const linkable = (units.data ?? []).filter(
                                (u) => !c.linkedPrograms.some((l) => l.id === u.id),
                              );
                              return (
                                <div key={c.id} className="bg-muted/40 grid gap-2 rounded-lg p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="min-w-0">
                                      <span className="block font-medium break-words">{c.name}</span>
                                      {meta(c.code, c.dapodikCode, c.active)}
                                    </span>
                                    {rowActions('concentration', c.id, c.name, {
                                      ...blank('concentration', p.id),
                                      id: c.id,
                                      code: c.code,
                                      name: c.name,
                                      dapodikCode: c.dapodikCode ?? '',
                                      active: c.active,
                                    })}
                                  </div>
                                  <div className="grid gap-1.5">
                                    <span className="text-muted-foreground text-xs font-medium">
                                      {t('linkedPrograms')}
                                    </span>
                                    {c.linkedPrograms.length === 0 ? (
                                      <span className="text-muted-foreground text-sm">{t('noLinked')}</span>
                                    ) : (
                                      <ul className="flex flex-wrap gap-2">
                                        {c.linkedPrograms.map((l) => (
                                          <li
                                            key={l.id}
                                            className="bg-card flex items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-3 text-sm"
                                          >
                                            <span className="break-words">
                                              {l.name}
                                              {l.durationYears
                                                ? ` · ${tc('programDurationYears', { years: l.durationYears })}`
                                                : ''}
                                            </span>
                                            {manage && (
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="size-11 rounded-full md:size-8"
                                                aria-label={t('unlink', { name: l.name })}
                                                disabled={link.isPending}
                                                onClick={() =>
                                                  link.mutate({ programId: l.id, concentrationId: null })
                                                }
                                              >
                                                <X className="size-4" />
                                              </Button>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                    {manage && linkable.length > 0 && (
                                      <SelectField
                                        aria-label={t('linkProgram')}
                                        className={TOUCH_SELECT}
                                        value=""
                                        disabled={link.isPending}
                                        onChange={(e) =>
                                          e.target.value &&
                                          link.mutate({ programId: e.target.value, concentrationId: c.id })
                                        }
                                      >
                                        <option value="">{t('linkProgram')}</option>
                                        {linkable.map((u) => (
                                          <option key={u.id} value={u.id}>
                                            {u.name}
                                          </option>
                                        ))}
                                      </SelectField>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          {addButton(t('addConcentration'), blank('concentration', p.id))}
                        </div>
                      </details>
                    ))}
                  {addButton(t('addProgram'), blank('program', f.id))}
                </div>
              </details>
            </Card>
          ))}
          {addButton(t('addField'), blank('field'))}
        </div>
      )}

      {draft && (
        <FormDialog
          open
          title={t(TITLE_KEY[draft.kind][draft.id ? 1 : 0])}
          description={t('sourceHint')}
          submitLabel={tm('save')}
          error={error}
          onOpenChange={(o) => {
            if (!o) setDraft(null);
            setError(null);
          }}
          onSubmit={async () => {
            if (!draft.code.trim() || !draft.name.trim() || (draft.kind !== 'field' && !draft.parentId)) {
              setError(te('formValidation.summary'));
              throw new Error('invalid');
            }
            try {
              await save.mutateAsync(draft);
              setDraft(null);
            } catch (e) {
              setError(te(errorKey(e)));
              throw e;
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div className="grid content-start gap-2">
              <Label htmlFor="vx-code">{tm('code')}</Label>
              <Input
                id="vx-code"
                className={TOUCH_INPUT}
                maxLength={20}
                autoComplete="off"
                aria-required="true"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="vx-name">{tm('name')}</Label>
              <Input
                id="vx-name"
                className={TOUCH_INPUT}
                maxLength={160}
                autoComplete="off"
                aria-required="true"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid content-start gap-2 sm:col-span-2">
              <Label htmlFor="vx-dapodik">{t('dapodikCode')}</Label>
              <Input
                id="vx-dapodik"
                className={TOUCH_INPUT}
                maxLength={40}
                autoComplete="off"
                value={draft.dapodikCode}
                onChange={(e) => setDraft({ ...draft, dapodikCode: e.target.value })}
              />
            </div>
            {draft.kind === 'field' && (
              <div className="grid content-start gap-2 sm:col-span-2">
                <Label htmlFor="vx-source">{t('sourceRef')}</Label>
                <Input
                  id="vx-source"
                  className={TOUCH_INPUT}
                  maxLength={60}
                  autoComplete="off"
                  placeholder="244/M/2024"
                  value={draft.sourceRef}
                  onChange={(e) => setDraft({ ...draft, sourceRef: e.target.value })}
                />
              </div>
            )}
            {draft.kind !== 'field' && (
              <div className="grid content-start gap-2 sm:col-span-2">
                <Label htmlFor="vx-parent">
                  {draft.kind === 'program' ? t('parentField') : t('parentProgram')}
                </Label>
                <SelectField
                  id="vx-parent"
                  className={TOUCH_SELECT}
                  value={draft.parentId}
                  onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}
                >
                  {(draft.kind === 'program' ? fieldRows : progRows).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            <div className="flex items-start gap-3 sm:col-span-2">
              <Checkbox
                id="vx-active"
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
              />
              <div className="grid gap-0.5">
                <Label htmlFor="vx-active">{t('active')}</Label>
                <p className="text-muted-foreground text-xs">{t('activeHint')}</p>
              </div>
            </div>
          </div>
        </FormDialog>
      )}

      <ConfirmDelete
        name={deleting?.name ?? null}
        onClose={() => setDeleting(null)}
        pending={remove.isPending}
        onConfirm={async () => deleting && remove.mutateAsync(deleting)}
      />
    </PageBody>
  );
}
