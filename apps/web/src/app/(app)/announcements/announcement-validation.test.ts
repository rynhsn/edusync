import { describe, expect, it } from 'vitest';
import { validateAnnouncement } from './announcement-validation';

const ok = { title: 'Libur', body: 'Sekolah libur.', category: 'news', eventDate: '' };

describe('validateAnnouncement', () => {
  it('menerima isian benar', () => expect(validateAnnouncement(ok)).toEqual({}));
  it('judul dan isi wajib', () => {
    expect(validateAnnouncement({ ...ok, title: ' ', body: '' })).toEqual({
      title: { code: 'required' },
      body: { code: 'required' },
    });
  });
  it('batas judul 150 dan isi 5000', () => {
    expect(validateAnnouncement({ ...ok, title: 'a'.repeat(151) }).title).toEqual({
      code: 'tooLong',
      max: 150,
    });
    expect(validateAnnouncement({ ...ok, body: 'a'.repeat(5001) }).body).toEqual({
      code: 'tooLong',
      max: 5000,
    });
    expect(validateAnnouncement({ ...ok, body: 'a'.repeat(5000) })).toEqual({});
  });
  it('menolak tag HTML', () => {
    expect(validateAnnouncement({ ...ok, body: 'halo <script>x</script>' }).body).toMatchObject({
      code: 'custom',
      key: 'announcements.noHtml',
    });
    expect(validateAnnouncement({ ...ok, title: 'a <3 b' })).toEqual({});
    // Sama dengan API: "<" diikuti huruf (juga setelah spasi) dianggap tag HTML.
    expect(validateAnnouncement({ ...ok, title: 'a < b' }).title).toBeDefined();
  });
  it('agenda wajib tanggal acara, kategori lain tidak', () => {
    expect(validateAnnouncement({ ...ok, category: 'agenda' }).eventDate).toEqual({ code: 'required' });
    expect(validateAnnouncement({ ...ok, category: 'agenda', eventDate: '2026-09-01' })).toEqual({});
  });
});
