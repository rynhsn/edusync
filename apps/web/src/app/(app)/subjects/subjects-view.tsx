'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { CurriculumBank } from './curriculum-bank';

interface Draft {
  code: string;
  name: string;
}
const EMPTY: Draft = { code: '', name: '' };

function SubjectFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const tm = useTranslations('masterData');
  return (
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-code`}>{tm('code')}</Label>
        <Input
          id={`${idPrefix}-code`}
          required
          maxLength={20}
          value={draft.code}
          onChange={(e) => onChange({ ...draft, code: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{tm('name')}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
    </div>
  );
}

export function SubjectsView() {
  const t = useTranslations('subjects');
  const tm = useTranslations('masterData');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['subjects', school.schoolId];
  const manage = can('subject:manage');

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<({ id: string } & Draft) | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/subjects', { params: header })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/subjects', { params: header, body: draft })),
    onSuccess: () => {
      setDraft(EMPTY);
      toast.success(tm('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const save = useMutation({
    mutationFn: async (v: { id: string } & Draft) =>
      unwrap(
        await api.PUT('/v1/subjects/{id}', {
          params: { ...header, path: { id: v.id } },
          body: { code: v.code, name: v.name },
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
      unwrap(await api.DELETE('/v1/subjects/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(tm('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={manage ? t('subtitle') : `${t('subtitle')} ${tm('readOnly')}`}
        actions={
          manage && (
            <>
              <CurriculumBank />
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
                <SubjectFields idPrefix="new" draft={draft} onChange={setDraft} />
              </FormDialog>
            </>
          )
        }
      />

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
                <TableHead className="w-32">{tm('code')}</TableHead>
                <TableHead>{tm('name')}</TableHead>
                {manage && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground font-mono text-xs">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  {manage && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={tm('edit')}
                        onClick={() => {
                          setError(null);
                          setEditing({ id: s.id, code: s.code, name: s.name });
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={tm('delete')}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(s.id)}
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
          <SubjectFields
            idPrefix="edit"
            draft={editing}
            onChange={(d) => setEditing({ id: editing.id, ...d })}
          />
        )}
      </FormDialog>
    </PageBody>
  );
}
