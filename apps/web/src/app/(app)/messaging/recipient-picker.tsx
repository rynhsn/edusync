'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import { TOUCH_INPUT, TOUCH_SELECT } from '@/components/form-field-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { api, unwrap } from '@/lib/api';
import type { PickItem, PickState } from './direct-logic';
import { useMessagingCtx } from './shared';

type Kind = 'student' | 'class' | 'guardian' | 'teacher';
const SEGMENTS: { kind: Kind; list: 'students' | 'classes' | 'guardians' | 'teachers' }[] = [
  { kind: 'student', list: 'students' },
  { kind: 'class', list: 'classes' },
  { kind: 'guardian', list: 'guardians' },
  { kind: 'teacher', list: 'teachers' },
];

function Search({ kind, picked, onPick }: { kind: Kind; picked: PickItem[]; onPick: (i: PickItem) => void }) {
  const t = useTranslations('messaging.direct');
  const { school, header } = useMessagingCtx();
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  // Wali butuh minimal 2 huruf; yang lain boleh kosong (menampilkan 20 pertama).
  const enabled = kind !== 'guardian' || deferred.length >= 2;
  const list = useQuery({
    queryKey: ['messaging-recipient-search', school.schoolId, kind, deferred],
    enabled,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/messaging/recipients/search', {
          params: { ...header, query: { kind, q: deferred } },
        }),
      ),
  });
  const items = (list.data ?? []).filter((i) => !picked.some((p) => p.id === i.id));
  return (
    <div className="grid gap-2">
      <Input
        className={TOUCH_INPUT}
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t(`search.${kind}`)}
        aria-label={t(`search.${kind}`)}
      />
      {enabled && !list.isPending && items.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('noResults')}</p>
      )}
      <ul className="grid max-h-56 gap-1 overflow-y-auto">
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onPick(i)}
              className="hover:bg-muted flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-sm md:min-h-9"
            >
              <span className="min-w-0 truncate font-medium">{i.label}</span>
              <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
                {i.hint}
                <Plus className="size-4" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pemilih penerima: murid, rombel, wali, atau staf; cip terpilih bisa dihapus. */
export function RecipientPicker({
  value,
  onChange,
  canBroadcast,
}: {
  value: PickState;
  onChange: (next: PickState) => void;
  canBroadcast: boolean;
}) {
  const t = useTranslations('messaging.direct');
  const [kind, setKind] = useState<Kind>('student');
  const seg = SEGMENTS.find((s) => s.kind === kind) ?? (SEGMENTS[0] as (typeof SEGMENTS)[number]);
  const toStudents = kind === 'student' || kind === 'class';

  const add = (i: PickItem) => onChange({ ...value, [seg.list]: [...value[seg.list], i] });
  const remove = (list: (typeof SEGMENTS)[number]['list'], id: string) =>
    onChange({ ...value, [list]: value[list].filter((x) => x.id !== id) });
  const chips = SEGMENTS.flatMap((s) => value[s.list].map((i) => ({ ...i, list: s.list, kind: s.kind })));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1 rounded-lg border p-0.5" role="tablist" aria-label={t('step1')}>
        {SEGMENTS.map((s) => (
          <Button
            key={s.kind}
            type="button"
            size="sm"
            role="tab"
            aria-selected={kind === s.kind}
            variant={kind === s.kind ? 'secondary' : 'ghost'}
            className="min-h-11 flex-1 md:min-h-8"
            onClick={() => setKind(s.kind)}
          >
            {t(`seg.${s.kind}`)}
            {value[s.list].length > 0 && <Badge variant="outline">{value[s.list].length}</Badge>}
          </Button>
        ))}
      </div>

      <Search kind={kind} picked={value[seg.list]} onPick={add} />

      {canBroadcast && toStudents && (
        <Label className="flex min-h-11 items-center gap-2 font-normal md:min-h-0">
          <Checkbox
            checked={value.wholeSchool}
            onCheckedChange={(next) => onChange({ ...value, wholeSchool: next })}
          />
          {t('wholeSchool')}
        </Label>
      )}
      {canBroadcast && kind === 'teacher' && (
        <Label className="flex min-h-11 items-center gap-2 font-normal md:min-h-0">
          <Checkbox
            checked={value.allStaff}
            onCheckedChange={(next) => onChange({ ...value, allStaff: next })}
          />
          {t('allStaff')}
        </Label>
      )}
      {toStudents && (
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="direct-scope">{t('scope')}</Label>
          <SelectField
            id="direct-scope"
            className={TOUCH_SELECT}
            value={value.guardianScope}
            onChange={(e) => onChange({ ...value, guardianScope: e.target.value as 'primary' | 'all' })}
          >
            <option value="primary">{t('scopePrimary')}</option>
            <option value="all">{t('scopeAll')}</option>
          </SelectField>
          <p className="text-muted-foreground text-xs">{t('scopeHint')}</p>
        </div>
      )}

      <div className="grid gap-1.5">
        <p className="text-muted-foreground text-xs font-medium">{t('selected')}</p>
        {chips.length === 0 && !value.wholeSchool && !value.allStaff && (
          <p className="text-muted-foreground text-sm">{t('noneSelected')}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {value.wholeSchool && <Badge variant="secondary">{t('wholeSchool')}</Badge>}
          {value.allStaff && <Badge variant="secondary">{t('allStaff')}</Badge>}
          {chips.map((c) => (
            <Badge
              key={`${c.kind}-${c.id}`}
              variant="secondary"
              className="h-auto gap-1.5 py-1 whitespace-normal"
            >
              <span className="text-muted-foreground text-[10px] uppercase">{t(`seg.${c.kind}`)}</span>
              {c.label}
              <button
                type="button"
                aria-label={t('remove', { name: c.label })}
                className="hover:text-destructive -mr-1 rounded p-0.5"
                onClick={() => remove(c.list, c.id)}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
