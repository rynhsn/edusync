'use client';

import { ASSESSMENT_BATCH_LIMIT } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Lock, MessageSquare, Plus, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { ListSkeleton } from '@/components/master-kit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToneBadge } from '@/components/ui-kit';
import { ApiError, api, unwrap } from '@/lib/api';
import {
  type CellMap,
  cellMapFrom,
  changedCells,
  chunkBy,
  fillColumn,
  getCell,
  isEvidenceUrl,
  pickSemester,
  setCell,
} from '@/lib/cocurricular';
import { errorKey } from '@/lib/errors';
import { SaveBar } from '../settings/settings-view';

type Header = { header: { 'x-school-id': string } };
interface Target {
  profileItemId: string;
  label: string;
  active: boolean;
}
interface Level {
  id: string;
  label: string;
  active: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Pilihan semester dan rombel yang boleh dilihat pengguna (tanpa izin tahun ajaran atau rombel). */
function useOptions(header: Header, schoolId: string, programId: string) {
  return useQuery({
    queryKey: ['cocurricular-options', schoolId, programId],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/cocurricular/programs/{id}/assessment-options', {
          params: { ...header, path: { id: programId } },
        }),
      ),
  });
}

function Pickers({
  semesters,
  classes,
  semesterId,
  classId,
  onSemester,
  onClass,
  withSemester,
  allLabel,
}: {
  semesters: { id: string; name: string }[];
  classes: { classId: string; name: string; level: string }[];
  semesterId: string;
  classId: string;
  onSemester: (v: string) => void;
  onClass: (v: string) => void;
  withSemester: boolean;
  allLabel?: string;
}) {
  const t = useTranslations('cocurricular');
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
      {withSemester && (
        <FormField label={t('asSemester')} htmlFor="as-sem">
          <SelectField id="as-sem" value={semesterId} onChange={(e) => onSemester(e.target.value)}>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </FormField>
      )}
      <FormField label={t('asClass')} htmlFor="as-cls">
        <SelectField
          id="as-cls"
          value={classId}
          placeholder={t('asPickClass')}
          onChange={(e) => onClass(e.target.value)}
        >
          {allLabel !== undefined && <option value="">{allLabel}</option>}
          {classes.map((c) => (
            <option key={c.classId} value={c.classId}>
              {t('classOption', { name: c.name, level: c.level })}
            </option>
          ))}
        </SelectField>
      </FormField>
    </div>
  );
}

/** Satu sel: pilihan tingkat (44 px di layar sentuh) dan catatan yang dapat dibuka. */
function CellEditor({
  idPrefix,
  levels,
  value,
  disabled,
  label,
  noteLabel,
  onChange,
}: {
  idPrefix: string;
  levels: Level[];
  value: { levelId: string; note: string };
  disabled: boolean;
  label: string;
  noteLabel: string;
  onChange: (patch: Partial<{ levelId: string; note: string }>) => void;
}) {
  const t = useTranslations('cocurricular');
  const [open, setOpen] = useState(value.note !== '');
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <SelectField
            id={`${idPrefix}-lv`}
            aria-label={label}
            value={value.levelId}
            disabled={disabled}
            onChange={(e) => onChange({ levelId: e.target.value })}
          >
            <option value="">{t('asNotRated')}</option>
            {levels
              .filter((l) => l.active || l.id === value.levelId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
          </SelectField>
        </div>
        <Button
          type="button"
          variant={value.note !== '' ? 'secondary' : 'ghost'}
          size="icon"
          className="max-md:size-11"
          aria-label={noteLabel}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <MessageSquare className="size-4" aria-hidden />
        </Button>
      </div>
      {open && (
        <Input
          id={`${idPrefix}-note`}
          aria-label={noteLabel}
          value={value.note}
          maxLength={1000}
          disabled={disabled}
          placeholder={t('asNotePlaceholder')}
          className="max-md:min-h-11"
          onChange={(e) => onChange({ note: e.target.value })}
        />
      )}
    </div>
  );
}

function SheetEditor({
  programId,
  semesterId,
  classId,
  targets,
  header,
  schoolId,
}: {
  programId: string;
  semesterId: string;
  classId: string;
  targets: Target[];
  header: Header;
  schoolId: string;
}) {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const sheetKey = ['cocurricular-sheet', schoolId, programId, semesterId, classId];
  const sheet = useQuery({
    queryKey: sheetKey,
    retry: false,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/cocurricular/programs/{id}/assessments', {
          params: { ...header, path: { id: programId }, query: { semesterId, classId } },
        }),
      ),
  });
  const levels = useQuery({
    queryKey: ['cocurricular-levels', schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/cocurricular/rubric-levels', { params: header })),
  });
  const [draft, setDraft] = useState<CellMap | null>(null);
  const [bulkItem, setBulkItem] = useState('');
  const [bulkLevel, setBulkLevel] = useState('');

  const data = sheet.data;
  const server = cellMapFrom(data?.cells ?? []);
  const current = draft ?? server;
  const changed = changedCells(current, server);
  const dirty = draft !== null && changed.length > 0;
  const editable = !!data && data.canAssess && !data.programClosed;

  const save = useMutation({
    mutationFn: async () => {
      let saved = 0;
      for (const part of chunkBy(changed, ASSESSMENT_BATCH_LIMIT)) {
        unwrap(
          await api.PUT('/v1/cocurricular/programs/{id}/assessments', {
            params: { ...header, path: { id: programId } },
            body: { semesterId, classId, cells: part },
          }),
        );
        saved += part.length;
      }
      return saved;
    },
    onSuccess: async () => {
      toast.success(t('asSaved'));
      await queryClient.invalidateQueries({ queryKey: sheetKey });
      setDraft(null);
    },
    onError: async (e) => {
      toast.error(te(errorKey(e)));
      // Sebagian kelompok mungkin sudah tersimpan: muat ulang supaya "belum disimpan" sesuai keadaan server.
      await queryClient.invalidateQueries({ queryKey: sheetKey });
    },
  });

  if (sheet.isPending || levels.isPending) return <ListSkeleton rows={4} stats={0} />;
  if (sheet.error || !data) {
    const forbidden = sheet.error instanceof ApiError && sheet.error.status === 403;
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {forbidden ? t('asForbidden') : sheet.error ? te(errorKey(sheet.error)) : t('asLoadError')}
        </AlertDescription>
      </Alert>
    );
  }
  const lv: Level[] = (levels.data?.levels ?? []).map((l) => ({
    id: l.id,
    label: l.label,
    active: l.active,
  }));
  const activeLevels = lv.filter((l) => l.active);
  const studentIds = data.students.map((s) => s.id);
  const patch = (studentId: string, itemId: string, p: Partial<{ levelId: string; note: string }>) =>
    setDraft(setCell(current, studentId, itemId, p));

  return (
    <div className="grid gap-4">
      {data.locked && (
        <Alert>
          <Lock className="size-4" aria-hidden />
          <AlertDescription>{t('asLocked')}</AlertDescription>
        </Alert>
      )}
      {data.programClosed && (
        <Alert>
          <AlertDescription>{t('asClosed')}</AlertDescription>
        </Alert>
      )}
      {!data.canAssess && !data.programClosed && (
        <Alert>
          <AlertDescription>{t('asReadOnly')}</AlertDescription>
        </Alert>
      )}
      {activeLevels.length === 0 && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {t('asNoLevels')}
            <Link href="/cocurricular/settings" className="font-medium underline underline-offset-2">
              {t('asNoLevelsLink')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {data.students.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('asNoStudents')}</p>
      ) : (
        <>
          {editable && activeLevels.length > 0 && (
            <section
              aria-label={t('asBulkTitle')}
              className="bg-card grid gap-3 rounded-2xl border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
            >
              <FormField label={t('asBulkItem')} htmlFor="as-bulk-item">
                <SelectField
                  id="as-bulk-item"
                  value={bulkItem}
                  placeholder={t('asBulkItem')}
                  onChange={(e) => setBulkItem(e.target.value)}
                >
                  {targets.map((x) => (
                    <option key={x.profileItemId} value={x.profileItemId}>
                      {x.label}
                    </option>
                  ))}
                </SelectField>
              </FormField>
              <FormField label={t('asBulkLevel')} htmlFor="as-bulk-level">
                <SelectField
                  id="as-bulk-level"
                  value={bulkLevel}
                  placeholder={t('asLevel')}
                  onChange={(e) => setBulkLevel(e.target.value)}
                >
                  {activeLevels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </SelectField>
              </FormField>
              <Button
                variant="outline"
                className="h-11 max-lg:w-full lg:h-8"
                disabled={bulkItem === '' || bulkLevel === ''}
                onClick={() => {
                  setDraft(fillColumn(current, studentIds, bulkItem, bulkLevel));
                  toast.success(t('asBulkDone', { count: studentIds.length }));
                }}
              >
                <Sparkles className="size-4" aria-hidden /> {t('asBulkApply')}
              </Button>
            </section>
          )}

          <p className="text-muted-foreground text-xs">{t('asRowCount', { count: data.students.length })}</p>

          {/* Kartu per murid di bawah lg. */}
          <ul className="grid gap-3 lg:hidden">
            {data.students.map((s) => (
              <li key={s.id} className="bg-card grid gap-3 rounded-2xl border p-3">
                <p className="font-medium break-words">{s.name}</p>
                {targets.map((x) => (
                  <div key={x.profileItemId} className="grid gap-1">
                    <span className="text-muted-foreground text-xs break-words">{x.label}</span>
                    <CellEditor
                      idPrefix={`m-${s.id}-${x.profileItemId}`}
                      levels={lv}
                      value={getCell(current, s.id, x.profileItemId)}
                      disabled={!editable}
                      label={t('asCellLabel', { item: x.label, name: s.name })}
                      noteLabel={t('asNoteToggle', { name: s.name, item: x.label })}
                      onChange={(p) => patch(s.id, x.profileItemId, p)}
                    />
                  </div>
                ))}
              </li>
            ))}
          </ul>

          {/* Matriks murid x butir dari lg ke atas. */}
          <div className="bg-card hidden overflow-x-auto rounded-2xl border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="bg-card sticky left-0 z-10 min-w-48">{t('asStudent')}</TableHead>
                  {targets.map((x) => (
                    <TableHead key={x.profileItemId} className="min-w-56">
                      {x.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="bg-card sticky left-0 z-10 align-top font-medium break-words">
                      {s.name}
                    </TableCell>
                    {targets.map((x) => (
                      <TableCell key={x.profileItemId} className="align-top">
                        <CellEditor
                          idPrefix={`d-${s.id}-${x.profileItemId}`}
                          levels={lv}
                          value={getCell(current, s.id, x.profileItemId)}
                          disabled={!editable}
                          label={t('asCellLabel', { item: x.label, name: s.name })}
                          noteLabel={t('asNoteToggle', { name: s.name, item: x.label })}
                          onChange={(p) => patch(s.id, x.profileItemId, p)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {editable && (
            <SaveBar
              dirty={dirty}
              valid
              pending={save.isPending}
              onSave={() => save.mutate()}
              onDiscard={() => setDraft(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Tab Penilaian: pilih semester dan rombel, isi tingkat dan catatan per murid dan butir sasaran. */
export function AssessmentTab({
  programId,
  targets,
  header,
  schoolId,
}: {
  programId: string;
  targets: Target[];
  header: Header;
  schoolId: string;
}) {
  const t = useTranslations('cocurricular');
  const options = useOptions(header, schoolId, programId);
  const [semesterId, setSemesterId] = useState('');
  const [classId, setClassId] = useState('');
  const o = options.data;

  // Bawaan: semester berjalan dan rombel pertama yang boleh dilihat (7A sebelum 7B menurut urutan tingkat dan nama).
  useEffect(() => {
    if (!o) return;
    setSemesterId((cur) =>
      cur !== '' && o.semesters.some((s) => s.id === cur) ? cur : pickSemester(o.semesters, today()),
    );
    setClassId((cur) =>
      cur !== '' && o.classes.some((c) => c.classId === cur) ? cur : (o.classes[0]?.classId ?? ''),
    );
  }, [o]);

  return (
    <section aria-labelledby="co-as-title" className="grid gap-4">
      <div>
        <h2 id="co-as-title" className="font-heading text-lg font-semibold">
          {t('asTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('asIntro')}</p>
      </div>
      {options.isPending ? (
        <ListSkeleton rows={2} stats={0} />
      ) : !o || o.classes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('asNoClasses')}</p>
      ) : o.semesters.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('asNoSemesters')}</p>
      ) : targets.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('asNoTargets')}</p>
      ) : (
        <>
          <Pickers
            withSemester
            semesters={o.semesters}
            classes={o.classes}
            semesterId={semesterId}
            classId={classId}
            onSemester={setSemesterId}
            onClass={setClassId}
          />
          {semesterId !== '' && classId !== '' && (
            <SheetEditor
              key={`${semesterId}-${classId}`}
              programId={programId}
              semesterId={semesterId}
              classId={classId}
              targets={targets}
              header={header}
              schoolId={schoolId}
            />
          )}
        </>
      )}
    </section>
  );
}

/** Tab Bukti: tautan https per rombel (atau tingkat program). */
export function EvidenceTab({
  programId,
  header,
  schoolId,
}: {
  programId: string;
  header: Header;
  schoolId: string;
}) {
  const t = useTranslations('cocurricular');
  const te = useTranslations();
  const queryClient = useQueryClient();
  const options = useOptions(header, schoolId, programId);
  const [classId, setClassId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const o = options.data;
  const cls = classId ?? o?.classes[0]?.classId ?? '';
  const listKey = ['cocurricular-evidence', schoolId, programId, cls];

  const list = useQuery({
    queryKey: listKey,
    enabled: !!o,
    retry: false,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/cocurricular/programs/{id}/evidence', {
          params: { ...header, path: { id: programId }, query: cls === '' ? {} : { classId: cls } },
        }),
      ),
  });
  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/cocurricular/programs/{id}/evidence', {
          params: { ...header, path: { id: programId } },
          body: { title: title.trim(), url: url.trim(), classId: cls === '' ? null : cls, studentId: null },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('evAdded'));
      setTitle('');
      setUrl('');
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (evidenceId: string) =>
      unwrap(
        await api.DELETE('/v1/cocurricular/programs/{id}/evidence/{evidenceId}', {
          params: { ...header, path: { id: programId, evidenceId } },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('evDeleted'));
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const urlOk = url.trim() === '' || isEvidenceUrl(url);
  const canAdd = title.trim() !== '' && url.trim() !== '' && isEvidenceUrl(url);
  const data = list.data;
  const editable = !!data && data.canAssess && !data.programClosed;

  return (
    <section aria-labelledby="co-ev-title" className="grid gap-4">
      <div>
        <h2 id="co-ev-title" className="font-heading text-lg font-semibold">
          {t('evTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('evIntro')}</p>
      </div>
      {options.isPending ? (
        <ListSkeleton rows={2} stats={0} />
      ) : !o ? (
        <Alert variant="destructive">
          <AlertDescription>{t('asLoadError')}</AlertDescription>
        </Alert>
      ) : (
        <>
          <Pickers
            withSemester={false}
            semesters={[]}
            classes={o.classes}
            semesterId=""
            classId={cls}
            onSemester={() => {}}
            onClass={setClassId}
            allLabel={t('evAllClasses')}
          />
          {list.isPending ? (
            <ListSkeleton rows={2} stats={0} />
          ) : list.error || !data ? (
            <Alert variant="destructive">
              <AlertDescription>
                {list.error instanceof ApiError && list.error.status === 403
                  ? t('asForbidden')
                  : t('asLoadError')}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {data.programClosed ? (
                <Alert>
                  <AlertDescription>{t('evClosed')}</AlertDescription>
                </Alert>
              ) : (
                !data.canAssess && (
                  <Alert>
                    <AlertDescription>{t('evReadOnly')}</AlertDescription>
                  </Alert>
                )
              )}
              {data.evidence.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('evEmpty')}</p>
              ) : (
                <ul className="grid gap-2">
                  {data.evidence.map((ev) => (
                    <li
                      key={ev.id}
                      className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">{ev.title}</p>
                        <p className="text-muted-foreground text-xs break-all">{ev.url}</p>
                        {ev.studentName && (
                          <ToneBadge tone="sky" dot={false}>
                            {t('evStudent', { name: ev.studentName })}
                          </ToneBadge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="max-md:size-11"
                        aria-label={t('evOpen', { title: ev.title })}
                        nativeButton={false}
                        render={<a href={ev.url} target="_blank" rel="noopener noreferrer" />}
                      >
                        <ExternalLink className="size-4" aria-hidden />
                      </Button>
                      {editable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="max-md:size-11"
                          aria-label={t('evDelete', { title: ev.title })}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(ev.id)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editable && (
                <form
                  className="bg-card grid gap-3 rounded-2xl border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-start"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canAdd) add.mutate();
                  }}
                >
                  <FormField label={t('evTitleField')} htmlFor="ev-title">
                    <Input
                      id="ev-title"
                      value={title}
                      maxLength={200}
                      className="max-md:min-h-11"
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </FormField>
                  <FormField
                    label={t('evUrl')}
                    htmlFor="ev-url"
                    hint={t('evUrlHint')}
                    error={urlOk ? undefined : t('evUrlInvalid')}
                  >
                    <Input
                      id="ev-url"
                      type="url"
                      inputMode="url"
                      value={url}
                      aria-invalid={!urlOk}
                      placeholder="https://"
                      className="max-md:min-h-11"
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </FormField>
                  <Button
                    type="submit"
                    className="h-11 max-lg:w-full lg:mt-6 lg:h-8"
                    disabled={!canAdd || add.isPending}
                  >
                    <Plus className="size-4" aria-hidden /> {add.isPending ? t('evAdding') : t('evAdd')}
                  </Button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
