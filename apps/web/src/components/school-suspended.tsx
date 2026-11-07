'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePause, RefreshCw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, unwrap } from '@/lib/api';
import type { SuspensionKind } from '@/lib/school-suspension';
import { goToSchool, useSite } from '@/lib/site';

/**
 * Layar pengganti isi panel untuk sekolah yang ditangguhkan. Kepala halaman dan pemindah konteks tetap
 * dirender oleh kerangka, jadi pengguna masih bisa pindah sekolah atau keluar. Tidak menampilkan data pribadi
 * apa pun (tanpa email pemilik); tombol bayar hanya muncul bagi pemilik lembaga.
 */
export function SchoolSuspended({
  kind,
  schoolName,
  note,
  since,
}: {
  kind: SuspensionKind;
  schoolName: string;
  /** Alasan tertulis dari staf platform (kosong untuk penangguhan karena tagihan). */
  note?: string | null;
  /** Waktu penangguhan (ISO). */
  since?: string | null;
}) {
  const t = useTranslations('schoolSuspended');
  const format = useFormatter();
  const site = useSite();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  // Kunci dan fungsi yang sama dengan ContextSwitcher, jadi hasilnya dipakai bersama dari cache.
  const owner = useQuery({
    queryKey: ['context', 'owner'],
    retry: false,
    queryFn: async () => {
      const res = await api.GET('/v1/account');
      return res.response.ok ? unwrap(res) : null;
    },
  });
  const isOwner = (owner.data?.foundations.length ?? 0) > 0;

  const reload = async () => {
    setBusy(true);
    try {
      await qc.invalidateQueries({ queryKey: ['me'] });
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!site.ready) return;
    try {
      await goToSchool(site, null, '/account/billing');
    } catch {
      toast.error(t('payError'));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <CirclePause className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('schoolName', { name: schoolName })}</p>
      {kind === 'billing' ? (
        <div className="grid gap-1 text-sm">
          <p>{t('billingBody')}</p>
          <p className="text-muted-foreground">{t('billingHint')}</p>
        </div>
      ) : (
        <div className="grid gap-1 text-sm">
          <p>{t('otherBody')}</p>
          {note && <p className="bg-muted rounded-lg px-3 py-2 break-words">{t('reason', { note })}</p>}
        </div>
      )}
      {since && (
        <p className="text-muted-foreground text-xs">
          {t('since', { date: format.dateTime(new Date(since), { dateStyle: 'long' }) })}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {isOwner && kind === 'billing' && <Button onClick={pay}>{t('payAction')}</Button>}
        <Button variant="outline" onClick={reload} disabled={busy}>
          <RefreshCw className="size-4" aria-hidden />
          {t('reload')}
        </Button>
      </div>
    </div>
  );
}
