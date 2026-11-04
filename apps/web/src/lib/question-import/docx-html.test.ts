import { describe, expect, it } from 'vitest';
import { htmlToText } from './docx';
import { parseText } from './text';

describe('htmlToText', () => {
  it('daftar bernomor otomatis Word dipulihkan: soal 1., pilihan A.', () => {
    const html =
      '<ol><li>Ibu kota Indonesia &amp; sekitarnya?<ol><li>Bandung</li><li>Jakarta</li><li>Medan</li></ol></li>' +
      '<li>2 + 2 = ?<ol><li>3</li><li>4</li></ol></li></ol><p>Kunci: B</p>';
    const text = htmlToText(html);
    expect(text).toContain('1. Ibu kota Indonesia & sekitarnya?');
    expect(text).toContain('\nA. Bandung');
    expect(text).toContain('\nB. Jakarta');
    expect(text).toContain('\n2. 2 + 2 = ?');
  });

  it('paragraf biasa tetap utuh dan bisa diurai', () => {
    const html = '<p>1. Berapa 2+3?</p><p>A. 4</p><p>B. 5</p><p>Kunci: B</p><p>Poin: 3</p>';
    const parsed = parseText(htmlToText(html));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ type: 'mcq', answer: 'B', points: 3 });
  });
});
