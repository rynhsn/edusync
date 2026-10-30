import { placeholdersIn, renderTemplate } from './messaging';

/**
 * Modul administrasi: penomoran surat, pengganti templat, dan batas gambar tanda tangan.
 * Fungsi murni agar bisa dipakai bersama oleh API dan web.
 */

/** Pengganti yang dikenal pada templat surat dan sertifikat. */
export const LETTER_PLACEHOLDERS = [
  'nama',
  'nis',
  'kelas',
  'tanggal',
  'sekolah',
  'nomor',
  'penandatangan',
  'jabatan',
] as const;

export type LetterPlaceholder = (typeof LETTER_PLACEHOLDERS)[number];

/** Ukuran maksimum gambar tanda tangan (data URL), dalam karakter. */
export const MAX_SIGNATURE_BYTES = 150 * 1024;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'] as const;

/** Bulan 1..12 dalam angka Romawi; di luar rentang melempar RangeError. */
export function romanMonth(n: number): string {
  const r = Number.isInteger(n) ? ROMAN[n - 1] : undefined;
  if (!r) throw new RangeError('Bulan harus bilangan bulat 1 sampai 12.');
  return r;
}

/**
 * Kode sekolah untuk nomor surat dari slug: slug satu kata memakai huruf awalnya, slug beberapa kata memakai
 * inisial tiap kata; huruf kapital, maksimal 6 karakter. Slug kosong menghasilkan "SKL".
 */
export function schoolCodeFromSlug(slug: string): string {
  const parts = slug
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'SKL';
  const code = parts.length === 1 ? (parts[0] as string) : parts.map((p) => p[0]).join('');
  return code.slice(0, 6);
}

/** Nomor surat keluar: "012/SMP/X/2026" (urutan 3 digit minimal, kode, bulan Romawi, tahun). */
export function formatLetterNumber(seq: number, code: string, month: number, year: number): string {
  return `${String(seq).padStart(3, '0')}/${code}/${romanMonth(month)}/${year}`;
}

/** Nomor agenda surat masuk: "AG/012/2026". */
export function formatAgendaNumber(seq: number, year: number): string {
  return `AG/${String(seq).padStart(3, '0')}/${year}`;
}

/** Pengganti pada templat yang tidak dikenal pada surat. */
export function unknownLetterPlaceholders(body: string): string[] {
  const allowed = LETTER_PLACEHOLDERS as readonly string[];
  return placeholdersIn(body).filter((p) => !allowed.includes(p));
}

/** Isi templat surat dengan variabel; pengganti tanpa nilai dikosongkan. */
export function renderLetter(
  body: string,
  vars: Partial<Record<LetterPlaceholder, string | number | null | undefined>>,
): string {
  return renderTemplate(body, vars);
}

/** Tanggal ISO (YYYY-MM-DD) dalam format Indonesia panjang, mis. "5 Oktober 2026". */
export function formatLongDateId(iso: string): string {
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const [y, m, d] = iso.split('-').map(Number);
  const name = months[(m ?? 0) - 1];
  if (!y || !d || !name) return iso;
  return `${d} ${name} ${y}`;
}

/** Templat bawaan: surat keterangan siswa aktif, surat panggilan orang tua, dan sertifikat sederhana. */
export const DEFAULT_LETTER_TEMPLATES: readonly {
  name: string;
  kind: 'letter' | 'certificate';
  body: string;
}[] = [
  {
    name: 'Surat keterangan siswa aktif',
    kind: 'letter',
    body:
      'SURAT KETERANGAN\nNomor: {{nomor}}\n\nYang bertanda tangan di bawah ini, {{penandatangan}} selaku {{jabatan}} {{sekolah}}, ' +
      'menerangkan bahwa:\n\nNama: {{nama}}\nNIS: {{nis}}\nKelas: {{kelas}}\n\nadalah benar siswa aktif di {{sekolah}}. ' +
      'Surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.\n\n{{tanggal}}\n{{jabatan}}\n\n{{penandatangan}}',
  },
  {
    name: 'Surat panggilan orang tua',
    kind: 'letter',
    body:
      'Nomor: {{nomor}}\nPerihal: Panggilan Orang Tua/Wali\n\nYth. Orang Tua/Wali dari {{nama}} (NIS {{nis}}, kelas {{kelas}}),\n\n' +
      'Dengan hormat, kami mengundang Bapak/Ibu untuk hadir ke {{sekolah}} guna membicarakan perkembangan putra/putri ' +
      'Bapak/Ibu. Waktu dan tempat pertemuan akan disampaikan oleh wali kelas.\n\nDemikian surat ini kami sampaikan, ' +
      'atas perhatian Bapak/Ibu kami ucapkan terima kasih.\n\n{{tanggal}}\n{{jabatan}}\n\n{{penandatangan}}',
  },
  {
    name: 'Sertifikat sederhana',
    kind: 'certificate',
    body:
      'SERTIFIKAT\nNomor: {{nomor}}\n\nDiberikan kepada\n\n{{nama}}\n\nsebagai penghargaan atas partisipasi dan prestasinya ' +
      'di {{sekolah}}.\n\n{{tanggal}}\n{{jabatan}}\n\n{{penandatangan}}',
  },
];

/** Dekode base64 murni (tanpa atob/Buffer agar jalan di mana saja); null bila panjang tak sah. */
function decodeBase64(s: string): Uint8Array | null {
  if (s.length % 4 !== 0) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) n = (n << 6) | Math.max(alphabet.indexOf(s[i + j] ?? '='), 0);
    for (let k = 0; k < 3 && o < out.length; k++) out[o++] = (n >> (16 - 8 * k)) & 0xff;
  }
  return out;
}

/** Kunci PNG dan JPEG dari data URL gambar; null bila bukan data URL base64 gambar yang sah. */
export function parseSignatureDataUrl(
  dataUrl: string,
): { mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array } | null {
  const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] as 'image/png' | 'image/jpeg';
  const bytes = decodeBase64(m[2] as string);
  if (!bytes) return null;
  const png =
    bytes.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png' ? !png : !jpeg) return null;
  return { mime, bytes };
}
