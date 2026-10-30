import { formatLongDateId, MAX_SIGNATURE_BYTES } from '@edusync/contracts';

/**
 * Fungsi murni modul surat: penyusunan baris, nama berkas, heksa hash, tautan verifikasi, dan penyisipan
 * pengganti. Dipisahkan dari komponen agar bisa dites tanpa DOM.
 */

/** Data contoh untuk pratinjau templat (pengganti {{...}}). */
export const SAMPLE_VARS = {
  nama: 'Ahmad Fauzan',
  nis: '2026001',
  kelas: 'VII A',
  tanggal: '30 Oktober 2026',
  sekolah: 'SMP IT Contoh',
  nomor: '012/SMPIT/X/2026',
  penandatangan: 'Drs. Hasan Basri, M.Pd.',
  jabatan: 'Kepala Sekolah',
} as const;

export type LineKind = 'title' | 'text' | 'blank';

export interface BodyLine {
  kind: LineKind;
  text: string;
}

const UPPER = /^[^a-z]*[A-Z][^a-z]*$/;

/**
 * Pecah isi surat menjadi baris bertipe. Baris pertama yang seluruhnya huruf kapital dan pendek
 * (mis. "SURAT KETERANGAN") menjadi judul; baris kosong beruntun diringkas menjadi satu.
 */
export function bodyLines(text: string): BodyLine[] {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const out: BodyLine[] = [];
  let titled = false;
  for (const line of raw) {
    const trimmed = line.trimEnd();
    if (trimmed.trim() === '') {
      if (out.length > 0 && out[out.length - 1]?.kind !== 'blank') out.push({ kind: 'blank', text: '' });
      continue;
    }
    if (!titled && out.length === 0 && trimmed.length <= 48 && UPPER.test(trimmed)) {
      out.push({ kind: 'title', text: trimmed.trim() });
      titled = true;
      continue;
    }
    titled = true;
    out.push({ kind: 'text', text: trimmed });
  }
  while (out.length > 0 && out[out.length - 1]?.kind === 'blank') out.pop();
  return out;
}

/** Tanggal Indonesia dari ISO tanggal atau waktu ("30 Oktober 2026"). */
export function formatIdDate(iso: string): string {
  return formatLongDateId(iso.slice(0, 10));
}

/** Tanggal dan jam ("30 Oktober 2026, 14.05") dari ISO waktu, memakai zona waktu perangkat. */
export function formatIdDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = formatLongDateId(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  );
  const time = `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date}, ${time}`;
}

/** Potongan nama berkas: huruf kecil, tanpa diakritik, selain huruf/angka jadi tanda hubung. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Nama berkas unduhan: surat-{nomor}-{perihal}.pdf (perihal dipotong agar tidak terlalu panjang). */
export function letterFileName(number: string, subject: string): string {
  const num = slugify(number) || 'tanpa-nomor';
  const subj = slugify(subject).slice(0, 40).replace(/-+$/g, '');
  return subj ? `surat-${num}-${subj}.pdf` : `surat-${num}.pdf`;
}

/** Bytes menjadi heksa huruf kecil (2 digit per byte). */
export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const b of view) out += b.toString(16).padStart(2, '0');
  return out;
}

/** SHA-256 heksa (64 karakter) dari byte berkas, dihitung di browser. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Uint8Array ? (data.slice().buffer as ArrayBuffer) : data;
  return bytesToHex(await crypto.subtle.digest('SHA-256', buf));
}

/** Tautan verifikasi absolut yang dimuat di QR. `origin` tanpa garis miring penutup. */
export function verifyUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/verify/${encodeURIComponent(token)}`;
}

/**
 * Sisipkan teks pada posisi kursor (atau ganti yang terpilih). Mengembalikan nilai baru dan posisi
 * kursor sesudah sisipan.
 */
export function insertAtCursor(
  value: string,
  start: number,
  end: number,
  insert: string,
): { value: string; cursor: number } {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  return { value: value.slice(0, s) + insert + value.slice(e), cursor: s + insert.length };
}

/** Bentuk pengganti: "nama" menjadi "{{nama}}". */
export const placeholderToken = (name: string) => `{{${name}}}`;

/** Gambar tanda tangan muat dalam batas ukuran (karakter data URL) dan berupa PNG/JPEG base64. */
export function isValidSignatureDataUrl(dataUrl: string): boolean {
  return (
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl) &&
    dataUrl.length <= MAX_SIGNATURE_BYTES
  );
}

/** Ukuran data URL dalam KB satu desimal ("12,3 KB"). */
export function dataUrlKb(dataUrl: string): string {
  return `${(dataUrl.length / 1024).toFixed(1).replace('.', ',')} KB`;
}

/** Skala berikutnya untuk memperkecil gambar hingga muat batas ukuran; null bila sudah terlalu kecil. */
export function nextSignatureScale(scale: number): number | null {
  const next = Math.round(scale * 0.8 * 100) / 100;
  return next < 0.2 ? null : next;
}

/** Nama kunci status surat pada terjemahan. */
export const STATUS_KEYS = {
  draft: 'statusDraft',
  signed: 'statusSigned',
  revoked: 'statusRevoked',
} as const;

const DATE_LINE = /^\d{1,2} [A-Za-zé]+ \d{4}$/;

/**
 * Lepaskan ekor isi surat yang berupa blok tanda tangan (tanggal, jabatan, nama) agar tidak tercetak dua kali
 * saat blok tanda tangan dirender terpisah. Hanya dilepas bila baris terakhir sama dengan nama penandatangan.
 */
export function splitSignatureTail(
  lines: BodyLine[],
  signer: { name: string; title: string } | null,
): { lines: BodyLine[]; dateLine: string | null } {
  if (!signer) return { lines, dateLine: null };
  const work = lines.slice();
  const trimEnd = () => {
    while (work.length > 0 && work[work.length - 1]?.kind === 'blank') work.pop();
  };
  trimEnd();
  if (work[work.length - 1]?.text.trim() !== signer.name.trim()) return { lines, dateLine: null };
  work.pop();
  trimEnd();
  if (work[work.length - 1]?.text.trim() === signer.title.trim()) work.pop();
  let dateLine: string | null = null;
  const prev = work[work.length - 1];
  if (prev && DATE_LINE.test(prev.text.trim())) {
    dateLine = prev.text.trim();
    work.pop();
  }
  trimEnd();
  return { lines: work, dateLine };
}
