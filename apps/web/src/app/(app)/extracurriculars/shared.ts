import type { LucideIcon } from 'lucide-react';
import {
  BookHeart,
  FlaskConical,
  Globe,
  Heart,
  Laptop,
  Music,
  Palette,
  Sparkles,
  Tent,
  Trophy,
} from 'lucide-react';
import type { Tone } from '@/components/ui-kit';
import { todayIso } from '@/lib/school-time';

/** Helper tampilan yang dipakai daftar dan halaman rinci ekstrakurikuler. */

export const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

export const ATT_STATUSES = ['present', 'excused', 'sick', 'absent'] as const;
export type AttStatus = (typeof ATT_STATUSES)[number];

export const PREDICATES = ['A', 'B', 'C', 'D'] as const;
export type Predicate = (typeof PREDICATES)[number];

/** Jam dari API bisa berformat HH:MM:SS; tampilkan HH:MM. */
export const hhmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : '');

export { todayIso };

/** Awal bulan berjalan (TTTT-BB-01) untuk batas awal laporan. */
export const monthStartIso = () => `${todayIso().slice(0, 8)}01`;

/** Ikon yang boleh dipilih untuk kategori (nama sama dengan daftar tetap di API). */
export const CATEGORY_ICONS = {
  trophy: Trophy,
  palette: Palette,
  book: BookHeart,
  flask: FlaskConical,
  tent: Tent,
  sparkles: Sparkles,
  music: Music,
  laptop: Laptop,
  globe: Globe,
  heart: Heart,
} as const satisfies Record<string, LucideIcon>;
export type CategoryIconKey = keyof typeof CATEGORY_ICONS;
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

/** Nada warna yang boleh dipilih untuk kategori (sama dengan `Tone` di kit tampilan). */
export const CATEGORY_TONE_KEYS = [
  'teal',
  'sky',
  'violet',
  'amber',
  'rose',
  'emerald',
  'slate',
] as const satisfies readonly Tone[];

/** Bentuk kategori dari API yang dipakai tampilan. */
export interface CategoryInfo {
  key: string;
  label: string;
  icon: string;
  tone: string;
  active: boolean;
}

/** Ikon, nada, dan nama tampilan sebuah kategori; kategori tak dikenal jatuh ke ikon netral. */
export function categoryMeta(
  categories: readonly CategoryInfo[] | undefined,
  key: string,
): { icon: LucideIcon; tone: Tone; label: string } {
  const found = categories?.find((c) => c.key === key);
  const icon =
    found && found.icon in CATEGORY_ICONS ? CATEGORY_ICONS[found.icon as CategoryIconKey] : Sparkles;
  const tone: Tone =
    found && (CATEGORY_TONE_KEYS as readonly string[]).includes(found.tone) ? (found.tone as Tone) : 'slate';
  return { icon, tone, label: found?.label ?? key };
}
