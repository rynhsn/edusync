import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/theme/ThemeProvider';
import { THEMES, type Theme } from '@/theme/storage';
import { LOCALES, LANGUAGE_NAMES, useTranslation, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';

const ICONS: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL_KEYS: Record<Theme, MessageKey> = { light: 'appearance.themeLight', dark: 'appearance.themeDark', system: 'appearance.themeSystem' };

/**
 * Theme switcher and language picker, mounted in the signed-in sidebar and on the public auth pages.
 *
 * The two groups sit side by side; each group is a single labelled radiogroup.
 * Icons alone are not an accessible name, so every segment carries screen-reader text and a native
 * title. Language names are endonyms (English / Bahasa Indonesia / Basa Sunda) and never translated.
 */
export function AppearanceControls({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useTranslation();
  return <div className={cn('inline-flex items-center gap-1.5', className)}>
    <div role="radiogroup" aria-label={t('appearance.themeLabel')} className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
      {THEMES.map(({ value }) => {
        const Icon = ICONS[value];
        const label = t(THEME_LABEL_KEYS[value]);
        const active = theme === value;
        return <button key={value} type="button" role="radio" aria-checked={active} onClick={() => setTheme(value)} title={label} className={cn('grid h-8 w-8 place-items-center rounded-md transition-colors', active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground')}><Icon size={15} aria-hidden="true" /><span className="sr-only">{label}</span></button>;
      })}
    </div>
    <div role="radiogroup" aria-label={t('appearance.languageLabel')} className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
      {LOCALES.map((code) => {
        const active = locale === code;
        return <button key={code} type="button" role="radio" aria-checked={active} onClick={() => setLocale(code)} title={LANGUAGE_NAMES[code]} aria-label={LANGUAGE_NAMES[code]} className={cn('grid h-8 w-8 place-items-center rounded-md text-xs font-semibold transition-colors', active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground')}>{code.toUpperCase()}</button>;
      })}
    </div>
  </div>;
}
