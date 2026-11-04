'use client';

import { useMutation } from '@tanstack/react-query';
import { ImagePlus, Sigma } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { RichText } from '@/components/rich-text';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { toBase64 } from '@/lib/file-base64';

const MAX_IMAGE_BYTES = 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Kolom teks soal dengan tombol sisip rumus dan gambar, plus pratinjau langsung. */
export function RichEditor({
  id,
  label,
  value,
  onChange,
  rows = 4,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const t = useTranslations('exams');
  const te = useTranslations();
  const { school } = useSchool();
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  /** Sisipkan `snippet` di kursor; `inner` = rentang di dalam snippet yang langsung terpilih. */
  function insert(snippet: string, inner?: [number, number]) {
    const el = area.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + snippet + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const [a, b] = inner ?? [snippet.length, snippet.length];
      el.setSelectionRange(start + a, start + b);
    });
  }

  const upload = useMutation({
    mutationFn: async (f: File) => {
      const mime = f.type as (typeof IMAGE_TYPES)[number];
      if (!IMAGE_TYPES.includes(mime) || f.size > MAX_IMAGE_BYTES) throw new Error('image');
      return unwrap(
        await api.POST('/v1/exam/images', {
          params: { header: schoolHeader(school.schoolId) },
          body: { mime, data: await toBase64(f) },
        }),
      );
    },
    onSuccess: (r) => insert(`![](${r.url})`),
    onError: (e) =>
      toast.error(e instanceof Error && e.message === 'image' ? t('imageInvalid') : te(errorKey(e))),
  });

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => insert('$x^2$', [1, 4])}>
            <Sigma /> {t('insertFormula')}
          </Button>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={t('insertImage')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) upload.mutate(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload.isPending}
            onClick={() => file.current?.click()}
          >
            <ImagePlus /> {t('insertImage')}
          </Button>
        </div>
      </div>
      <Textarea
        id={id}
        ref={area}
        rows={rows}
        maxLength={10_000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value.trim() && (
        <div className="bg-muted/40 rounded-lg border p-3 text-sm">
          <p className="text-muted-foreground mb-1 text-xs">{t('preview')}</p>
          <RichText text={value} />
        </div>
      )}
    </div>
  );
}
