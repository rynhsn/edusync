import { EXPORT_COLUMNS, EXPORT_DATASETS } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorKey } from './errors';
import {
  cellText,
  datasetNeedsGrades,
  datasetNeedsSemester,
  exportError,
  exportFallbackFilename,
  exportQueryString,
  exportReady,
  filenameFromDisposition,
} from './export';

const YEAR = '0190a7f0-0000-7000-8000-000000000001';
const SEM = '0190a7f0-0000-7000-8000-000000000002';

describe('dataset ekspor', () => {
  it('semester wajib hanya untuk pilihan mapel, nilai akhir, dan deskripsi', () => {
    expect(EXPORT_DATASETS.filter(datasetNeedsSemester)).toEqual([
      'subject_choices',
      'final_grades',
      'descriptions',
    ]);
  });

  it('modul nilai hanya untuk nilai akhir dan deskripsi', () => {
    expect(EXPORT_DATASETS.filter(datasetNeedsGrades)).toEqual(['final_grades', 'descriptions']);
  });

  it('kamus kolom tersedia untuk setiap dataset dan tidak memuat NIK', () => {
    for (const d of EXPORT_DATASETS) {
      expect(EXPORT_COLUMNS[d].length).toBeGreaterThan(0);
      expect(EXPORT_COLUMNS[d].map((c) => c.key)).not.toContain('nik');
    }
  });
});

describe('exportQueryString', () => {
  it('menyertakan semester hanya bila dataset memintanya', () => {
    expect(
      exportQueryString({ academicYearId: YEAR, semesterId: SEM, dataset: 'rombel', format: 'csv' }),
    ).toBe(`academicYearId=${YEAR}&dataset=rombel&format=csv`);
    expect(
      exportQueryString({ academicYearId: YEAR, semesterId: SEM, dataset: 'final_grades', format: 'json' }),
    ).toBe(`academicYearId=${YEAR}&dataset=final_grades&format=json&semesterId=${SEM}`);
  });
});

describe('exportReady', () => {
  it('butuh tahun ajaran, dan semester untuk dataset per semester', () => {
    expect(exportReady({ academicYearId: '', dataset: 'rombel' })).toBe(false);
    expect(exportReady({ academicYearId: YEAR, dataset: 'rombel' })).toBe(true);
    expect(exportReady({ academicYearId: YEAR, dataset: 'descriptions' })).toBe(false);
    expect(exportReady({ academicYearId: YEAR, semesterId: SEM, dataset: 'descriptions' })).toBe(true);
  });
});

describe('nama berkas', () => {
  it('memakai nama dari Content-Disposition', () => {
    expect(filenameFromDisposition('attachment; filename="rombel-2026.csv"')).toBe('rombel-2026.csv');
    expect(filenameFromDisposition('attachment; filename=rombel.csv')).toBe('rombel.csv');
  });

  it('mendahulukan filename* dan membongkar pengodean', () => {
    expect(
      filenameFromDisposition(`attachment; filename="x.csv"; filename*=UTF-8''kelas%20VII%20A.csv`),
    ).toBe('kelas VII A.csv');
  });

  it('membuang pemisah folder dari nama', () => {
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"')).toBe('....etcpasswd');
  });

  it('null bila header kosong atau tanpa nama', () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition('attachment')).toBeNull();
    expect(filenameFromDisposition('attachment; filename=""')).toBeNull();
  });

  it('nama cadangan memuat format dan dataset', () => {
    expect(exportFallbackFilename('class_subjects', 'json')).toBe('edusync-academic-v1-class_subjects.json');
  });
});

describe('exportError', () => {
  it('membaca kode dan pesan dari badan galat', async () => {
    const res = new Response(
      JSON.stringify({ error: { code: 'dataset_requires_module', message: 'Modul mati' } }),
      {
        status: 400,
      },
    );
    const err = await exportError(res);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('dataset_requires_module');
    expect(errorKey(err)).toBe('errors.dataset_requires_module');
  });

  it('badan bukan JSON tetap menjadi ApiError tanpa kode', async () => {
    const err = await exportError(new Response('<html>', { status: 502 }));
    expect(err.status).toBe(502);
    expect(err.code).toBeUndefined();
    expect(errorKey(err)).toBe('errors.unknown');
  });

  it('429 dikenali dari status', async () => {
    expect(errorKey(await exportError(new Response('', { status: 429 })))).toBe('errors.rate_limited');
  });
});

describe('cellText', () => {
  it('mengubah sel menjadi teks', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(true)).toBe('true');
    expect(cellText(0)).toBe('0');
    expect(cellText('A')).toBe('A');
  });
});
