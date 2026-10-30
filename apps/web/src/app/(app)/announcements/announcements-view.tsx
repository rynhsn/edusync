'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  FilePen,
  Globe,
  Layers,
  Megaphone,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import {
  type AnnouncementStatus,
  AUDIENCES,
  announcementStatus,
  CATEGORIES,
  dateOnlyOrEmpty,
  excerpt,
  isoDay,
  matchesQuery,
} from '@/lib/announcements';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { AnnouncementEditor, type Draft, EMPTY_DRAFT, toBody } from './announcement-editor';
import '../../site/site.css';

interface Row {
  id: string;
  title: string;
  body: string;
  category: 'news' | 'agenda' | 'notice';
  audience: 'public' | 'portal' | 'staff' | 'all';
  eventDate: string | null;
  pinned: boolean;
  status: 'draft' | 'published';
  publishedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
}

const STATUS_FILTERS = ['all', 'published', 'draft', 'pinned'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const draftOf = (r: Row): Draft => ({
  title: r.title,
  body: r.body,
  category: r.category,
  audience: r.audience,
  eventDate: r.eventDate ?? '',
  expires: dateOnlyOrEmpty(r.expiresAt),
  pinned: r.pinned,
  publish: r.status === 'published',
});

export function AnnouncementsView() {
  const t = useTranslations('announcements');
  const te = useTranslations();
  const locale = useLocale() as Locale;
  const { school, can, hasModule } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('announcement:manage');

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState('');
  const [editor, setEditor] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const list = useQuery({
    queryKey: ['announcements', school.schoolId],
    queryFn: async () =>
      unwrap(await api.GET('/v1/announcements', { params: { ...header, query: { limit: 200 } } })),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['announcements', school.schoolId] });
    queryClient.invalidateQueries({ queryKey: ['announcements-feed', school.schoolId] });
  };

  const save = useMutation({
    mutationFn: async (v: { id: string | null; draft: Draft }) =>
      v.id
        ? unwrap(
            await api.PUT('/v1/announcements/{id}', {
              params: { ...header, path: { id: v.id } },
              body: toBody(v.draft),
            }),
          )
        : unwrap(await api.POST('/v1/announcements', { params: header, body: toBody(v.draft) })),
    onSuccess: (_d, v) => {
      setError(null);
      toast.success(v.id ? t('saved') : t('created'));
      refresh();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const togglePublish = useMutation({
    mutationFn: async (r: Row) =>
      unwrap(
        await api.POST(
          r.status === 'published' ? '/v1/announcements/{id}/unpublish' : '/v1/announcements/{id}/publish',
          { params: { ...header, path: { id: r.id } } },
        ),
      ),
    onSuccess: (_d, r) => {
      toast.success(r.status === 'published' ? t('unpublished') : t('published'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const togglePin = useMutation({
    mutationFn: async (r: Row) =>
      unwrap(
        await api.PUT('/v1/announcements/{id}', {
          params: { ...header, path: { id: r.id } },
          body: {
            title: r.title,
            body: r.body,
            category: r.category,
            audience: r.audience,
            eventDate: r.eventDate,
            pinned: !r.pinned,
            status: r.status,
            expiresAt: r.expiresAt,
          },
        }),
      ),
    onSuccess: (_d, r) => {
      toast.success(r.pinned ? t('unpinned') : t('pinned'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/announcements/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  const all = (list.data?.items ?? []) as Row[];
  const now = new Date();
  const counts = {
    all: all.length,
    published: all.filter((r) => r.status === 'published').length,
    draft: all.filter((r) => r.status === 'draft').length,
    pinned: all.filter((r) => r.pinned).length,
  };
  const rows = all.filter(
    (r) =>
      (filter === 'all' ||
        (filter === 'pinned'
          ? r.pinned
          : filter === 'published'
            ? r.status === 'published'
            : r.status === 'draft')) &&
      (!category || r.category === category) &&
      (!audience || r.audience === audience) &&
      matchesQuery(r, q),
  );

  const openNew = () => {
    setError(null);
    setEditor({ id: null, draft: EMPTY_DRAFT });
  };

  const tiles: { key: StatusFilter; icon: typeof Layers; label: string; tone: string }[] = [
    { key: 'all', icon: Layers, label: t('statTotal'), tone: 'text-foreground bg-muted' },
    {
      key: 'published',
      icon: CheckCircle2,
      label: t('statPublished'),
      tone: 'text-emerald-700 bg-emerald-500/15 dark:text-emerald-300',
    },
    {
      key: 'draft',
      icon: FilePen,
      label: t('statDraft'),
      tone: 'text-amber-700 bg-amber-500/15 dark:text-amber-300',
    },
    {
      key: 'pinned',
      icon: Pin,
      label: t('statPinned'),
      tone: 'text-violet-700 bg-violet-500/15 dark:text-violet-300',
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            {can('announcement:manage') && hasModule('website') && (
              <Button variant="outline" nativeButton={false} render={<Link href="/site-settings" />}>
                <Globe className="size-4" aria-hidden /> {t('siteSettings')}
              </Button>
            )}
            {manage && (
              <Button onClick={openNew}>
                <Plus className="size-4" aria-hidden /> {t('add')}
              </Button>
            )}
          </>
        }
      />

      <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-3 border-0 p-0 lg:grid-cols-4">
        <legend className="sr-only">{t('statusLabel')}</legend>
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            aria-pressed={filter === tile.key}
            onClick={() => setFilter(tile.key)}
            className={cn(
              'bg-card focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all outline-none focus-visible:ring-3',
              filter === tile.key
                ? 'border-primary ring-primary/30 shadow-sm ring-2'
                : 'hover:border-primary/40',
            )}
          >
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', tile.tone)}>
              <tile.icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="font-heading block text-2xl leading-none font-bold tabular-nums">
                {list.isPending ? '–' : counts[tile.key]}
              </span>
              <span className="text-muted-foreground mt-1 block truncate text-xs">{tile.label}</span>
            </span>
          </button>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            aria-label={t('searchPlaceholder')}
            className="pl-8"
            value={q}
            placeholder={t('searchPlaceholder')}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <SelectField
          aria-label={t('categoryLabel')}
          className="sm:w-48"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{t('allCategories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label={t('audienceLabel')}
          className="sm:w-56"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        >
          <option value="">{t('allAudiences')}</option>
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {t(`audience.${a}`)}
            </option>
          ))}
        </SelectField>
      </div>

      {list.isPending && (
        <div className="grid gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {list.data && rows.length === 0 && (
        <EmptyState filtered={all.length > 0} canManage={manage} onAdd={openNew} />
      )}

      {rows.length > 0 && (
        <ul className="site-root grid gap-3">
          {rows.map((r) => {
            const status = announcementStatus(r, now);
            return (
              <li
                key={r.id}
                className={cn(
                  'bg-card relative grid gap-3 overflow-hidden rounded-xl border p-4 pl-5 sm:grid-cols-[1fr_auto] sm:items-center',
                  status === 'draft' && 'bg-muted/30',
                )}
              >
                <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1.5', RAIL[r.category])} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="site-chip" data-cat={r.category}>
                      {t(`category.${r.category}`)}
                    </span>
                    <StatusBadge status={status} label={t(`status.${status}`)} />
                    <Badge variant="outline">{t(`audience.${r.audience}`)}</Badge>
                    {r.pinned && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300">
                        <Pin className="size-3.5" aria-hidden /> {t('pinnedBadge')}
                      </span>
                    )}
                    {r.status === 'published' && (r.audience === 'public' || r.audience === 'all') && (
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        <Globe className="size-3.5" aria-hidden /> {t('visibleOnSite')}
                      </span>
                    )}
                  </div>
                  <h2 className="font-heading mt-1.5 text-base leading-snug font-semibold text-balance">
                    {r.title}
                  </h2>
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{excerpt(r.body, 200)}</p>
                  <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {r.eventDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" aria-hidden />
                        {t('eventOn', { date: formatCalendarDate(locale, r.eventDate) })}
                      </span>
                    )}
                    {r.publishedAt && (
                      <span>
                        {t('publishedOn', { date: formatCalendarDate(locale, isoDay(r.publishedAt)) })}
                      </span>
                    )}
                    {r.expiresAt && (
                      <span>{t('expiresOn', { date: formatCalendarDate(locale, isoDay(r.expiresAt)) })}</span>
                    )}
                  </div>
                </div>
                {manage && (
                  <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                    <Button
                      size="sm"
                      variant={r.status === 'published' ? 'outline' : 'default'}
                      disabled={togglePublish.isPending}
                      onClick={() => togglePublish.mutate(r)}
                    >
                      {r.status === 'published' ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                      {r.status === 'published' ? t('unpublish') : t('publish')}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${r.pinned ? t('unpin') : t('pin')}: ${r.title}`}
                      aria-pressed={r.pinned}
                      disabled={togglePin.isPending}
                      onClick={() => togglePin.mutate(r)}
                    >
                      {r.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${t('edit')}: ${r.title}`}
                      onClick={() => {
                        setError(null);
                        setEditor({ id: r.id, draft: draftOf(r) });
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${t('delete')}: ${r.title}`}
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editor && (
        <AnnouncementEditor
          open
          onOpenChange={(o) => !o && setEditor(null)}
          title={editor.id ? t('editTitle') : t('addTitle')}
          submitLabel={t('submit')}
          draft={editor.draft}
          onChange={(d) => setEditor({ id: editor.id, draft: d })}
          error={error}
          onSubmit={() => save.mutateAsync(editor)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('deleteTitle')}
        description={deleting ? t('deleteBody', { title: deleting.title }) : undefined}
        confirmLabel={t('delete')}
        destructive
        pending={remove.isPending}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : Promise.resolve())}
      />
    </PageBody>
  );
}

/** Pita warna di tepi kiri kartu menurut kategori. */
const RAIL: Record<Row['category'], string> = {
  news: 'bg-[var(--sa)]',
  agenda: 'bg-violet-500',
  notice: 'bg-amber-500',
};

function StatusBadge({ status, label }: { status: AnnouncementStatus; label: string }) {
  const tone: Record<AnnouncementStatus, string> = {
    published: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    draft: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    scheduled: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    expired: 'bg-muted text-muted-foreground',
  };
  return <Badge className={tone[status]}>{label}</Badge>;
}

function EmptyState({
  filtered,
  canManage,
  onAdd,
}: {
  filtered: boolean;
  canManage: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations('announcements');
  return (
    <div className="bg-card flex flex-col items-center gap-4 rounded-2xl border border-dashed p-10 text-center">
      <svg viewBox="0 0 160 120" aria-hidden className="w-40" fill="none">
        <circle cx="80" cy="60" r="52" className="fill-primary" opacity="0.1" />
        <path d="M44 66v-12l56-22v56z" className="fill-primary" />
        <rect x="36" y="52" width="14" height="28" rx="4" className="fill-primary" opacity="0.75" />
        <path d="M54 82l6 20h12l-6-20" className="fill-primary" opacity="0.6" />
        <path
          d="M110 48l16-8M110 66h20M110 84l16 8"
          className="stroke-primary"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <div>
        <h2 className="font-heading text-lg font-semibold">{filtered ? t('emptyFiltered') : t('empty')}</h2>
        {!filtered && <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">{t('emptyHint')}</p>}
      </div>
      {!filtered && canManage && (
        <Button onClick={onAdd}>
          <Megaphone className="size-4" aria-hidden /> {t('add')}
        </Button>
      )}
    </div>
  );
}
