'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, GraduationCap, type LucideIcon, Search, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { DocArticle, DocLocale } from '@/lib/docs-types';
import { highlight, rankItems } from '@/lib/search';
import { cn } from '@/lib/utils';

/** Satu halaman yang bisa dibuka lewat pencarian; daftar ini diturunkan dari menu samping kerangkanya. */
export interface SearchPage {
  href: string;
  label: string;
  /** Nama menu induk (mis. "Data induk"), tampil sebagai keterangan. */
  group?: string;
  icon: LucideIcon;
}

/** Siswa dan guru dicari lewat API sekolah; tiap sumber hanya aktif bila penggunanya berizin membacanya. */
export interface PeopleSource {
  schoolId: string;
  students: boolean;
  teachers: boolean;
}

type Kind = 'page' | 'doc' | 'student' | 'teacher';

interface Result {
  id: string;
  kind: Kind;
  href: string;
  title: string;
  hint?: string;
  icon: LucideIcon;
}

const PAGE_LIMIT = 8;
const DOC_LIMIT = 6;
const PEOPLE_LIMIT = 5;
const MIN_PEOPLE_CHARS = 2;
const DEBOUNCE_MS = 250;
const GROUP_ORDER: Kind[] = ['page', 'doc', 'student', 'teacher'];

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Teks dengan bagian yang cocok kueri disorot. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => highlight(text, query), [text, query]);
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: potongan teks statis, urutan tetap
          <mark key={i} className="text-foreground rounded-sm bg-primary/20">
            {p.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: potongan teks statis, urutan tetap
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Pencarian di kepala halaman (palet perintah): tombol + dialog yang juga terbuka dengan Ctrl/Cmd+K. Sumbernya
 * halaman menu kerangka, artikel dokumentasi, dan (panel sekolah) siswa serta guru. Dialog berpola combobox:
 * kolom ketik mengendalikan daftar (listbox) dengan panah atas/bawah, Home/End, Enter, dan Esc.
 */
export function TopbarSearch({
  pages,
  loadDocs,
  docsBase,
  people,
}: {
  pages: SearchPage[];
  /** Memuat artikel dokumentasi panel ini; dipanggil sekali, saat pencarian pertama kali dibuka (agar isi dokumentasi tidak ikut paket awal). */
  loadDocs: () => Promise<DocArticle[]>;
  docsBase: string;
  people?: PeopleSource;
}) {
  const t = useTranslations('shell.search');
  const locale = useLocale() as DocLocale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [docs, setDocs] = useState<DocArticle[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `loadDocs` dipanggil sekali per pemasangan
  useEffect(() => {
    if (!open || docsLoaded) return;
    setDocsLoaded(true);
    // Bila gagal, pencarian tetap jalan untuk halaman (dan siswa/guru) tanpa dokumentasi.
    loadDocs()
      .then(setDocs)
      .catch(() => undefined);
  }, [open, docsLoaded]);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setActive(0);
    }
  };

  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, DEBOUNCE_MS);
  const searchPeople = open && !!people && debounced.length >= MIN_PEOPLE_CHARS;

  const students = useQuery({
    queryKey: ['topbar-search', 'students', people?.schoolId, debounced],
    enabled: searchPeople && !!people?.students,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students', {
          params: {
            header: schoolHeader(people?.schoolId ?? ''),
            query: { q: debounced, limit: PEOPLE_LIMIT },
          },
        }),
      ),
  });
  const teachers = useQuery({
    queryKey: ['topbar-search', 'teachers', people?.schoolId, debounced],
    enabled: searchPeople && !!people?.teachers,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/teachers', {
          params: { header: schoolHeader(people?.schoolId ?? ''), query: { q: debounced } },
        }),
      ),
  });

  const results = useMemo(() => {
    const out: Result[] = [];
    for (const p of rankItems(
      trimmed,
      pages,
      (x) => [x.label, x.group ?? ''],
      trimmed ? PAGE_LIMIT : undefined,
    )) {
      out.push({
        id: `page:${p.href}`,
        kind: 'page',
        href: p.href,
        title: p.label,
        hint: p.group,
        icon: p.icon,
      });
    }
    if (trimmed) {
      const texts = docs.map((a) => ({ a, text: a.text[locale] ?? a.text.id }));
      const found = rankItems(
        trimmed,
        texts,
        ({ text }) => [text.title, text.summary, ...text.sections.map((s) => s.heading)],
        DOC_LIMIT,
      );
      for (const { a, text } of found) {
        out.push({
          id: `doc:${a.slug}`,
          kind: 'doc',
          href: `${docsBase}/${a.slug}`,
          title: text.title,
          hint: text.summary,
          icon: BookOpen,
        });
      }
    }
    if (searchPeople) {
      for (const s of students.data?.items ?? []) {
        out.push({
          id: `student:${s.id}`,
          kind: 'student',
          href: `/students?q=${encodeURIComponent(s.name)}`,
          title: s.name,
          hint: [s.nis, s.className].filter(Boolean).join(' · ') || undefined,
          icon: GraduationCap,
        });
      }
      for (const x of (teachers.data ?? []).slice(0, PEOPLE_LIMIT)) {
        out.push({
          id: `teacher:${x.id}`,
          kind: 'teacher',
          href: `/teachers?q=${encodeURIComponent(x.name)}`,
          title: x.name,
          hint: x.nip ?? undefined,
          icon: UserRound,
        });
      }
    }
    return out;
  }, [trimmed, pages, docs, docsBase, locale, searchPeople, students.data, teachers.data]);

  const groups = GROUP_ORDER.map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) })).filter(
    (g) => g.items.length > 0,
  );
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const pending = searchPeople && (debounced !== trimmed || students.isFetching || teachers.isFetching);
  const peopleFailed = searchPeople && (students.isError || teachers.isError);

  // Baris aktif selalu terlihat saat daftar digulir dengan papan ketik.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bereaksi pada pindah baris aktif
  useEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, results.length]);

  const go = (r: Result) => {
    changeOpen(false);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const last = results.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIndex >= last ? 0 : activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIndex <= 0 ? Math.max(last, 0) : activeIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(last, 0));
    } else if (e.key === 'Enter') {
      const r = results[activeIndex];
      if (r) {
        e.preventDefault();
        go(r);
      }
    }
  };

  const showEmpty = trimmed.length > 0 && results.length === 0 && !pending;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-muted-foreground max-sm:w-8 max-sm:px-0 sm:min-w-44 sm:justify-start sm:gap-2"
        onClick={() => setOpen(true)}
        aria-label={t('open')}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden flex-1 text-left sm:inline">{t('button')}</span>
        <kbd className="bg-muted text-muted-foreground hidden rounded border px-1.5 font-sans text-[11px] lg:inline">
          {t('shortcut')}
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[10%] translate-y-0 content-start gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>

          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={people ? t('placeholderPeople') : t('placeholder')}
              aria-label={t('title')}
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
              autoComplete="off"
              spellCheck={false}
              className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>

          <div
            id={listId}
            role="listbox"
            aria-label={t('title')}
            className="max-h-[min(60vh,28rem)] overflow-y-auto p-2"
          >
            {groups.map((g) => (
              // biome-ignore lint/a11y/useSemanticElements: kelompok di dalam listbox harus role=group, bukan fieldset
              <div
                key={g.kind}
                role="group"
                aria-labelledby={`${uid}-g-${g.kind}`}
                className="mb-1 last:mb-0"
              >
                <div
                  id={`${uid}-g-${g.kind}`}
                  role="presentation"
                  className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase"
                >
                  {t(`groups.${g.kind}`)}
                </div>
                {g.items.map((r) => {
                  const index = results.indexOf(r);
                  const selected = index === activeIndex;
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: papan ketik ditangani kolom combobox (panah, Enter)
                    <div
                      key={r.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => setActive(index)}
                      onClick={() => go(r)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm',
                        selected && 'bg-muted',
                      )}
                    >
                      <r.icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          <Highlighted text={r.title} query={trimmed} />
                        </span>
                        {r.hint && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {r.kind === 'doc' ? <Highlighted text={r.hint} query={trimmed} /> : r.hint}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {showEmpty && (
              <div className="px-3 py-8 text-center text-sm">
                <p className="font-medium break-words">{t('empty', { query: trimmed })}</p>
                <p className="text-muted-foreground mt-1 text-xs">{t('emptyHint')}</p>
              </div>
            )}
            {pending && <p className="text-muted-foreground px-3 py-2 text-xs">{t('searching')}</p>}
            {peopleFailed && <p className="text-destructive px-3 py-2 text-xs">{t('peopleError')}</p>}
          </div>

          <div className="sr-only" role="status" aria-live="polite">
            {trimmed ? t('count', { count: results.length }) : ''}
          </div>

          <div className="text-muted-foreground hidden items-center gap-4 border-t px-3 py-2 text-xs sm:flex">
            <span>{t('hintNavigate')}</span>
            <span>{t('hintOpen')}</span>
            <span>{t('hintClose')}</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
