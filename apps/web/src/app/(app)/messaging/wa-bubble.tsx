import type { ReactNode } from 'react';
import { parseWhatsApp, type WaNode } from '@/lib/whatsapp-format';

function render(nodes: WaNode[]): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${i}-${n.type}`;
    switch (n.type) {
      case 'text':
        return n.text;
      case 'bold':
        return <strong key={key}>{render(n.children)}</strong>;
      case 'italic':
        return <em key={key}>{render(n.children)}</em>;
      case 'strike':
        return <s key={key}>{render(n.children)}</s>;
      case 'code':
        return (
          <code key={key} className="font-mono text-[0.85em]">
            {n.text}
          </code>
        );
      case 'block':
        return (
          <code key={key} className="my-0.5 block font-mono text-[0.85em]">
            {n.text}
          </code>
        );
      default:
        return null;
    }
  });
}

/** Pratinjau pesan seperti gelembung obrolan WhatsApp (warna tetap hijau, terbaca di tema terang dan gelap). */
export function WaBubble({ body, time = '07:05' }: { body: string; time?: string }) {
  return (
    <div className="rounded-xl bg-[#e5ddd5] p-3 dark:bg-[#0b141a]">
      <div className="relative ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
        <p className="break-words whitespace-pre-wrap">{render(parseWhatsApp(body))}</p>
        <p
          className="mt-1 text-right text-[11px] leading-none text-[#667781] dark:text-[#8696a0]"
          aria-hidden
        >
          {time}
        </p>
      </div>
    </div>
  );
}
