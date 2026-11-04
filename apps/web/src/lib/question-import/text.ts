import type { ImportRow, ImportWarning, ParsedImport } from './types';

const QUESTION = /^(\d{1,3})\s*[.)]\s+(.*)$/;
const OPTION = /^(\*?)\s*([A-Fa-f])\s*[.)]\s+(.*)$/;
const KEY = /^(?:kunci(?:\s+jawaban)?|jawaban|answer|key)\s*[:=]\s*(.*)$/i;
const GUIDE = /^pedoman(?:\s+jawaban)?\s*[:=]\s*(.*)$/i;
const POINTS = /^(?:poin|skor|bobot|points?)\s*[:=]\s*(\d+)/i;
const EXPLAIN = /^(?:pembahasan|penjelasan)\s*[:=]\s*(.*)$/i;

type Mode = 'stem' | 'option' | 'guide' | 'explanation';

interface Draft {
  line: number;
  body: string[];
  options: { key: string; text: string }[];
  starred: string | null;
  key: string | null;
  guide: string[];
  explanation: string[];
  points: number;
  mode: Mode;
}

const fresh = (line: number, first: string): Draft => ({
  line,
  body: [first],
  options: [],
  starred: null,
  key: null,
  guide: [],
  explanation: [],
  points: 1,
  mode: 'stem',
});

/**
 * Baca soal dari teks polos (hasil Word atau berkas .txt). Format: soal bernomor `1.` atau `1)`; pilihan `A.` sampai
 * `F.` di baris sendiri; baris `Kunci: B` (atau Jawaban/Answer); opsional `Poin: 2` dan `Pembahasan: ...`. Pilihan yang
 * diawali `*` juga dianggap kunci. Soal tanpa pilihan = esai, dan teks `Kunci:`/`Pedoman:` menjadi pedoman jawabannya.
 * shortcut: baris bernomor di tengah soal dianggap soal baru, ganti penomoran bila soalnya memuat daftar bernomor.
 */
export function parseText(text: string): ParsedImport {
  const rows: ImportRow[] = [];
  const lines: number[] = [];
  const warnings: ImportWarning[] = [];
  let cur: Draft | null = null;
  let strayWarned = false;

  const finish = () => {
    if (!cur) return;
    const d = cur;
    cur = null;
    const mcq = d.options.length > 0;
    let answer: string | null = null;
    if (mcq) {
      answer = d.key ?? d.starred;
      if (!answer) warnings.push({ line: d.line, message: 'Kunci jawaban tidak ditemukan.' });
    } else {
      answer = d.guide.join('\n').trim() || null;
    }
    rows.push({
      type: mcq ? 'mcq' : 'essay',
      body: d.body.join('\n').trim(),
      options: d.options,
      answer,
      points: d.points,
      explanation: d.explanation.join('\n').trim() || null,
    });
    lines.push(d.line);
  };

  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  for (const [i, src] of raw.entries()) {
    const n = i + 1;
    const line = src.trim();
    if (!line) continue;

    const q = QUESTION.exec(line);
    if (q) {
      finish();
      cur = fresh(n, q[2] as string);
      continue;
    }
    if (!cur) {
      if (!strayWarned) {
        warnings.push({ line: n, message: 'Teks sebelum soal pertama diabaikan.' });
        strayWarned = true;
      }
      continue;
    }
    const d: Draft = cur;

    const opt = OPTION.exec(line);
    if (opt && d.mode !== 'guide' && d.mode !== 'explanation') {
      const key = (opt[2] as string).toUpperCase();
      d.options.push({ key, text: opt[3] as string });
      if (opt[1]) d.starred = key;
      d.mode = 'option';
      continue;
    }
    const key = KEY.exec(line);
    if (key) {
      const value = (key[1] as string).trim();
      if (d.options.length > 0) {
        const letter = /^[A-Fa-f]\b/.exec(value);
        if (letter) d.key = letter[0].toUpperCase();
        else warnings.push({ line: n, message: `Kunci "${value}" bukan huruf pilihan.` });
        d.mode = 'stem';
      } else {
        d.guide = [value];
        d.mode = 'guide';
      }
      continue;
    }
    const guide = GUIDE.exec(line);
    if (guide) {
      d.guide = [(guide[1] as string).trim()];
      d.mode = 'guide';
      continue;
    }
    const pts = POINTS.exec(line);
    if (pts) {
      d.points = Number(pts[1]);
      continue;
    }
    const exp = EXPLAIN.exec(line);
    if (exp) {
      d.explanation = [(exp[1] as string).trim()];
      d.mode = 'explanation';
      continue;
    }

    // Baris lanjutan menempel pada bagian yang sedang dibaca.
    if (d.mode === 'stem') d.body.push(line);
    else if (d.mode === 'option') {
      const last = d.options[d.options.length - 1];
      if (last) last.text = `${last.text} ${line}`;
    } else if (d.mode === 'guide') d.guide.push(line);
    else d.explanation.push(line);
  }
  finish();
  return { rows, lines, warnings };
}
