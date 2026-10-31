import type { LucideIcon } from 'lucide-react';
import { BookHeart, FlaskConical, Palette, Sparkles, Tent, Trophy } from 'lucide-react';
import type { Tone } from '@/components/ui-kit';

/** Kategori dan helper tampilan yang dipakai daftar dan halaman rinci ekstrakurikuler. */
export const CATEGORIES = ['sport', 'art', 'religion', 'science', 'scout', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

export const ATT_STATUSES = ['present', 'excused', 'sick', 'absent'] as const;
export type AttStatus = (typeof ATT_STATUSES)[number];

export const PREDICATES = ['A', 'B', 'C', 'D'] as const;
export type Predicate = (typeof PREDICATES)[number];

/** Jam dari API bisa berformat HH:MM:SS; tampilkan HH:MM. */
export const hhmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : '');

export const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

/** Awal bulan berjalan (TTTT-BB-01) untuk batas awal laporan. */
export const monthStartIso = () => `${todayIso().slice(0, 8)}01`;

/** Ikon dan warna aksen tiap kategori ekstrakurikuler (kartu daftar dan kepala halaman rinci). */
export const CATEGORY_META: Record<Category, { icon: LucideIcon; tone: Tone }> = {
  sport: { icon: Trophy, tone: 'emerald' },
  art: { icon: Palette, tone: 'rose' },
  religion: { icon: BookHeart, tone: 'teal' },
  science: { icon: FlaskConical, tone: 'sky' },
  scout: { icon: Tent, tone: 'amber' },
  other: { icon: Sparkles, tone: 'violet' },
};
