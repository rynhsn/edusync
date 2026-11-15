'use client';

import {
  composeMessage,
  DIRECT_BODY_MAX,
  DIRECT_PLACEHOLDERS,
  DIRECT_TEMPLATES,
  hasSensitiveNumber,
  renderDirect,
} from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TOUCH_INPUT, TOUCH_SELECT } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  EMPTY_PICK,
  estimateMinutes,
  hasPick,
  insertAt,
  lacksVariation,
  type PickState,
  toSelection,
} from './direct-logic';
import { RecipientPicker } from './recipient-picker';
import { useMessagingCtx } from './shared';
import { WaBubble } from './wa-bubble';

const CUSTOM = 'custom:';
const BUILTIN = 'builtin:';

/** Pesan langsung ke wali/staf terpilih: penerima, pesan, tinjau, konfirmasi. Izin `message:send`. */
export function DirectPanel({ onSent }: { onSent: () => void }) {
  const t = useTranslations('messaging.direct');
  const tc = useTranslations('common');
  const te = useTranslations();
  const { school, header, canManage, canBroadcast } = useMessagingCtx();
  const queryClient = useQueryClient();
  const [pick, setPick] = useState<PickState>(EMPTY_PICK);
  const [body, setBody] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [saveName, setSaveName] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const deferredBody = useDeferredValue(body.trim());
  const selection = useMemo(() => toSelection(pick), [pick]);
  const deferredSelection = useDeferredValue(selection);

  const settings = useQuery({
    queryKey: ['messaging-settings', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/messaging/settings', { params: header })),
  });
  const templates = useQuery({
    queryKey: ['messaging-direct-templates', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/messaging/direct-templates', { params: header })),
  });

  const sensitive = hasSensitiveNumber(body);
  const review = useQuery({
    queryKey: ['messaging-preview', school.schoolId, JSON.stringify(deferredSelection), deferredBody],
    enabled: hasPick(pick) && !hasSensitiveNumber(deferredBody),
    placeholderData: (prev) => prev,
    queryFn: async () =>
      unwrap(
        await api.POST('/v1/messaging/recipients/preview', {
          params: header,
          body: { selection: deferredSelection, ...(deferredBody ? { body: deferredBody } : {}) },
        }),
      ),
  });
  const r = review.data;

  /** Pratinjau gelembung: penerima pertama bila ada, selain itu data rekaan; header/footer sekolah ikut dipasang. */
  const bubble = useMemo(() => {
    const first = r?.sample[0];
    const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(),
    );
    const text =
      first?.message ??
      renderDirect(
        body.trim() || t('bodyEmptyPreview'),
        {
          guardianName: t('sample.guardian'),
          teacherName: t('sample.teacher'),
          studentNames: [t('sample.student')],
          classNames: ['7A'],
        },
        { school: school.schoolName, date },
      );
    return composeMessage(text, { ...settings.data, schoolName: school.schoolName });
  }, [r, body, settings.data, school.schoolName, t]);

  const send = useMutation({
    mutationFn: async () => {
      if (!r) throw new Error('no_preview');
      return unwrap(
        await api.POST('/v1/messaging/batches', {
          params: header,
          body: { selection, body: body.trim(), expectedTotal: r.total },
        }),
      );
    },
    onSuccess: (res) => {
      toast.success(t('sentToast', { total: res.total }));
      setConfirmOpen(false);
      setTyped('');
      setPick(EMPTY_PICK);
      setBody('');
      setTemplateKey('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['messaging-batches', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['messaging-messages', school.schoolId] });
      onSent();
    },
    onError: (e) => {
      setConfirmOpen(false);
      setTyped('');
      setError(te(errorKey(e)));
      queryClient.invalidateQueries({ queryKey: ['messaging-preview', school.schoolId] });
    },
  });

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const name = saveName.trim();
      const existing = (templates.data ?? []).find((x) => x.name === name);
      const payload = { name, body: body.trim() };
      return existing
        ? unwrap(
            await api.PUT('/v1/messaging/direct-templates/{id}', {
              params: { ...header, path: { id: existing.id } },
              body: payload,
            }),
          )
        : unwrap(await api.POST('/v1/messaging/direct-templates', { params: header, body: payload }));
    },
    onSuccess: (row) => {
      toast.success(t('templateSaved'));
      setSaveName('');
      setTemplateKey(`${CUSTOM}${row.id}`);
      queryClient.invalidateQueries({ queryKey: ['messaging-direct-templates', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const removeTemplate = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE('/v1/messaging/direct-templates/{id}', { params: { ...header, path: { id } } }),
      ),
    onSuccess: () => {
      toast.success(t('templateDeleted'));
      setTemplateKey('');
      queryClient.invalidateQueries({ queryKey: ['messaging-direct-templates', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function chooseTemplate(key: string) {
    setTemplateKey(key);
    const text = key.startsWith(BUILTIN)
      ? DIRECT_TEMPLATES.find((x) => x.key === key.slice(BUILTIN.length))?.body
      : templates.data?.find((x) => x.id === key.slice(CUSTOM.length))?.body;
    if (text !== undefined) setBody(text);
  }
  function insert(name: string) {
    const el = area.current;
    const { text, cursor } = insertAt(
      body,
      `{{${name}}}`,
      el?.selectionStart ?? body.length,
      el?.selectionEnd ?? body.length,
    );
    setBody(text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  }

  const total = r?.total ?? 0;
  const overLimit = r ? total > r.dailyRemaining : false;
  const overQueue = r ? total > r.queueRemaining : false;
  const blocked =
    !r || total === 0 || !r.enabled || !r.canSend || overLimit || overQueue || !body.trim() || sensitive;
  const selectedCustom = templateKey.startsWith(CUSTOM)
    ? templates.data?.find((x) => x.id === templateKey.slice(CUSTOM.length))
    : undefined;
  const needsTyping = r?.confirmTyping ?? false;
  const typedOk = !needsTyping || typed.trim() === String(total);

  return (
    <div className="grid gap-4">
      <Alert>
        <AlertDescription>{t('intro')}</AlertDescription>
      </Alert>

      <Card className="grid gap-3 p-4 sm:p-5">
        <h3 className="font-medium">{t('step1')}</h3>
        <RecipientPicker value={pick} onChange={setPick} canBroadcast={canBroadcast} />
      </Card>

      <Card className="grid gap-4 p-4 sm:p-5">
        <h3 className="font-medium">{t('step2')}</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="direct-template">{t('template')}</Label>
              <SelectField
                id="direct-template"
                className={TOUCH_SELECT}
                value={templateKey}
                onChange={(e) => chooseTemplate(e.target.value)}
              >
                <option value="">{t('templateNone')}</option>
                {DIRECT_TEMPLATES.map((x) => (
                  <option key={x.key} value={`${BUILTIN}${x.key}`}>
                    {t(`builtin.${x.key}` as 'builtin.parent_call')}
                  </option>
                ))}
                {(templates.data ?? []).map((x) => (
                  <option key={x.id} value={`${CUSTOM}${x.id}`}>
                    {x.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="direct-body">{t('body')}</Label>
              <Textarea
                id="direct-body"
                ref={area}
                rows={7}
                maxLength={DIRECT_BODY_MAX}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-invalid={sensitive}
              />
              <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
                <span>{t('formatHint')}</span>
                <span>{t('counter', { n: body.length, max: DIRECT_BODY_MAX })}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">{t('insert')}:</span>
                {DIRECT_PLACEHOLDERS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="xs"
                    variant="outline"
                    className="min-h-9 md:min-h-0"
                    onClick={() => insert(p)}
                    title={`{{${p}}}`}
                  >
                    {t(`placeholder.${p}`)}
                  </Button>
                ))}
              </div>
              {sensitive && (
                <Alert variant="destructive">
                  <AlertDescription>{t('warn.sensitive')}</AlertDescription>
                </Alert>
              )}
              <p className="text-muted-foreground text-xs">{t('warn.values')}</p>
            </div>

            {canManage && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-40 flex-1 gap-1.5">
                  <Label htmlFor="direct-save-name">{t('templateName')}</Label>
                  <Input
                    id="direct-save-name"
                    className={TOUCH_INPUT}
                    maxLength={60}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!saveName.trim() || !body.trim() || saveTemplate.isPending}
                  onClick={() => saveTemplate.mutate()}
                >
                  {t('saveTemplate')}
                </Button>
                {selectedCustom && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={removeTemplate.isPending}
                    onClick={() => removeTemplate.mutate(selectedCustom.id)}
                  >
                    {t('deleteTemplate')}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid content-start gap-1">
            <p className="text-muted-foreground text-xs font-medium">
              {r?.sample[0]?.message ? t('previewFor', { name: r.sample[0].name }) : t('previewDummy')}
            </p>
            <WaBubble body={bubble} />
          </div>
        </div>
      </Card>

      <Card className="grid gap-3 p-4 sm:p-5" aria-live="polite">
        <h3 className="font-medium">{t('step3')}</h3>
        {!hasPick(pick) && <p className="text-muted-foreground text-sm">{t('reviewEmpty')}</p>}
        {hasPick(pick) && !r && review.isPending && <Skeleton className="h-24 w-full" />}
        {review.isError && (
          <Alert variant="destructive">
            <AlertDescription>{te(errorKey(review.error))}</AlertDescription>
          </Alert>
        )}
        {r && (
          <div className="grid gap-3">
            <p className="text-base font-medium">
              {total === 0 ? t('noRecipients') : t('recipientsLine', { total })}
            </p>
            {(r.excluded.noPhone > 0 || r.excluded.invalid > 0 || r.excluded.duplicate > 0) && (
              <p className="text-muted-foreground text-sm">
                {t('excludedLine', {
                  noPhone: r.excluded.noPhone,
                  invalid: r.excluded.invalid,
                  duplicate: r.excluded.duplicate,
                })}
              </p>
            )}
            <p className="text-muted-foreground text-sm">
              {t('dailyLine', { remaining: r.dailyRemaining, limit: r.dailyLimit })}
              {total > 0 && ` ${t('durationLine', { minutes: estimateMinutes(total, r.avgDelaySeconds) })}`}
            </p>
            {r.sample.length > 0 && (
              <div className="text-muted-foreground text-xs">
                <span className="font-medium">{t('sampleTitle')}: </span>
                {r.sample.map((s) => `${s.name} (${s.phone})`).join(', ')}
                {total > r.sample.length && ` ${t('andMore', { n: total - r.sample.length })}`}
              </div>
            )}
            {!r.enabled && (
              <Alert variant="destructive">
                <AlertDescription>{t('warn.disabled')}</AlertDescription>
              </Alert>
            )}
            {r.enabled && !r.accountReady && (
              <Alert>
                <AlertDescription>{t('warn.notReady')}</AlertDescription>
              </Alert>
            )}
            {!r.canSend && (
              <Alert variant="destructive">
                <AlertDescription>{t('warn.needBroadcast')}</AlertDescription>
              </Alert>
            )}
            {overLimit && (
              <Alert variant="destructive">
                <AlertDescription>{t('warn.overLimit', { remaining: r.dailyRemaining })}</AlertDescription>
              </Alert>
            )}
            {overQueue && !overLimit && (
              <Alert variant="destructive">
                <AlertDescription>{t('warn.queueFull', { remaining: r.queueRemaining })}</AlertDescription>
              </Alert>
            )}
            {r.newNumber && (
              <p className="text-muted-foreground text-xs">{t('warn.newNumber', { limit: r.dailyLimit })}</p>
            )}
            {total > 30 && lacksVariation(body) && (
              <p className="text-muted-foreground text-xs">{t('warn.noVariation')}</p>
            )}
            <p className="text-muted-foreground text-xs">{t('warn.risk')}</p>
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            className="min-h-11 w-full sm:w-auto md:min-h-8"
            disabled={blocked || send.isPending}
            onClick={() => {
              setError(null);
              setTyped('');
              setConfirmOpen(true);
            }}
          >
            {t('send')}
          </Button>
        </div>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => !send.isPending && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle', { total })}</DialogTitle>
            <DialogDescription>{t('confirmBody')}</DialogDescription>
          </DialogHeader>
          {needsTyping && (
            <div className="grid gap-1.5">
              <Label htmlFor="direct-confirm-count">{t('confirmType', { total })}</Label>
              <Input
                id="direct-confirm-count"
                className={TOUCH_INPUT}
                inputMode="numeric"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={send.isPending} onClick={() => setConfirmOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button disabled={!typedOk || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? t('sending') : t('confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
