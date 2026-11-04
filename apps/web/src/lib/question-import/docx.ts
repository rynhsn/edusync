import mammoth from 'mammoth';
import { parseText } from './text';
import type { ParsedImport } from './types';

/** Nama berkas di dalam zip tersimpan polos, jadi gambar tertanam (`word/media/`) bisa dideteksi tanpa membuka zip. */
function hasImages(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  const needle = new TextEncoder().encode('word/media/');
  outer: for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (t: string) =>
  t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith('#')) {
      const code =
        e[1]?.toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const TOKEN = /<(\/?)(ol|ul|li|p|br|h[1-6]|tr)\b[^>]*>|<[^>]+>|([^<]+)/gi;

/**
 * HTML hasil mammoth menjadi teks bernomor. Daftar bernomor otomatis Word (yang hilang di teks polos) dipulihkan:
 * butir daftar tingkat pertama = "1." dan seterusnya, butir di dalamnya = "A." dan seterusnya (pilihan jawaban).
 * shortcut: tipe nomor/huruf asli daftar tidak dibaca, selalu angka lalu huruf; pakai daftar bertingkat atau ketik manual.
 */
export function htmlToText(html: string): string {
  const out: string[] = [];
  const counters: number[] = [];
  for (const m of html.matchAll(TOKEN)) {
    if (m[3] !== undefined) {
      out.push(decode(m[3]));
      continue;
    }
    const tag = m[2]?.toLowerCase();
    const closing = m[1] === '/';
    if (!tag) continue;
    if (tag === 'ol' || tag === 'ul') {
      if (closing) counters.pop();
      else counters.push(0);
      out.push('\n');
    } else if (tag === 'li' && !closing) {
      const depth = counters.length;
      const n = (counters[depth - 1] ?? 0) + 1;
      counters[depth - 1] = n;
      out.push(`\n${depth <= 1 ? n : String.fromCharCode(64 + n)}. `);
    } else {
      out.push('\n');
    }
  }
  return out
    .join('')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Baca soal dari berkas .docx: HTML lewat mammoth (supaya daftar bernomor otomatis terbaca), lalu `parseText`. Gambar tidak diimpor. */
export async function parseDocx(buf: ArrayBuffer): Promise<ParsedImport> {
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const parsed = parseText(htmlToText(value));
  if (hasImages(buf)) {
    parsed.warnings.unshift({
      line: 0,
      message: 'Gambar di dalam berkas Word tidak ikut diimpor; tambahkan lewat tombol Ubah pada soalnya.',
    });
  }
  return parsed;
}
