'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

/**
 * Kartu seorang siswa. Bagian RFID (endpoint kartu absensi) hanya untuk pemegang `attendance:configure` dengan modul
 * absensi; bagian QR identitas (satu kode untuk semua fitur, tanpa modul) untuk pemegang `student:manage`.
 */
export function StudentCards({
  studentId,
  name,
  rfid,
  qr,
}: {
  studentId: string;
  name: string;
  rfid: boolean;
  qr: boolean;
}) {
  const t = useTranslations('gate');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['attendance-cards', school.schoolId, 'student', studentId];
  const [code, setCode] = useState('');

  const list = useQuery({
    queryKey: key,
    enabled: rfid,
    queryFn: async () =>
      unwrap(await api.GET('/v1/attendance/cards', { params: { ...header, query: { studentId } } })),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['attendance-cards', school.schoolId] });
  };
  const add = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/v1/attendance/cards', { params: header, body: { studentId, code } })),
    onSuccess: () => {
      setCode('');
      toast.success(t('cardAdded'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const rotate = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/students/{studentId}/identity-code/rotate', {
          params: { ...header, path: { studentId } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('qrRotated'));
      queryClient.invalidateQueries({ queryKey: ['card-data', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/attendance/cards/{id}', { params: { ...header, path: { id } } })),
    onSuccess: refresh,
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <section className="grid gap-3">
      {rfid && list.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('studentCardsEmpty')}</p>
      )}
      <ul className="grid content-start gap-2">
        {list.data?.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
            <code className="font-mono text-xs break-all">{c.code}</code>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('confirmDeleteCard', { name: c.studentName })}
              disabled={remove.isPending}
              onClick={() => remove.mutate(c.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      {rfid && list.data?.length === 0 && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Input
            aria-label={t('cardCode')}
            value={code}
            maxLength={64}
            placeholder={t('cardCodePlaceholder')}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" disabled={code.trim().length < 4 || add.isPending}>
            {t('studentCardsRegister')}
          </Button>
        </form>
      )}
      {qr && (
        <div className={rfid ? 'border-t pt-3' : undefined}>
          <p className="text-muted-foreground mb-2 text-xs">{t('qrRotateHint')}</p>
          <ConfirmDialog
            destructive
            title={t('qrRotateTitle', { name })}
            description={t('qrRotateBody')}
            confirmLabel={t('qrRotateConfirm')}
            pending={rotate.isPending}
            onConfirm={() => rotate.mutateAsync()}
            trigger={
              <Button variant="outline" size="sm" disabled={rotate.isPending}>
                <QrCode className="size-4" /> {t('qrRotate')}
              </Button>
            }
          />
        </div>
      )}
    </section>
  );
}
