'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { buildExport, saveBlob } from '@/lib/sheet';

interface Draft {
  name: string;
  nip: string;
  status: 'active' | 'inactive';
}
const EMPTY: Draft = { name: '', nip: '', status: 'active' };

function TeacherFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const t = useTranslations('teachers');
  const tm = useTranslations('masterData');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-nip`}>{t('nip')}</Label>
        <Input
          id={`${idPrefix}-nip`}
          maxLength={30}
          value={draft.nip}
          onChange={(e) => onChange({ ...draft, nip: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-status`}>{t('status')}</Label>
        <SelectField
          id={`${idPrefix}-status`}
          value={draft.status}
          onChange={(e) => onChange({ ...draft, status: e.target.value as Draft['status'] })}
        >
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </SelectField>
      </div>
    </div>
  );
}

export function TeachersView() {
  const t = useTranslations('teachers');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('teacher:manage');

  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);

  const list = useQuery({
    queryKey: ['teachers', school.schoolId, q],
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/teachers', { params: { ...header, query: q.trim() ? { q: q.trim() } : {} } }),
      ),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['teachers', school.schoolId] });

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/teachers', { params: header, body: { ...draft, nip: draft.nip.trim() || null } }),
      ),
    onSuccess: () => {
      setError(null);
      setDraft(EMPTY);
      toast.success(tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const save = useMutation({
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/teachers/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { name: v.name, nip: v.nip.trim() || null, status: v.status },
        }),
      ),
    onSuccess: () => {
      toast.success(tm('saved'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/teachers/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  async function exportExcel() {
    const rows = list.data ?? [];
    if (rows.length === 0) return void toast.info(tm('exportEmpty'));
    const blob = await buildExport(
      'Guru',
      ['Nama', 'NIP', 'Status'],
      rows.map((r) => [r.name, r.nip, r.status === 'active' ? t('active') : t('inactive')]),
      { textColumns: [2], widths: [30, 24, 14] },
    );
    saveBlob(blob, `guru-${school.schoolSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          <>
            <Button variant="outline" onClick={exportExcel}>
              <Download className="size-4" /> {tm('export')}
            </Button>
            {manage && (
              <>
                <Button variant="outline" nativeButton={false} render={<Link href="/teachers/import" />}>
                  <Upload className="size-4" /> {t('importLink')}
                </Button>
                <FormDialog
                  trigger={
                    <Button>
                      <Plus className="size-4" /> {t('addTitle')}
                    </Button>
                  }
                  title={t('addTitle')}
                  submitLabel={tm('add')}
                  error={error}
                  onOpenChange={() => {
                    setDraft(EMPTY);
                    setError(null);
                  }}
                  onSubmit={() => create.mutateAsync()}
                >
                  <TeacherFields idPrefix="new" draft={draft} onChange={setDraft} />
                </FormDialog>
              </>
            )}
          </>
        }
      />

      <div className="relative max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          aria-label={tm('search')}
          className="pl-8"
          value={q}
          placeholder={t('searchPlaceholder')}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {list.isPending && <Skeleton className="h-40 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tm('loadError')}</AlertDescription>
        </Alert>
      )}
      {list.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">{tm('empty')}</Card>
      )}

      {list.data && list.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tm('name')}</TableHead>
                <TableHead>{t('nip')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                {manage && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {r.nip ?? tm('none')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'active' ? 'secondary' : 'outline'}>
                      {r.status === 'active' ? t('active') : t('inactive')}
                    </Badge>
                  </TableCell>
                  {manage && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={tm('edit')}
                        onClick={() => {
                          setError(null);
                          setEditing({ id: r.id, name: r.name, nip: r.nip ?? '', status: r.status });
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={tm('delete')}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <FormDialog
        open={!!editing}
        title={tm('edit')}
        submitLabel={tm('save')}
        error={error}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={() => (editing ? save.mutateAsync(editing) : Promise.resolve())}
      >
        {editing && (
          <TeacherFields
            idPrefix="edit"
            draft={editing}
            onChange={(d) => setEditing({ id: editing.id, ...d })}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
