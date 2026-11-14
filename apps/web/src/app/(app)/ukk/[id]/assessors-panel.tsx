'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { TOUCH_INPUT, TOUCH_SELECT } from '@/components/form-field-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { type UkkEvent, ukkKey } from '../lib';

type Row =
  | { kind: 'internal'; teacherId: string; label: string }
  | { kind: 'external'; name: string; institution: string; qualification: string };

const fromEvent = (e: UkkEvent): Row[] =>
  e.assessors.map((a) =>
    a.kind === 'internal'
      ? { kind: 'internal', teacherId: a.teacherId ?? '', label: a.teacherName ?? '' }
      : {
          kind: 'external',
          name: a.name ?? '',
          institution: a.institution ?? '',
          qualification: a.qualification ?? '',
        },
  );

/** Penguji kegiatan: guru internal (boleh mengisi hasil kegiatan ini) dan penguji eksternal (isian bebas, dinilai oleh staf). */
export function AssessorsPanel({ event }: { event: UkkEvent }) {
  const t = useTranslations('ukk');
  const te = useTranslations();
  const { school, can } = useSchool();
  const manage = can('ukk:manage');
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [teacherId, setTeacherId] = useState('');
  const [ext, setExt] = useState({ name: '', institution: '', qualification: '' });
  const [error, setError] = useState<string | null>(null);

  const current = rows ?? fromEvent(event);
  const teachers = useQuery({
    queryKey: ['teachers', school.schoolId],
    enabled: manage && can('teacher:read'),
    queryFn: async () => unwrap(await api.GET('/v1/teachers', { params: header })),
  });
  const chosen = new Set(current.flatMap((r) => (r.kind === 'internal' ? [r.teacherId] : [])));
  const available = (teachers.data ?? []).filter((x) => x.status === 'active' && !chosen.has(x.id));

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/ukk/events/{id}/assessors', {
          params: { ...header, path: { id: event.id } },
          body: {
            assessors: current.map((r) =>
              r.kind === 'internal'
                ? { kind: 'internal' as const, teacherId: r.teacherId }
                : {
                    kind: 'external' as const,
                    name: r.name.trim(),
                    institution: r.institution.trim() || null,
                    qualification: r.qualification.trim() || null,
                  },
            ),
          },
        }),
      ),
    onSuccess: () => {
      setRows(null);
      setError(null);
      toast.success(t('assessors.saved'));
      queryClient.invalidateQueries({ queryKey: ukkKey(school.schoolId) });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const update = (next: Row[]) => setRows(next);

  return (
    <div className="grid gap-4">
      <section className="bg-card grid gap-3 rounded-xl border p-4">
        <h2 className="font-heading text-lg font-semibold">{t('assessors.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('assessors.hint')}</p>
        {current.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('assessors.empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {current.map((r, i) => (
              <li
                key={r.kind === 'internal' ? r.teacherId : `x-${i}`}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <UserRound className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="font-medium break-words">{r.kind === 'internal' ? r.label : r.name}</p>
                  {r.kind === 'external' && (r.institution || r.qualification) && (
                    <p className="text-muted-foreground text-xs break-words">
                      {[r.institution, r.qualification].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <ToneBadge tone={r.kind === 'internal' ? 'teal' : 'amber'} className="w-fit">
                    {t(r.kind === 'internal' ? 'assessors.internal' : 'assessors.external')}
                  </ToneBadge>
                </div>
                {manage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-8"
                    aria-label={t('assessors.remove', { name: r.kind === 'internal' ? r.label : r.name })}
                    onClick={() => update(current.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {manage && (
        <>
          <section className="bg-card grid gap-3 rounded-xl border p-4">
            <h3 className="font-heading font-semibold">{t('assessors.addInternal')}</h3>
            {can('teacher:read') ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-0 flex-1 content-start gap-2 max-sm:basis-full">
                  <Label htmlFor="uk-teacher">{t('assessors.pickTeacher')}</Label>
                  <SelectField
                    id="uk-teacher"
                    className={TOUCH_SELECT}
                    value={teacherId}
                    placeholder={t('assessors.pickTeacher')}
                    onChange={(e) => setTeacherId(e.target.value)}
                  >
                    {available.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 max-sm:w-full md:h-8"
                  disabled={!teacherId}
                  onClick={() => {
                    const x = available.find((a) => a.id === teacherId);
                    if (!x) return;
                    update([...current, { kind: 'internal', teacherId: x.id, label: x.name }]);
                    setTeacherId('');
                  }}
                >
                  <Plus className="size-4" aria-hidden /> {t('assessors.add')}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t('assessors.noTeacherAccess')}</p>
            )}
          </section>

          <section className="bg-card grid gap-3 rounded-xl border p-4">
            <h3 className="font-heading font-semibold">{t('assessors.addExternal')}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid content-start gap-2">
                <Label htmlFor="uk-ext-name">{t('assessors.extName')}</Label>
                <Input
                  id="uk-ext-name"
                  className={TOUCH_INPUT}
                  maxLength={160}
                  autoComplete="off"
                  value={ext.name}
                  onChange={(e) => setExt({ ...ext, name: e.target.value })}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="uk-ext-inst">{t('assessors.extInstitution')}</Label>
                <Input
                  id="uk-ext-inst"
                  className={TOUCH_INPUT}
                  maxLength={200}
                  autoComplete="off"
                  value={ext.institution}
                  onChange={(e) => setExt({ ...ext, institution: e.target.value })}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="uk-ext-qual">{t('assessors.extQualification')}</Label>
                <Input
                  id="uk-ext-qual"
                  className={TOUCH_INPUT}
                  maxLength={300}
                  autoComplete="off"
                  value={ext.qualification}
                  onChange={(e) => setExt({ ...ext, qualification: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                className="h-11 max-sm:w-full md:h-8"
                disabled={!ext.name.trim()}
                onClick={() => {
                  update([...current, { kind: 'external', ...ext }]);
                  setExt({ name: '', institution: '', qualification: '' });
                }}
              >
                <Plus className="size-4" aria-hidden /> {t('assessors.add')}
              </Button>
            </div>
          </section>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="bg-background/90 sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-lg backdrop-blur">
            <span className="text-muted-foreground text-sm" aria-live="polite">
              {rows ? t('assessors.dirty') : t('assessors.clean')}
            </span>
            <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
              <Button
                type="button"
                variant="ghost"
                className="h-11 md:h-8"
                disabled={!rows}
                onClick={() => {
                  setRows(null);
                  setError(null);
                }}
              >
                {t('discard')}
              </Button>
              <Button
                type="button"
                className="h-11 md:h-8"
                disabled={!rows || save.isPending}
                onClick={() => save.mutate()}
              >
                <Save className="size-4" aria-hidden /> {t('assessors.save')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
