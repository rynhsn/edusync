'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { IconTile } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';

/**
 * Sakelar rapor SMK (tahap 5.2): kelompokkan mapel menurut kelompok (Umum/Kejuruan) dan tampilkan bidang/program/konsentrasi
 * keahlian di kop. Hanya jenjang kejuruan dengan modul PKL; disimpan langsung (endpoint sendiri, bukan bagian formulir di atas).
 */
export function VocationalReportCard() {
  const t = useTranslations('vocational');
  const te = useTranslations();
  const { school, can, hasModule } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const show = school.educationProfile?.vocational === true && hasModule('internship');
  const key = ['vocational', school.schoolId, 'report-setting'];

  const setting = useQuery({
    queryKey: key,
    enabled: show,
    queryFn: async () => unwrap(await api.GET('/v1/vocational/settings/report', { params: header })),
  });
  const save = useMutation({
    mutationFn: async (reportGrouped: boolean) =>
      unwrap(await api.PUT('/v1/vocational/settings/report', { params: header, body: { reportGrouped } })),
    onSuccess: () => {
      toast.success(t('reportSaved'));
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['report-card', school.schoolId] });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  if (!show) return null;
  const manage = can('report_card:manage');
  return (
    <Card className="gap-3 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex items-start gap-3">
        <IconTile icon={Briefcase} tone="sky" />
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('reportTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('reportHint')}</p>
        </div>
      </div>
      {setting.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{te(errorKey(setting.error))}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex items-start gap-3">
          <Checkbox
            id="rc-reportGrouped"
            checked={setting.data?.reportGrouped ?? false}
            disabled={!manage || setting.isPending || save.isPending}
            onCheckedChange={(v) => save.mutate(v === true)}
          />
          <div className="grid gap-0.5">
            <Label htmlFor="rc-reportGrouped">{t('reportGrouped')}</Label>
            <p className="text-muted-foreground text-sm">{t('reportGroupedHint')}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
