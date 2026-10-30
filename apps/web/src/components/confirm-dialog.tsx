'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
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

interface Props {
  /** Tombol pembuka. Tanpa trigger, dialog dikendalikan lewat `open` dan `onOpenChange`. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  /** Teks tombol konfirmasi; bawaan "Ya, lanjutkan". */
  confirmLabel?: string;
  /** Tindakan merusak (hapus dsb.): tombol konfirmasi berwarna merah. */
  destructive?: boolean;
  /** Dipanggil saat dikonfirmasi. Dialog menutup bila berhasil; lempar galat untuk membiarkannya terbuka. */
  onConfirm: () => Promise<unknown>;
  /** Status berjalan dari luar (mis. `mutation.isPending`); tombol dikunci selama true. */
  pending?: boolean;
}

/** Dialog konfirmasi seragam pengganti `window.confirm`. */
export function ConfirmDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  pending,
}: Props) {
  const t = useTranslations('common');
  const [innerOpen, setInnerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const busy = running || !!pending;

  function change(next: boolean) {
    setInnerOpen(next);
    onOpenChange?.(next);
  }

  async function confirm() {
    setRunning(true);
    try {
      await onConfirm();
      change(false);
    } catch {
      // Galat ditampilkan oleh pemanggil (mis. toast); dialog tetap terbuka.
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && change(o)}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent showCloseButton={false} role="alertdialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => change(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={confirm}
          >
            {confirmLabel ?? t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
