'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useMessagingCtx } from './shared';

/** Data contoh untuk pratinjau templat; hanya tampilan, tidak dikirim ke mana pun. */
const SAMPLE: Record<string, string> = {
  student: 'Ahmad Fauzi',
  class: '7A',
  school: 'Sekolah Anda',
  time: '07:05',
  date: '12 Oktober 2026',
  subject: 'Matematika',
  amount: 'Rp 250.000',
  receipt: 'KW-000123',
  title: 'SPP Oktober',
  due: '10 Oktober 2026',
  semester: 'Ganjil 2026/2027',
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

function preview(body: string): string {
  return body.replace(PLACEHOLDER_RE, (whole, name: string) => SAMPLE[name] ?? whole);
}

interface TemplateRow {
  eventKey: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
  defaultBody: string;
  placeholders: string[];
}

function TemplateCard({
  tpl,
  canManage,
  onChanged,
}: {
  tpl: TemplateRow;
  canManage: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('messaging');
  const te = useTranslations();
  const { header } = useMessagingCtx();
  const [body, setBody] = useState(tpl.body);
  const [enabled, setEnabled] = useState(tpl.enabled);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = body !== tpl.body || enabled !== tpl.enabled;

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/messaging/templates', {
          params: header,
          body: { eventKey: tpl.eventKey as never, body, enabled },
        }),
      ),
    onSuccess: () => {
      setError(null);
      toast.success(t('templateSaved'));
      onChanged();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const reset = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/messaging/templates/{eventKey}/reset', {
          params: { ...header, path: { eventKey: tpl.eventKey as never } },
        }),
      ),
    onSuccess: () => {
      setError(null);
      setBody(tpl.defaultBody);
      toast.success(t('templateReset'));
      onChanged();
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  /** Sisipkan {{pengganti}} di posisi kursor (atau ganti teks yang dipilih). */
  function insert(name: string) {
    const el = area.current;
    const token = `{{${name}}}`;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-base font-medium">
          <Checkbox checked={enabled} disabled={!canManage} onCheckedChange={(next) => setEnabled(next)} />
          {t(`event.${tpl.eventKey}` as 'event.arrival')}
        </Label>
        {tpl.isDefault && <Badge variant="outline">{t('templateDefault')}</Badge>}
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        {t(`eventHint.${tpl.eventKey}` as 'eventHint.arrival')}
      </p>

      <div className="grid gap-2">
        <Label htmlFor={`tpl-${tpl.eventKey}`}>{t('templateBody')}</Label>
        <textarea
          id={`tpl-${tpl.eventKey}`}
          ref={area}
          rows={4}
          maxLength={1000}
          disabled={!canManage}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-24 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">{t('insertPlaceholder')}:</span>
          {tpl.placeholders.map((p) => (
            <Button
              key={p}
              type="button"
              size="xs"
              variant="outline"
              disabled={!canManage}
              onClick={() => insert(p)}
              title={`{{${p}}}`}
            >
              {t.has(`placeholder.${p}` as never) ? t(`placeholder.${p}` as never) : p}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-1">
        <p className="text-muted-foreground text-xs font-medium">{t('preview')}</p>
        <p className="bg-muted/50 rounded-lg border p-3 text-sm whitespace-pre-wrap">{preview(body)}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || !body.trim() || save.isPending} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
          <Button
            variant="outline"
            disabled={(tpl.isDefault && body === tpl.defaultBody) || reset.isPending}
            onClick={() => reset.mutate()}
          >
            {t('resetDefault')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function GeneralSettings() {
  const t = useTranslations('messaging');
  const te = useTranslations();
  const { school, header, canManage } = useMessagingCtx();
  const queryClient = useQueryClient();
  const key = ['messaging-settings', school.schoolId];

  const settings = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/messaging/settings', { params: header })),
  });
  const [draft, setDraft] = useState<NonNullable<typeof settings.data> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? settings.data;

  const save = useMutation({
    mutationFn: async () => {
      if (!value) return;
      return unwrap(
        await api.PUT('/v1/messaging/settings', {
          params: header,
          body: {
            enabled: value.enabled,
            delayMinSeconds: value.delayMinSeconds,
            delayMaxSeconds: value.delayMaxSeconds,
            windowStart: value.windowStart,
            windowEnd: value.windowEnd,
            absentNoticeAt: value.absentNoticeAt,
          },
        }),
      );
    },
    onSuccess: () => {
      setError(null);
      setDraft(null);
      toast.success(t('settingsSaved'));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (!value) return <Skeleton className="h-72 w-full" />;
  const set = (patch: Partial<typeof value>) => setDraft({ ...value, ...patch });
  const badDelay = value.delayMinSeconds > value.delayMaxSeconds;

  return (
    <Card className="grid gap-5 p-5">
      <form
        className="grid max-w-2xl gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Label className="flex items-center gap-2 font-medium">
          <Checkbox
            checked={value.enabled}
            disabled={!canManage}
            onCheckedChange={(next) => set({ enabled: next })}
          />
          {t('enabled')}
        </Label>
        <p className="text-muted-foreground -mt-3 text-xs">{t('enabledHint')}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="msg-window-start">{t('windowStart')}</Label>
            <Input
              id="msg-window-start"
              type="time"
              required
              disabled={!canManage}
              value={value.windowStart}
              onChange={(e) => set({ windowStart: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="msg-window-end">{t('windowEnd')}</Label>
            <Input
              id="msg-window-end"
              type="time"
              required
              disabled={!canManage}
              value={value.windowEnd}
              onChange={(e) => set({ windowEnd: e.target.value })}
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-3 text-xs">{t('windowHint')}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="msg-delay-min">{t('delayMin')}</Label>
            <Input
              id="msg-delay-min"
              type="number"
              min={0}
              max={600}
              disabled={!canManage}
              value={value.delayMinSeconds}
              onChange={(e) => set({ delayMinSeconds: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="msg-delay-max">{t('delayMax')}</Label>
            <Input
              id="msg-delay-max"
              type="number"
              min={0}
              max={600}
              disabled={!canManage}
              value={value.delayMaxSeconds}
              onChange={(e) => set({ delayMaxSeconds: Number(e.target.value) })}
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-3 text-xs">{t('delayHint')}</p>
        {badDelay && (
          <Alert variant="destructive">
            <AlertDescription>{t('delayInvalid')}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2 sm:w-1/2">
          <Label htmlFor="msg-absent-at">{t('absentAt')}</Label>
          <Input
            id="msg-absent-at"
            type="time"
            disabled={!canManage || value.absentNoticeAt === null}
            value={value.absentNoticeAt ?? ''}
            onChange={(e) => set({ absentNoticeAt: e.target.value })}
          />
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={value.absentNoticeAt === null}
              disabled={!canManage}
              onCheckedChange={(next) => set({ absentNoticeAt: next ? null : '08:00' })}
            />
            {t('absentOff')}
          </Label>
          <p className="text-muted-foreground text-xs">{t('absentHint')}</p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {canManage && (
          <div>
            <Button type="submit" disabled={!draft || badDelay || save.isPending}>
              {t('save')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

export function SettingsPanel() {
  const t = useTranslations('messaging');
  const { school, header, canManage } = useMessagingCtx();
  const queryClient = useQueryClient();
  const key = ['messaging-templates', school.schoolId];

  const templates = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/messaging/templates', { params: header })),
  });

  return (
    <div className="grid gap-6">
      <GeneralSettings />
      <div className="grid gap-1">
        <h2 className="font-heading text-lg font-semibold">{t('templatesTitle')}</h2>
        <p className="text-muted-foreground max-w-2xl text-sm">{t('templatesHint')}</p>
      </div>
      {templates.isPending && <Skeleton className="h-48 w-full" />}
      {templates.data?.map((tpl) => (
        <TemplateCard
          // Remount saat data server berubah agar isian lokal mengikuti hasil simpan/kembalikan.
          key={`${tpl.eventKey}:${tpl.body}:${tpl.enabled}`}
          tpl={tpl}
          canManage={canManage}
          onChanged={() => queryClient.invalidateQueries({ queryKey: key })}
        />
      ))}
    </div>
  );
}
