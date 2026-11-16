import { describe, expect, it } from 'vitest';
import { parseWhatsApp } from './whatsapp-format';

describe('parseWhatsApp', () => {
  it('tebal, miring, coret, dan kode inline', () => {
    expect(parseWhatsApp('Halo *Budi* _ya_ ~batal~ `x`')).toEqual([
      { type: 'text', text: 'Halo ' },
      { type: 'bold', children: [{ type: 'text', text: 'Budi' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'ya' }] },
      { type: 'text', text: ' ' },
      { type: 'strike', children: [{ type: 'text', text: 'batal' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'x' },
    ]);
  });

  it('bersarang dan lintas baris tetap per baris', () => {
    const nodes = parseWhatsApp('*tebal _miring_*\nbaris dua');
    expect(nodes[0]).toEqual({
      type: 'bold',
      children: [
        { type: 'text', text: 'tebal ' },
        { type: 'italic', children: [{ type: 'text', text: 'miring' }] },
      ],
    });
    expect(nodes[1]).toEqual({ type: 'text', text: '\nbaris dua' });
  });

  it('bukan pemformatan: spasi di dalam penanda dan penanda di tengah kata', () => {
    for (const s of ['2 * 3 * 4', 'snake_case_name', 'a *  spasi *', '-tanpa spasi', '1.tanpa spasi']) {
      expect(parseWhatsApp(s)).toEqual([{ type: 'text', text: s }]);
    }
  });

  it('butir daftar "- " dan "* " menjadi satu daftar, berurutan dengan teks di sekitarnya', () => {
    expect(parseWhatsApp('Isi:\n- satu *tebal*\n* dua\nTutup')).toEqual([
      { type: 'text', text: 'Isi:' },
      {
        type: 'bullets',
        items: [
          [
            { type: 'text', text: 'satu ' },
            { type: 'bold', children: [{ type: 'text', text: 'tebal' }] },
          ],
          [{ type: 'text', text: 'dua' }],
        ],
      },
      { type: 'text', text: 'Tutup' },
    ]);
  });

  it('daftar bernomor mengikuti nomor awal', () => {
    expect(parseWhatsApp('3. tiga\n4. empat')).toEqual([
      {
        type: 'numbered',
        start: 3,
        items: [[{ type: 'text', text: 'tiga' }], [{ type: 'text', text: 'empat' }]],
      },
    ]);
  });

  it('kutipan dan daftar berganti blok', () => {
    expect(parseWhatsApp('> kutip\n- butir')).toEqual([
      { type: 'quote', children: [{ type: 'text', text: 'kutip' }] },
      { type: 'bullets', items: [[{ type: 'text', text: 'butir' }]] },
    ]);
  });

  it('blok kode tidak diformat di dalamnya', () => {
    expect(parseWhatsApp('a ```*x*\ny``` b')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'block', text: '*x*\ny' },
      { type: 'text', text: ' b' },
    ]);
  });

  it('kutipan dengan "> " menjadi blok sendiri', () => {
    expect(parseWhatsApp('Halo\n> satu *tebal*\n> dua\nPenutup')).toEqual([
      { type: 'text', text: 'Halo' },
      {
        type: 'quote',
        children: [
          { type: 'text', text: 'satu ' },
          { type: 'bold', children: [{ type: 'text', text: 'tebal' }] },
          { type: 'text', text: '\ndua' },
        ],
      },
      { type: 'text', text: 'Penutup' },
    ]);
  });

  it('tanda > tanpa spasi atau di tengah baris bukan kutipan', () => {
    for (const s of ['>tanpa spasi', 'a > b']) expect(parseWhatsApp(s)).toEqual([{ type: 'text', text: s }]);
  });
});
