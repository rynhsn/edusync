'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Props {
  /** Tombol pembuka, mis. <Button>Tambah siswa</Button>. Tanpa trigger, dialog dikendalikan lewat `open`. */
  trigger?: React.ReactElement;
  /** Mode terkendali (mis. dialog ubah yang dibuka dari tombol di baris daftar). */
  open?: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  /** Dipanggil saat formulir dikirim. Dialog menutup bila berhasil; lempar galat untuk membiarkannya terbuka. */
  onSubmit: () => Promise<unknown>;
  /** Pesan galat untuk ditampilkan di dalam dialog. */
  error?: string | null;
  /** Mengosongkan isian setiap kali dialog dibuka atau ditutup. */
  onOpenChange?: (open: boolean) => void;
  /** Lebar dialog; formulir dengan banyak isian memakai "wide". */
  size?: 'default' | 'wide';
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Formulir tambah di dalam dialog, supaya halaman daftar tidak didominasi formulir. Isian ditata dua kolom
 * (satu kolom di layar sempit) oleh pemakai lewat grid di dalam `children`.
 */
export function FormDialog({
  trigger,
  open: controlledOpen,
  title,
  description,
  submitLabel,
  onSubmit,
  error,
  onOpenChange,
  size = 'default',
  disabled,
  children,
}: Props) {
  const t = useTranslations('common');
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [pending, setPending] = useState(false);

  function change(next: boolean) {
    setInnerOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent
        className={cn('max-h-[90dvh] overflow-y-auto sm:max-w-lg', size === 'wide' && 'sm:max-w-2xl')}
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              await onSubmit();
              change(false);
            } catch {
              // Galat ditampilkan lewat prop `error`; dialog tetap terbuka.
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-4">{children}</div>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => change(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending || disabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
