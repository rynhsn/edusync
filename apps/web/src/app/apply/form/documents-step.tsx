'use client';

import { detectMime, MAX_DOC_BYTES } from '@edusync/contracts';
import { FileText, ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DocKind = string;

/** Jenis dokumen yang diminta sekolah (dari info pendaftaran). */
export interface DocType {
  key: string;
  label: string;
  required: boolean;
}

/** Dokumen di memori saja (tidak pernah ditulis ke sessionStorage). */
export interface DocFile {
  kind: DocKind;
  fileName: string;
  mime: string;
  size: number;
  dataBase64: string;
  /** URL pratinjau untuk gambar; kosong untuk PDF. */
  previewUrl: string | null;
}

type Problem = 'tooLarge' | 'badType' | 'unreadable';

function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** Baca dan periksa berkas di klien. Server tetap memeriksa ulang isi dan ukurannya. */
async function readDoc(kind: DocKind, file: File): Promise<DocFile | Problem> {
  if (file.size > MAX_DOC_BYTES) return 'tooLarge';
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectMime(bytes);
    if (!mime) return 'badType';
    const previewUrl =
      mime === 'application/pdf' ? null : URL.createObjectURL(new Blob([bytes], { type: mime }));
    return {
      kind,
      fileName: file.name.slice(0, 120),
      mime,
      size: file.size,
      dataBase64: toBase64(bytes),
      previewUrl,
    };
  } catch {
    return 'unreadable';
  }
}

const sizeLabel = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function Slot({
  kind,
  label,
  required,
  doc,
  onPick,
  onRemove,
}: {
  kind: DocKind;
  label: string;
  required: boolean;
  doc: DocFile | undefined;
  onPick: (kind: DocKind, file: File) => Promise<Problem | null>;
  onRemove: (kind: DocKind) => void;
}) {
  const t = useTranslations('apply.docs');
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setProblem(await onPick(kind, file));
    setBusy(false);
  }

  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">
        {label}{' '}
        <span className={required ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
          {required ? t('requiredMark') : t('optionalMark')}
        </span>
      </p>
      {doc ? (
        <div className="flex items-center gap-3 rounded-2xl border bg-[var(--ap-teal-soft)]/50 p-3">
          <div className="bg-background grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border">
            {doc.previewUrl ? (
              // biome-ignore lint/performance/noImgElement: pratinjau lokal dari blob, bukan aset yang dioptimalkan
              <img src={doc.previewUrl} alt="" className="size-full object-cover" />
            ) : (
              <FileText className="size-6 text-[var(--ap-orange)]" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{doc.fileName}</p>
            <p className="text-muted-foreground text-xs">{sizeLabel(doc.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('remove', { name: doc.fileName })}
            onClick={() => {
              setProblem(null);
              onRemove(kind);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: area seret-lepas; tombol sebenarnya ada di dalamnya
        <div
          role="group"
          aria-label={label}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void take(e.dataTransfer.files[0]);
          }}
          className={cn(
            'flex flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors',
            over ? 'border-[var(--ap-orange)] bg-[var(--ap-orange-soft)]' : 'hover:border-primary/50',
          )}
        >
          {kind === 'photo' ? (
            <ImageIcon className="text-muted-foreground size-6" aria-hidden />
          ) : (
            <UploadCloud className="text-muted-foreground size-6" aria-hidden />
          )}
          <p className="text-muted-foreground text-xs">{t('dropHint')}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? t('reading') : t('choose')}
          </Button>
          <input
            ref={input}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept="application/pdf,image/jpeg,image/png"
            aria-label={label}
            onChange={(e) => {
              void take(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {problem && (
        <p role="alert" className="text-destructive text-xs font-medium">
          {t(`problem.${problem}`)}
        </p>
      )}
    </div>
  );
}

/** Langkah unggah dokumen: satu area seret-lepas per jenis dokumen. Berkas hanya hidup di memori halaman ini. */
export function DocumentsStep({
  types,
  docs,
  missing,
  onChange,
}: {
  types: DocType[];
  docs: DocFile[];
  /** Kunci jenis wajib yang belum diunggah setelah mencoba lanjut. */
  missing: string[];
  onChange: (docs: DocFile[]) => void;
}) {
  const t = useTranslations('apply.docs');
  const latest = useRef(docs);
  latest.current = docs;

  async function pick(kind: DocKind, file: File): Promise<Problem | null> {
    const res = await readDoc(kind, file);
    if (typeof res === 'string') return res;
    const old = latest.current.find((d) => d.kind === kind);
    if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl);
    onChange([...latest.current.filter((d) => d.kind !== kind), res]);
    return null;
  }

  function remove(kind: DocKind) {
    const old = latest.current.find((d) => d.kind === kind);
    if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl);
    onChange(latest.current.filter((d) => d.kind !== kind));
  }

  return (
    <div className="grid gap-5">
      <p className="text-muted-foreground rounded-xl bg-[var(--ap-orange-soft)] px-3 py-2 text-xs text-[var(--ap-orange-ink)]">
        {t('rules')}
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {types.map((k) => (
          <div key={k.key} className="grid gap-1.5">
            <Slot
              kind={k.key}
              label={k.label}
              required={k.required}
              doc={docs.find((d) => d.kind === k.key)}
              onPick={pick}
              onRemove={remove}
            />
            {missing.includes(k.key) && (
              <p role="alert" className="text-destructive text-xs font-medium">
                {t('requiredError')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
