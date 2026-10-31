'use client';

import {
  LETTER_PLACEHOLDERS,
  type LetterPlaceholder,
  renderLetter,
  unknownLetterPlaceholders,
} from '@edusync/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, FilePlus2, FileText, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { insertAtCursor, placeholderToken, SAMPLE_VARS } from '../format';
import { LetterPaper, PaperSheet } from '../letter-paper';
import { PlaceholderChips, TextArea } from '../placeholder-chips';
import { EnvelopeArt, useHeader, useLetterhead, useTemplates } from '../shared';
import '../letters.css';
import { NumberingCard } from './numbering-card';

interface Form {
  id: string | null;
  name: string;
  kind: 'letter' | 'certificate';
  body: string;
  active: boolean;
}
const EMPTY: Form = { id: null, name: '', kind: 'letter', body: '', active: true };

/** Daftar templat surat dan editornya (chip pengganti, pratinjau data contoh). */
export function TemplatesView() {
  const t = useTranslations('letters');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const { school, can } = useSchool();
  const { header } = useHeader();
  const letterhead = useLetterhead();
  const templates = useTemplates();
  const manage = can('letter:manage');
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['letters', school.schoolId] });

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const body = { name: f.name.trim(), kind: f.kind, body: f.body.trim(), active: f.active };
      if (f.id) {
        return unwrap(
          await api.PUT('/v1/letters/templates/{id}', { params: { header, path: { id: f.id } }, body }),
        );
      }
      return unwrap(await api.POST('/v1/letters/templates', { params: { header }, body }));
    },
    onSuccess: () => {
      toast.success(t('templateSaved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/letters/templates/{id}', { params: { header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('templateDeleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const installDefaults = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/letters/templates/defaults', { params: { header } })),
    onSuccess: () => {
      toast.success(t('defaultsInstalled'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function insert(name: string) {
    if (!form) return;
    const el = bodyRef.current;
    const { value, cursor } = insertAtCursor(
      form.body,
      el?.selectionStart ?? form.body.length,
      el?.selectionEnd ?? form.body.length,
      placeholderToken(name),
    );
    setForm({ ...form, body: value });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  }

  const sample = (body: string) =>
    renderLetter(body, SAMPLE_VARS as Partial<Record<LetterPlaceholder, string>>);
  const unknown = form ? unknownLetterPlaceholders(form.body) : [];
  const list = templates.data ?? [];

  return (
    <PageBody className="lt-scope">
      <PageHeader
        title={t('templatesTitle')}
        description={t('templatesDescription')}
        actions={
          manage && (
            <Button
              onClick={() => {
                setError(null);
                setForm(EMPTY);
              }}
            >
              <FilePlus2 className="size-4" /> {t('templateAdd')}
            </Button>
          )
        }
      />

      <NumberingCard />

      {templates.isPending && <Skeleton className="h-40 w-full" />}
      {templates.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {templates.data && list.length === 0 && (
        <Card className="lt-fade-up items-center gap-3 px-6 py-12 text-center">
          <EnvelopeArt className="w-32" />
          <p className="font-heading text-lg font-medium">{t('templatesEmptyTitle')}</p>
          <p className="text-muted-foreground max-w-md text-sm">{t('templatesEmptyBody')}</p>
          {manage && (
            <Button disabled={installDefaults.isPending} onClick={() => installDefaults.mutate()}>
              <Sparkles className="size-4" /> {t('installDefaults')}
            </Button>
          )}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((tpl, i) => (
          <Card
            key={tpl.id}
            className="lt-fade-up gap-3 px-4 transition-shadow hover:shadow-md"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--lt-ink-soft)] text-[var(--lt-ink)]">
                {tpl.kind === 'certificate' ? (
                  <Award className="size-5" aria-hidden />
                ) : (
                  <FileText className="size-5" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{tpl.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">
                    {tpl.kind === 'certificate' ? t('kindCertificate') : t('kindLetter')}
                  </Badge>
                  {!tpl.active && <Badge variant="secondary">{t('inactive')}</Badge>}
                </div>
              </div>
            </div>
            <p className="text-muted-foreground line-clamp-3 font-serif text-sm whitespace-pre-line">
              {tpl.body}
            </p>
            <div className="flex justify-between gap-1">
              <Button size="sm" variant="ghost" onClick={() => setPreviewing(tpl.id)}>
                {t('preview')}
              </Button>
              {manage && (
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('edit')}
                    onClick={() => {
                      setError(null);
                      setForm({
                        id: tpl.id,
                        name: tpl.name,
                        kind: tpl.kind,
                        body: tpl.body,
                        active: tpl.active,
                      });
                    }}
                  >
                    <Pencil />
                  </Button>
                  <ConfirmDialog
                    destructive
                    title={t('templateDeleteTitle', { name: tpl.name })}
                    description={t('templateDeleteBody')}
                    confirmLabel={t('delete')}
                    onConfirm={() => remove.mutateAsync(tpl.id)}
                    trigger={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={t('delete')}
                      >
                        <Trash2 />
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Pratinjau templat dengan data contoh */}
      <FormDialog
        open={previewing !== null}
        onOpenChange={(o) => !o && setPreviewing(null)}
        title={t('templatePreviewTitle')}
        description={t('samplePreviewNote')}
        submitLabel={t('close')}
        onSubmit={async () => undefined}
        size="wide"
      >
        {previewing && (
          <PaperSheet zoom={100}>
            <LetterPaper
              schoolName={letterhead.schoolName}
              address={letterhead.address}
              number={SAMPLE_VARS.nomor}
              text={sample(list.find((x) => x.id === previewing)?.body ?? '')}
              dateText={SAMPLE_VARS.tanggal}
              status="draft"
              signer={{ name: SAMPLE_VARS.penandatangan, title: SAMPLE_VARS.jabatan }}
              watermark={false}
            />
          </PaperSheet>
        )}
      </FormDialog>

      {manage && (
        <FormDialog
          open={form !== null}
          onOpenChange={(o) => !o && setForm(null)}
          title={form?.id ? t('templateEditTitle') : t('templateAddTitle')}
          description={t('templateFormDescription')}
          submitLabel={t('save')}
          size="wide"
          error={error}
          disabled={!form || !form.name.trim() || !form.body.trim()}
          onSubmit={async () => {
            if (!form) return;
            setError(null);
            await save.mutateAsync(form);
          }}
        >
          {form && (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
                <div className="grid gap-1.5">
                  <Label htmlFor="tp-name">{t('templateName')}</Label>
                  <Input
                    id="tp-name"
                    required
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tp-kind">{t('templateKind')}</Label>
                  <SelectField
                    id="tp-kind"
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value as Form['kind'] })}
                  >
                    <option value="letter">{t('kindLetter')}</option>
                    <option value="certificate">{t('kindCertificate')}</option>
                  </SelectField>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tp-body">{t('body')}</Label>
                <PlaceholderChips names={LETTER_PLACEHOLDERS} onPick={insert} />
                <TextArea
                  id="tp-body"
                  ref={bodyRef}
                  required
                  rows={11}
                  maxLength={20000}
                  className="font-serif text-[0.95rem] leading-relaxed"
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
                {unknown.length > 0 && (
                  <p className="text-destructive text-xs" role="alert">
                    {t('unknownPlaceholders', { list: unknown.map(placeholderToken).join(', ') })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="tp-active"
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v === true })}
                />
                <Label htmlFor="tp-active">{t('templateActive')}</Label>
              </div>
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">{t('samplePreview')}</p>
                <div className="mx-auto w-full max-w-sm">
                  <PaperSheet zoom={100}>
                    <LetterPaper
                      schoolName={letterhead.schoolName}
                      address={letterhead.address}
                      number={SAMPLE_VARS.nomor}
                      text={sample(form.body)}
                      dateText={SAMPLE_VARS.tanggal}
                      status="draft"
                      signer={{ name: SAMPLE_VARS.penandatangan, title: SAMPLE_VARS.jabatan }}
                      watermark={false}
                    />
                  </PaperSheet>
                </div>
              </div>
            </div>
          )}
        </FormDialog>
      )}
    </PageBody>
  );
}
