import { DEFAULT_DOCUMENT_TEMPLATE, DEFAULT_SIGNATURE_SLOTS } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import { addSlot, draftIssues, getField, removeSlot, setField, toConfig, toDraft } from './document-template';

describe('editor templat dokumen', () => {
  it('bawaan -> draf -> config kembali ke bawaan (tanpa perubahan tidak menyimpan apa-apa)', () => {
    for (const kind of ['skl', 'pkl_certificate'] as const) {
      expect(toConfig(kind, toDraft(kind, DEFAULT_DOCUMENT_TEMPLATE))).toEqual(DEFAULT_DOCUMENT_TEMPLATE);
    }
  });

  it('isian kosong menjadi null, bagian yang dimatikan tersimpan, SKL mengabaikan subjudul', () => {
    const d = toDraft('skl', DEFAULT_DOCUMENT_TEMPLATE);
    const c = toConfig('skl', {
      ...d,
      title: '  SKL  ',
      subtitle: 'diabaikan',
      sections: { ...d.sections, criteria: false },
    });
    expect(c).toMatchObject({
      title: 'SKL',
      subtitle: null,
      sections: { criteria: false },
      signatures: null,
    });
  });

  it('slot tanda tangan: mulai dari susunan bawaan, tambah (maks. 4), hapus, sisip variabel', () => {
    let d = { ...toDraft('pkl_certificate', DEFAULT_DOCUMENT_TEMPLATE), customSignatures: true };
    expect(d.slots).toEqual(DEFAULT_SIGNATURE_SLOTS.pkl_certificate);
    d = addSlot(addSlot(addSlot(d)));
    expect(d.slots).toHaveLength(4);
    expect(addSlot(d).slots).toHaveLength(4);
    d = setField(d, 'slot:2:label', 'Wali Kelas');
    expect(getField(d, 'slot:2:label')).toBe('Wali Kelas');
    expect(toConfig('pkl_certificate', removeSlot(d, 0)).signatures).toHaveLength(3);
  });

  it('draftIssues menandai variabel tak dikenal sebelum simpan', () => {
    const d = setField(toDraft('skl', DEFAULT_DOCUMENT_TEMPLATE), 'body', 'Mitra {{mitra}}');
    expect(draftIssues('skl', d)).toEqual([{ code: 'unknown_variable', names: ['mitra'] }]);
    expect(draftIssues('pkl_certificate', d)).toEqual([]);
  });
});
