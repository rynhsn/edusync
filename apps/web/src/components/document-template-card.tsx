'use client';

import {
  DOCUMENT_SECTIONS,
  DOCUMENT_VARIABLES,
  type DocumentTemplateConfig,
  type DocumentTemplateKind,
  MAX_SIGNATURE_SLOTS,
} from '@edusync/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, FileSignature, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { insertAtCursor } from '@/app/(app)/letters/format';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { TOUCH_INPUT } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import {
  addSlot,
  type DocumentDraft,
  draftIssues,
  type FieldKey,
  getField,
  removeSlot,
  setField,
  TEXT_FIELDS,
  type TextKey,
  toConfig,
  toDraft,
} from '@/lib/document-template';
import { errorKey } from '@/lib/errors';
import { documentTemplateKey, useDocumentTemplate } from '@/lib/use-document-template';

const AREA_CLASS =
  'min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

/** Teks bawaan yang tampil sebagai contoh (placeholder) pada isian yang dikosongkan. */
type Defaults = Partial<Record<TextKey, string>>;

/**
 * Pratinjau contoh: dibuat oleh pemanggil karena SKL dan sertifikat PKL dirender berbeda (cetak HTML dan PDF).
 * Dipanggil dengan config yang sedang diedit.
 */
export interface DocumentTemplateCardProps {
  kind: DocumentTemplateKind;
  defaults: Defaults;
  onPreview: (config: DocumentTemplateConfig) => Promise<void> | void;
}

/**
 * Kartu "Templat dokumen" untuk SKL atau sertifikat PKL: status (bawaan/disesuaikan), editor teks dengan variabel, sakelar bagian,
 * susunan slot tanda tangan (ruang kosong untuk tanda tangan basah), kembalikan bawaan, dan pratinjau contoh.
 * Izin ubah ditentukan pemanggil lewat `manage` (graduation:manage atau pkl:manage); API tetap menegakkannya.
 */
export function DocumentTemplateCard({
  kind,
  defaults,
  onPreview,
  manage,
}: DocumentTemplateCardProps & { manage: boolean }) {
  const t = useTranslations('documentTemplate');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const current = useDocumentTemplate(kind);
  const [draft, setDraft] = useState<DocumentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const params = { header: schoolHeader(school.schoolId) };
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: documentTemplateKey(school.schoolId, kind) });

  const save = useMutation({
    mutationFn: async (config: DocumentTemplateConfig) =>
      unwrap(
        kind === 'skl'
          ? await api.PUT('/v1/document-templates/skl', { params, body: config })
          : await api.PUT('/v1/document-templates/pkl_certificate', { params, body: config }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const reset = useMutation({
    mutationFn: async () =>
      unwrap(
        kind === 'skl'
          ? await api.DELETE('/v1/document-templates/skl', { params })
          : await api.DELETE('/v1/document-templates/pkl_certificate', { params }),
      ),
    onSuccess: () => {
      toast.success(t('resetDone'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const issues = draft ? draftIssues(kind, draft) : [];
  const issueText = issues.map((i) => te(`documentTemplate.issue.${i.code}`, { list: i.names.join(', ') }));

  function insertVariable(name: string) {
    const f = focused.current;
    if (!draft || !f) return;
    const value = getField(draft, f.key);
    const { value: next, cursor } = insertAtCursor(
      value,
      f.el.selectionStart ?? value.length,
      f.el.selectionEnd ?? value.length,
      `{{${name}}}`,
    );
    setDraft(setField(draft, f.key, next));
    requestAnimationFrame(() => {
      f.el.focus();
      f.el.setSelectionRange(cursor, cursor);
    });
  }

  const track = (key: FieldKey) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    focused.current = { key, el: e.currentTarget };
  };

  const isDefault = current.data?.isDefault ?? true;

  return (
    <section className="grid gap-3" aria-labelledby={`dt-${kind}`}>
      <h2 id={`dt-${kind}`} className="font-heading flex items-center gap-2 text-lg font-semibold">
        <FileSignature className="size-5 text-teal-600 dark:text-teal-300" aria-hidden />{' '}
        {t('title', { kind: t(`kind.${kind}`) })}
      </h2>
      <div className="bg-card grid gap-4 rounded-xl border p-4">
        <p className="text-muted-foreground text-sm">{t(`description.${kind}`)}</p>
        {current.isPending && <Skeleton className="h-10 w-full rounded-xl" aria-busy />}
        {current.isError && (
          <Alert variant="destructive">
            <AlertDescription>{t('loadError')}</AlertDescription>
          </Alert>
        )}
        {current.data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isDefault ? 'secondary' : 'default'}>
              {isDefault ? t('statusDefault') : t('statusCustom')}
            </Badge>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onPreview(current.data.config)}>
                <Eye className="size-4" aria-hidden /> {t('preview')}
              </Button>
              {manage && !isDefault && (
                <ConfirmDialog
                  destructive
                  title={t('resetTitle', { kind: t(`kind.${kind}`) })}
                  description={t('resetBody')}
                  confirmLabel={t('reset')}
                  onConfirm={() => reset.mutateAsync()}
                  trigger={
                    <Button variant="outline" size="sm">
                      <RotateCcw className="size-4" aria-hidden /> {t('reset')}
                    </Button>
                  }
                />
              )}
              {manage && (
                <Button
                  size="sm"
                  onClick={() => {
                    setError(null);
                    focused.current = null;
                    setDraft(toDraft(kind, current.data.config));
                  }}
                >
                  {t('customize')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {manage && (
        <FormDialog
          open={draft !== null}
          onOpenChange={(o) => !o && setDraft(null)}
          title={t('editorTitle', { kind: t(`kind.${kind}`) })}
          description={t('editorDescription')}
          submitLabel={t('save')}
          size="wide"
          error={error ?? (issueText.length > 0 ? issueText.join(' ') : null)}
          disabled={issues.length > 0}
          onSubmit={async () => {
            if (!draft || issues.length > 0) return;
            setError(null);
            await save.mutateAsync(toConfig(kind, draft));
          }}
        >
          {draft && (
            <div className="grid gap-5">
              <div className="grid gap-2">
                <p className="text-sm font-medium">{t('variables')}</p>
                <p className="text-muted-foreground text-xs">{t('variablesHint')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {DOCUMENT_VARIABLES[kind].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="hover:bg-accent focus-visible:ring-ring/50 rounded-full border px-2 py-0.5 font-mono text-[11px] outline-none focus-visible:ring-3"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {TEXT_FIELDS[kind].map((k) => (
                <div key={k} className="grid content-start gap-2">
                  <Label htmlFor={`dt-${kind}-${k}`}>{t(`field.${k}`)}</Label>
                  {k === 'intro' || k === 'body' ? (
                    <textarea
                      id={`dt-${kind}-${k}`}
                      className={AREA_CLASS}
                      rows={k === 'body' ? 4 : 2}
                      maxLength={k === 'body' ? 2000 : 500}
                      placeholder={defaults[k]}
                      value={draft[k]}
                      onFocus={track(k)}
                      onChange={(e) => setDraft(setField(draft, k, e.target.value))}
                    />
                  ) : (
                    <Input
                      id={`dt-${kind}-${k}`}
                      className={TOUCH_INPUT}
                      maxLength={120}
                      autoComplete="off"
                      placeholder={defaults[k]}
                      value={draft[k]}
                      onFocus={track(k)}
                      onChange={(e) => setDraft(setField(draft, k, e.target.value))}
                    />
                  )}
                </div>
              ))}
              <p className="text-muted-foreground -mt-3 text-xs">{t('emptyIsDefault')}</p>

              <fieldset className="grid gap-2 border-0 p-0">
                <legend className="mb-1 text-sm font-medium">{t('sectionsTitle')}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DOCUMENT_SECTIONS[kind].map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <Checkbox
                        id={`dt-${kind}-sec-${k}`}
                        checked={draft.sections[k] !== false}
                        onCheckedChange={(v) =>
                          setDraft({ ...draft, sections: { ...draft.sections, [k]: v === true } })
                        }
                      />
                      <Label htmlFor={`dt-${kind}-sec-${k}`}>{t(`section.${k}`)}</Label>
                    </div>
                  ))}
                </div>
              </fieldset>

              <fieldset className="grid gap-3 border-0 p-0">
                <legend className="mb-1 text-sm font-medium">{t('signaturesTitle')}</legend>
                <p className="text-muted-foreground text-xs">{t('signaturesHint')}</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`dt-${kind}-custom-sign`}
                    checked={draft.customSignatures}
                    onCheckedChange={(v) => setDraft({ ...draft, customSignatures: v === true })}
                  />
                  <Label htmlFor={`dt-${kind}-custom-sign`}>{t('signaturesCustom')}</Label>
                </div>
                {draft.customSignatures && (
                  <>
                    {draft.slots.length === 0 && (
                      <p className="text-muted-foreground text-xs">{t('signaturesNone')}</p>
                    )}
                    {draft.slots.map((slot, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: slot tidak punya id; urutannya yang bermakna
                      <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                        <div className="grid content-start gap-1.5">
                          <Label htmlFor={`dt-${kind}-s${i}-label`}>{t('slotLabel')}</Label>
                          <Input
                            id={`dt-${kind}-s${i}-label`}
                            maxLength={80}
                            autoComplete="off"
                            value={slot.label}
                            onFocus={track(`slot:${i}:label`)}
                            onChange={(e) => setDraft(setField(draft, `slot:${i}:label`, e.target.value))}
                          />
                        </div>
                        <div className="grid content-start gap-1.5">
                          <Label htmlFor={`dt-${kind}-s${i}-name`}>{t('slotName')}</Label>
                          <Input
                            id={`dt-${kind}-s${i}-name`}
                            maxLength={120}
                            autoComplete="off"
                            value={slot.name}
                            onFocus={track(`slot:${i}:name`)}
                            onChange={(e) => setDraft(setField(draft, `slot:${i}:name`, e.target.value))}
                          />
                        </div>
                        <div className="grid content-start gap-1.5">
                          <Label htmlFor={`dt-${kind}-s${i}-note`}>{t('slotNote')}</Label>
                          <Input
                            id={`dt-${kind}-s${i}-note`}
                            maxLength={120}
                            autoComplete="off"
                            value={slot.note}
                            onFocus={track(`slot:${i}:note`)}
                            onChange={(e) => setDraft(setField(draft, `slot:${i}:note`, e.target.value))}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:col-span-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`dt-${kind}-s${i}-pd`}
                              checked={slot.placeDate}
                              onCheckedChange={(v) =>
                                setDraft({
                                  ...draft,
                                  slots: draft.slots.map((s, n) =>
                                    n === i ? { ...s, placeDate: v === true } : s,
                                  ),
                                })
                              }
                            />
                            <Label htmlFor={`dt-${kind}-s${i}-pd`}>{t('slotPlaceDate')}</Label>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDraft(removeSlot(draft, i))}
                          >
                            <Trash2 className="size-4" aria-hidden /> {t('slotRemove')}
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      disabled={draft.slots.length >= MAX_SIGNATURE_SLOTS}
                      onClick={() => setDraft(addSlot(draft))}
                    >
                      <Plus className="size-4" aria-hidden /> {t('slotAdd')}
                    </Button>
                  </>
                )}
              </fieldset>

              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => onPreview(toConfig(kind, draft))}
              >
                <Eye className="size-4" aria-hidden /> {t('previewDraft')}
              </Button>
            </div>
          )}
        </FormDialog>
      )}
    </section>
  );
}
