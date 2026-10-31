'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookMarked,
  BookOpen,
  FileUp,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  School,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyPanel, StatCard, StatGrid, ToneBadge } from '@/components/ui-kit';
import { ApiError, api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useStaff } from '../../platform-shell';

const KEY = ['platform-reference'];
const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

interface LevelDraft {
  key: string;
  name: string;
  sort: string;
  active: boolean;
}
interface CurDraft {
  key: string;
  name: string;
  description: string;
}
interface SubjectDraft {
  id?: string;
  levelGroup: string;
  code: string;
  name: string;
  sort: string;
}

/** Baca teks CSV/tempelan Excel (pemisah tab, titik koma, atau koma) menjadi baris kode,nama,urutan. */
function parseRows(text: string) {
  const rows: { code: string; name: string; sort?: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/\t|;|,/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const [code, name, sort] = cells;
    if (!code || !name) continue;
    if (rows.length === 0 && /^(kode|code)$/i.test(code)) continue;
    const n = Number(sort);
    rows.push({ code, name, ...(sort && Number.isFinite(n) ? { sort: Math.max(0, Math.round(n)) } : {}) });
  }
  return rows;
}

export function CurriculumView() {
  const t = useTranslations('platformReference');
  const te = useTranslations();
  const { role } = useStaff();
  const canEdit = role === 'admin';
  const queryClient = useQueryClient();

  const ref = useQuery({
    queryKey: KEY,
    queryFn: async () => unwrap(await api.GET('/v1/platform/reference')),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const [picked, setPicked] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [newLevel, setNewLevel] = useState<LevelDraft>({ key: '', name: '', sort: '50', active: true });
  const [editLevel, setEditLevel] = useState<LevelDraft | null>(null);
  const [newCur, setNewCur] = useState<CurDraft>({ key: '', name: '', description: '' });
  const [editCur, setEditCur] = useState<CurDraft | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft | null>(null);
  const [importLevel, setImportLevel] = useState('');
  const [importText, setImportText] = useState('');

  const failed = (e: unknown) => (e instanceof ApiError && e.status === 409 ? t('inUse') : te(errorKey(e)));
  const done = (msg: string) => () => {
    toast.success(msg);
    refresh();
  };

  const saveLevel = useMutation({
    mutationFn: async ({ draft, create }: { draft: LevelDraft; create: boolean }) =>
      create
        ? unwrap(
            await api.POST('/v1/platform/reference/levels', {
              body: { key: draft.key, name: draft.name, sort: num(draft.sort) },
            }),
          )
        : unwrap(
            await api.PUT('/v1/platform/reference/levels/{key}', {
              params: { path: { key: draft.key } },
              body: { name: draft.name, sort: num(draft.sort), active: draft.active },
            }),
          ),
    onSuccess: done(t('saved')),
    onError: (e) => setError(failed(e)),
  });
  const removeLevel = useMutation({
    mutationFn: async (key: string) =>
      unwrap(await api.DELETE('/v1/platform/reference/levels/{key}', { params: { path: { key } } })),
    onSuccess: done(t('deleted')),
    onError: (e) => toast.error(failed(e)),
  });
  const saveCur = useMutation({
    mutationFn: async ({ draft, create }: { draft: CurDraft; create: boolean }) =>
      create
        ? unwrap(await api.POST('/v1/platform/reference/curricula', { body: draft }))
        : unwrap(
            await api.PUT('/v1/platform/reference/curricula/{key}', {
              params: { path: { key: draft.key } },
              body: { name: draft.name, description: draft.description },
            }),
          ),
    onSuccess: (row) => {
      setPicked(row.key);
      done(t('saved'))();
    },
    onError: (e) => setError(failed(e)),
  });
  const removeCur = useMutation({
    mutationFn: async (key: string) =>
      unwrap(await api.DELETE('/v1/platform/reference/curricula/{key}', { params: { path: { key } } })),
    onSuccess: () => {
      setPicked('');
      done(t('deleted'))();
    },
    onError: (e) => toast.error(failed(e)),
  });
  const saveSubject = useMutation({
    mutationFn: async ({ draft, cur }: { draft: SubjectDraft; cur: string }) => {
      const body = {
        levelGroup: draft.levelGroup,
        code: draft.code,
        name: draft.name,
        sort: num(draft.sort),
      };
      return draft.id
        ? unwrap(
            await api.PUT('/v1/platform/reference/subjects/{id}', {
              params: { path: { id: draft.id } },
              body,
            }),
          )
        : unwrap(
            await api.POST('/v1/platform/reference/curricula/{key}/subjects', {
              params: { path: { key: cur } },
              body,
            }),
          );
    },
    onSuccess: done(t('saved')),
    onError: (e) => setError(failed(e)),
  });
  const removeSubject = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/platform/reference/subjects/{id}', { params: { path: { id } } })),
    onSuccess: done(t('deleted')),
    onError: (e) => toast.error(failed(e)),
  });
  const importRows = useMutation({
    mutationFn: async (cur: string) =>
      unwrap(
        await api.POST('/v1/platform/reference/curricula/{key}/subjects/import', {
          params: { path: { key: cur } },
          body: { levelGroup: importLevel, rows: parseRows(importText) },
        }),
      ),
    onSuccess: (res) => {
      toast.success(t('imported', res));
      setImportText('');
      refresh();
    },
    onError: (e) => setError(failed(e)),
  });

  if (ref.isPending) return <Skeleton className="h-64 w-full" />;
  if (!ref.data) return null;
  const { levels, curricula, subjects } = ref.data;
  const current = curricula.find((c) => c.key === (picked || curricula[0]?.key));
  const levelName = (key: string) => levels.find((l) => l.key === key)?.name ?? key;
  const mine = subjects.filter((s) => s.curriculumKey === current?.key);
  const shown = mine.filter((s) => !levelFilter || s.levelGroup === levelFilter);
  const activeLevels = levels.filter((l) => l.active);
  const defaultLevel = activeLevels[0]?.key ?? levels[0]?.key ?? '';

  const levelFields = (d: LevelDraft, set: (d: LevelDraft) => void, creating: boolean, idp: string) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${idp}-key`}>{t('key')}</Label>
        <Input
          id={`${idp}-key`}
          required
          disabled={!creating}
          placeholder="paket_c"
          value={d.key}
          onChange={(e) => set({ ...d, key: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idp}-sort`}>{t('sort')}</Label>
        <Input
          id={`${idp}-sort`}
          inputMode="numeric"
          value={d.sort}
          onChange={(e) => set({ ...d, sort: e.target.value })}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idp}-name`}>{t('name')}</Label>
        <Input
          id={`${idp}-name`}
          required
          maxLength={60}
          value={d.name}
          onChange={(e) => set({ ...d, name: e.target.value })}
        />
      </div>
      {!creating && (
        <label htmlFor={`${idp}-active`} className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            id={`${idp}-active`}
            checked={d.active}
            onCheckedChange={(next) => set({ ...d, active: next })}
          />
          {t('activeHint')}
        </label>
      )}
    </div>
  );

  const curFields = (d: CurDraft, set: (d: CurDraft) => void, creating: boolean, idp: string) => (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor={`${idp}-key`}>{t('key')}</Label>
        <Input
          id={`${idp}-key`}
          required
          disabled={!creating}
          placeholder="merdeka"
          value={d.key}
          onChange={(e) => set({ ...d, key: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idp}-name`}>{t('name')}</Label>
        <Input
          id={`${idp}-name`}
          required
          maxLength={80}
          value={d.name}
          onChange={(e) => set({ ...d, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idp}-desc`}>{t('description')}</Label>
        <Input
          id={`${idp}-desc`}
          maxLength={300}
          value={d.description}
          onChange={(e) => set({ ...d, description: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <PageBody>
      <PageHeader
        icon={BookMarked}
        tone="violet"
        title={t('title')}
        description={canEdit ? t('subtitle') : `${t('subtitle')} ${t('readOnly')}`}
        actions={
          canEdit && (
            <>
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <Plus className="size-4" /> {t('addLevel')}
                  </Button>
                }
                title={t('addLevel')}
                description={t('levelHint')}
                submitLabel={t('add')}
                error={error}
                onOpenChange={() => {
                  setError(null);
                  setNewLevel({ key: '', name: '', sort: '50', active: true });
                }}
                onSubmit={() => saveLevel.mutateAsync({ draft: newLevel, create: true })}
              >
                {levelFields(newLevel, setNewLevel, true, 'nl')}
              </FormDialog>
              <FormDialog
                trigger={
                  <Button>
                    <Plus className="size-4" /> {t('addCurriculum')}
                  </Button>
                }
                title={t('addCurriculum')}
                submitLabel={t('add')}
                error={error}
                onOpenChange={() => {
                  setError(null);
                  setNewCur({ key: '', name: '', description: '' });
                }}
                onSubmit={() => saveCur.mutateAsync({ draft: newCur, create: true })}
              >
                {curFields(newCur, setNewCur, true, 'nc')}
              </FormDialog>
            </>
          )
        }
      />

      <StatGrid>
        <StatCard
          label={t('statLevels')}
          value={activeLevels.length}
          hint={t('statLevelsHint', { total: levels.length })}
          icon={GraduationCap}
          tone="violet"
        />
        <StatCard label={t('statCurricula')} value={curricula.length} icon={Layers} tone="sky" />
        <StatCard label={t('statSubjects')} value={subjects.length} icon={BookOpen} tone="teal" />
        <StatCard
          label={t('statAdoptions')}
          value={curricula.reduce((n, c) => n + c.schoolCount, 0)}
          hint={t('statAdoptionsHint')}
          icon={School}
          tone="amber"
        />
      </StatGrid>

      <section className="grid gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('levelsTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('levelsHint')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {levels.map((l) => (
            <div
              key={l.key}
              className={cn(
                'bg-card relative overflow-hidden rounded-2xl border p-4 transition-shadow hover:shadow-sm',
                !l.active && 'opacity-70',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-heading truncate font-semibold">{l.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">{l.key}</p>
                </div>
                <ToneBadge tone={l.active ? 'emerald' : 'slate'}>
                  {l.active ? t('active') : t('inactive')}
                </ToneBadge>
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                {t('levelUsage', { subjects: l.subjectCount, schools: l.schoolCount })}
              </p>
              {canEdit && (
                <div className="mt-2 flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('edit')} ${l.name}`}
                    onClick={() => {
                      setError(null);
                      setEditLevel({ key: l.key, name: l.name, sort: String(l.sort), active: l.active });
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDialog
                    destructive
                    trigger={
                      <Button size="icon-sm" variant="ghost" aria-label={`${t('delete')} ${l.name}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    }
                    title={t('deleteLevelTitle', { name: l.name })}
                    description={t('deleteLevelBody')}
                    confirmLabel={t('delete')}
                    onConfirm={() => removeLevel.mutateAsync(l.key)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('curriculaTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('curriculaHint')}</p>
        </div>

        {curricula.length === 0 || !current ? (
          <EmptyPanel icon={BookMarked} tone="violet" title={t('emptyTitle')} body={t('emptyBody')} />
        ) : (
          <>
            <div role="tablist" aria-label={t('curriculaTitle')} className="flex flex-wrap gap-2">
              {curricula.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={c.key === current.key}
                  onClick={() => {
                    setPicked(c.key);
                    setLevelFilter('');
                  }}
                  className={cn(
                    'rounded-xl border px-3.5 py-2 text-left text-sm transition-colors',
                    c.key === current.key
                      ? 'border-violet-500/50 bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100'
                      : 'bg-card hover:bg-muted',
                  )}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs tabular-nums">{c.subjectCount}</span>
                </button>
              ))}
            </div>

            <div className="bg-card rounded-2xl border">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-base font-semibold">{current.name}</h3>
                    <span className="text-muted-foreground font-mono text-xs">{current.key}</span>
                    <ToneBadge tone="amber" dot={false}>
                      {t('adoptedBy', { count: current.schoolCount })}
                    </ToneBadge>
                  </div>
                  {current.description && (
                    <p className="text-muted-foreground mt-1 text-sm">{current.description}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <FormDialog
                      trigger={
                        <Button size="sm">
                          <Plus className="size-4" /> {t('addSubject')}
                        </Button>
                      }
                      title={t('addSubject')}
                      submitLabel={t('add')}
                      error={error}
                      onOpenChange={(open) => {
                        setError(null);
                        if (open)
                          setSubjectDraft({
                            levelGroup: levelFilter || defaultLevel,
                            code: '',
                            name: '',
                            sort: String((mine.reduce((m, s) => Math.max(m, s.sort), 0) || 0) + 10),
                          });
                      }}
                      onSubmit={() =>
                        subjectDraft
                          ? saveSubject.mutateAsync({ draft: subjectDraft, cur: current.key })
                          : Promise.resolve()
                      }
                    >
                      {subjectDraft && !subjectDraft.id && (
                        <SubjectFields
                          draft={subjectDraft}
                          onChange={setSubjectDraft}
                          levels={activeLevels}
                          idp="ns"
                        />
                      )}
                    </FormDialog>
                    <FormDialog
                      size="wide"
                      trigger={
                        <Button size="sm" variant="outline">
                          <FileUp className="size-4" /> {t('import')}
                        </Button>
                      }
                      title={t('importTitle', { name: current.name })}
                      description={t('importHint')}
                      submitLabel={t('import')}
                      error={error}
                      disabled={parseRows(importText).length === 0}
                      onOpenChange={(open) => {
                        setError(null);
                        if (open) setImportLevel(levelFilter || defaultLevel);
                      }}
                      onSubmit={() => importRows.mutateAsync(current.key)}
                    >
                      <div className="grid gap-2 sm:max-w-xs">
                        <Label htmlFor="imp-level">{t('level')}</Label>
                        <SelectField
                          id="imp-level"
                          value={importLevel}
                          onChange={(e) => setImportLevel(e.target.value)}
                        >
                          {activeLevels.map((l) => (
                            <option key={l.key} value={l.key}>
                              {l.name}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="imp-file">{t('importFile')}</Label>
                        <Input
                          id="imp-file"
                          type="file"
                          accept=".csv,.tsv,.txt,text/csv,text/plain"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) setImportText(await file.text());
                          }}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="imp-text">{t('importPaste')}</Label>
                        <textarea
                          id="imp-text"
                          rows={7}
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder={'MTK;Matematika;10\nBIN;Bahasa Indonesia;20'}
                          className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus-visible:ring-3"
                        />
                        <p className="text-muted-foreground text-xs">
                          {t('importCount', { count: parseRows(importText).length })}
                        </p>
                      </div>
                    </FormDialog>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${t('edit')} ${current.name}`}
                      onClick={() => {
                        setError(null);
                        setEditCur({
                          key: current.key,
                          name: current.name,
                          description: current.description,
                        });
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <ConfirmDialog
                      destructive
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label={`${t('delete')} ${current.name}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      }
                      title={t('deleteCurTitle', { name: current.name })}
                      description={t('deleteCurBody')}
                      confirmLabel={t('delete')}
                      onConfirm={() => removeCur.mutateAsync(current.key)}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 p-3 pb-0">
                {[
                  { key: '', name: t('allLevels'), n: mine.length },
                  ...levels.map((l) => ({
                    key: l.key,
                    name: l.name,
                    n: mine.filter((s) => s.levelGroup === l.key).length,
                  })),
                ]
                  .filter((l) => l.key === '' || l.n > 0)
                  .map((l) => (
                    <button
                      key={l.key || 'all'}
                      type="button"
                      aria-pressed={levelFilter === l.key}
                      onClick={() => setLevelFilter(l.key)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        levelFilter === l.key
                          ? 'border-violet-500/50 bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100'
                          : 'hover:bg-muted',
                      )}
                    >
                      {l.name} <span className="text-muted-foreground tabular-nums">{l.n}</span>
                    </button>
                  ))}
              </div>

              {shown.length === 0 ? (
                <div className="p-4">
                  <EmptyPanel
                    icon={BookOpen}
                    tone="violet"
                    title={t('noSubjects')}
                    body={t('noSubjectsBody')}
                  />
                </div>
              ) : (
                <div className="p-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">{t('code')}</TableHead>
                        <TableHead>{t('name')}</TableHead>
                        <TableHead>{t('level')}</TableHead>
                        <TableHead className="w-20 text-right">{t('sort')}</TableHead>
                        {canEdit && <TableHead className="w-24" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.code}</TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>
                            <ToneBadge tone="violet" dot={false}>
                              {levelName(s.levelGroup)}
                            </ToneBadge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{s.sort}</TableCell>
                          {canEdit && (
                            <TableCell className="text-right">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`${t('edit')} ${s.name}`}
                                onClick={() => {
                                  setError(null);
                                  setSubjectDraft({
                                    id: s.id,
                                    levelGroup: s.levelGroup,
                                    code: s.code,
                                    name: s.name,
                                    sort: String(s.sort),
                                  });
                                }}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <ConfirmDialog
                                destructive
                                trigger={
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`${t('delete')} ${s.name}`}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                }
                                title={t('deleteSubjectTitle', { name: s.name })}
                                confirmLabel={t('delete')}
                                onConfirm={() => removeSubject.mutateAsync(s.id)}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <FormDialog
        open={!!editLevel}
        title={`${t('edit')} · ${editLevel?.name ?? ''}`}
        submitLabel={t('save')}
        error={error}
        onOpenChange={(open) => !open && setEditLevel(null)}
        onSubmit={() =>
          editLevel ? saveLevel.mutateAsync({ draft: editLevel, create: false }) : Promise.resolve()
        }
      >
        {editLevel && levelFields(editLevel, setEditLevel as (d: LevelDraft) => void, false, 'el')}
      </FormDialog>

      <FormDialog
        open={!!editCur}
        title={`${t('edit')} · ${editCur?.name ?? ''}`}
        submitLabel={t('save')}
        error={error}
        onOpenChange={(open) => !open && setEditCur(null)}
        onSubmit={() =>
          editCur ? saveCur.mutateAsync({ draft: editCur, create: false }) : Promise.resolve()
        }
      >
        {editCur && curFields(editCur, setEditCur as (d: CurDraft) => void, false, 'ec')}
      </FormDialog>

      <FormDialog
        open={!!subjectDraft?.id}
        title={`${t('edit')} · ${subjectDraft?.name ?? ''}`}
        submitLabel={t('save')}
        error={error}
        onOpenChange={(open) => !open && setSubjectDraft(null)}
        onSubmit={() =>
          subjectDraft && current
            ? saveSubject.mutateAsync({ draft: subjectDraft, cur: current.key })
            : Promise.resolve()
        }
      >
        {subjectDraft?.id && (
          <SubjectFields draft={subjectDraft} onChange={setSubjectDraft} levels={levels} idp="es" />
        )}
      </FormDialog>
    </PageBody>
  );
}

function SubjectFields({
  draft,
  onChange,
  levels,
  idp,
}: {
  draft: SubjectDraft;
  onChange: (d: SubjectDraft) => void;
  levels: { key: string; name: string }[];
  idp: string;
}) {
  const t = useTranslations('platformReference');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${idp}-level`}>{t('level')}</Label>
        <SelectField
          id={`${idp}-level`}
          value={draft.levelGroup}
          onChange={(e) => onChange({ ...draft, levelGroup: e.target.value })}
        >
          {levels.map((l) => (
            <option key={l.key} value={l.key}>
              {l.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idp}-code`}>{t('code')}</Label>
        <Input
          id={`${idp}-code`}
          required
          maxLength={20}
          value={draft.code}
          onChange={(e) => onChange({ ...draft, code: e.target.value })}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idp}-name`}>{t('name')}</Label>
        <Input
          id={`${idp}-name`}
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idp}-sort`}>{t('sort')}</Label>
        <Input
          id={`${idp}-sort`}
          inputMode="numeric"
          value={draft.sort}
          onChange={(e) => onChange({ ...draft, sort: e.target.value })}
        />
      </div>
    </div>
  );
}
