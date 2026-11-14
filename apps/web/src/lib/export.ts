import {
  EXPORT_FORMAT_NAME,
  EXPORT_GRADE_DATASETS,
  EXPORT_SEMESTER_DATASETS,
  type ExportDataset,
  type ExportFormat,
} from '@edusync/contracts';
import { ApiError, schoolHeader } from './api';
import { saveBlob } from './sheet';

/**
 * Ekspor akademik generik (3C.5). Formatnya milik Edusync, bukan format impor aplikasi pelaporan resmi. Pemanggilan memakai
 * fetch biasa: berkas CSV bukan JSON, jadi tidak lewat klien bertipe.
 */

/** Jumlah baris yang ditampilkan pada pratinjau. */
export const PREVIEW_ROWS = 10;

export type ExportCell = string | number | boolean | null;

export interface ExportJson {
  format: string;
  dataset: ExportDataset;
  generatedAt: string;
  columns: { key: string; description: string }[];
  rows: Record<string, ExportCell>[];
}

export interface ExportRequest {
  academicYearId: string;
  semesterId?: string;
  dataset: ExportDataset;
  format: ExportFormat;
}

/** Dataset yang harus menyebut semester. */
export const datasetNeedsSemester = (dataset: ExportDataset) => EXPORT_SEMESTER_DATASETS.includes(dataset);

/** Dataset yang isinya dari modul Nilai dan rapor (butuh modul `grades` aktif). */
export const datasetNeedsGrades = (dataset: ExportDataset) => EXPORT_GRADE_DATASETS.includes(dataset);

/** Query string permintaan; semester hanya dikirim untuk dataset yang memintanya. */
export function exportQueryString(q: ExportRequest): string {
  const params = new URLSearchParams({
    academicYearId: q.academicYearId,
    dataset: q.dataset,
    format: q.format,
  });
  if (q.semesterId && datasetNeedsSemester(q.dataset)) params.set('semesterId', q.semesterId);
  return params.toString();
}

/** Apakah pilihan sudah lengkap untuk diminta ke server. */
export function exportReady(q: Pick<ExportRequest, 'academicYearId' | 'semesterId' | 'dataset'>): boolean {
  return !!q.academicYearId && (!datasetNeedsSemester(q.dataset) || !!q.semesterId);
}

/** Nama berkas bila server tidak mengirim nama. */
export function exportFallbackFilename(dataset: ExportDataset, format: ExportFormat): string {
  return `${EXPORT_FORMAT_NAME}-${dataset}.${format}`;
}

/** Buang pemisah folder dan karakter kontrol supaya nama dari server aman dipakai sebagai nama berkas. */
function cleanFilename(name: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: karakter kontrol memang dibuang
  const cleaned = name.replace(/[\u0000-\u001f\\/:*?"<>|]/g, '').trim();
  return cleaned === '.' || cleaned === '..' ? '' : cleaned;
}

/** Nama berkas dari header Content-Disposition (`filename*` didahulukan), atau null. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(header)?.[1];
  if (star) {
    try {
      const name = cleanFilename(decodeURIComponent(star.trim()));
      if (name) return name;
    } catch {
      // pengodean rusak: coba filename biasa
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  const name = cleanFilename((plain?.[1] ?? plain?.[2] ?? '').trim());
  return name || null;
}

/** Ubah respons galat menjadi ApiError berkode, dari bentuk `{error:{code,message}}`; badan yang bukan JSON tetap menghasilkan galat. */
export async function exportError(res: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string } } | undefined;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = undefined;
  }
  return new ApiError(
    body?.error?.message ?? 'Permintaan tidak dapat diproses.',
    res.status,
    body?.error?.code,
  );
}

async function request(schoolId: string, q: ExportRequest, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`/v1/exports/academic?${exportQueryString(q)}`, {
    credentials: 'include',
    headers: schoolHeader(schoolId),
    signal,
  });
  if (!res.ok) throw await exportError(res);
  return res;
}

/** Ambil isi ekspor sebagai JSON (untuk pratinjau). */
export async function fetchExportJson(
  schoolId: string,
  q: Omit<ExportRequest, 'format'>,
  signal?: AbortSignal,
): Promise<ExportJson> {
  const res = await request(schoolId, { ...q, format: 'json' }, signal);
  return (await res.json()) as ExportJson;
}

/** Unduh berkas ekspor; mengembalikan nama berkas yang dipakai. */
export async function downloadExport(schoolId: string, q: ExportRequest): Promise<string> {
  const res = await request(schoolId, q);
  const name =
    filenameFromDisposition(res.headers.get('content-disposition')) ??
    exportFallbackFilename(q.dataset, q.format);
  saveBlob(await res.blob(), name);
  return name;
}

/** Teks sel pratinjau: kosong untuk null, true/false untuk boolean. */
export function cellText(value: ExportCell | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}
