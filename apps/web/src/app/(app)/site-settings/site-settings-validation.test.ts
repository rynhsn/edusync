import { describe, expect, it } from 'vitest';
import { validateSiteProfile } from './site-settings-validation';

const ok = { email: '', emailActive: true, mapUrl: '', accent: '' };

describe('validateSiteProfile', () => {
  it('semua kosong lolos', () => expect(validateSiteProfile(ok)).toEqual({}));
  it('warna aksen: #RRGGBB, #RGB, atau tanpa pagar diterima; selain itu ditolak', () => {
    expect(validateSiteProfile({ ...ok, accent: '#0d9488' })).toEqual({});
    expect(validateSiteProfile({ ...ok, accent: 'fff' })).toEqual({});
    expect(validateSiteProfile({ ...ok, accent: 'merah' }).accent).toMatchObject({
      code: 'custom',
      key: 'siteSettings.accentInvalid',
    });
  });
  it('email opsional dan diperiksa hanya bila sumber kontak sendiri', () => {
    expect(validateSiteProfile({ ...ok, email: 'x' }).email).toEqual({ code: 'email' });
    expect(validateSiteProfile({ ...ok, email: 'x', emailActive: false })).toEqual({});
    expect(validateSiteProfile({ ...ok, email: 'info@sekolah.sch.id' })).toEqual({});
  });
  it('tautan peta harus http(s) dan maksimal 500', () => {
    expect(validateSiteProfile({ ...ok, mapUrl: 'maps' }).mapUrl).toEqual({ code: 'urlInvalid' });
    expect(validateSiteProfile({ ...ok, mapUrl: 'https://maps.app.goo.gl/abc' })).toEqual({});
    expect(validateSiteProfile({ ...ok, mapUrl: `https://${'a'.repeat(500)}.id` }).mapUrl).toEqual({
      code: 'tooLong',
      max: 500,
    });
  });
});
