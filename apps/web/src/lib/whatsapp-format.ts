/**
 * Pemformat teks bergaya WhatsApp untuk pratinjau templat: *tebal*, _miring_, ~coret~, `kode`, ```blok kode```.
 * Hanya untuk tampilan; teks yang dikirim tetap apa adanya (WhatsApp sendiri yang memformatnya di ponsel penerima).
 */
export type WaNode =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: WaNode[] }
  | { type: 'code'; text: string }
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

/** Memecah teks menjadi simpul tampilan; baris baru tetap ada di simpul teks (tampilkan dengan whitespace-pre-wrap). */
export function parseWhatsApp(body: string): WaNode[] {
  const out: WaNode[] = [];
  let rest = body;
  for (;;) {
    const open = rest.indexOf('```');
    const close = open < 0 ? -1 : rest.indexOf('```', open + 3);
    if (open < 0 || close < 0) break;
    if (open > 0) out.push(...inline(rest.slice(0, open)));
    out.push({ type: 'block', text: rest.slice(open + 3, close).replace(/^\n|\n$/g, '') });
    rest = rest.slice(close + 3);
  }
  out.push(...inline(rest));
  return out;
}
