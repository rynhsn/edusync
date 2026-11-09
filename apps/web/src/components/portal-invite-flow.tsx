'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, useFormValidation } from '@/components/form-field-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorKey } from '@/lib/errors';
import { PORTAL_PATHS, type PortalInviteCreated, type PortalKind, portalRequest } from '@/lib/portal-api';
import {
  PORTAL_INVITE_ORDER,
  type PortalInviteField,
  validatePortalInvite,
} from '../app/(app)/portal-admin/portal-admin-validation';

export interface InviteTarget {
  kind: PortalKind;
  id: string;
  name: string;
}

/**
 * Alur undangan portal untuk satu wali atau siswa: dialog email opsional, lalu dialog tautan sekali tampil dengan
 * tombol Salin. Dipakai halaman Akun portal dan halaman Data wali. `target` null berarti tertutup.
 */
export function PortalInviteFlow({
  target,
  onClose,
  onCreated,
}: {
  target: InviteTarget | null;
  onClose: () => void;
  /** Dipanggil setelah undangan dibuat (mis. untuk menyegarkan daftar). */
  onCreated?: () => void;
}) {
  const t = useTranslations('portalAdmin');
  const te = useTranslations();
  const { school } = useSchool();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const validation = useFormValidation<PortalInviteField>({
    errors: validatePortalInvite(email),
    order: PORTAL_INVITE_ORDER,
    idPrefix: 'pa',
  });

  // Setiap kali dialog dibuka untuk target baru, isian dikosongkan.
  useEffect(() => {
    if (target) {
      setEmail('');
      setError(null);
    }
  }, [target]);

  const create = useMutation({
    mutationFn: async (v: { target: InviteTarget; email: string }) =>
      portalRequest<PortalInviteCreated>('POST', PORTAL_PATHS.invites, {
        schoolId: school.schoolId,
        body: {
          kind: v.target.kind,
          ...(v.target.kind === 'guardian' ? { guardianId: v.target.id } : { studentId: v.target.id }),
          ...(v.email.trim() ? { email: v.email.trim() } : {}),
        },
      }),
    onSuccess: (res, v) => {
      setError(null);
      setCopied(false);
      setCreated({ link: res.link, name: v.target.name });
      onCreated?.();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <>
      <FormDialog
        open={!!target}
        title={t('createTitle', { name: target?.name ?? '' })}
        description={t('createBody')}
        submitLabel={t('create')}
        error={error}
        validation={validation}
        onOpenChange={(o) => !o && onClose()}
        onSubmit={async () => {
          if (!target) return;
          await create.mutateAsync({ target, email });
        }}
      >
        <div className="grid content-start gap-1.5">
          <Label htmlFor={validation.idOf('email')}>{t('emailLabel')}</Label>
          <Input
            {...validation.fieldProps('email')}
            className={TOUCH_INPUT}
            type="email"
            inputMode="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
          <FieldError id={validation.idOf('email')} issue={validation.issue('email')} />
          <p className="text-muted-foreground text-xs">{t('emailHint')}</p>
        </div>
      </FormDialog>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{t('linkTitle')}</DialogTitle>
            <DialogDescription>{t('linkBody', { name: created?.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <div className="grid content-start gap-2">
            <Label htmlFor="pa-link">{t('linkLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="pa-link"
                readOnly
                value={created?.link ?? ''}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button onClick={() => created && copy(created.link)} aria-live="polite">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t('linkOnce')}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
