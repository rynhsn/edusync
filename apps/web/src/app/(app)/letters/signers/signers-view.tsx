'use client';

import { MAX_SIGNATURE_BYTES } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ImageUp, Pencil, PenLine, Trash2, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { dataUrlKb } from '../format';
import { Seal } from '../seal';
import { useHeader, useLetterhead, useMySigner, useSigners } from '../shared';
import { fileToSignatureDataUrl } from './signature-image';
import { SignaturePad } from './signature-pad';
import '../letters.css';

interface SignerForm {
  id: string | null;
  memberId: string;
  name: string;
  nip: string;
  title: string;
  active: boolean;
}
const EMPTY: SignerForm = { id: null, memberId: '', name: '', nip: '', title: '', active: true };

/** Penandatangan: kartu daftar, pengelolaan (letter:manage), dan tanda tangan milik sendiri (gambar atau unggah). */
export function SignersView() {
  const t = useTranslations('letters');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const { school, can } = useSchool();
  const { header } = useHeader();
  const letterhead = useLetterhead();
  const manage = can('letter:manage');
  const signers = useSigners();
  const me = useMySigner();
  const key = ['letters', school.schoolId] as const;

  const [form, setForm] = useState<SignerForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ['letters', school.schoolId, 'members'],
    enabled: manage && can('member:read'),
    queryFn: async () => unwrap(await api.GET('/v1/members', { params: { header } })),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: async (f: SignerForm) => {
      const body = {
        name: f.name.trim(),
        nip: f.nip.trim() || null,
        title: f.title.trim(),
        active: f.active,
      };
      if (f.id) {
        return unwrap(
          await api.PUT('/v1/letters/signers/{id}', { params: { header, path: { id: f.id } }, body }),
        );
      }
      return unwrap(
        await api.POST('/v1/letters/signers', {
          params: { header },
          body: { ...body, memberId: f.memberId },
        }),
      );
    },
    onSuccess: () => {
      toast.success(t('signerSaved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/letters/signers/{id}', { params: { header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('signerDeleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const taken = new Set((signers.data ?? []).map((s) => s.memberId));
  const memberChoices = (members.data ?? []).filter((m) => m.status === 'active' && !taken.has(m.id));

  return (
    <PageBody className="lt-scope">
      <PageHeader
        title={t('signersTitle')}
        description={t('signersDescription')}
        actions={
          manage && (
            <Button
              onClick={() => {
                setError(null);
                setForm(EMPTY);
              }}
            >
              <UserPlus className="size-4" /> {t('signerAdd')}
            </Button>
          )
        }
      />

      {me.data && can('letter:sign') && (
        <MySignature signer={me.data.signer} schoolName={letterhead.schoolName} onSaved={refresh} />
      )}

      {signers.isPending && <Skeleton className="h-32 w-full" />}
      {signers.data?.length === 0 && (
        <Card className="lt-fade-up items-center gap-2 px-6 py-10 text-center">
          <Seal tone="draft" label={letterhead.schoolName} size={96} />
          <p className="font-heading text-lg font-medium">{t('signersEmptyTitle')}</p>
          <p className="text-muted-foreground max-w-sm text-sm">{t('signersEmptyBody')}</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {signers.data?.map((s, i) => (
          <Card
            key={s.id}
            className="lt-fade-up relative gap-3 px-4 transition-shadow hover:shadow-md"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--lt-ink)] via-[var(--lt-gold)] to-[var(--lt-ink)] opacity-70"
              aria-hidden
            />
            <div className="flex items-start gap-3 pt-1">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lt-ink-soft)] font-serif text-lg font-semibold text-[var(--lt-ink)]">
                {s.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="text-muted-foreground truncate text-sm">{s.title}</p>
                <p className="text-muted-foreground text-xs">{s.nip ? `NIP. ${s.nip}` : t('noNip')}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={s.active ? 'secondary' : 'outline'}>
                {s.active ? t('active') : t('inactive')}
              </Badge>
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs',
                  s.hasSignature ? 'text-[var(--lt-valid)]' : 'text-muted-foreground',
                )}
              >
                {s.hasSignature ? (
                  <BadgeCheck className="size-3.5" aria-hidden />
                ) : (
                  <PenLine className="size-3.5" aria-hidden />
                )}
                {s.hasSignature ? t('signatureReady') : t('signatureMissing')}
              </span>
            </div>
            {manage && (
              <div className="flex justify-end gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('edit')}
                  onClick={() => {
                    setError(null);
                    setForm({
                      id: s.id,
                      memberId: s.memberId,
                      name: s.name,
                      nip: s.nip ?? '',
                      title: s.title,
                      active: s.active,
                    });
                  }}
                >
                  <Pencil />
                </Button>
                <ConfirmDialog
                  destructive
                  title={t('signerDeleteTitle', { name: s.name })}
                  description={t('signerDeleteBody')}
                  confirmLabel={t('delete')}
                  onConfirm={() => remove.mutateAsync(s.id)}
                  trigger={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive"
                      aria-label={t('delete')}
                    >
                      <Trash2 />
                    </Button>
                  }
                />
              </div>
            )}
          </Card>
        ))}
      </div>

      {manage && (
        <FormDialog
          open={form !== null}
          onOpenChange={(o) => !o && setForm(null)}
          title={form?.id ? t('signerEditTitle') : t('signerAddTitle')}
          description={t('signerFormDescription')}
          submitLabel={t('save')}
          error={error}
          disabled={!form || !form.name.trim() || !form.title.trim() || (!form.id && !form.memberId)}
          onSubmit={async () => {
            if (!form) return;
            setError(null);
            await save.mutateAsync(form);
          }}
        >
          {form && (
            <div className="grid gap-4">
              {!form.id && (
                <div className="grid gap-1.5">
                  <Label htmlFor="sg-member">{t('member')}</Label>
                  <SelectField
                    id="sg-member"
                    value={form.memberId}
                    placeholder={t('memberPick')}
                    onChange={(e) => {
                      const m = memberChoices.find((x) => x.id === e.target.value);
                      setForm({ ...form, memberId: e.target.value, name: form.name || m?.name || '' });
                    }}
                  >
                    <option value="">{t('memberPick')}</option>
                    {memberChoices.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </SelectField>
                  {members.isError && <p className="text-destructive text-xs">{t('memberNoAccess')}</p>}
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="sg-name">{t('signerName')}</Label>
                <Input
                  id="sg-name"
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sg-title">{t('signerTitle')}</Label>
                <Input
                  id="sg-title"
                  required
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={t('signerTitleHint')}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sg-nip">NIP</Label>
                <Input
                  id="sg-nip"
                  maxLength={40}
                  value={form.nip}
                  onChange={(e) => setForm({ ...form, nip: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sg-active"
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v === true })}
                />
                <Label htmlFor="sg-active">{t('signerActive')}</Label>
              </div>
            </div>
          )}
        </FormDialog>
      )}
    </PageBody>
  );
}

type Mode = 'draw' | 'upload';

/** Panel tanda tangan milik pengguna: gambar langsung atau unggah, pratinjau, simpan, dan hapus. */
function MySignature({
  signer,
  schoolName,
  onSaved,
}: {
  signer: { id: string; name: string; title: string; signatureData: string | null } | null;
  schoolName: string;
  onSaved: () => void;
}) {
  const t = useTranslations('letters');
  const te = useTranslations();
  const { header } = useHeader();
  const [mode, setMode] = useState<Mode>('draw');
  const [draft, setDraft] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [removeWhite, setRemoveWhite] = useState(true);
  const [padKey, setPadKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (signatureData: string | null) =>
      unwrap(
        await api.PUT('/v1/letters/signers/me/signature', { params: { header }, body: { signatureData } }),
      ),
    onSuccess: (_d, v) => {
      toast.success(v ? t('mySignatureSaved') : t('mySignatureRemoved'));
      setDraft(null);
      setLastFile(null);
      setPadKey((k) => k + 1);
      onSaved();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  async function loadFile(file: File, white: boolean) {
    setError(null);
    setLastFile(file);
    const url = await fileToSignatureDataUrl(file, white).catch(() => null);
    setDraft(url);
    setTooLarge(url === null);
  }

  if (!signer) {
    return (
      <Alert>
        <AlertDescription>{t('notASigner')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="gap-4 border-[color-mix(in_oklab,var(--lt-gold-deep)_40%,transparent)] px-5 ring-0 border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-medium">{t('mySignature')}</h2>
          <p className="text-muted-foreground text-sm">{t('mySignatureHint', { name: signer.name })}</p>
        </div>
        <div
          role="tablist"
          aria-label={t('mySignature')}
          className="bg-muted inline-flex gap-1 rounded-lg p-1"
        >
          {(['draw', 'upload'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setDraft(null);
                setTooLarge(false);
                setError(null);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                mode === m ? 'bg-card text-[var(--lt-ink)] shadow-sm' : 'text-muted-foreground',
              )}
            >
              {m === 'draw' ? (
                <PenLine className="size-3.5" aria-hidden />
              ) : (
                <ImageUp className="size-3.5" aria-hidden />
              )}
              {m === 'draw' ? t('modeDraw') : t('modeUpload')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          {mode === 'draw' ? (
            <SignaturePad
              key={padKey}
              onChange={(url, large) => {
                setDraft(url);
                setTooLarge(large);
                setError(null);
              }}
            />
          ) : (
            <div className="grid gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                aria-label={t('uploadPick')}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadFile(f, removeWhite);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="hover:bg-muted/60 grid min-h-[180px] place-items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="grid justify-items-center gap-2">
                  <ImageUp className="text-[var(--lt-ink)] size-8" aria-hidden />
                  <span className="text-sm font-medium">{t('uploadPick')}</span>
                  <span className="text-muted-foreground text-xs">{t('uploadHint')}</span>
                </span>
              </button>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rm-white"
                  checked={removeWhite}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    setRemoveWhite(on);
                    if (lastFile) void loadFile(lastFile, on);
                  }}
                />
                <Label htmlFor="rm-white">{t('removeWhite')}</Label>
              </div>
            </div>
          )}
          {tooLarge && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {t('signatureTooLarge', { kb: Math.round(MAX_SIGNATURE_BYTES / 1024) })}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="grid content-start gap-3">
          <div className="grid gap-1.5">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              {draft ? t('newSignature') : t('currentSignature')}
            </p>
            <div className="grid min-h-[140px] place-items-center rounded-xl border bg-[#fffdf8] p-4">
              {draft || signer.signatureData ? (
                // biome-ignore lint/performance/noImgElement: data URL tanda tangan
                <img
                  src={draft ?? signer.signatureData ?? ''}
                  alt={t('signatureAlt')}
                  className="max-h-28 max-w-full object-contain"
                />
              ) : (
                <span className="text-sm text-[#9a98ae]">{t('noSignatureYet')}</span>
              )}
            </div>
            {draft && <p className="text-muted-foreground text-xs">{dataUrlKb(draft)} · PNG</p>}
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!draft || save.isPending} onClick={() => save.mutate(draft)}>
              {t('saveSignature')}
            </Button>
            {signer.signatureData && (
              <ConfirmDialog
                destructive
                title={t('removeSignatureTitle')}
                description={t('removeSignatureBody')}
                confirmLabel={t('delete')}
                onConfirm={() => save.mutateAsync(null)}
                trigger={
                  <Button variant="outline" className="text-destructive">
                    <Trash2 className="size-4" /> {t('removeSignature')}
                  </Button>
                }
              />
            )}
          </div>
          <p className="text-muted-foreground text-xs">{t('signaturePrivacy', { school: schoolName })}</p>
        </div>
      </div>
    </Card>
  );
}
