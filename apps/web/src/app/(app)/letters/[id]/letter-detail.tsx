'use client';

import { type LetterPlaceholder, renderLetter } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  Pencil,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { ApiError, api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { formatIdDate, formatIdDateTime } from '../format';
import { IncomingDialog } from '../incoming-dialog';
import { LetterPaper, PaperSheet, type PaperSigner } from '../letter-paper';
import { hashBlob, makeQrDataUrl, renderLetterPdf, saveLetterPdf } from '../pdf/download';
import { TextArea } from '../placeholder-chips';
import { Seal, type SealTone } from '../seal';
import {
  StatusBadge,
  useHeader,
  useLetterhead,
  useMySigner,
  useSigners,
  useTemplates,
  useVerifyUrl,
  useZoom,
  ZoomControl,
} from '../shared';
import '../letters.css';

const TONE: Record<'draft' | 'signed' | 'revoked', SealTone> = {
  draft: 'draft',
  signed: 'valid',
  revoked: 'revoked',
};

/** Detail satu surat: kertas, tindakan (ubah, tandatangani, unduh, cabut), dan linimasa. */
export function LetterDetail({ id }: { id: string }) {
  const t = useTranslations('letters');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { school, can } = useSchool();
  const { header } = useHeader();
  const letterhead = useLetterhead();
  const verifyUrlFor = useVerifyUrl();
  const me = useMySigner();
  const signers = useSigners();
  const templates = useTemplates();
  const [zoom, setZoom] = useZoom(90);
  const [editingIncoming, setEditingIncoming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const manage = can('letter:manage');
  const key = ['letters', school.schoolId] as const;

  const letter = useQuery({
    queryKey: [...key, 'detail', id],
    queryFn: async () => unwrap(await api.GET('/v1/letters/{id}', { params: { header, path: { id } } })),
  });
  const l = letter.data;
  const outgoing = l?.direction === 'outgoing';

  const sig = useQuery({
    queryKey: [...key, 'signature', id],
    enabled: !!l && outgoing && l.status !== 'draft',
    queryFn: async () =>
      unwrap(await api.GET('/v1/letters/{id}/signature', { params: { header, path: { id } } })),
  });

  const mySigner = me.data?.signer ?? null;
  const signerList = signers.data ?? [];

  // Penandatangan yang tampil di kertas: yang sudah menandatangani, atau calon penandatangan untuk draf.
  const paperSigner: PaperSigner | null = (() => {
    if (!l || !outgoing) return null;
    if (l.status !== 'draft' && sig.data) {
      const found = signerList.find(
        (s) => s.name === sig.data.signerName && s.title === sig.data.signerTitle,
      );
      const mine =
        mySigner && mySigner.name === sig.data.signerName && mySigner.title === sig.data.signerTitle;
      return {
        name: sig.data.signerName,
        title: sig.data.signerTitle,
        nip: found?.nip ?? (mine ? mySigner?.nip : null) ?? null,
        signatureData: mine ? mySigner?.signatureData : null,
      };
    }
    const cand = mySigner ?? signerList.find((s) => s.active) ?? null;
    return cand ? { name: cand.name, title: cand.title, nip: cand.nip, signatureData: null } : null;
  })();
  const signerRow = paperSigner
    ? signerList.find((s) => s.name === paperSigner.name && s.title === paperSigner.title)
    : undefined;

  // Isi surat yang sudah terisi: dari API (pengelola), cadangan: dirender di klien dari templat.
  const bodyText = useQuery({
    queryKey: [
      ...key,
      'render',
      id,
      l?.status,
      signerRow?.id ?? mySigner?.id ?? null,
      l?.body,
      l?.studentId,
      l?.templateId,
    ],
    enabled: !!l && outgoing && !(signers.isPending || me.isPending),
    retry: false,
    queryFn: async () => {
      if (manage) {
        try {
          const r = unwrap(
            await api.POST('/v1/letters/{id}/render', {
              params: { header, path: { id } },
              body: { signerId: signerRow?.id ?? mySigner?.id ?? null },
            }),
          );
          return r.text;
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 403) throw e;
        }
      }
      return localRender();
    },
  });

  function localRender(): string {
    if (!l) return '';
    const tpl = l.templateId ? (templates.data ?? []).find((x) => x.id === l.templateId) : undefined;
    const source = tpl?.body ?? l.body ?? '';
    const vars: Partial<Record<LetterPlaceholder, string | null>> = {
      nama: l.studentName,
      tanggal: formatIdDate(l.letterDate),
      sekolah: school.schoolName,
      nomor: l.number,
      penandatangan: paperSigner?.name ?? null,
      jabatan: paperSigner?.title ?? null,
    };
    return renderLetter(source, vars);
  }
  const text = bodyText.data ?? (templates.isPending ? '' : l ? localRender() : '');

  const link = sig.data ? verifyUrlFor(sig.data.token) : null;
  useEffect(() => {
    let live = true;
    if (!link) {
      setQr(null);
      return;
    }
    makeQrDataUrl(link)
      .then((u) => live && setQr(u))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [link]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  /** Buat PDF dari data yang ada dan kembalikan blob dan hash-nya. */
  async function buildPdf(token: string, signer: NonNullable<PaperSigner>) {
    if (!l) throw new Error('letter');
    const url = verifyUrlFor(token);
    const blob = await renderLetterPdf({
      schoolName: letterhead.schoolName,
      address: letterhead.address,
      number: l.number,
      subject: l.subject,
      text,
      dateText: formatIdDate(l.letterDate),
      dateIso: l.letterDate,
      signer: {
        name: signer.name,
        title: signer.title,
        nip: signer.nip ?? null,
        signatureData: signer.signatureData ?? null,
      },
      qrDataUrl: await makeQrDataUrl(url),
      verifyUrl: url,
    });
    return { blob, sha256: await hashBlob(blob) };
  }

  const sign = useMutation({
    mutationFn: async () => {
      if (!l) return;
      setBusy(t('stepSigning'));
      const res = unwrap(await api.POST('/v1/letters/{id}/sign', { params: { header, path: { id } } }));
      try {
        setBusy(t('stepPdf'));
        // Isi surat dirender ulang karena penandatangan kini pasti pengguna ini.
        let finalText = text;
        if (manage) {
          const r = await api.POST('/v1/letters/{id}/render', {
            params: { header, path: { id } },
            body: { signerId: mySigner?.id ?? null },
          });
          if (r.data) finalText = r.data.text;
        }
        const url = verifyUrlFor(res.token);
        const blob = await renderLetterPdf({
          schoolName: letterhead.schoolName,
          address: letterhead.address,
          number: res.number,
          subject: res.subject,
          text: finalText,
          dateText: formatIdDate(l.letterDate),
          dateIso: l.letterDate,
          signer: res.signer,
          qrDataUrl: await makeQrDataUrl(url),
          verifyUrl: url,
        });
        setBusy(t('stepHash'));
        const sha256 = await hashBlob(blob);
        unwrap(
          await api.PUT('/v1/signed-documents/{id}/hash', {
            params: { header, path: { id: res.signedDocumentId } },
            body: { sha256 },
          }),
        );
        saveLetterPdf(blob, res.number, res.subject);
        toast.success(t('signedDone'));
      } catch (e) {
        // Surat sudah sah ditandatangani; PDF-nya bisa dibuat lagi lewat tombol unduh.
        toast.error(t('signedPdfFailed'));
        console.error(e);
      }
    },
    onSettled: () => {
      setBusy(null);
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const download = useMutation({
    mutationFn: async () => {
      if (!l || !sig.data || !paperSigner) return;
      setBusy(t('stepPdf'));
      const { blob, sha256 } = await buildPdf(sig.data.token, paperSigner);
      if (!sig.data.hashRegistered) {
        unwrap(
          await api.PUT('/v1/signed-documents/{id}/hash', {
            params: { header, path: { id: sig.data.signedDocumentId } },
            body: { sha256 },
          }),
        );
      }
      saveLetterPdf(blob, l.number, l.subject);
      // Cetak ulang yang tidak identik dengan berkas terdaftar tidak akan lolos pencocokan berkas.
      const check = await api.POST('/v1/public/verify/{token}/check', {
        params: { path: { token: sig.data.token } },
        body: { sha256 },
      });
      if (check.data && !check.data.match) toast.info(t('reprintDiffers'));
    },
    onSettled: () => {
      setBusy(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? te(errorKey(e)) : t('pdfFailed')),
  });

  const revoke = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/letters/{id}/revoke', {
          params: { header, path: { id } },
          body: { reason: reason.trim() },
        }),
      ),
    onSuccess: () => {
      toast.success(t('revoked'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/letters/{id}', { params: { header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
      router.replace('/letters');
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success(t('linkCopied'));
    } catch {
      toast.error(t('linkCopyFailed'));
    }
  }

  if (letter.isPending) {
    return (
      <PageBody>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </PageBody>
    );
  }
  if (letter.isError || !l) {
    return (
      <PageBody>
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
        <Button variant="outline" className="w-fit" nativeButton={false} render={<Link href="/letters" />}>
          <ArrowLeft className="size-4" /> {t('back')}
        </Button>
      </PageBody>
    );
  }

  const isMySignature =
    !!sig.data &&
    !!mySigner &&
    mySigner.name === sig.data.signerName &&
    mySigner.title === sig.data.signerTitle;
  const canSign = outgoing && l.status === 'draft' && can('letter:sign') && !!mySigner?.active;
  const canRevoke = outgoing && l.status === 'signed' && (manage || isMySignature);
  const draftEditable = outgoing && l.status === 'draft' && manage;
  const date = formatCalendarDate(locale, l.letterDate);
  const working = busy !== null;

  const timeline: {
    key: string;
    label: string;
    at: string | null;
    detail?: string | null;
    tone: 'ink' | 'valid' | 'revoked';
  }[] = [
    { key: 'created', label: outgoing ? t('tlCreated') : t('tlReceived'), at: l.createdAt, tone: 'ink' },
  ];
  if (sig.data) {
    timeline.push({
      key: 'signed',
      label: t('tlSigned', { name: sig.data.signerName }),
      at: sig.data.signedAt,
      tone: 'valid',
    });
    if (sig.data.hashRegistered) timeline.push({ key: 'hash', label: t('tlHash'), at: null, tone: 'ink' });
    if (sig.data.revoked) {
      timeline.push({
        key: 'revoked',
        label: t('tlRevoked'),
        at: sig.data.revokedAt,
        detail: sig.data.revokedReason,
        tone: 'revoked',
      });
    }
  }

  const sideActions = (
    <div className="grid gap-2">
      {canSign && (
        <ConfirmDialog
          title={t('signConfirmTitle')}
          description={t('signConfirmBody', { number: l.number })}
          confirmLabel={t('signConfirm')}
          onConfirm={() => sign.mutateAsync()}
          trigger={
            <Button
              disabled={working}
              className="w-full bg-[var(--lt-ink)] text-white hover:bg-[color-mix(in_oklab,var(--lt-ink)_85%,black)] dark:text-black"
            >
              <FileSignature className="size-4" /> {t('sign')}
            </Button>
          }
        />
      )}
      {outgoing && l.status === 'draft' && can('letter:sign') && !me.isPending && !mySigner && (
        <p className="text-muted-foreground text-xs">{t('notASignerHint')}</p>
      )}
      {outgoing && l.status !== 'draft' && sig.data && (
        <Button variant="outline" disabled={working || !paperSigner} onClick={() => download.mutate()}>
          <Download className="size-4" /> {t('downloadPdf')}
        </Button>
      )}
      {draftEditable && (
        <Button variant="outline" nativeButton={false} render={<Link href={`/letters/${id}/edit`} />}>
          <Pencil className="size-4" /> {t('edit')}
        </Button>
      )}
      {!outgoing && manage && (
        <Button variant="outline" onClick={() => setEditingIncoming(true)}>
          <Pencil className="size-4" /> {t('edit')}
        </Button>
      )}
      {canRevoke && (
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => {
            setReason('');
            setError(null);
            setRevoking(true);
          }}
        >
          <Ban className="size-4" /> {t('revoke')}
        </Button>
      )}
      {(draftEditable || (!outgoing && manage && l.status === 'draft')) && (
        <ConfirmDialog
          destructive
          title={t('deleteTitle')}
          description={t('deleteBody')}
          confirmLabel={t('delete')}
          pending={remove.isPending}
          onConfirm={() => remove.mutateAsync()}
          trigger={
            <Button variant="ghost" className="text-destructive justify-start">
              <Trash2 className="size-4" /> {t('delete')}
            </Button>
          }
        />
      )}
      {busy && (
        <p className="text-muted-foreground flex items-center gap-2 text-xs" role="status">
          <span
            className="border-primary size-3 animate-spin rounded-full border-2 border-t-transparent"
            aria-hidden
          />
          {busy}
        </p>
      )}
    </div>
  );

  return (
    <PageBody className="lt-scope">
      <PageHeader
        title={l.subject}
        description={
          <span className="font-mono text-xs">
            {l.number} · {date}
          </span>
        }
        actions={
          <Button variant="ghost" nativeButton={false} render={<Link href="/letters" />}>
            <ArrowLeft className="size-4" /> {t('back')}
          </Button>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {outgoing ? (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-medium">{t('paper')}</h2>
              <ZoomControl zoom={zoom} onChange={setZoom} />
            </div>
            <PaperSheet zoom={zoom}>
              <LetterPaper
                schoolName={letterhead.schoolName}
                address={letterhead.address}
                number={l.number}
                text={text}
                dateText={formatIdDate(l.letterDate)}
                status={l.status}
                signer={paperSigner}
                qr={l.status === 'draft' ? null : qr}
              />
            </PaperSheet>
          </div>
        ) : (
          <Card className="gap-4 px-5">
            <h2 className="font-heading text-lg font-medium">{t('agendaCard')}</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label={t('incomingNumber')} value={l.number} mono />
              <Field label={t('receivedDate')} value={date} />
              <Field label={t('sender')} value={l.party} />
              <Field label={t('subject')} value={l.subject} />
            </dl>
            {l.body && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                  {t('incomingBody')}
                </p>
                <p className="bg-[#fffdf8] font-serif text-[#1d1b26] rounded-lg border p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {l.body}
                </p>
              </div>
            )}
            <div className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--lt-gold-deep)_55%,transparent)] bg-[color-mix(in_oklab,var(--lt-gold)_10%,transparent)] p-4">
              <p className="text-[var(--lt-gold-deep)] mb-1 text-xs font-semibold tracking-wide uppercase">
                {t('disposition')}
              </p>
              <p className="text-sm whitespace-pre-wrap">{l.dispositionNote || t('noDisposition')}</p>
            </div>
          </Card>
        )}

        <div className="grid gap-4">
          <Card className="gap-4 px-4">
            <div className="flex items-center gap-3">
              <Seal
                tone={TONE[l.status]}
                label={letterhead.schoolName}
                size={72}
                stamp={l.status !== 'draft'}
              />
              <div className="min-w-0">
                <StatusBadge status={l.status} />
                <p className="text-muted-foreground mt-1 text-xs">
                  {outgoing ? t('tabOutgoing') : t('tabIncoming')}
                </p>
              </div>
            </div>
            <dl className="grid gap-2 text-sm">
              <Field label={outgoing ? t('recipient') : t('sender')} value={l.party} />
              {l.studentName && <Field label={t('student')} value={l.studentName} />}
              {l.templateName && <Field label={t('template')} value={l.templateName} />}
            </dl>
            {sideActions}
          </Card>

          {link && (
            <Card className="gap-2 px-4">
              <h2 className="font-heading text-sm font-medium">{t('verifyLink')}</h2>
              <p className="text-muted-foreground bg-muted rounded-md px-2 py-1.5 font-mono text-[11px] break-all">
                {link}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {t('copyLink')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  nativeButton={false}
                  render={<a href={link} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLink className="size-3.5" /> {t('openLink')}
                </Button>
              </div>
            </Card>
          )}

          <Card className="gap-3 px-4">
            <h2 className="font-heading text-sm font-medium">{t('timeline')}</h2>
            <ol className="relative grid gap-4 border-s ps-4">
              {timeline.map((e) => (
                <li key={e.key} className="relative text-sm">
                  <span
                    className={cn(
                      'absolute top-1.5 -start-[1.3rem] size-2.5 rounded-full ring-4 ring-card',
                      e.tone === 'valid'
                        ? 'bg-[var(--lt-valid)]'
                        : e.tone === 'revoked'
                          ? 'bg-[var(--lt-revoked)]'
                          : 'bg-[var(--lt-ink)]',
                    )}
                    aria-hidden
                  />
                  <p className="font-medium">{e.label}</p>
                  {e.at && <p className="text-muted-foreground text-xs">{formatIdDateTime(e.at)}</p>}
                  {e.detail && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t('reasonPrefix')} {e.detail}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <FormDialog
        open={revoking}
        onOpenChange={setRevoking}
        title={t('revokeTitle')}
        description={t('revokeBody')}
        submitLabel={t('revoke')}
        error={error}
        disabled={reason.trim().length < 3}
        onSubmit={async () => {
          setError(null);
          await revoke.mutateAsync();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="revoke-reason">{t('revokeReason')}</Label>
          <TextArea
            id="revoke-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </FormDialog>

      {!outgoing && manage && (
        <IncomingDialog
          open={editingIncoming}
          onOpenChange={setEditingIncoming}
          initial={{
            id: l.id,
            number: l.number,
            subject: l.subject,
            party: l.party,
            letterDate: l.letterDate,
            body: l.body,
            dispositionNote: l.dispositionNote,
          }}
        />
      )}
    </PageBody>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn('break-words', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
