'use client';

import type { CardKind } from '@edusync/contracts';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, IdCard, NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PrintPanel, type PrintTemplate } from './print-panel';
import { TemplatesPanel } from './templates-panel';

const SYSTEM_ID = '__system__';

function KindSection({ kind }: { kind: CardKind }) {
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [selected, setSelected] = useState('');

  const list = useQuery({
    queryKey: ['card-templates', school.schoolId, kind],
    queryFn: async () =>
      unwrap(await api.GET('/v1/cards/templates', { params: { ...header, query: { kind } } })),
  });
  const defaults = useQuery({
    queryKey: ['card-defaults', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/cards/templates/defaults', { params: header })),
  });

  const system: PrintTemplate | null = useMemo(() => {
    const d = defaults.data?.[kind];
    return d ? { id: SYSTEM_ID, name: d.name, layout: d.layout, backgroundPath: null, isSystem: true } : null;
  }, [defaults.data, kind]);

  const saved = useMemo(
    () =>
      (list.data ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        layout: x.layout,
        backgroundPath: x.backgroundUrl,
        isSystem: false,
        isDefault: x.isDefault,
      })),
    [list.data],
  );

  if (list.isLoading || defaults.isLoading) return <Skeleton className="h-64 w-full" />;

  // Templat yang dipakai mencetak: pilihan pengguna, lalu bawaan sekolah, lalu bawaan sistem.
  const printable: PrintTemplate[] = saved.length > 0 ? saved : system ? [system] : [];
  const current =
    printable.find((x) => x.id === selected)?.id ??
    saved.find((x) => x.isDefault)?.id ??
    printable[0]?.id ??
    '';

  return (
    <div className="grid gap-6">
      <TemplatesPanel
        kind={kind}
        templates={saved}
        system={system}
        selectedId={current}
        onPrint={setSelected}
      />
      <PrintPanel kind={kind} templates={printable} selectedId={current} onSelect={setSelected} />
    </div>
  );
}

/** Halaman Kartu: templat dan cetak kartu siswa (RFID) serta kartu peserta ujian. */
export function CardsView() {
  const t = useTranslations('cards');
  const { can, hasModule } = useSchool();
  const showExam = hasModule('exams') && can('exam:read');
  const [tab, setTab] = useState<CardKind>('student');
  const active: CardKind = showExam ? tab : 'student';

  const tabs: { kind: CardKind; icon: typeof IdCard; label: string }[] = [
    { kind: 'student', icon: IdCard, label: t('tabStudent') },
    ...(showExam ? [{ kind: 'exam' as const, icon: NotebookPen, label: t('tabExam') }] : []),
  ];

  return (
    <PageBody>
      <PageHeader icon={GraduationCap} tone="violet" title={t('title')} description={t('description')} />

      {can('attendance:configure') && (
        <Alert>
          <AlertDescription>
            {t('rfidNote')}{' '}
            <Link href="/attendance/cards" className="font-medium underline underline-offset-4">
              {t('rfidLink')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label={t('title')}
          className="bg-muted inline-flex w-fit max-w-full gap-1 rounded-xl p-1"
        >
          {tabs.map(({ kind, icon: Icon, label }) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={active === kind}
              onClick={() => setTab(kind)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active === kind
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      <KindSection key={active} kind={active} />
    </PageBody>
  );
}
