/**
 * Pencocokan dan pengurutan untuk pencarian di topbar (palet perintah). Murni dan tanpa React agar mudah diuji.
 * Pencocokan tidak membedakan huruf besar/kecil maupun aksen (mis. "Pengaturan" cocok dengan "pengaturan",
 * "cafe" cocok dengan "café"). Setiap kata pada kueri harus cocok di salah satu bidang item.
 */

/** Huruf kecil dan tanpa tanda aksen. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Pecah kueri menjadi kata-kata ternormalisasi (kata kosong dibuang). */
export function tokens(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Nilai satu kata terhadap satu teks ternormalisasi: awal teks > awal kata > di mana saja; 0 bila tidak ada. */
function tokenScore(token: string, text: string): number {
  const at = text.indexOf(token);
  if (at < 0) return 0;
  if (at === 0) return 3;
  const before = text[at - 1] ?? '';
  return /[\p{L}\p{N}]/u.test(before) ? 1 : 2;
}

/**
 * Nilai kecocokan item terhadap kueri. `fields[0]` adalah bidang utama (judul/label) dan bernilai paling tinggi;
 * bidang berikutnya (ringkasan, kata kunci) bernilai lebih rendah. 0 berarti tidak cocok; kueri kosong selalu 0.
 */
export function matchScore(query: string, fields: readonly string[]): number {
  const words = tokens(query);
  if (words.length === 0) return 0;
  const normalized = fields.map(normalize);
  let total = 0;
  for (const word of words) {
    let best = 0;
    normalized.forEach((text, index) => {
      const s = tokenScore(word, text);
      if (s === 0) return;
      // Bidang utama dikalikan 10, bidang lain 1: judul yang cocok selalu mengalahkan cocok di ringkasan.
      best = Math.max(best, index === 0 ? s * 10 : s);
    });
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/**
 * Saring dan urutkan item menurut kueri (nilai tertinggi dulu, urutan asli bila sama). Kueri kosong mengembalikan
 * semua item sesuai urutan asli.
 */
export function rankItems<T>(
  query: string,
  items: readonly T[],
  fields: (item: T) => readonly string[],
  limit = Number.POSITIVE_INFINITY,
): T[] {
  if (tokens(query).length === 0) return items.slice(0, limit);
  return items
    .map((item, index) => ({ item, index, score: matchScore(query, fields(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** Pecah `text` menjadi potongan biasa dan potongan yang cocok dengan kata-kata kueri (untuk disorot). */
export function highlight(text: string, query: string): HighlightPart[] {
  const words = tokens(query);
  if (words.length === 0 || text.length === 0) return [{ text, match: false }];

  // Normalisasi per karakter agar indeks hasil bisa dipetakan kembali ke teks asli.
  let flat = '';
  const origin: number[] = []; // indeks di `flat` -> indeks di teks asli
  let i = 0;
  for (const ch of text) {
    const n = normalize(ch);
    for (let k = 0; k < n.length; k++) origin.push(i);
    flat += n;
    i += ch.length;
  }

  const marked = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = 0;
    for (;;) {
      const at = flat.indexOf(word, from);
      if (at < 0) break;
      const start = origin[at] ?? 0;
      const last = origin[at + word.length - 1] ?? start;
      // Sertakan seluruh karakter asal di ujung (mis. surrogate pair).
      const end = last + (String.fromCodePoint(text.codePointAt(last) ?? 0).length || 1);
      for (let p = start; p < end && p < marked.length; p++) marked[p] = true;
      from = at + word.length;
    }
  }

  const parts: HighlightPart[] = [];
  for (let p = 0; p < text.length; p++) {
    const match = marked[p] === true;
    const last = parts[parts.length - 1];
    if (last && last.match === match) last.text += text[p];
    else parts.push({ text: text[p] as string, match });
  }
  return parts;
}
