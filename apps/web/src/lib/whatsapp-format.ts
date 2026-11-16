/**
 * Pemformat teks bergaya WhatsApp untuk pratinjau templat: *tebal*, _miring_, ~coret~, `kode`, ```blok kode```.
 * Hanya untuk tampilan; teks yang dikirim tetap apa adanya (WhatsApp sendiri yang memformatnya di ponsel penerima).
 */
export type WaNode =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: WaNode[] }
  | { type: 'code'; text: string }
  | { type: 'quote'; children: WaNode[] }
  | { type: 'bullets'; items: WaNode[][] }
  | { type: 'numbered'; start: number; items: WaNode[][] }
  | { type: 'block'; text: string };

const MARK = { '*': 'bold', _: 'italic', '~': 'strike' } as const;
// Penanda hanya berlaku di batas kata, dan isinya tidak boleh diawali/diakhiri spasi (aturan WhatsApp).
const INLINE_SOURCE = /(`[^`\n]+`)|(^|[\s(—-])([*_~])(?=\S)([^\n]*?\S)\3(?=$|[\s).,;:!?—-])/;

function inline(text: string): WaNode[] {
  const out: WaNode[] = [];
  let last = 0;
  // Regex baru per panggilan: pemanggilan bersarang tidak boleh mengubah lastIndex milik pemanggil.
  const re = new RegExp(INLINE_SOURCE.source, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1]) {
      if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
      out.push({ type: 'code', text: m[1].slice(1, -1) });
    } else {
      const start = m.index + (m[2]?.length ?? 0);
      if (start > last) out.push({ type: 'text', text: text.slice(last, start) });
      out.push({ type: MARK[m[3] as keyof typeof MARK], children: inline(m[4] ?? '') });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/**
 * Blok seperti di WhatsApp: baris berawalan "> " menjadi kutipan, "- " atau "* " butir daftar, "1. " daftar bernomor.
 * Baris biasa tetap teks (baris baru dipertahankan); blok tidak menambah baris baru di sekelilingnya.
 */
const BLOCK_LINE = /^(?:> |[-*] |\d+\. )/;

function withBlocks(text: string): WaNode[] {
  if (!text.split('\n').some((l) => BLOCK_LINE.test(l))) return inline(text);
  const out: WaNode[] = [];
  let plain: string[] = [];
  let run: { kind: 'quote' | 'bullets' | 'numbered'; lines: string[]; start: number } | null = null;
  const flushPlain = () => {
    if (plain.length) out.push(...inline(plain.join('\n')));
    plain = [];
  };
  const flushRun = () => {
    if (!run) return;
    if (run.kind === 'quote') out.push({ type: 'quote', children: inline(run.lines.join('\n')) });
    else if (run.kind === 'bullets') out.push({ type: 'bullets', items: run.lines.map(inline) });
    else out.push({ type: 'numbered', start: run.start, items: run.lines.map(inline) });
    run = null;
  };
  for (const line of text.split('\n')) {
    let kind: 'quote' | 'bullets' | 'numbered' | null = null;
    let content = line;
    let start = 1;
    if (line.startsWith('> ')) {
      kind = 'quote';
      content = line.slice(2);
    } else if (/^[-*] /.test(line)) {
      kind = 'bullets';
      content = line.slice(2);
    } else {
      const m = /^(\d+)\. (.*)$/.exec(line);
      if (m) {
        kind = 'numbered';
        start = Number(m[1]);
        content = m[2] ?? '';
      }
    }
    if (!kind) {
      flushRun();
      plain.push(line);
      continue;
    }
    flushPlain();
    if (run && run.kind !== kind) flushRun();
    if (!run) run = { kind, lines: [], start };
    run.lines.push(content);
  }
  flushPlain();
  flushRun();
  return out;
}

/** Memecah teks menjadi simpul tampilan; baris baru tetap ada di simpul teks (tampilkan dengan whitespace-pre-wrap). */
export function parseWhatsApp(body: string): WaNode[] {
  const out: WaNode[] = [];
  let rest = body;
  for (;;) {
    const open = rest.indexOf('```');
    const close = open < 0 ? -1 : rest.indexOf('```', open + 3);
    if (open < 0 || close < 0) break;
    if (open > 0) out.push(...withBlocks(rest.slice(0, open)));
    out.push({ type: 'block', text: rest.slice(open + 3, close).replace(/^\n|\n$/g, '') });
    rest = rest.slice(close + 3);
  }
  out.push(...withBlocks(rest));
  return out;
}
