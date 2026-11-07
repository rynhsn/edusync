import { siteLocaleOf, siteParagraphs } from '@edusync/contracts';
import {
  ArrowRight,
  Building2,
  Globe,
  Globe2,
  GraduationCap,
  KeyRound,
  Landmark,
  Mail,
  MapPin,
  MessageCircle,
  Network,
  Phone,
  Rocket,
  School,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonVariants } from '@/components/ui/button';
import { getSiteConfig, safeHref, siteAssetUrl, socialLinks, whatsappHref } from '@/lib/site-config';
import { SITE_ICON_MAP } from '@/lib/site-icons';
import { cn } from '@/lib/utils';
import { LoginLink } from './login-link';

const SOCIAL_LABEL = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X',
  linkedin: 'LinkedIn',
} as const;

const STEPS = [
  { key: 's1', icon: Building2 },
  { key: 's2', icon: Settings2 },
  { key: 's3', icon: Rocket },
] as const;

const AUDIENCE = [
  { key: 'a1', icon: Landmark },
  { key: 'a2', icon: School },
  { key: 'a3', icon: GraduationCap },
  { key: 'a4', icon: Wallet },
  { key: 'a5', icon: Users },
] as const;

const SECURITY = [
  { key: 'sec1', icon: ShieldCheck },
  { key: 'sec2', icon: KeyRound },
  { key: 'sec3', icon: Globe },
] as const;

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** Profil perusahaan untuk pengunjung yang belum masuk di alamat utama. Dirender di server. */
export async function LandingPage({ fresh = false }: { fresh?: boolean } = {}) {
  const [t, locale, config] = await Promise.all([
    getTranslations('landing'),
    getLocale(),
    getSiteConfig(fresh),
  ]);
  const { content } = config;
  const l = siteLocaleOf(content, locale);
  const show = content.sections;
  const brand = content.brandName;
  const year = new Date().getFullYear();
  const heroImage = siteAssetUrl(config, 'hero');
  const logoUrl = siteAssetUrl(config, 'logo');
  const logoDarkUrl = siteAssetUrl(config, 'logo_dark');
  const about = siteParagraphs(l.aboutBody);
  const whatsapp = whatsappHref(content.contact.whatsapp);
  const contactRows = [
    content.contact.email && {
      key: 'email',
      icon: Mail,
      label: t('contactEmail'),
      text: content.contact.email,
      href: `mailto:${content.contact.email}`,
    },
    content.contact.phone && {
      key: 'phone',
      icon: Phone,
      label: t('contactPhone'),
      text: content.contact.phone,
      href: `tel:${content.contact.phone.replace(/[^\d+]/g, '')}`,
    },
    content.contact.whatsapp && {
      key: 'whatsapp',
      icon: MessageCircle,
      label: t('contactWhatsapp'),
      text: content.contact.whatsapp,
      href: whatsapp,
    },
    content.contact.address && {
      key: 'address',
      icon: MapPin,
      label: t('contactAddress'),
      text: content.contact.address,
      href: null,
    },
  ].filter((row) => row !== '' && row !== undefined) as {
    key: string;
    icon: typeof Mail;
    label: string;
    text: string;
    href: string | null;
  }[];
  const socials = socialLinks(content);
  const showFeatures = show.features && content.features.length > 0;
  const showAbout = show.about && about.length > 0;
  const showContact = show.contact && (contactRows.length > 0 || socials.length > 0);
  const nav = [
    showFeatures && { href: '#fitur', label: t('navFeatures') },
    show.how && { href: '#cara-kerja', label: t('navHow') },
    show.audience && { href: '#untuk-siapa', label: t('navAudience') },
    show.security && { href: '#keamanan', label: t('navSecurity') },
    showAbout && { href: '#tentang', label: l.aboutTitle || t('navAbout') },
    showContact && { href: '#kontak', label: t('navContact') },
  ].filter((item): item is { href: string; label: string } => Boolean(item));
  const logo = <Logo brand={brand} src={logoUrl} srcDark={logoUrl ? logoDarkUrl : null} />;

  return (
    <div className="bg-background text-foreground flex flex-1 flex-col overflow-x-clip">
      <a
        href="#konten"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('skip')}
      </a>

      <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link href="/" aria-label={brand} className={cn('rounded-md', focusRing)}>
            {logo}
          </Link>
          <nav
            aria-label={t('navLabel')}
            className="text-muted-foreground hidden items-center gap-6 text-sm md:flex"
          >
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn('hover:text-foreground rounded-sm transition-colors', focusRing)}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <LoginLink label={t('login')} signedInLabel={t('openApp')} />
            <Link href="/register" className={cn(buttonVariants(), 'hidden sm:inline-flex')}>
              {l.ctaPrimary}
            </Link>
          </div>
        </div>
      </header>

      <main id="konten" className="flex-1">
        <section className="relative isolate">
          <div
            aria-hidden
            className="from-accent/70 to-background absolute inset-0 -z-10 bg-gradient-to-b via-transparent"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="bg-accent text-accent-foreground ring-primary/20 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1">
                <Network className="size-3.5 shrink-0" aria-hidden />
                {l.eyebrow}
              </p>
              <h1 className="font-heading mt-5 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
                {l.heroTitle}
              </h1>
              <p className="text-muted-foreground mt-5 max-w-xl text-lg text-pretty">{l.heroSubtitle}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" className={cn(buttonVariants({ size: 'lg' }), 'justify-center')}>
                  {l.ctaPrimary}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <LoginLink
                  label={l.ctaSecondary}
                  signedInLabel={t('openApp')}
                  size="lg"
                  className="justify-center"
                />
              </div>
            </div>

            {heroImage ? (
              <div className="bg-card ring-foreground/10 overflow-hidden rounded-2xl p-2 shadow-sm ring-1">
                {/* biome-ignore lint/performance/noImgElement: gambar unggahan staf platform dari API sendiri */}
                <img
                  src={heroImage}
                  alt={t('heroImageAlt', { brand })}
                  className="h-auto max-h-[28rem] w-full rounded-xl object-contain"
                />
              </div>
            ) : (
              <figure className="bg-card ring-foreground/10 rounded-2xl p-5 shadow-sm ring-1 sm:p-6">
                <figcaption className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
                  {t('heroPreviewLabel')}
                </figcaption>
                <div className="bg-primary text-primary-foreground flex items-center gap-3 rounded-xl px-4 py-3">
                  <Landmark className="size-5 shrink-0" aria-hidden />
                  <span className="text-sm font-medium">{t('heroPreviewMain')}</span>
                </div>
                <ul className="border-primary/30 mt-3 ml-5 space-y-3 border-l-2 pl-5">
                  {['smp-contoh.edusync.web.id', 'smk-contoh.edusync.web.id'].map((host) => (
                    <li key={host} className="bg-muted flex items-center gap-3 rounded-lg px-4 py-3">
                      <School className="text-primary size-4 shrink-0" aria-hidden />
                      <code className="font-mono text-xs break-all sm:text-sm">{host}</code>
                    </li>
                  ))}
                  <li className="border-border text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed px-4 py-3">
                    <Globe2 className="size-4 shrink-0" aria-hidden />
                    <span className="text-xs sm:text-sm">{t('heroPreviewDomain')}</span>
                  </li>
                </ul>
              </figure>
            )}
          </div>
        </section>

        {showFeatures && (
          <section id="fitur" aria-labelledby="fitur-judul" className="scroll-mt-20 border-t py-16 sm:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="max-w-2xl">
                <h2
                  id="fitur-judul"
                  className="font-heading text-3xl font-semibold tracking-tight text-balance"
                >
                  {l.featuresTitle}
                </h2>
                {l.featuresSubtitle && (
                  <p className="text-muted-foreground mt-3 text-pretty">{l.featuresSubtitle}</p>
                )}
              </div>
              <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {content.features.map((feature, i) => {
                  const Icon = SITE_ICON_MAP[feature.icon];
                  const text = feature.text[locale as 'id' | 'en' | 'su'] ?? feature.text.id;
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: daftar statis tanpa id; urutan = identitas
                    <li key={i} className="bg-card ring-foreground/10 rounded-xl p-5 ring-1">
                      <span className="bg-accent text-accent-foreground grid size-10 place-items-center rounded-lg">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <h3 className="font-heading mt-4 font-semibold">{text.title}</h3>
                      {text.description && (
                        <p className="text-muted-foreground mt-1.5 text-sm text-pretty">{text.description}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {show.how && (
          <section
            id="cara-kerja"
            aria-labelledby="cara-judul"
            className="bg-muted/50 scroll-mt-20 border-y py-16 sm:py-20"
          >
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2 id="cara-judul" className="font-heading text-3xl font-semibold tracking-tight text-balance">
                {t('howTitle')}
              </h2>
              <p className="text-muted-foreground mt-3">{t('howBody')}</p>
              <ol className="mt-10 grid gap-4 md:grid-cols-3">
                {STEPS.map(({ key, icon: Icon }, i) => (
                  <li key={key} className="bg-card ring-foreground/10 rounded-xl p-6 ring-1">
                    <div className="flex items-center justify-between">
                      <span className="bg-primary text-primary-foreground font-heading grid size-10 place-items-center rounded-full font-semibold">
                        {i + 1}
                      </span>
                      <Icon className="text-muted-foreground size-5" aria-hidden />
                    </div>
                    <h3 className="font-heading mt-4 font-semibold">{t(`${key}Title`)}</h3>
                    <p className="text-muted-foreground mt-1.5 text-sm text-pretty">{t(`${key}Body`)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {show.audience && (
          <section id="untuk-siapa" aria-labelledby="siapa-judul" className="scroll-mt-20 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2
                id="siapa-judul"
                className="font-heading text-3xl font-semibold tracking-tight text-balance"
              >
                {t('audienceTitle')}
              </h2>
              <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
                {AUDIENCE.map(({ key, icon: Icon }) => (
                  <li key={key} className="border-border border-t-2 pt-4">
                    <Icon className="text-primary size-6" aria-hidden />
                    <h3 className="font-heading mt-3 font-semibold">{t(`${key}Title`)}</h3>
                    <p className="text-muted-foreground mt-1.5 text-sm text-pretty">{t(`${key}Body`)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {show.security && (
          <section
            id="keamanan"
            aria-labelledby="aman-judul"
            className="bg-primary text-primary-foreground scroll-mt-20 py-16 sm:py-20"
          >
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2 id="aman-judul" className="font-heading text-3xl font-semibold tracking-tight text-balance">
                {t('securityTitle')}
              </h2>
              <p className="text-primary-foreground/80 mt-3 max-w-2xl text-pretty">{t('securityBody')}</p>
              <ul className="mt-10 grid gap-4 md:grid-cols-3">
                {SECURITY.map(({ key, icon: Icon }) => (
                  <li
                    key={key}
                    className="bg-primary-foreground/10 ring-primary-foreground/20 rounded-xl p-5 ring-1"
                  >
                    <Icon className="text-amber size-6" aria-hidden />
                    <h3 className="font-heading mt-3 font-semibold">{t(`${key}Title`)}</h3>
                    <p className="text-primary-foreground/80 mt-1.5 text-sm text-pretty">{t(`${key}Body`)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {showAbout && (
          <section
            id="tentang"
            aria-labelledby="tentang-judul"
            className="scroll-mt-20 border-t py-16 sm:py-20"
          >
            <div className="mx-auto max-w-3xl px-4 sm:px-6">
              <h2
                id="tentang-judul"
                className="font-heading text-3xl font-semibold tracking-tight text-balance"
              >
                {l.aboutTitle || t('navAbout')}
              </h2>
              <div className="text-muted-foreground mt-4 space-y-4 text-pretty">
                {about.map((paragraph) => (
                  <p key={paragraph} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </section>
        )}

        {showContact && (
          <section
            id="kontak"
            aria-labelledby="kontak-judul"
            className="bg-muted/50 scroll-mt-20 border-y py-16 sm:py-20"
          >
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2
                id="kontak-judul"
                className="font-heading text-3xl font-semibold tracking-tight text-balance"
              >
                {t('contactTitle')}
              </h2>
              <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {contactRows.map(({ key, icon: Icon, label, text, href }) => (
                  <li key={key} className="bg-card ring-foreground/10 rounded-xl p-5 ring-1">
                    <Icon className="text-primary size-5" aria-hidden />
                    <p className="text-muted-foreground mt-3 text-xs font-medium tracking-wide uppercase">
                      {label}
                    </p>
                    {href ? (
                      <a
                        href={safeHref(href) ?? href}
                        className={cn(
                          'mt-1 block text-sm font-medium break-words hover:underline',
                          focusRing,
                        )}
                      >
                        {text}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm font-medium break-words whitespace-pre-line">{text}</p>
                    )}
                  </li>
                ))}
              </ul>
              {socials.length > 0 && (
                <p className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <span className="font-medium">{t('socialLabel')}</span>
                  {socials.map((social) => (
                    <a
                      key={social.key}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'hover:text-foreground rounded-sm underline-offset-4 hover:underline',
                        focusRing,
                      )}
                    >
                      {SOCIAL_LABEL[social.key]}
                    </a>
                  ))}
                </p>
              )}
            </div>
          </section>
        )}

        {show.cta && (
          <section aria-labelledby="cta-judul" className="py-16 sm:py-20">
            <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
              <h2 id="cta-judul" className="font-heading text-3xl font-semibold tracking-tight text-balance">
                {t('ctaTitle')}
              </h2>
              <p className="text-muted-foreground mt-3 text-pretty">{t('ctaBody')}</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/register" className={cn(buttonVariants({ size: 'lg' }), 'justify-center')}>
                  {l.ctaPrimary}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <LoginLink
                  label={t('login')}
                  signedInLabel={t('openApp')}
                  size="lg"
                  className="justify-center"
                />
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            {logo}
            {l.tagline && <p className="text-muted-foreground mt-2 text-sm">{l.tagline}</p>}
            {l.footerText && <p className="text-muted-foreground mt-1 text-sm">{l.footerText}</p>}
          </div>
          <nav
            aria-label={t('footerNav')}
            className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm"
          >
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn('hover:text-foreground rounded-sm', focusRing)}
              >
                {item.label}
              </a>
            ))}
            <Link href="/login" className={cn('hover:text-foreground rounded-sm', focusRing)}>
              {t('login')}
            </Link>
            {socials.map((social) => (
              <a
                key={social.key}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('hover:text-foreground rounded-sm', focusRing)}
              >
                {SOCIAL_LABEL[social.key]}
              </a>
            ))}
          </nav>
          <p className="text-muted-foreground text-xs">{t('footerCopyright', { year, brand })}</p>
        </div>
      </footer>
    </div>
  );
}
