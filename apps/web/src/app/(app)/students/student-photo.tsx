'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Trash2, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { fetchImageDataUrl } from '@/lib/cards/assets';
import { preparePhoto } from '@/lib/cards/photo';
import { errorKey } from '@/lib/errors';

/** Foto siswa untuk kartu cetak: pratinjau, unggah/ganti (dipotong 3:4 dan dikecilkan otomatis), dan hapus. */
export function StudentPhotoField({ studentId }: { studentId: string }) {
  const t = useTranslations('students');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const fileRef = useRef<HTMLInputElement>(null);
  const key = ['student-photo', school.schoolId, studentId];

  const photo = useQuery({
    queryKey: key,
    queryFn: () => fetchImageDataUrl(`/v1/students/${studentId}/photo`, school.schoolId),
    staleTime: 0,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = await preparePhoto(file);
      return unwrap(
        await api.POST('/v1/students/{id}/photo', {
          params: { ...header, path: { id: studentId } },
          body: { mime: 'image/jpeg', data },
        }),
      );
    },
    onSuccess: () => {
      toast.success(t('photoSaved'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) =>
      toast.error(e instanceof Error && e.message === 'invalid_image' ? t('photoInvalid') : te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/students/{id}/photo', { params: { ...header, path: { id: studentId } } })),
    onSuccess: () => {
      toast.success(t('photoRemoved'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex items-center gap-4 sm:col-span-2">
      <div className="bg-muted text-muted-foreground flex h-24 w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-lg border">
        {photo.data ? (
          // biome-ignore lint/performance/noImgElement: foto privat berupa data URL
          <img src={photo.data} alt={t('photoAlt')} className="size-full object-cover" />
        ) : (
          <User className="size-8" aria-hidden />
        )}
      </div>
      <div className="grid content-start gap-2">
        <div>
          <p className="text-sm font-medium">{t('photo')}</p>
          <p className="text-muted-foreground text-xs">{t('photoHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <ImageUp className="size-4" />{' '}
            {upload.isPending ? t('photoUploading') : photo.data ? t('photoReplace') : t('photoUpload')}
          </Button>
          {photo.data && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate()}>
              <Trash2 className="size-4" /> {t('photoRemove')}
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload.mutate(file);
          }}
        />
      </div>
    </div>
  );
}
