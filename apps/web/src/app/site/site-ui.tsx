import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Pin,
} from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Locale } from '@/i18n/config';
import {
  accentVars,
  daysBetween,
  excerpt,
  initialsOf,
  isoDay,
  mapEmbedSrc,
  paragraphs,
  safeHttpUrl,
  telLink,
  todayIso,
  whatsappLink,
} from '@/lib/announcements';
import { formatCalendarDate } from '@/lib/format-date';
import type { SiteLinks } from '@/lib/site-links';
import type { PublicCategory, PublicDetail, PublicItem, SiteHome } from '@/lib/site-public';
import './site.css';

/* ---------- Kerangka ---------- */

/** Jangkar menu situs; hanya bagian yang ada isinya yang ditampilkan. */
export interface SiteSections {
  news: boolean;
  agenda: boolean;
  about: boolean;
  contact: boolean;
}

export async function SiteShell({
  name,
  accent,
  links,
  sections,
  children,
}: {
  name: string;
  accent: string | null;
  links: SiteLinks;
  sections: SiteSections;
  children: React.ReactNode;
}) {
  const t = await getTranslations('site');
  const nav: { id: keyof SiteSections; label: string }[] = [
    { id: 'news' as const, label: t('navNews') },
    { id: 'agenda' as const, label: t('navAgenda') },
    { id: 'about' as const, label: t('navAbout') },
    { id: 'contact' as const, label: t('navContact') },
  ].filter((n) => sections[n.id]);

  return (
    <div
      className="site-root bg-background text-foreground flex min-h-dvh flex-col"
      style={accentVars(accent)}
    >
      <a
        href="#content"
        className="bg-background focus:ring-ring sr-only z-50 rounded-lg px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2"
      >
        {t('skip')}
      </a>
      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href={links.base}
            aria-label={t('homeLabel', { name })}
            className="site-link flex min-w-0 items-center gap-2.5"
          >
            <Badge name={name} />
            <span className="font-heading truncate text-base font-semibold tracking-tight sm:text-lg">
              {name}
            </span>
          </Link>
          <nav aria-label={t('navMenu')} className="ml-auto hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.id}
                href={`${links.base}#${n.id}`}
                className="site-link text-muted-foreground hover:text-foreground hover:bg-[var(--sa-soft)] rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 md:ml-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <a href={links.login} className="site-btn-ghost ml-1 !min-h-9 !px-4 !py-1.5 !text-sm">
              {t('login')}
            </a>
          </div>
        </div>
        {nav.length > 0 && (
          <nav
            aria-label={t('navMenu')}
            className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:hidden"
          >
            {nav.map((n) => (
              <Link
                key={n.id}
                href={`${links.base}#${n.id}`}
                className="site-link text-muted-foreground bg-[var(--sa-soft)] shrink-0 rounded-full px-3 py-1 text-sm font-medium"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main id="content" className="flex flex-1 flex-col">
        {children}
      </main>
      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm sm:px-6">
          <span className="font-heading text-foreground font-semibold">{name}</span>
          <span>{t('footerMade')}</span>
        </div>
      </footer>
    </div>
  );
}

function Badge({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={`font-heading grid shrink-0 place-items-center bg-[var(--sa)] font-bold text-[var(--sa-ink)] shadow-sm ${
        size === 'lg' ? 'size-16 rounded-2xl text-2xl' : 'size-9 rounded-xl text-sm'
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Pemberitahuan layar penuh (situs/pengumuman tidak tersedia). */
export async function SiteNotice({
  title,
  body,
  homeHref,
  homeLabel,
}: {
  title: string;
  body: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="site-root bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <svg viewBox="0 0 160 120" aria-hidden className="w-44" fill="none">
        <rect x="24" y="52" width="112" height="56" rx="8" fill="var(--sa)" opacity="0.85" />
        <path d="M16 56 80 14l64 42z" fill="var(--sa)" />
        <rect x="68" y="76" width="24" height="32" rx="4" fill="var(--background)" />
        <circle cx="80" cy="40" r="6" fill="var(--background)" />
        <circle cx="132" cy="22" r="10" fill="var(--sa)" opacity="0.25" />
      </svg>
      <h1 className="font-heading max-w-md text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-muted-foreground max-w-md text-pretty">{body}</p>
      {homeHref && homeLabel && (
        <a href={homeHref} className="site-btn">
          {homeLabel}
        </a>
      )}
    </div>
  );
}

/* ---------- Potongan ---------- */

async function dateLabel(iso: string) {
  const locale = (await getLocale()) as Locale;
  return formatCalendarDate(locale, iso);
}

function CategoryChip({ category, label }: { category: PublicCategory; label: string }) {
  return (
    <span className="site-chip" data-cat={category}>
      {label}
    </span>
  );
}

async function NewsCard({
  item,
  href,
  featured,
  delay,
}: {
  item: PublicItem;
  href: string;
  featured?: boolean;
  delay: number;
}) {
  const t = await getTranslations('site');
  const day = item.eventDate ?? (item.publishedAt ? isoDay(item.publishedAt) : null);
  return (
    <Link
      href={href}
      style={{ '--d': `${delay}ms` } as React.CSSProperties}
      className={`site-card site-rise group flex flex-col gap-3 p-5 sm:p-6 ${
        featured ? 'site-feature md:col-span-2 md:row-span-2 md:justify-end md:p-8' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip category={item.category} label={t(`category.${item.category}`)} />
        {item.pinned && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium">
            <Pin className="size-3.5" aria-hidden /> {t('pinned')}
          </span>
        )}
      </div>
      <h3
        className={`font-heading font-semibold tracking-tight text-balance ${
          featured ? 'text-2xl md:text-3xl' : 'text-lg'
        }`}
      >
        {item.title}
      </h3>
      <p
        className={`text-muted-foreground text-pretty ${featured ? 'md:text-base' : 'line-clamp-3 text-sm'}`}
      >
        {item.excerpt}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-1 text-sm">
        <span className="text-muted-foreground">{day ? await dateLabel(day) : ''}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-[var(--sa-text)]">
          {t('readMore')}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function shortMonth(locale: Locale, iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'id', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace('.', '');
}

async function AgendaRow({ item, href, delay }: { item: PublicItem; href: string; delay: number }) {
  const t = await getTranslations('site');
  const locale = (await getLocale()) as Locale;
  const iso = item.eventDate as string;
  const diff = daysBetween(todayIso(), iso);
  const when = diff <= 0 ? t('today') : diff === 1 ? t('tomorrow') : t('inDays', { days: diff });
  return (
    <li style={{ '--d': `${delay}ms` } as React.CSSProperties} className="site-rise relative">
      <Link href={href} className="site-card group flex items-center gap-4 p-4 sm:p-5">
        <div className="site-date" aria-hidden>
          <b>{iso.slice(8, 10).replace(/^0/, '')}</b>
          <span>{shortMonth(locale, iso)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading font-semibold tracking-tight text-balance">{item.title}</h3>
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">{await dateLabel(iso)}</p>
        </div>
        <span className="site-chip hidden shrink-0 sm:inline-flex">{when}</span>
        <ChevronRight
          className="text-muted-foreground size-5 shrink-0 transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </Link>
    </li>
  );
}

/** Ilustrasi hero: gedung sekolah dengan matahari dan buku melayang, berwarna aksen sekolah. */
function HeroArt() {
  return (
    <svg viewBox="0 0 440 340" role="img" aria-hidden className="w-full max-w-md" fill="none">
      <circle cx="350" cy="70" r="40" fill="var(--sa)" opacity="0.9" />
      <circle cx="350" cy="70" r="62" fill="var(--sa)" opacity="0.16" />
      <g className="site-float-slow">
        <ellipse cx="96" cy="76" rx="44" ry="15" fill="var(--sa)" opacity="0.18" />
        <ellipse cx="122" cy="64" rx="28" ry="13" fill="var(--sa)" opacity="0.18" />
      </g>
      <ellipse cx="220" cy="312" rx="190" ry="16" fill="var(--sa)" opacity="0.14" />
      <rect x="92" y="164" width="256" height="148" rx="12" fill="var(--sa)" />
      <rect x="92" y="164" width="256" height="22" rx="12" fill="#fff" opacity="0.14" />
      <path d="M74 170 220 88l146 82z" fill="var(--sa)" />
      <path d="M74 170 220 88l146 82z" fill="#fff" opacity="0.2" />
      <rect x="196" y="232" width="48" height="80" rx="7" fill="var(--background)" />
      <circle cx="220" cy="144" r="17" fill="var(--background)" />
      <path d="M220 134v10h9" stroke="var(--sa)" strokeWidth="3" strokeLinecap="round" />
      {[114, 150, 258, 294].map((x) => (
        <rect key={x} x={x} y="208" width="26" height="34" rx="6" fill="var(--background)" opacity="0.92" />
      ))}
      <g className="site-float" style={{ '--r': '-8deg' } as React.CSSProperties}>
        <rect
          x="36"
          y="214"
          width="58"
          height="42"
          rx="7"
          fill="var(--card)"
          stroke="var(--sa)"
          strokeWidth="3"
        />
        <path d="M65 214v42" stroke="var(--sa)" strokeWidth="3" />
        <path
          d="M44 228h14M44 238h14M72 228h14M72 238h14"
          stroke="var(--sa)"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.6"
        />
      </g>
    </svg>
  );
}

/* ---------- Beranda ---------- */

export async function SiteHomeView({ data, links }: { data: SiteHome; links: SiteLinks }) {
  const t = await getTranslations('site');
  const { school, profile, admission, announcements, agenda } = data;
  const applyOpen = admission.enabled && admission.openLevels.length > 0;
  const [featured, ...restNews] = announcements;
  const nextAgenda = agenda[0];
  const missionLines = (profile.mission ?? '')
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);
  const aboutParas = paragraphs(profile.about);
  const wa = whatsappLink(profile.whatsapp);
  const tel = telLink(profile.phone);
  const mapSrc = mapEmbedSrc(profile.mapUrl);
  const mapLink = safeHttpUrl(profile.mapUrl);
  const hasContact = !!(profile.address || profile.phone || profile.email || profile.whatsapp || mapLink);

  return (
    <>
      {/* Hero */}
      <section className="site-hero" aria-labelledby="site-title">
        <span className="site-blob site-float-slow -top-24 -right-20 size-72" aria-hidden />
        <span className="site-blob -bottom-28 left-1/4 size-64 opacity-60" aria-hidden />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:py-28">
          <div className="grid gap-6">
            <div className="site-rise flex flex-wrap items-center gap-2">
              <span className="site-chip">{t('heroBadge')}</span>
              {applyOpen && (
                <span className="site-chip">
                  <span className="site-pulse" aria-hidden /> {t('admissionOpen')}
                </span>
              )}
            </div>
            <h1
              id="site-title"
              style={{ '--d': '80ms' } as React.CSSProperties}
              className="font-heading site-rise text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl"
            >
              {school.name}
            </h1>
            <p
              style={{ '--d': '160ms' } as React.CSSProperties}
              className="site-rise text-muted-foreground max-w-xl text-lg text-pretty sm:text-xl"
            >
              {profile.tagline ?? t('heroDefaultTagline')}
            </p>
            <div style={{ '--d': '240ms' } as React.CSSProperties} className="site-rise flex flex-wrap gap-3">
              {applyOpen && (
                <a href={links.apply} className="site-btn">
                  {t('apply')} <ArrowRight className="size-4" aria-hidden />
                </a>
              )}
              <a href={links.login} className="site-btn-ghost">
                {t('login')}
              </a>
            </div>
            {applyOpen && (
              <p
                style={{ '--d': '300ms' } as React.CSSProperties}
                className="site-rise text-muted-foreground text-sm"
              >
                {t('admissionLevels', { levels: admission.openLevels.join(', ') })}
              </p>
            )}
          </div>
          <div className="relative mx-auto w-full max-w-md" aria-hidden={!nextAgenda}>
            <HeroArt />
            {nextAgenda?.eventDate && (
              <Link
                href={`${links.base}/announcements/${nextAgenda.id}`}
                className="site-card site-float absolute -bottom-4 left-0 flex max-w-[78%] items-center gap-3 p-3 shadow-lg sm:left-4"
              >
                <div className="site-date" aria-hidden>
                  <b>{nextAgenda.eventDate.slice(8, 10).replace(/^0/, '')}</b>
                  <span>{shortMonth((await getLocale()) as Locale, nextAgenda.eventDate)}</span>
                </div>
                <div className="min-w-0">
                  <p className="site-eyebrow">{t('navAgenda')}</p>
                  <p className="font-heading line-clamp-2 text-sm font-semibold">{nextAgenda.title}</p>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Kabar */}
      <section
        id="news"
        className="scroll-mt-28 mx-auto w-full max-w-6xl px-4 py-14 sm:px-6"
        aria-labelledby="news-h"
      >
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="site-eyebrow">{t('navNews')}</p>
            <h2 id="news-h" className="font-heading mt-1 text-3xl font-bold tracking-tight">
              {t('newsTitle')}
            </h2>
            <p className="text-muted-foreground mt-1">{t('newsSubtitle')}</p>
          </div>
          {announcements.length > 0 && (
            <Link
              href={`${links.base}/announcements`}
              className="site-link inline-flex items-center gap-1 font-semibold text-[var(--sa-text)]"
            >
              {t('allNews')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
        {featured ? (
          <div className="grid gap-4 md:grid-cols-3">
            <NewsCard
              item={featured}
              href={`${links.base}/announcements/${featured.id}`}
              featured
              delay={0}
            />
            {restNews.slice(0, 4).map((n, i) => (
              <NewsCard
                key={n.id}
                item={n}
                href={`${links.base}/announcements/${n.id}`}
                delay={(i + 1) * 90}
              />
            ))}
          </div>
        ) : (
          <EmptyBox text={t('newsEmpty')} />
        )}
      </section>

      {/* Agenda */}
      <section id="agenda" className="scroll-mt-28 bg-[var(--sa-soft)] py-14" aria-labelledby="agenda-h">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="site-eyebrow">{t('navAgenda')}</p>
            <h2 id="agenda-h" className="font-heading mt-1 text-3xl font-bold tracking-tight">
              {t('agendaTitle')}
            </h2>
            <p className="text-muted-foreground mt-1">{t('agendaSubtitle')}</p>
            <CalendarDays className="mt-6 hidden size-16 text-[var(--sa)] opacity-40 lg:block" aria-hidden />
          </div>
          {agenda.length > 0 ? (
            <ol className="site-timeline grid gap-3">
              {agenda
                .filter((a) => a.eventDate)
                .map((a, i) => (
                  <AgendaRow
                    key={a.id}
                    item={a}
                    href={`${links.base}/announcements/${a.id}`}
                    delay={i * 80}
                  />
                ))}
            </ol>
          ) : (
            <EmptyBox text={t('agendaEmpty')} />
          )}
        </div>
      </section>

      {/* Tentang */}
      {(aboutParas.length > 0 || profile.vision || missionLines.length > 0) && (
        <section
          id="about"
          className="scroll-mt-28 mx-auto w-full max-w-6xl px-4 py-14 sm:px-6"
          aria-labelledby="about-h"
        >
          <p className="site-eyebrow">{t('navAbout')}</p>
          <h2 id="about-h" className="font-heading mt-1 mb-7 text-3xl font-bold tracking-tight">
            {t('aboutTitle')}
          </h2>
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className="site-prose text-lg">
              {aboutParas.map((p, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: paragraf statis tanpa urutan berubah
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="grid content-start gap-4">
              {profile.vision && (
                <div className="site-card site-feature p-6">
                  <p className="site-eyebrow">{t('visionTitle')}</p>
                  <p className="font-heading mt-2 text-xl leading-snug font-semibold text-balance">
                    {profile.vision}
                  </p>
                </div>
              )}
              {missionLines.length > 0 && (
                <div className="site-card p-6">
                  <p className="site-eyebrow">{t('missionTitle')}</p>
                  <ol className="mt-3 grid gap-3">
                    {missionLines.map((m, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: daftar statis
                      <li key={i} className="flex gap-3">
                        <span
                          aria-hidden
                          className="font-heading grid size-7 shrink-0 place-items-center rounded-full bg-[var(--sa-soft-2)] text-sm font-bold text-[var(--sa-text)]"
                        >
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{m}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Kontak */}
      {hasContact && (
        <section id="contact" className="scroll-mt-28 bg-[var(--sa-soft)] py-14" aria-labelledby="contact-h">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <p className="site-eyebrow">{t('navContact')}</p>
            <h2 id="contact-h" className="font-heading mt-1 text-3xl font-bold tracking-tight">
              {t('contactTitle')}
            </h2>
            <p className="text-muted-foreground mt-1 mb-7">{t('contactSubtitle')}</p>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <ul className="grid content-start gap-3">
                {profile.address && (
                  <ContactRow icon={<MapPin className="size-5" aria-hidden />} label={t('address')}>
                    <span className="whitespace-pre-line">{profile.address}</span>
                  </ContactRow>
                )}
                {profile.phone && (
                  <ContactRow icon={<Phone className="size-5" aria-hidden />} label={t('phone')}>
                    {tel ? (
                      <a href={tel} className="site-link underline-offset-4 hover:underline">
                        {profile.phone}
                      </a>
                    ) : (
                      profile.phone
                    )}
                  </ContactRow>
                )}
                {profile.email && (
                  <ContactRow icon={<Mail className="size-5" aria-hidden />} label={t('email')}>
                    <a
                      href={`mailto:${profile.email}`}
                      className="site-link break-all underline-offset-4 hover:underline"
                    >
                      {profile.email}
                    </a>
                  </ContactRow>
                )}
                {profile.whatsapp && (
                  <ContactRow icon={<MessageCircle className="size-5" aria-hidden />} label={t('whatsapp')}>
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="site-btn !min-h-9 !px-4 !py-1.5 !text-sm"
                      >
                        {t('chatWhatsapp')}
                      </a>
                    ) : (
                      profile.whatsapp
                    )}
                  </ContactRow>
                )}
              </ul>
              {(mapSrc || mapLink) && (
                <div className="site-card overflow-hidden">
                  {mapSrc ? (
                    <iframe
                      src={mapSrc}
                      title={t('mapTitle', { name: school.name })}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-[4/3] w-full border-0"
                    />
                  ) : (
                    <div className="grid aspect-[4/3] place-items-center gap-3 bg-[var(--sa-soft-2)] p-6 text-center">
                      <MapPin className="size-10 text-[var(--sa-text)]" aria-hidden />
                      <a
                        href={mapLink as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="site-btn"
                      >
                        {t('openMap')}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="site-card flex items-start gap-4 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--sa-soft-2)] text-[var(--sa-text)]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</p>
        <div className="mt-0.5 text-pretty">{children}</div>
      </div>
    </li>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground rounded-2xl border border-dashed p-10 text-center">{text}</div>
  );
}

/* ---------- Daftar dan detail ---------- */

export async function AnnouncementListView({
  name,
  links,
  items,
  total,
  page,
  pageSize,
  category,
}: {
  name: string;
  links: SiteLinks;
  items: PublicItem[];
  total: number;
  page: number;
  pageSize: number;
  category: PublicCategory | '';
}) {
  const t = await getTranslations('site');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const q = (cat: string, p: number) => {
    const sp = new URLSearchParams();
    if (cat) sp.set('category', cat);
    if (p > 1) sp.set('page', String(p));
    const s = sp.toString();
    return `${links.base}/announcements${s ? `?${s}` : ''}`;
  };
  const filters: { key: PublicCategory | ''; label: string }[] = [
    { key: '', label: t('filterAll') },
    { key: 'news', label: t('category.news') },
    { key: 'agenda', label: t('category.agenda') },
    { key: 'notice', label: t('category.notice') },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={links.base}
        className="site-link text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
      >
        <ChevronLeft className="size-4" aria-hidden /> {t('backHome')}
      </Link>
      <h1 className="font-heading mt-4 text-4xl font-bold tracking-tight">{t('listTitle')}</h1>
      <p className="text-muted-foreground mt-1">{t('listSubtitle', { name })}</p>

      <nav aria-label={t('listTitle')} className="mt-6 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key || 'all'}
            href={q(f.key, 1)}
            aria-current={category === f.key ? 'page' : undefined}
            className={`site-link rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              category === f.key
                ? 'border-transparent bg-[var(--sa)] text-[var(--sa-ink)]'
                : 'hover:bg-[var(--sa-soft)]'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyBox text={t('listEmpty')} />
        </div>
      ) : (
        <ul className="mt-8 grid gap-4">
          {items.map((it, i) => (
            <li key={it.id}>
              <NewsCardRow item={it} href={`${links.base}/announcements/${it.id}`} delay={i * 60} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav
          className="mt-10 flex items-center justify-between gap-3"
          aria-label={t('pageInfo', { page, pages })}
        >
          {page > 1 ? (
            <Link href={q(category, page - 1)} className="site-btn-ghost" rel="prev">
              <ChevronLeft className="size-4" aria-hidden /> {t('prev')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-sm">{t('pageInfo', { page, pages })}</span>
          {page < pages ? (
            <Link href={q(category, page + 1)} className="site-btn-ghost" rel="next">
              {t('next')} <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

async function NewsCardRow({ item, href, delay }: { item: PublicItem; href: string; delay: number }) {
  const t = await getTranslations('site');
  const day = item.eventDate ?? (item.publishedAt ? isoDay(item.publishedAt) : null);
  return (
    <Link
      href={href}
      style={{ '--d': `${delay}ms` } as React.CSSProperties}
      className="site-card site-rise group grid gap-2 p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip category={item.category} label={t(`category.${item.category}`)} />
        {item.pinned && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium">
            <Pin className="size-3.5" aria-hidden /> {t('pinned')}
          </span>
        )}
        {day && <span className="text-muted-foreground ml-auto text-sm">{await dateLabel(day)}</span>}
      </div>
      <h2 className="font-heading text-xl font-semibold tracking-tight text-balance">{item.title}</h2>
      <p className="text-muted-foreground line-clamp-2 text-pretty">{item.excerpt}</p>
    </Link>
  );
}

export async function AnnouncementDetailView({ item, links }: { item: PublicDetail; links: SiteLinks }) {
  const t = await getTranslations('site');
  const published = item.publishedAt ? isoDay(item.publishedAt) : null;
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href={`${links.base}/announcements`}
        className="site-link text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
      >
        <ChevronLeft className="size-4" aria-hidden /> {t('backList')}
      </Link>
      <header className="site-rise mt-5 grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip category={item.category} label={t(`category.${item.category}`)} />
          {item.pinned && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium">
              <Pin className="size-3.5" aria-hidden /> {t('pinned')}
            </span>
          )}
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-5xl">
          {item.title}
        </h1>
        <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {published && <span>{t('publishedOn', { date: await dateLabel(published) })}</span>}
        </div>
        {item.eventDate && (
          <div className="site-card site-feature flex items-center gap-4 p-4">
            <CalendarDays className="size-8 shrink-0 text-[var(--sa-text)]" aria-hidden />
            <p className="font-heading text-lg font-semibold">
              {t('eventOn', { date: await dateLabel(item.eventDate) })}
            </p>
          </div>
        )}
      </header>
      <div className="site-prose mt-8 text-lg">
        {paragraphs(item.body).map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: paragraf statis
          <p key={i}>{p}</p>
        ))}
      </div>
    </article>
  );
}

/** Data terstruktur sekolah untuk mesin pencari; `<` di-escape agar JSON aman di dalam <script>. */
export function SchoolJsonLd({ data, url }: { data: SiteHome; url: string | null }) {
  const { school, profile } = data;
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'School',
    name: school.name,
    ...(url ? { url } : {}),
    ...(profile.tagline ? { description: profile.tagline } : {}),
    ...(profile.phone ? { telephone: profile.phone } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.address ? { address: profile.address } : {}),
  }).replace(/</g, '\\u003c');
  // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD hasil JSON.stringify dengan "<" di-escape
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/** Deskripsi meta: slogan, lalu awal teks "tentang", lalu bawaan. */
export function metaDescription(data: SiteHome, fallback: string): string {
  return data.profile.tagline ?? (data.profile.about ? excerpt(data.profile.about, 155) : fallback);
}
