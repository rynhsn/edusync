'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Download, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { parseScore, todayIso } from './lib';
import { type PklPlacement, PREDICATE_STYLE, pklKey } from './shared';

interface Period {
  name: string;
  startsOn: string;
  endsOn: string;
}
interface Draft {
  value: string;
  note: string;
}

const LS_KEY = 'edusync.pkl.certificate';

/** Penilaian: nilai sekolah (dapat diisi), nilai industri (baca saja), hasil tertimbang, dan sertifikat. */
export function ScoresPanel({ placement, period }: { placement: PklPlacement; period: Period | null }) {
  const t = useTranslations('pkl');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const writable = placement.canWrite && placement.status !== 'cancelled';

  const sheet = useQuery({
    queryKey: pklKey(school.schoolId, 'scores', placement.id),
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/pkl/placements/{id}/scores', {
          params: { ...header, path: { id: placement.id } },
        }),
      ),
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);

  // Isi ulang isian dari server setiap kali lembar nilai dimuat atau disimpan.
  useEffect(() => {
    if (!sheet.data) return;
    setDrafts(
      Object.fromEntries(
        sheet.data.aspects.map((a) => [
          a.id,
          { value: a.school ? String(a.school.value) : '', note: a.school?.note ?? '' },
        ]),
      ),
    );
  }, [sheet.data]);

  const invalid = Object.values(drafts).some((d) => d.value.trim() !== '' && parseScore(d.value) === null);

  const save = useMutation({
    mutationFn: async () => {
      const records = Object.entries(drafts).flatMap(([aspectId, d]) => {
        const value = parseScore(d.value);
        return value === null ? [] : [{ aspectId, value, note: d.note.trim() || null }];
      });
      return unwrap(
        await api.PUT('/v1/pkl/placements/{id}/scores', {
          params: { ...header, path: { id: placement.id } },
          body: { records },
        }),
      );
    },
    onSuccess: (data) => {
      toast.success(t('scoresSaved'));
      setError(null);
      queryClient.setQueryData(pklKey(school.schoolId, 'scores', placement.id), data);
      queryClient.invalidateQueries({ queryKey: pklKey(school.schoolId) });
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  if (sheet.isPending) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (sheet.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{te(errorKey(sheet.error))}</AlertDescription>
      </Alert>
    );
  }
  const { aspects, result } = sheet.data;
  if (aspects.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
        {t('noAspects')}
      </div>
    );
  }
  const perAspect = new Map(result.perAspect.map((r) => [r.aspectId, r.value]));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <section className="grid gap-3">
        <div className="bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('aspect')}</TableHead>
                <TableHead className="text-right">{t('weight')}</TableHead>
                <TableHead className="min-w-44">{t('schoolScore')}</TableHead>
                <TableHead className="text-right">{t('industryScore')}</TableHead>
                <TableHead className="text-right">{t('aspectAverage')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aspects.map((a) => {
                const d = drafts[a.id] ?? { value: '', note: '' };
                const bad = d.value.trim() !== '' && parseScore(d.value) === null;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.weight}</TableCell>
                    <TableCell>
                      <div className="grid gap-1.5">
                        <Input
                          inputMode="numeric"
                          maxLength={3}
                          className="w-20"
                          aria-label={`${t('schoolScore')}: ${a.name}`}
                          aria-invalid={bad}
                          disabled={!writable}
                          value={d.value}
                          onChange={(e) => setDrafts({ ...drafts, [a.id]: { ...d, value: e.target.value } })}
                        />
                        <Input
                          maxLength={500}
                          aria-label={`${t('note')}: ${a.name}`}
                          placeholder={t('note')}
                          disabled={!writable}
                          value={d.note}
                          onChange={(e) => setDrafts({ ...drafts, [a.id]: { ...d, note: e.target.value } })}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {a.industry ? (
                        <span title={a.industry.note ?? undefined}>{a.industry.value}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right align-top font-semibold tabular-nums">
                      {perAspect.get(a.id) ?? '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {invalid && <p className="text-destructive text-xs">{t('scoreRange')}</p>}
        {writable && (
          <div>
            <Button type="button" disabled={invalid || save.isPending} onClick={() => save.mutate()}>
              <Save className="size-4" aria-hidden /> {t('saveScores')}
            </Button>
          </div>
        )}
      </section>

      {/* Hasil akhir */}
      <aside className="grid h-fit gap-3 rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-teal-50 p-5 text-center dark:border-orange-500/30 dark:from-orange-500/10 dark:to-teal-500/10">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {t('finalResult')}
        </p>
        {result.final === null || result.predicate === null ? (
          <p className="text-muted-foreground py-6 text-sm">{t('unscored')}</p>
        ) : (
          <>
            <p className="font-heading text-5xl font-semibold tabular-nums">{result.final}</p>
            <span
              className={cn(
                'mx-auto inline-flex size-14 items-center justify-center rounded-2xl text-3xl font-bold shadow-sm',
                PREDICATE_STYLE[result.predicate],
              )}
            >
              {result.predicate}
            </span>
            <p className="text-sm font-medium">{t(`predicate.${result.predicate}`)}</p>
            <CertificateDialog
              placement={placement}
              period={period}
              final={result.final}
              predicate={result.predicate}
              aspects={aspects.map((a) => ({
                name: a.name,
                weight: a.weight,
                value: perAspect.get(a.id) ?? null,
              }))}
            />
          </>
        )}
      </aside>
    </div>
  );
}

function CertificateDialog({
  placement,
  period,
  final,
  predicate,
  aspects,
}: {
  placement: PklPlacement;
  period: Period | null;
  final: number;
  predicate: 'A' | 'B' | 'C' | 'D';
  aspects: { name: string; weight: number; value: number | null }[];
}) {
  const t = useTranslations('pkl');
  const { school } = useSchool();
  const [place, setPlace] = useState('');
  const [principal, setPrincipal] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const key = `${LS_KEY}.${school.schoolId}`;

  function load() {
    setDate(todayIso());
    setError(null);
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as { place?: string; principal?: string };
      setPlace(saved.place ?? '');
      setPrincipal(saved.principal ?? '');
    } catch {
      // Penyimpanan tidak tersedia: isian kosong.
    }
  }

  return (
    <FormDialog
      trigger={
        <Button variant="default" size="sm" className="mx-auto">
          <Award className="size-4" aria-hidden /> {t('certificate')}
        </Button>
      }
      title={t('certificate')}
      description={t('certificateDescription')}
      submitLabel={t('certificateDownload')}
      error={error}
      disabled={!period || !date}
      onOpenChange={(o) => o && load()}
      onSubmit={async () => {
        if (!period) return;
        try {
          localStorage.setItem(key, JSON.stringify({ place, principal }));
        } catch {
          // Abaikan.
        }
        try {
          const { downloadCertificatePdf } = await import('./pdf/download');
          await downloadCertificatePdf({
            schoolName: school.schoolName,
            studentName: placement.studentName,
            className: placement.className,
            partnerName: placement.partnerName,
            periodName: period.name,
            startsOn: period.startsOn,
            endsOn: period.endsOn,
            finalScore: final,
            predicate,
            aspects,
            place: place.trim(),
            dateIso: date,
            principalName: principal.trim(),
            industrySupervisorName: placement.industrySupervisorName,
          });
        } catch (e) {
          setError(t('certificateError'));
          throw e;
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="ct-place">{t('certificatePlace')}</Label>
        <Input id="ct-place" maxLength={80} value={place} onChange={(e) => setPlace(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ct-date">{t('certificateDate')}</Label>
        <DatePicker id="ct-date" value={date} onChange={setDate} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ct-principal">{t('certificatePrincipal')}</Label>
        <Input
          id="ct-principal"
          maxLength={120}
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
        />
      </div>
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Download className="size-3.5" aria-hidden /> {t('certificateNote')}
      </p>
    </FormDialog>
  );
}
