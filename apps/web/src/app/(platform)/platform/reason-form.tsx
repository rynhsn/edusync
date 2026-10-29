'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  id: string;
  pending: boolean;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/** Tindakan staf selalu butuh alasan yang dicatat di audit log. */
export function ReasonForm({ id, pending, confirmLabel, onConfirm, onCancel }: Props) {
  const t = useTranslations('platform');
  const [reason, setReason] = useState('');
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(reason.trim());
      }}
    >
      <div className="grid min-w-56 flex-1 gap-1">
        <Label htmlFor={id} className="text-xs">
          {t('reasonLabel')}
        </Label>
        <Input
          id={id}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('reasonPlaceholder')}
          minLength={3}
          maxLength={500}
          required
          autoFocus
        />
      </div>
      <Button type="submit" size="sm" disabled={pending || reason.trim().length < 3}>
        {confirmLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        {t('cancel')}
      </Button>
    </form>
  );
}
