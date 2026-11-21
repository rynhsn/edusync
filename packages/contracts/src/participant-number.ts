/**
 * Format nomor peserta ujian yang dapat diatur sekolah. Token: {jenis} singkatan jenis ujian, {yy}/{yyyy} tahun mulai
 * tahun ajaran, {kelas} nama kelas, {urut} / {urut:N} nomor urut (N = lebar digit dengan nol di depan, 1 sampai 9).
 */
export const DEFAULT_PARTICIPANT_NO_FORMAT = '{jenis}-{yy}-{urut:3}';
export const PARTICIPANT_NO_FORMAT_MAX = 40;
export const PARTICIPANT_NO_TOKENS = ['{jenis}', '{yy}', '{yyyy}', '{kelas}', '{urut}', '{urut:N}'] as const;

const TOKEN = /\{([^{}]*)\}/g;
const URUT = /^urut(?::([1-9]))?$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: sengaja mendeteksi karakter kontrol
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Galat pertama pada format, atau null bila sah. */
export function participantFormatError(format: string): string | null {
  if (format.length === 0 || format.trim().length === 0) return 'Format tidak boleh kosong.';
  if (format.length > PARTICIPANT_NO_FORMAT_MAX)
    return `Format maksimal ${PARTICIPANT_NO_FORMAT_MAX} karakter.`;
  if (CONTROL.test(format)) return 'Format tidak boleh memuat karakter kontrol.';
  let seqCount = 0;
  for (const m of format.matchAll(TOKEN)) {
    const name = m[1] as string;
    if (URUT.test(name)) seqCount++;
    else if (!['jenis', 'yy', 'yyyy', 'kelas'].includes(name)) return `Token {${name}} tidak dikenal.`;
  }
  if (format.replace(TOKEN, '').match(/[{}]/)) return 'Tanda kurung kurawal tidak berpasangan.';
  if (seqCount === 0) return 'Format wajib memuat {urut}.';
  return null;
}

export const hasClassToken = (format: string) => format.includes('{kelas}');

/** Nama kelas yang aman dipakai di nomor: tanpa karakter kontrol dan garis miring, spasi menjadi tanda hubung. */
export function safeClassToken(name: string): string {
  return (
    name
      .normalize('NFC')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: sengaja membuang karakter kontrol
      .replace(/[\u0000-\u001f\u007f-\u009f/\\]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'X'
  );
}

export interface ParticipantNoParts {
  typeShort: string;
  academicYearStart: string;
  className: string;
  seq: number;
}

/** Terapkan format (yang sudah lolos `participantFormatError`) pada satu murid. */
export function renderParticipantNo(format: string, p: ParticipantNoParts): string {
  const year = /^(\d{4})/.exec(p.academicYearStart)?.[1] ?? '2000';
  const short = p.typeShort.trim().toUpperCase().replace(/\s+/g, '') || 'UJN';
  return format.replace(TOKEN, (_all, name: string) => {
    if (name === 'jenis') return short;
    if (name === 'yy') return year.slice(2);
    if (name === 'yyyy') return year;
    if (name === 'kelas') return safeClassToken(p.className);
    const width = Number(URUT.exec(name)?.[1] ?? 0);
    return String(p.seq).padStart(width, '0');
  });
}
