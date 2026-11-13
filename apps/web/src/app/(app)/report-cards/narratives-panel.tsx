'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Lock, NotebookPen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { IconTile, MODULE_TONE, ToneBadge } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import {
  dropSaved,
  filterNarrativeRows,
  NARRATIVE_MAX,
  type NarrativeDrafts,
  narrativeItems,
  narrativesTooLong,
  narrativeValue,
} from '@/lib/report-v2';
import { Textarea } from './textarea';

interface Props {
  semesterId: string;
  classId: string;
  /** Mapel kelas itu (dari rapor siswa); kosong bila belum ada yang dinilai. */
  subjects: { subjectId: string; name: string }[];
  descriptive: boolean;
}

/**
 * Deskripsi capaian per mata pelajaran: satu mapel untuk seluruh murid kelas. Deskripsi yang disunting menang atas
 * deskripsi otomatis; mengosongkan isian menghapus suntingan. Baris berstatus final dikunci.
 */
export function NarrativesPanel({ semesterId, classId, subjects, descriptive }: Props) {
  const t = useTranslations('reportCards');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const [open, setOpen] = useState(descriptive);
  const [subjectChoice, setSubjectChoice] = useState('');
  // Suntingan belum tersimpan per mapel, supaya berpindah mapel tidak membuangnya.
  const [draftsBySubject, setDraftsBySubject] = useState<Record<string, NarrativeDrafts>>({});
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const subjectId = subjects.some((s) => s.subjectId === subjectChoice)
    ? subjectChoice
    : (subjects[0]?.subjectId ?? '');
  const drafts = draftsBySubject[subjectId] ?? {};

  const key = ['report-card-narratives', school.schoolId, semesterId, classId, subjectId];
  const list = useQuery({
    queryKey: key,
    enabled: open && !!subjectId,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/report-cards/narratives', {
          params: { ...header, query: { semesterId, classId, subjectId } },
        }),
      ),
  });
  const rows = (list.data?.students ?? []).map((s) => ({ ...s, locked: s.reportStatus === 'final' }));
  const editable = rows.filter((r) => !r.locked);
  const items = narrativeItems(editable, drafts);
  const tooLong = narrativesTooLong(drafts);
  const missing = rows.filter((r) => narrativeValue(r, drafts).trim() === '').length;
  const shown = filterNarrativeRows(rows, { query, onlyMissing }, drafts);

  const setDraft = (studentId: string, text: string) =>
    setDraftsBySubject((all) => ({ ...all, [subjectId]: { ...(all[subjectId] ?? {}), [studentId]: text } }));

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/v1/report-cards/narratives', {
          params: header,
          body: { semesterId, classId, subjectId, items },
        }),
      ),
    onSuccess: () => {
      toast.success(t('narrativesSaved'));
      const saved = items;
      setDraftsBySubject((all) => ({ ...all, [subjectId]: dropSaved(all[subjectId] ?? {}, saved) }));
      queryClient.invalidateQueries({ queryKey: ['report-card-narratives', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['report-cards', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <section className="bg-card grid content-start gap-3 rounded-2xl border p-4" aria-labelledby="rc-narr">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="rc-narr-body"
        onClick={() => setOpen((o) => !o)}
        className="focus-visible:ring-ring/50 -m-1 flex min-h-11 items-start gap-3 rounded-xl p-1 text-left outline-none focus-visible:ring-3"
      >
        <IconTile icon={NotebookPen} tone={MODULE_TONE.academic} />
        <span className="min-w-0 flex-1">
          <span id="rc-narr" className="font-heading block text-lg font-semibold">
            {t('narrativesTitle')}
          </span>
          <span className="text-muted-foreground block text-sm">
            {descriptive ? t('narrativesHintDescriptive') : t('narrativesHint')}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`text-muted-foreground mt-2 size-5 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div id="rc-narr-body" className="grid content-start gap-3">
          {subjects.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('narrativesNoSubjects')}</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="rc-narr-subject">{t('narrativesSubject')}</Label>
                  <SelectField
                    id="rc-narr-subject"
                    value={subjectId}
                    onChange={(e) => setSubjectChoice(e.target.value)}
                  >
                    {subjects.map((s) => (
                      <option key={s.subjectId} value={s.subjectId}>
                        {s.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rc-narr-search">{t('narrativesSearch')}</Label>
                  <Input
                    id="rc-narr-search"
                    className="h-11 md:h-9"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="flex min-h-11 items-center gap-2">
                  <Checkbox
                    id="rc-narr-missing"
                    checked={onlyMissing}
                    onCheckedChange={(v) => setOnlyMissing(v === true)}
                  />
                  <Label htmlFor="rc-narr-missing">{t('narrativesOnlyMissing')}</Label>
                </div>
              </div>

              {list.isPending && <Skeleton className="h-40 w-full rounded-xl" aria-busy />}
              {list.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
                </Alert>
              )}

              {list.data && (
                <>
                  <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
                    {t('narrativesMissing', { missing, total: rows.length })}
                  </p>
                  {rows.length > 0 && editable.length === 0 && (
                    <Alert>
                      <Lock aria-hidden className="size-4" />
                      <AlertDescription>{t('narrativesAllFinal')}</AlertDescription>
                    </Alert>
                  )}
                  {shown.length === 0 && rows.length > 0 && (
                    <p className="text-muted-foreground text-sm">{t('narrativesNoMatch')}</p>
                  )}
                  <ul className="grid gap-3 md:grid-cols-2">
                    {shown.map((r) => {
                      const value = narrativeValue(r, drafts);
                      const inputId = `rc-narr-${r.studentId}`;
                      return (
                        <li
                          key={r.studentId}
                          className="grid min-w-0 content-start gap-2 rounded-xl border p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Label htmlFor={inputId} className="font-medium">
                                {r.name}
                              </Label>
                              {r.nis && <p className="text-muted-foreground text-xs">{r.nis}</p>}
                            </div>
                            {r.locked && (
                              <ToneBadge tone="emerald">
                                <Lock aria-hidden className="size-3" />
                                {t('statusFinal')}
                              </ToneBadge>
                            )}
                          </div>
                          <Textarea
                            id={inputId}
                            rows={3}
                            maxLength={NARRATIVE_MAX}
                            disabled={r.locked}
                            value={value}
                            aria-describedby={`${inputId}-hint`}
                            onChange={(e) => setDraft(r.studentId, e.target.value)}
                          />
                          <p id={`${inputId}-hint`} className="text-muted-foreground text-xs">
                            {r.locked
                              ? t('narrativeLocked')
                              : !descriptive && r.generated && !value.trim()
                                ? t('narrativeAuto', { text: r.generated })
                                : `${value.length}/${NARRATIVE_MAX}`}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      className="h-11 md:h-8"
                      disabled={items.length === 0 || tooLong.length > 0 || save.isPending}
                      onClick={() => save.mutate()}
                    >
                      {t('narrativesSave')}
                    </Button>
                    {items.length > 0 && (
                      <span className="text-muted-foreground text-sm" aria-live="polite">
                        {t('narrativesUnsaved', { count: items.length })}
                      </span>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
