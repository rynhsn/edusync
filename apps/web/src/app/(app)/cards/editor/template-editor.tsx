'use client';

import type { CardElement, CardKind, CardLayout } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  Frame,
  ImageMinus,
  ImagePlus,
  Minus,
  QrCode,
  Redo2,
  Save,
  ScanBarcode,
  Square,
  Type,
  Undo2,
  User,
  Variable,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import {
  CANVAS_PRESETS,
  createElement,
  duplicateElement,
  ensureIds,
  type LayoutIssue,
  moveInOrder,
  type OrderMove,
  removeElement,
  resizeCanvas,
  sampleCardData,
  validateLayout,
} from '@/lib/cards/elements';
import { fitScale, nudgeBox } from '@/lib/cards/geometry';
import { errorKey } from '@/lib/errors';
import { toBase64 } from '@/lib/file-base64';
import { CheckField } from '../check-field';
import { schoolFileUrl } from '../element-preview';
import { useFieldLabel } from '../use-field-label';
import { EditorCanvas } from './canvas';
import { NumberField } from './number-field';
import { PropertiesPanel } from './properties-panel';
import { type EditorDoc, useCardEditor } from './use-card-editor';
import { useUnsavedGuard } from './use-unsaved-guard';

const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_MIMES = ['image/png', 'image/jpeg'] as const;

const ADD_TOOLS = [
  { type: 'text', icon: Type },
  { type: 'field', icon: Variable },
  { type: 'image', icon: ImagePlus },
  { type: 'photo', icon: User },
  { type: 'qr', icon: QrCode },
  { type: 'barcode', icon: ScanBarcode },
  { type: 'rect', icon: Square },
  { type: 'line', icon: Minus },
] as const;

const BLANK_LAYOUT: Record<CardKind, CardLayout> = {
  student: { widthMm: 86, heightMm: 54, elements: [] },
  exam: { widthMm: 100, heightMm: 60, elements: [] },
};

type UploadPurpose = 'background' | 'image-new' | 'image-replace';

/** Muat templat (mode ubah) lalu tampilkan ruang kerja editor; mode baru langsung menampilkan kanvas kosong. */
export function TemplateEditor({ id, kind }: { id?: string; kind?: CardKind }) {
  const t = useTranslations('cards');
  const { school, can } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };

  const template = useQuery({
    queryKey: ['card-template', school.schoolId, id],
    enabled: !!id && can('school:manage'),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/cards/templates/{id}', { params: { ...header, path: { id: id as string } } }),
      ),
  });

  if (!can('school:manage')) {
    return (
      <PageBody>
        <PageHeader title={t('editor.title')} actions={<BackLink href="/cards" label={t('backToList')} />} />
        <Alert>
          <CircleAlert className="size-4" aria-hidden />
          <AlertDescription>{t('editor.noAccess')}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }
  if (id) {
    if (template.error) {
      return (
        <PageBody>
          <PageHeader
            title={t('editor.title')}
            actions={<BackLink href="/cards" label={t('backToList')} />}
          />
          <Alert variant="destructive">
            <CircleAlert className="size-4" aria-hidden />
            <AlertDescription>{t('editor.loadError')}</AlertDescription>
          </Alert>
        </PageBody>
      );
    }
    if (!template.data) return <Skeleton className="h-96 w-full" />;
    const tpl = template.data;
    return (
      <Workspace
        key={tpl.id}
        templateId={tpl.id}
        kind={tpl.kind}
        initial={{
          name: tpl.name,
          layout: { ...tpl.layout, elements: ensureIds(tpl.layout.elements as CardElement[]) },
          backgroundFileId: tpl.backgroundFileId,
          isDefault: tpl.isDefault,
        }}
      />
    );
  }
  const k = kind ?? 'student';
  return (
    <Workspace
      kind={k}
      initial={{ name: '', layout: BLANK_LAYOUT[k], backgroundFileId: null, isDefault: false }}
    />
  );
}

function Workspace({
  templateId,
  kind,
  initial,
}: {
  templateId?: string;
  kind: CardKind;
  initial: EditorDoc;
}) {
  const t = useTranslations('cards');
  const te = useTranslations();
  const tType = useTranslations('cards.elementTypes');
  const { school } = useSchool();
  const router = useRouter();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const fieldLabel = useFieldLabel();

  const editor = useCardEditor(initial);
  const { doc, selected } = editor;
  const guard = useUnsavedGuard(editor.dirty);
  const sampleData = sampleCardData(kind);

  const [scale, setScale] = useState(5);
  const [snap, setSnap] = useState(true);
  const [sample, setSample] = useState(true);
  const [issues, setIssues] = useState<LayoutIssue[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const purpose = useRef<UploadPurpose>('background');

  const canvasW = doc.layout.widthMm;
  const canvasH = doc.layout.heightMm;
  const canvasSize = useMemo(() => ({ w: canvasW, h: canvasH }), [canvasW, canvasH]);
  const fitToWidth = useCallback(() => {
    const avail = (wrapRef.current?.clientWidth ?? 640) - 40;
    setScale(fitScale(canvasW, avail));
  }, [canvasW]);

  // Skala awal agar kartu muat di lebar yang tersedia; berikutnya diatur pengguna.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat dibuka
  useEffect(() => fitToWidth(), []);

  /* ---------- Aksi pada elemen ---------- */

  const addElement = (type: CardElement['type'], fileId?: string) => {
    if (doc.layout.elements.length >= 60) {
      toast.error(t('editor.tooMany'));
      return;
    }
    const el = createElement(type, kind, canvasSize, fileId ? { fileId } : {});
    editor.changeLayout((l) => ({ ...l, elements: [...l.elements, el] }));
    editor.select(el.id ?? null);
  };

  const deleteSelected = useCallback(() => {
    const id = editor.selectedId;
    if (!id) return;
    editor.changeLayout((l) => ({ ...l, elements: removeElement(l.elements, id) }));
    editor.select(null);
  }, [editor]);

  const order = (move: OrderMove) => {
    const id = editor.selectedId;
    if (id) editor.changeLayout((l) => ({ ...l, elements: moveInOrder(l.elements, id, move) }));
  };

  const duplicate = useCallback(() => {
    const id = editor.selectedId;
    if (!id) return;
    const result = duplicateElement(doc.layout.elements, id, canvasSize);
    if (!result) {
      toast.error(t('editor.tooMany'));
      return;
    }
    editor.changeLayout((l) => ({ ...l, elements: result.elements }));
    editor.select(result.newId);
  }, [editor, doc.layout.elements, canvasSize, t]);

  /* ---------- Papan ketik ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"],[role="listbox"],[role="dialog"]'))
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        editor.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
        return;
      }
      const sel = editor.selected;
      if (!sel?.id) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        editor.select(null);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        const step = e.shiftKey ? 5 : snap ? 0.5 : 0.1;
        const id = sel.id;
        const box = nudgeBox(sel, dx, dy, step, canvasSize);
        editor.changeElement(id, box, `${id}:nudge`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, duplicate, deleteSelected, snap, canvasSize]);

  /* ---------- Unggah gambar ---------- */

  function pickFile(p: UploadPurpose) {
    purpose.current = p;
    fileRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const mime = IMAGE_MIMES.find((m) => m === file.type);
    if (!mime || file.size > MAX_IMAGE_BYTES) {
      toast.error(t('editor.imageInvalid'));
      return;
    }
    setUploading(true);
    try {
      const data = await toBase64(file);
      const res = unwrap(await api.POST('/v1/cards/backgrounds', { params: header, body: { mime, data } }));
      if (purpose.current === 'background') {
        editor.change((d) => ({ ...d, backgroundFileId: res.id }));
      } else if (purpose.current === 'image-new') {
        addElement('image', res.id);
      } else if (editor.selectedId) {
        editor.changeElement(editor.selectedId, { fileId: res.id } as Partial<CardElement>);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : te(errorKey(e)));
    } finally {
      setUploading(false);
    }
  }

  /* ---------- Simpan ---------- */

  const save = useMutation({
    mutationFn: async () => {
      const found = validateLayout(doc.layout);
      const nameIssue =
        doc.name.trim() === '' ? [{ element: null, field: 'name', message: t('editor.nameRequired') }] : [];
      setIssues([...nameIssue, ...found]);
      setServerError(null);
      if (nameIssue.length > 0 || found.length > 0) throw new Error('invalid_layout');
      const body = {
        name: doc.name.trim(),
        layout: doc.layout,
        backgroundFileId: doc.backgroundFileId,
        isDefault: doc.isDefault,
      };
      if (templateId) {
        return unwrap(
          await api.PUT('/v1/cards/templates/{id}', {
            params: { ...header, path: { id: templateId } },
            body,
          }),
        );
      }
      return unwrap(await api.POST('/v1/cards/templates', { params: header, body: { ...body, kind } }));
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['card-templates', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['card-template', school.schoolId, saved.id] });
      toast.success(t('editor.saved'));
      editor.markSaved({
        name: saved.name,
        layout: { ...saved.layout, elements: ensureIds(saved.layout.elements as CardElement[]) },
        backgroundFileId: saved.backgroundFileId,
        isDefault: saved.isDefault,
      });
      if (!templateId) router.replace(`/cards/${saved.id}`);
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'invalid_layout') return;
      setServerError(e instanceof ApiError ? e.message : te(errorKey(e)));
    },
  });

  const presetKey = CANVAS_PRESETS.find((p) => p.w === canvasSize.w && p.h === canvasSize.h)?.key ?? '';
  const backgroundUrl = doc.backgroundFileId ? schoolFileUrl(doc.backgroundFileId) : null;
  const elementName = (el: CardElement) =>
    el.type === 'field' ? fieldLabel(el.field) : el.type === 'text' ? el.text : tType(el.type);

  return (
    <PageBody>
      <PageHeader
        icon={Frame}
        tone="violet"
        title={doc.name.trim() || t('editor.untitled')}
        description={t(kind === 'student' ? 'editor.descStudent' : 'editor.descExam')}
        actions={
          <>
            {editor.dirty && <span className="text-muted-foreground text-sm">{t('editor.unsaved')}</span>}
            <BackLink href="/cards" label={t('backToList')} />
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || (!editor.dirty && !!templateId)}
            >
              <Save className="size-4" /> {save.isPending ? t('editor.saving') : t('editor.save')}
            </Button>
          </>
        }
      />

      {(issues.length > 0 || serverError) && (
        <Alert variant="destructive">
          <CircleAlert className="size-4" aria-hidden />
          <AlertDescription>
            {serverError && <p>{serverError}</p>}
            {issues.length > 0 && (
              <>
                <p className="font-medium">{t('editor.fixIssues')}</p>
                <ul className="list-disc pl-5">
                  {issues.map((i, n) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: daftar pesan sesaat
                    <li key={n}>
                      {i.element !== null && `${t('editor.elementN', { n: i.element })}: `}
                      {i.field && i.element !== null ? `${i.field}, ` : ''}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card className="grid gap-4 px-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_auto_auto_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <Label htmlFor="tpl-name">{t('editor.name')}</Label>
          <Input
            id="tpl-name"
            maxLength={100}
            value={doc.name}
            placeholder={t('editor.namePlaceholder')}
            onChange={(e) => editor.change((d) => ({ ...d, name: e.target.value }), 'name')}
            onBlur={editor.endTyping}
          />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="tpl-preset">{t('editor.size')}</Label>
          <div className="flex items-center gap-2">
            <div className="w-28">
              <SelectField
                id="tpl-preset"
                value={presetKey}
                placeholder={t('presets.custom')}
                onChange={(e) => {
                  const p = CANVAS_PRESETS.find((x) => x.key === e.target.value);
                  if (p) editor.changeLayout((l) => resizeCanvas(l, p.w, p.h));
                }}
              >
                <option value="">{t('presets.custom')}</option>
                {CANVAS_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {t(`presets.${p.key}`)} ({p.w}×{p.h})
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="tpl-w">{t('editor.sizeMm')}</Label>
          <div className="flex items-center gap-2">
            <div className="w-20">
              <NumberField
                id="tpl-w"
                aria-label={t('editor.width')}
                value={canvasSize.w}
                min={20}
                max={300}
                step={1}
                onChange={(v) => editor.changeLayout((l) => resizeCanvas(l, v, l.heightMm), 'canvas-w')}
              />
            </div>
            <span aria-hidden>×</span>
            <div className="w-20">
              <NumberField
                aria-label={t('editor.height')}
                value={canvasSize.h}
                min={20}
                max={300}
                step={1}
                onChange={(v) => editor.changeLayout((l) => resizeCanvas(l, l.widthMm, v), 'canvas-h')}
              />
            </div>
          </div>
        </div>
        <div className="grid content-start gap-2">
          <Label>{t('editor.background')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => pickFile('background')}>
              <ImagePlus className="size-4" />{' '}
              {uploading ? t('editor.uploading') : t('editor.uploadBackground')}
            </Button>
            {doc.backgroundFileId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => editor.change((d) => ({ ...d, backgroundFileId: null }))}
              >
                <ImageMinus className="size-4" /> {t('editor.removeBackground')}
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">{t('editor.backgroundHint')}</p>
        </div>
        <CheckField
          className="md:col-span-2 xl:col-span-4"
          checked={doc.isDefault}
          onChange={(c) => editor.change((d) => ({ ...d, isDefault: c }))}
        >
          {t('editor.makeDefault')}
        </CheckField>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        {/* Kiri: tambah elemen + lapisan */}
        <Card className="gap-4 px-4">
          <div className="grid content-start gap-2">
            <h2 className="font-heading text-sm font-semibold">{t('editor.addElement')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {ADD_TOOLS.map(({ type, icon: Icon }) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => (type === 'image' ? pickFile('image-new') : addElement(type))}
                >
                  <Icon className="size-4" /> {tType(type)}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid content-start gap-2">
            <h2 className="font-heading text-sm font-semibold">{t('editor.layers')}</h2>
            {doc.layout.elements.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t('editor.noLayers')}</p>
            ) : (
              <ul className="grid max-h-64 gap-1 overflow-y-auto">
                {[...doc.layout.elements].reverse().map((el) => (
                  <li key={el.id}>
                    <button
                      type="button"
                      onClick={() => editor.select(el.id ?? null)}
                      aria-pressed={el.id === editor.selectedId}
                      className={`hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
                        el.id === editor.selectedId ? 'bg-muted font-medium' : ''
                      }`}
                    >
                      <span className="text-muted-foreground w-12 shrink-0 truncate">{tType(el.type)}</span>
                      <span className="truncate">{elementName(el)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Tengah: kanvas */}
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t('editor.undo')}
              disabled={!editor.canUndo}
              onClick={editor.undo}
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t('editor.redo')}
              disabled={!editor.canRedo}
              onClick={editor.redo}
            >
              <Redo2 className="size-4" />
            </Button>
            <span className="bg-border mx-1 h-5 w-px" aria-hidden />
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t('editor.zoomOut')}
              onClick={() => setScale((s) => Math.max(2, Math.round(s * 0.85 * 100) / 100))}
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t('editor.zoomIn')}
              onClick={() => setScale((s) => Math.min(14, Math.round(s * 1.15 * 100) / 100))}
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={fitToWidth}>
              {t('editor.fit')}
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              {Math.round((scale / 3.7795) * 100)}%
            </span>
            <span className="bg-border mx-1 h-5 w-px" aria-hidden />
            <CheckField checked={snap} onChange={setSnap}>
              {t('editor.snap')}
            </CheckField>
            <CheckField checked={sample} onChange={setSample}>
              {t('editor.sampleData')}
            </CheckField>
          </div>
          <div
            ref={wrapRef}
            className="bg-muted/50 flex min-h-64 justify-start overflow-auto rounded-xl border p-5 sm:justify-center"
          >
            <EditorCanvas
              editor={editor}
              scale={scale}
              snap={snap}
              sample={sample}
              data={sampleData}
              backgroundUrl={backgroundUrl}
              fieldLabel={fieldLabel}
              ariaLabel={t('editor.canvas')}
            />
          </div>
          <p className="text-muted-foreground text-xs">{t('editor.shortcuts')}</p>
        </div>

        {/* Kanan: properti */}
        <Card className="px-4">
          <h2 className="font-heading text-sm font-semibold">{t('editor.properties')}</h2>
          {selected?.id ? (
            <PropertiesPanel
              element={selected}
              kind={kind}
              fieldLabel={fieldLabel}
              uploading={uploading}
              onChange={(patch, key) => editor.changeElement(selected.id as string, patch, key ?? null)}
              onBlurField={editor.endTyping}
              onOrder={order}
              onDuplicate={duplicate}
              onDelete={deleteSelected}
              onPickImage={() => pickFile('image-replace')}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{t('editor.selectHint')}</p>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!guard.pending}
        onOpenChange={(open) => !open && guard.stay()}
        title={t('editor.leaveTitle')}
        description={t('editor.leaveBody')}
        confirmLabel={t('editor.leaveConfirm')}
        destructive
        onConfirm={async () => guard.leave()}
      />
    </PageBody>
  );
}
