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

  it('bukan pemformatan: spasi di dalam penanda, butir daftar, penanda di tengah kata', () => {
    for (const s of ['* butir', '2 * 3 * 4', 'snake_case_name', '*  spasi *', '- butir']) {
      expect(parseWhatsApp(s)).toEqual([{ type: 'text', text: s }]);
    }
  });

  it('blok kode tidak diformat di dalamnya', () => {
    expect(parseWhatsApp('a ```*x*\ny``` b')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'block', text: '*x*\ny' },
      { type: 'text', text: ' b' },
    ]);
  });
});
