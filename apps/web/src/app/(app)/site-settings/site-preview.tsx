'use client';

import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { accentVars, excerpt, initialsOf } from '@/lib/announcements';
import '../../site/site.css';

export interface PreviewProfile {
  tagline: string;
  about: string;
  vision: string;
  address: string;
  phone: string;
  email: string;
  whatsapp: string;
  accent: string;
}

/**
 * Pratinjau langsung beranda situs dalam bingkai ponsel, memakai kelas gaya yang sama dengan situs publik
 * (site.css) sehingga warna aksen yang dipilih terlihat persis seperti hasil akhirnya.
 */
export function SitePreview({
  name,
  profile,
  published,
}: {
  name: string;
  profile: PreviewProfile;
  published: boolean;
}) {
  const t = useTranslations('siteSettings');
  const hasContact = profile.address || profile.phone || profile.email || profile.whatsapp;
  return (
    <div className="mx-auto w-full max-w-[22rem]">
      <div className="bg-foreground/90 rounded-[2.2rem] p-2.5 shadow-xl">
        <div
          className="site-root bg-background relative h-[34rem] overflow-y-auto overscroll-contain rounded-[1.7rem] text-[13px]"
          style={accentVars(profile.accent || null)}
        >
          <div className="bg-background/85 sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-2 backdrop-blur">
            <span
              aria-hidden
              className="font-heading grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--sa)] text-xs font-bold text-[var(--sa-ink)]"
            >
              {initialsOf(name)}
            </span>
            <span className="font-heading truncate text-sm font-semibold">{name}</span>
          </div>

          <div className="site-hero px-4 py-8">
            <span className="site-chip">{published ? t('publishedBadge') : t('draftBadge')}</span>
            <h3 className="font-heading mt-3 text-2xl leading-tight font-bold tracking-tight text-balance">
              {name}
            </h3>
            <p className="text-muted-foreground mt-2 text-sm text-pretty">
              {profile.tagline.trim() || t('previewTaglineEmpty')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="site-btn !min-h-9 !px-4 !py-1.5 !text-xs">
                {t('previewApply')} <ArrowRight className="size-3.5" aria-hidden />
              </span>
              <span className="site-btn-ghost !min-h-9 !px-4 !py-1.5 !text-xs">{t('previewLogin')}</span>
            </div>
          </div>

          <div className="grid gap-3 p-4">
            <div>
              <p className="site-eyebrow">{t('previewAbout')}</p>
              <p className="mt-1.5 text-pretty">
                {profile.about.trim() ? (
                  excerpt(profile.about, 220)
                ) : (
                  <span className="text-muted-foreground">{t('previewAboutEmpty')}</span>
                )}
              </p>
            </div>
            {profile.vision.trim() && (
              <div className="site-card site-feature p-3.5">
                <p className="site-eyebrow">{t('vision')}</p>
                <p className="font-heading mt-1 text-sm leading-snug font-semibold text-balance">
                  {excerpt(profile.vision, 140)}
                </p>
              </div>
            )}
            {hasContact && (
              <ul className="grid gap-2 pt-1">
                {profile.address.trim() && (
                  <PreviewRow icon={<MapPin className="size-3.5" aria-hidden />} text={profile.address} />
                )}
                {profile.phone.trim() && (
                  <PreviewRow icon={<Phone className="size-3.5" aria-hidden />} text={profile.phone} />
                )}
                {profile.email.trim() && (
                  <PreviewRow icon={<Mail className="size-3.5" aria-hidden />} text={profile.email} />
                )}
                {profile.whatsapp.trim() && (
                  <PreviewRow
                    icon={<MessageCircle className="size-3.5" aria-hidden />}
                    text={profile.whatsapp}
                  />
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[var(--sa-soft-2)] text-[var(--sa-text)]">
        {icon}
      </span>
      <span className="min-w-0 pt-0.5 break-words">{text}</span>
    </li>
  );
}
