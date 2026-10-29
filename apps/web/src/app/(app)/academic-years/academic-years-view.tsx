'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' });
const show = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));

export function AcademicYearsView() {
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const key = ['academic-years', school.schoolId];
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await api.GET('/v1/academic-years', { params: { header: schoolHeader(school.schoolId) } })),
  });

  const create = useMutation({
    mutationFn: async (body: { name: string; startsOn: string; endsOn: string }) =>
      unwrap(
        await api.POST('/v1/academic-years', {
          params: { header: schoolHeader(school.schoolId) },
          body,
        }),
      ),
    onSuccess: (row) => {
      setFormError(null);
      toast.success(`Tahun ajaran ${row.name} dibuat.`);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setFormError(e.message),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create.mutate(
      {
        name: String(data.get('name')),
        startsOn: String(data.get('startsOn')),
        endsOn: String(data.get('endsOn')),
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Tahun ajaran</h1>
        <p className="text-muted-foreground text-sm">{school.schoolName}</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Daftar</CardTitle>
          </CardHeader>
          <CardContent>
            {list.isPending && <Skeleton className="h-20 w-full" />}
            {list.isError && (
              <Alert variant="destructive">
                <AlertDescription>{list.error.message}</AlertDescription>
              </Alert>
            )}
            {list.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Belum ada tahun ajaran.{' '}
                {can('academic_year:manage')
                  ? 'Buat yang pertama di sebelah.'
                  : 'Minta admin atau operator membuatnya.'}
              </p>
            )}
            {list.data && list.data.length > 0 && (
              <ul className="divide-y">
                {list.data.map((y) => (
                  <li key={y.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <span className="font-medium">{y.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {show(y.startsOn)} – {show(y.endsOn)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {can('academic_year:manage') && (
          <Card>
            <CardHeader>
              <CardTitle>Buat tahun ajaran</CardTitle>
              <CardDescription>Nama harus unik di sekolah ini.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="grid gap-4">
                {formError && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="name">Nama</Label>
                  <Input id="name" name="name" placeholder="2026/2027" required maxLength={40} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="startsOn">Mulai</Label>
                  <Input id="startsOn" name="startsOn" type="date" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endsOn">Selesai</Label>
                  <Input id="endsOn" name="endsOn" type="date" required />
                </div>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
