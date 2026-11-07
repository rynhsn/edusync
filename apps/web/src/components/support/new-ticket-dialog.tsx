'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { FieldError, TOUCH_INPUT, useFormValidation } from '@/components/form-field-error';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { errorKey } from '@/lib/errors';
import {
  CATEGORIES,
  lastPage,
  PRIORITIES,
  SUBJECT_MAX,
  TICKET_ORDER,
  type TicketCategory,
  type TicketPriority,
  validateTicket,
} from '@/lib/support';
import type { SupportApi } from './support-api';

/** Dialog Buat laporan: kategori, prioritas, judul, penjelasan. Setelah terkirim, membuka percakapannya. */
export function NewTicketDialog({
  api,
  units,
  trigger,
}: {
  api: SupportApi;
  units: { id: string; name: string }[];
  trigger: React.ReactElement;
}) {
  const t = useTranslations('support');
  const te = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<TicketCategory>('bug');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [unitId, setUnitId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validation = useFormValidation({
    errors: validateTicket({ subject, body }),
    order: TICKET_ORDER,
    idPrefix: `support-new-${api.side}`,
  });

  const create = useMutation({
    mutationFn: () =>
      api.create({
        subject: subject.trim(),
        category,
        priority,
        body: body.trim(),
        page: lastPage(window.location.pathname),
        ...(unitId ? { unitId } : {}),
      }),
    onSuccess: (ticket) => {
      setError(null);
      toast.success(t('dialog.created', { no: ticket.ticketNo }));
      queryClient.invalidateQueries({ queryKey: api.key });
      router.push(`${api.basePath}/${ticket.id}`);
    },
    onError: (e) => setError(te(errorKey(e) as never)),
  });

  function reset(open: boolean) {
    if (!open) return;
    setCategory('bug');
    setPriority('normal');
    setSubject('');
    setBody('');
    setUnitId('');
    setError(null);
  }

  const subjectProps = validation.fieldProps('subject');
  const bodyProps = validation.fieldProps('body');

  return (
    <FormDialog
      trigger={trigger}
      title={t('dialog.title')}
      description={t('dialog.description')}
      submitLabel={t('dialog.submit')}
      error={error}
      validation={validation}
      onOpenChange={reset}
      onSubmit={() => create.mutateAsync()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('dialog.category')} htmlFor="support-category">
          <SelectField
            id="support-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TicketCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField label={t('dialog.priority')} htmlFor="support-priority">
          <SelectField
            id="support-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </SelectField>
        </FormField>
      </div>

      {units.length > 0 && (
        <FormField label={t('dialog.unit')} htmlFor="support-unit">
          <SelectField id="support-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">{t('dialog.unitNone')}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectField>
        </FormField>
      )}

      <div className="grid content-start gap-2">
        <label htmlFor={subjectProps.id} className="text-sm leading-none font-medium">
          {t('dialog.subject')}
        </label>
        <Input
          {...subjectProps}
          className={TOUCH_INPUT}
          value={subject}
          maxLength={SUBJECT_MAX + 50}
          placeholder={t('dialog.subjectPlaceholder')}
          onChange={(e) => setSubject(e.target.value)}
        />
        <FieldError id={subjectProps.id} issue={validation.issue('subject')} />
      </div>

      <div className="grid content-start gap-2">
        <label htmlFor={bodyProps.id} className="text-sm leading-none font-medium">
          {t('dialog.body')}
        </label>
        <Textarea
          {...bodyProps}
          rows={6}
          value={body}
          placeholder={t('dialog.bodyPlaceholder')}
          onChange={(e) => setBody(e.target.value)}
        />
        <FieldError id={bodyProps.id} issue={validation.issue('body')} />
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {api.side === 'school' ? t('dialog.contextNote') : t('dialog.ownerContextNote')}
      </p>
    </FormDialog>
  );
}
