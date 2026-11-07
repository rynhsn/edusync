'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Mail, MessageCircle, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { paths } from '@/lib/api-types';
import { errorKey } from '@/lib/errors';

export type CreatedResetLink =
  paths['/v1/password-help/links']['post']['responses'][201]['content']['application/json'];

export function formatDateTime(locale: string, iso: string) {
  return new Intl.DateTimeFormat(locale === 'su' ? 'id' : locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * Menampilkan tautan reset yang baru dibuat (hanya sekali): salin, kirim ke email akun, atau buka WhatsApp
 * dengan pesan siap kirim. Token hanya hidup di memori halaman ini; server hanya menyimpan hash-nya.
 */
export function ResetLinkDialog({
  link,
  onClose,
  onChanged,
}: {
  link: CreatedResetLink | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const t = useTranslations('passwordHelp');
  const te = useTranslations();
  const locale = useLocale();
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async (channel: 'email' | 'whatsapp') =>
      unwrap(
        await api.POST('/v1/password-help/links/{id}/send', {
          params: { ...header, path: { id: (link as CreatedResetLink).id } },
          body: { channel, token: (link as CreatedResetLink).token },
        }),
      ),
    onSuccess: (res) => {
      setError(null);
      if (res.channel === 'email') toast.success(t('emailSent', { to: res.sentTo ?? '' }));
      else if (res.whatsappUrl) window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
      onChanged?.();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const revoke = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/v1/password-help/links/{id}', {
          params: { ...header, path: { id: (link as CreatedResetLink).id } },
        }),
      ),
    onSuccess: () => {
      toast.success(t('revoked'));
      onChanged?.();
      onClose();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(te('errors.unknown'));
    }
  }

  return (
    <Dialog
      open={!!link}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {link && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-lg">{t('linkTitle')}</DialogTitle>
              <DialogDescription>{t('linkBody')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <p className="text-sm font-medium">
                {t('linkFor', { name: link.user.name, email: link.user.emailMasked })}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={link.url}
                  aria-label={t('copy')}
                  className="h-10 font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={t('copy')}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                {t('linkExpires', { date: formatDateTime(locale, link.expiresAt) })}
              </p>
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={send.isPending}
                  onClick={() => send.mutate('email')}
                >
                  <Mail className="size-4" />
                  {t('sendEmail')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={send.isPending}
                  onClick={() => send.mutate('whatsapp')}
                >
                  <MessageCircle className="size-4" />
                  {t('openWhatsapp')}
                </Button>
              </div>
              <div className="flex flex-wrap justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate()}
                >
                  <Trash2 className="size-4" />
                  {t('revoke')}
                </Button>
                <Button type="button" onClick={onClose}>
                  {t('close')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
