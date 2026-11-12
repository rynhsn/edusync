'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { FormGate } from '@/components/form-field-error';
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
  error?: React.ReactNode;
  /** Mengosongkan isian setiap kali dialog dibuka atau ditutup. */
  onOpenChange?: (open: boolean) => void;
  /** Lebar dialog; formulir dengan banyak isian memakai "wide". */
  size?: 'default' | 'wide';
  disabled?: boolean;
  /**
   * Validasi galat-merah (useFormValidation). Bila diberikan, validasi bawaan browser dimatikan (`noValidate`), kirim
   * ditahan sampai semua isian benar, isian salah pertama difokuskan, dan ringkasan tampil dekat tombol kirim.
   */
  validation?: FormGate;
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
  validation,
  children,
}: Props) {
  const t = useTranslations('common');
  const tv = useTranslations('formValidation');
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // Galat dari server muncul di bawah dialog; di ponsel itu bisa di luar layar, jadi digulir ke terlihat.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  function change(next: boolean) {
    setInnerOpen(next);
    validation?.reset();
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
          noValidate={!!validation}
          onSubmit={async (e) => {
            e.preventDefault();
            if (validation && !validation.attempt()) return;
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
            <div ref={errorRef} className="scroll-mb-28">
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}
          {validation?.summary && (
            <p aria-live="polite" className="text-destructive text-sm">
              {tv('summary')}
            </p>
          )}
          <DialogFooter className="max-sm:sticky max-sm:-bottom-4 max-sm:z-10 max-sm:flex-row-reverse max-sm:bg-muted max-sm:[&>*]:flex-1">
            <Button type="button" variant="ghost" className="h-11 md:h-8" onClick={() => change(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" className="h-11 md:h-8" disabled={pending || disabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
