'use client';

import { useMutation } from '@tanstack/react-query';
import { FileText, ImageIcon, Paperclip, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { toBase64 } from '@/lib/file-base64';
import { formatSize, inspectAttachment } from './attachment-logic';
import { useMessagingCtx } from './shared';

export interface PickedAttachment {
  id: string;
  fileName: string;
  mime: string;
  size: number;
  /** URL objek lokal untuk pratinjau gambar; null untuk PDF. */
  previewUrl: string | null;
}

/** Pilih satu lampiran (PDF/JPG/PNG, maks 2 MB): diperiksa di klien lalu diunggah; `id` dipakai saat membuat batch. */
export function AttachmentPicker({
  value,
  onChange,
  onBusy,
}: {
  value: PickedAttachment | null;
  onChange: (next: PickedAttachment | null) => void;
  /** Dipanggil true saat unggahan berjalan, false saat selesai (tombol kirim ditahan selama itu). */
  onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations('messaging.direct');
  const te = useTranslations();
  const { header } = useMessagingCtx();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checked = inspectAttachment(bytes);
      if ('issue' in checked) throw new Error(checked.issue);
      const meta = unwrap(
        await api.POST('/v1/messaging/attachments', {
          params: header,
          body: { fileName: file.name, mime: checked.mime, dataBase64: await toBase64(file) },
        }),
      );
      return {
        id: meta.id,
        fileName: meta.fileName,
        mime: meta.mime,
        size: meta.size,
        previewUrl: meta.mime === 'application/pdf' ? null : URL.createObjectURL(file),
      } satisfies PickedAttachment;
    },
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    onSuccess: (a) => {
      setError(null);
      onChange(a);
    },
    onError: (e) => {
      const issue = e instanceof Error ? e.message : '';
      setError(
        issue === 'empty' || issue === 'tooLarge' || issue === 'badType'
          ? t(`attachmentIssue.${issue}`)
          : te(errorKey(e)),
      );
    },
  });

  function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    // Ukuran diperiksa lebih dulu agar berkas besar tidak dibaca ke memori.
    if (file.size > 2 * 1024 * 1024) {
      setError(t('attachmentIssue.tooLarge'));
      return;
    }
    upload.mutate(file);
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="direct-attachment">{t('attachment')}</Label>
      <input
        ref={input}
        id="direct-attachment"
        type="file"
        className="sr-only"
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = ''; // berkas yang sama boleh dipilih lagi
        }}
      />
      {value ? (
        <div className="bg-muted/50 flex items-center gap-2 rounded-lg border p-2">
          {value.mime === 'application/pdf' ? (
            <FileText className="text-muted-foreground size-5 shrink-0" aria-hidden />
          ) : (
            <ImageIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.fileName}</p>
            <p className="text-muted-foreground text-xs">
              {value.mime === 'application/pdf' ? 'PDF' : value.mime === 'image/png' ? 'PNG' : 'JPG'} ·{' '}
              {formatSize(value.size)}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 shrink-0 md:size-8"
            aria-label={t('attachmentRemove')}
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto md:min-h-8"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <Paperclip className="size-4" />{' '}
            {upload.isPending ? t('attachmentUploading') : t('attachmentPick')}
          </Button>
        </div>
      )}
      <p className="text-muted-foreground text-xs">{t('attachmentHint')}</p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
