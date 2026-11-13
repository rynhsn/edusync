import { describe, expect, it } from 'vitest';
import {
  portalReportDocumentSchema,
  projectDescriptiveForPortal,
  REPORT_V2_DOCUMENT_KEYS,
  REPORT_V2_SUBJECT_KEYS,
  reportDocumentResponseSchema,
  reportDocumentSchema,
  reportDocumentSchemaVersion,
  reportDocumentV2Schema,
} from './report-document';

const uuid = (c: string) =>
  `019${c.repeat(5)}-${c.repeat(4)}-7${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`;

const v1 = {
  status: 'draft' as const,
  school: { name: 'Sekolah Uji', address: 'Jl. Uji', city: 'Bandung' },
  semester: { id: uuid('a'), name: 'Ganjil', academicYear: '2026/2027' },
  student: { id: uuid('b'), name: 'Ani', nis: '1', nisn: null, className: '7A', level: '7' },
  subjects: [
    {
      subjectId: uuid('c'),
      name: 'Matematika',
      kkm: 75,
      final: 86,
      predicate: 'B' as const,
      description: 'Baik.',
      belowKkm: false,
    },
    {
      subjectId: uuid('d'),
      name: 'IPA',
      kkm: 70,
      final: null,
      predicate: null,
      description: null,
      belowKkm: false,
    },
  ],
  extracurriculars: [{ name: 'Pramuka', predicate: 'A' as const, note: null }],
  attendance: { sick: 1, excused: 0, absent: 0, late: 2 },
  homeroomNote: 'Pertahankan.',
  homeroomTeacher: { name: 'Bu Wali', nip: null },
  principal: { name: 'Kepala', nip: '1970' },
  rank: { position: 1, of: 30 },
  generatedAt: '2026-11-13T00:00:00.000Z',
};

describe('skema dokumen rapor bersama', () => {
  it('v1: menerima dokumen sah tanpa mengubah satu kunci pun', () => {
    expect(reportDocumentSchema.parse(v1)).toEqual(v1);
    expect(
      reportDocumentSchema.parse({ ...v1, rank: null, homeroomTeacher: null, principal: null }),
    ).toMatchObject({
      rank: null,
    });
  });

  it('v1: menolak bentuk yang rusak (predikat di luar A-D, id bukan uuid, kunci wajib hilang)', () => {
    expect(() => reportDocumentSchema.parse({ ...v1, status: 'archived' })).toThrow();
    expect(() =>
      reportDocumentSchema.parse({ ...v1, subjects: [{ ...v1.subjects[0], predicate: 'E' }] }),
    ).toThrow();
    expect(() => reportDocumentSchema.parse({ ...v1, student: { ...v1.student, id: 'x' } })).toThrow();
    const { homeroomNote: _omit, ...missing } = v1;
    expect(() => reportDocumentSchema.parse(missing)).toThrow();
  });

  it('v1 membuang kunci tak dikenal (perilaku yang membuat skema v2 harus ada di sini)', () => {
    const out = reportDocumentSchema.parse({ ...v1, cocurricularNote: 'x', reportMode: 'descriptive' });
    expect(out).toEqual(v1);
  });

  it('v2: dokumen v1 lewat tanpa kunci baru (sparse); bagian v2 yang sah dipertahankan', () => {
    expect(reportDocumentV2Schema.parse(v1)).toEqual(v1);
    const v2 = {
      ...v1,
      reportMode: 'descriptive' as const,
      cocurricularNote: 'Aktif.',
      developmentNote: 'Berkembang.',
      subjects: [
        {
          ...v1.subjects[0],
          descriptionSource: 'objectives' as const,
          objectives: {
            assessed: 3,
            achieved: 2,
            high: [{ id: uuid('e'), code: '7.1', text: 'Menghitung pecahan' }],
            low: [{ id: uuid('f'), code: null, text: 'Menyajikan data' }],
          },
        },
        { ...v1.subjects[1], descriptionSource: 'manual' as const },
      ],
    };
    expect(reportDocumentV2Schema.parse(v2)).toEqual(v2);
    expect(() => reportDocumentV2Schema.parse({ ...v2, reportMode: 'numeric' })).toThrow();
    expect(() =>
      reportDocumentV2Schema.parse({ ...v2, subjects: [{ ...v2.subjects[1], descriptionSource: 'auto' }] }),
    ).toThrow();
  });
});

describe('reportDocumentSchemaVersion (snapshot sparse)', () => {
  it('1 bila tidak ada bagian v2 (termasuk kunci v2 bernilai undefined)', () => {
    expect(reportDocumentSchemaVersion(v1)).toBe(1);
    expect(reportDocumentSchemaVersion({ ...v1, cocurricularNote: undefined })).toBe(1);
    expect(reportDocumentSchemaVersion({ ...v1, subjects: [] })).toBe(1);
  });

  it('2 bila ada minimal satu bagian v2, di dokumen atau di salah satu mapel', () => {
    for (const k of REPORT_V2_DOCUMENT_KEYS) {
      expect(reportDocumentSchemaVersion({ ...v1, [k]: 'x' })).toBe(2);
    }
    for (const k of REPORT_V2_SUBJECT_KEYS) {
      expect(
        reportDocumentSchemaVersion({ ...v1, subjects: [v1.subjects[0]!, { ...v1.subjects[1]!, [k]: 'x' }] }),
      ).toBe(2);
    }
  });
});

describe('skema respons dan proyeksi portal (tahap 3.2)', () => {
  const guardianResponse = {
    id: uuid('e'),
    guardianId: uuid('f'),
    guardianName: 'Wali Ani',
    text: 'Terima kasih.',
    recordedByKind: 'guardian' as const,
    snapshotVersion: 1,
    outdated: false,
    updatedAt: '2026-11-13T00:00:00.000Z',
  };
  const v2 = {
    ...v1,
    reportMode: 'descriptive' as const,
    cocurricularNote: 'Aktif.',
    developmentNote: 'Baik.',
    schemaVersion: 2 as const,
    guardianResponses: [guardianResponse],
  };

  it('skema respons staf mempertahankan semua kunci v2 (serializer tidak membuangnya)', () => {
    expect(reportDocumentResponseSchema.parse(v2)).toEqual(v2);
    expect(reportDocumentResponseSchema.parse(v1)).toEqual(v1);
    expect(reportDocumentResponseSchema.parse(v1)).not.toHaveProperty('schemaVersion');
  });

  it('skema portal menerima dokumen tanpa angka dan mempertahankan kunci v2', () => {
    const projected = projectDescriptiveForPortal(v2);
    expect(portalReportDocumentSchema.parse(projected)).toEqual(projected);
    expect(portalReportDocumentSchema.parse(v1)).toEqual(v1);
  });

  it('proyeksi deskriptif membuang final, predikat, kkm, belowKkm, dan peringkat; mode numerik tidak berubah', () => {
    const projected = projectDescriptiveForPortal(v2);
    expect(projected).not.toHaveProperty('rank');
    for (const s of projected.subjects) {
      for (const k of ['final', 'predicate', 'kkm', 'belowKkm']) expect(s).not.toHaveProperty(k);
      expect(s).toHaveProperty('name');
    }
    expect(projected.reportMode).toBe('descriptive');
    expect(v2.subjects[0]).toHaveProperty('final');
    expect(projectDescriptiveForPortal(v1)).toBe(v1);
  });
});
