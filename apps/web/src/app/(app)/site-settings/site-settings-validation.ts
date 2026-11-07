/**
 * Aturan isian profil situs sekolah (murni, mudah diuji). Mengikuti zod di apps/api/src/routes/announcements.ts
 * (profileBody). Panjang teks dijaga maxLength di isian; yang diperiksa di sini: email, tautan peta, dan warna aksen.
 * Warna: klien menerima #RGB dan tanpa tanda pagar lalu menormalkannya ke #RRGGBB sebelum kirim (normalizeHex).
 */

import type { FieldErrors } from '@/lib/form-validation';
import { normalizeHex } from '../../../lib/announcements';
import { compactErrors, customIssue } from '../../../lib/form-issues';
import { optionalEmail, optionalUrl } from '../../../lib/form-issues-extra';

export interface SiteProfileValues {
  email: string;
  /** Email hanya diisi dari formulir bila sumber kontak "sendiri"; bila ikut identitas sekolah tidak diperiksa. */
  emailActive: boolean;
  mapUrl: string;
  accent: string;
}
export type SiteProfileField = 'accent' | 'email' | 'mapUrl';
export const SITE_PROFILE_ORDER: SiteProfileField[] = ['accent', 'email', 'mapUrl'];

export function validateSiteProfile(v: SiteProfileValues): FieldErrors<SiteProfileField> {
  const accent = v.accent.trim();
  return compactErrors<SiteProfileField>([
    [
      'accent',
      accent === '' || normalizeHex(accent) !== null ? undefined : customIssue('siteSettings.accentInvalid'),
    ],
    ['email', v.emailActive ? optionalEmail(v.email, 254) : undefined],
    ['mapUrl', optionalUrl(v.mapUrl, 500)],
  ]);
}
