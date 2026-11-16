import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { parseWhatsApp, type WaNode } from '@/lib/whatsapp-format';
import { formatSize } from './attachment-logic';

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
      case 'quote':
        return (
          <blockquote
            key={key}
            className="my-1 rounded border-l-4 border-[#06cf9c] bg-black/5 py-1 pr-2 pl-2 dark:bg-white/10"
          >
            {render(n.children)}
          </blockquote>
        );
      default:
        return null;
    }
  });
}

/** Pratinjau pesan seperti gelembung obrolan WhatsApp (warna tetap hijau, terbaca di tema terang dan gelap). */
export interface BubbleAttachment {
  fileName: string;
  mime: string;
  size: number;
  /** URL pratinjau gambar; kosong untuk PDF. */
  previewUrl?: string | null;
}

export function WaBubble({
  body,
  time = '07:05',
  attachment,
}: {
  body: string;
  time?: string;
  attachment?: BubbleAttachment | null;
}) {
  return (
    <div className="rounded-xl bg-[#e5ddd5] p-3 dark:bg-[#0b141a]">
      <div className="relative ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
        {attachment &&
          (attachment.previewUrl ? (
            // biome-ignore lint/performance/noImgElement: URL objek lokal untuk pratinjau, bukan aset yang dioptimalkan
            <img
              src={attachment.previewUrl}
              alt={attachment.fileName}
              className="mb-1.5 max-h-48 w-full rounded-md object-cover"
            />
          ) : (
            <div className="mb-1.5 flex items-center gap-2 rounded-md bg-black/5 p-2 dark:bg-white/10">
              <FileText className="size-6 shrink-0 text-[#667781] dark:text-[#8696a0]" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                <p className="text-xs text-[#667781] dark:text-[#8696a0]">
                  PDF · {formatSize(attachment.size)}
                </p>
              </div>
            </div>
          ))}
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{render(parseWhatsApp(body))}</p>
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
