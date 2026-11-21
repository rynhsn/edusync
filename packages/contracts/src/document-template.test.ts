import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_TEMPLATE,
  DEFAULT_SIGNATURE_SLOTS,
  DOCUMENT_SECTIONS,
  DOCUMENT_VARIABLES,
  documentTemplateConfigSchema,
  renderDocumentText,
  renderSignatureSlots,
  SAMPLE_DOCUMENT_VARS,
  sectionShown,
  unknownDocumentVariables,
  validateDocumentTemplate,
} from './document-template';

describe('templat dokumen', () => {
  it('templat bawaan sah dan semua bagiannya tampil', () => {
    expect(documentTemplateConfigSchema.safeParse(DEFAULT_DOCUMENT_TEMPLATE).success).toBe(true);
    for (const kind of ['skl', 'pkl_certificate'] as const) {
      expect(validateDocumentTemplate(kind, DEFAULT_DOCUMENT_TEMPLATE)).toEqual([]);
      for (const s of DOCUMENT_SECTIONS[kind]) expect(sectionShown(DEFAULT_DOCUMENT_TEMPLATE, s)).toBe(true);
      // Susunan tanda tangan awal dan data contoh memakai variabel yang dikenal.
      const slots = DEFAULT_SIGNATURE_SLOTS[kind];
      expect(validateDocumentTemplate(kind, { ...DEFAULT_DOCUMENT_TEMPLATE, signatures: slots })).toEqual([]);
      expect(Object.keys(SAMPLE_DOCUMENT_VARS[kind]).sort()).toEqual([...DOCUMENT_VARIABLES[kind]].sort());
    }
  });

  it('variabel tak dikenal ditolak per jenis (variabel PKL tidak berlaku di SKL)', () => {
    expect(unknownDocumentVariables('skl', 'Halo {{nama_murid}} {{ mitra }} {{x}}')).toEqual(['mitra', 'x']);
    const issues = validateDocumentTemplate('skl', {
      ...DEFAULT_DOCUMENT_TEMPLATE,
      body: '{{nilai_akhir}}',
      signatures: [{ label: '{{jabatan}}', name: '', note: '', placeDate: false }],
    });
    expect(issues).toEqual([{ code: 'unknown_variable', names: ['nilai_akhir', 'jabatan'] }]);
    expect(
      validateDocumentTemplate('pkl_certificate', {
        ...DEFAULT_DOCUMENT_TEMPLATE,
        sections: { criteria: false },
      }),
    ).toEqual([{ code: 'unknown_section', names: ['criteria'] }]);
  });

  it('skema membatasi panjang dan jumlah slot', () => {
    const slot = { label: 'a', name: '', note: '', placeDate: false };
    const ok = (signatures: unknown) =>
      documentTemplateConfigSchema.safeParse({ ...DEFAULT_DOCUMENT_TEMPLATE, signatures }).success;
    expect(ok(Array(4).fill(slot))).toBe(true);
    expect(ok(Array(5).fill(slot))).toBe(false);
    expect(ok([{ ...slot, label: 'x'.repeat(81) }])).toBe(false);
    expect(
      documentTemplateConfigSchema.safeParse({ ...DEFAULT_DOCUMENT_TEMPLATE, body: 'x'.repeat(2001) })
        .success,
    ).toBe(false);
  });

  it('render mengisi variabel; yang kosong dihilangkan; baris catatan tanpa nilai disembunyikan', () => {
    expect(renderDocumentText('{{nama_murid}} lulus {{kosong}}.', { nama_murid: 'Ani' })).toBe('Ani lulus.');
    const [a, b, c] = renderSignatureSlots(
      DEFAULT_SIGNATURE_SLOTS.skl.concat([{ label: 'Wali', name: '', note: '', placeDate: false }]),
      {
        kepala_sekolah: 'Drs. K',
        nip_kepala_sekolah: '',
      },
    ).concat([undefined as never]);
    expect(a).toMatchObject({ label: 'Kepala Sekolah', name: 'Drs. K', note: '', placeDate: true });
    expect(b).toMatchObject({ label: 'Wali', name: '', note: '' });
    expect(c).toBeUndefined();
    const [withNip] = renderSignatureSlots(DEFAULT_SIGNATURE_SLOTS.skl, {
      kepala_sekolah: 'K',
      nip_kepala_sekolah: '1965',
    });
    expect(withNip?.note).toBe('NIP 1965');
  });
});
