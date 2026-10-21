/**
 * Storage keys and theme constants shared by the React provider and by the inline boot script
 * in `index.html`.
 *
 * The boot script runs before the bundle loads and cannot import this module, so the key strings
 * are duplicated there. Keep both copies in sync — the script carries a matching comment.
 *
 * The keys are namespaced per app: the platform console and the school console can be open in the
 * same browser, and each keeps its own theme and language choice.
 */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key holding the school user's theme choice. Mirrored in `index.html`. */
export const THEME_STORAGE_KEY = 'edusync-school.theme';

/** localStorage key holding the school user's language choice. Mirrored in `index.html`. */
export const LOCALE_STORAGE_KEY = 'edusync-school.locale';

/** Browser chrome colour (`<meta name="theme-color">`) for each resolved theme. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f4f7f8',
  dark: '#0b1418',
};

/** The three theme options, in display order. Labels are translated at the call site. */
export const THEMES: readonly { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}
