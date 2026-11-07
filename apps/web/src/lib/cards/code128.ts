/**
 * Kode batang Code 128 (subset B, atau subset C untuk deret angka genap) tanpa pustaka luar.
 * Hasilnya batang-batang dalam satuan modul sehingga bisa digambar sebagai SVG (editor) maupun PDF.
 */

/** Lebar bar-spasi-bar-spasi-bar-spasi untuk nilai 0..105, lalu penutup (7 angka) di indeks 106. */
export const CODE128_PATTERNS: readonly string[] = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Deret nilai simbol (awal, data, pemeriksa) tanpa penutup; null bila teks kosong atau memuat karakter non-ASCII. */
export function code128Values(text: string): number[] | null {
  if (text.length === 0) return null;
  const values: number[] = [];
  if (/^\d+$/.test(text) && text.length >= 4 && text.length % 2 === 0) {
    values.push(START_C);
    for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
  } else {
    values.push(START_B);
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 32 || code > 126) return null;
      values.push(code - 32);
    }
  }
  let sum = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) sum += (values[i] ?? 0) * i;
  values.push(sum % 103);
  return values;
}

export interface Code128Bars {
  /** Batang hitam dalam modul: posisi awal dan lebar. */
  bars: { x: number; w: number }[];
  /** Lebar total dalam modul, tanpa area sunyi. */
  modules: number;
}

/** Batang hitam untuk teks, atau null bila tidak bisa disandikan. */
export function code128Bars(text: string): Code128Bars | null {
  const values = code128Values(text);
  if (!values) return null;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const v of [...values, STOP]) {
    const pattern = CODE128_PATTERNS[v] ?? '';
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]);
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    }
  }
  return { bars, modules: x };
}

/** Area sunyi (modul) di kiri dan kanan yang disarankan. */
export const CODE128_QUIET = 10;
