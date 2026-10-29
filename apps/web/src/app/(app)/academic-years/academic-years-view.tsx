'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Locale } from '@/i18n/config';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { SemestersPanel } from './semesters-panel';

interface Draft {
  name: string;
  startsOn: string;
  endsOn: string;
}
const EMPTY: Draft = { name: '', startsOn: '', endsOn: '' };

export function AcademicYearsView() {
  const t = useTranslations('academicYears');
  const ts = useTranslations('semesters');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const key = ['academic-years', school.schoolId];
  const manage = can('academic_year:manage');

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [semestersFor, setSemestersFor] = useState<{ id: string; name: string } | null>(null);

  const show = (iso: string) => formatCalendarDate(locale, iso);

  const list = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await api.GET('/v1/academic-years', { params: header })),
  });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.POST('/v1/academic-years', { params: header, body: draft })),
    onSuccess: (row) => {
      setDraft(EMPTY);
      toast.success(t('created', { name: row.name }));
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setFormError(te(errorKey(e))),
  });

  const activate = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.PUT('/v1/academic-years/{id}/activate', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('activated'));
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['classes', school.schoolId] });
      queryClient.invalidateQueries({ queryKey: ['students', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          manage && (
            <FormDialog
              trigger={
                <Button>
                  <Plus className="size-4" /> {t('createTitle')}
                </Button>
              }
              title={t('createTitle')}
              description={t('createDescription')}
              submitLabel={t('save')}
              error={formError}
              disabled={!draft.name.trim() || !draft.startsOn || !draft.endsOn}
              onOpenChange={() => {
                setDraft(EMPTY);
                setFormError(null);
              }}
              onSubmit={() => create.mutateAsync()}
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ay-name">{t('name')}</Label>
                  <Input
                    id="ay-name"
                    placeholder="2026/2027"
                    required
                    maxLength={40}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="ay-starts">{t('startsOn')}</Label>
                    <DatePicker
                      id="ay-starts"
                      value={draft.startsOn}
                      onChange={(v) => setDraft({ ...draft, startsOn: v })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ay-ends">{t('endsOn')}</Label>
                    <DatePicker
                      id="ay-ends"
                      value={draft.endsOn}
                      onChange={(v) => setDraft({ ...draft, endsOn: v })}
                    />
                  </div>
                </div>
              </div>
            </FormDialog>
          )
        }
      />

      {list.isPending && <Skeleton className="h-32 w-full" />}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(list.error))}</AlertDescription>
        </Alert>
      )}
      {list.data?.length === 0 && (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          {t('empty')} {manage ? t('emptyManage') : t('emptyReadonly')}
        </Card>
      )}

      {list.data && list.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('name')}</TableHead>
                <TableHead>{t('period')}</TableHead>
                <TableHead>{t('statusHeading')}</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((y) => (
                <TableRow key={y.id}>
                  <TableCell className="font-medium">{y.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {show(y.startsOn)} – {show(y.endsOn)}
                  </TableCell>
                  <TableCell>{y.isActive && <Badge variant="secondary">{t('active')}</Badge>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSemestersFor({ id: y.id, name: y.name })}
                    >
                      <Layers className="size-4" /> {ts('toggle')}
                    </Button>{' '}
                    {manage && !y.isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={activate.isPending}
                        onClick={() => activate.mutate(y.id)}
                      >
                        {t('activate')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!semestersFor} onOpenChange={(open) => !open && setSemestersFor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {ts('title')} · {semestersFor?.name}
            </DialogTitle>
          </DialogHeader>
          {semestersFor && <SemestersPanel yearId={semestersFor.id} />}
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
