'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

/** Rumus `$...$` (sebaris), `$$...$$` (blok), dan gambar `![](/v1/public/school-files/<uuid>)`; `\$` = tanda dolar biasa. */
const TOKEN =
  /(\$\$[\s\S]+?\$\$|(?<!\\)\$[^$\n]+?(?<!\\)\$|!\[[^\]]*\]\(\/v1\/public\/school-files\/[0-9a-f-]{36}\))/g;
const IMAGE = /^!\[([^\]]*)\]\((\/v1\/public\/school-files\/[0-9a-f-]{36})\)$/;

function math(src: string, display: boolean) {
  // KaTeX membersihkan keluarannya sendiri; `trust` mati sehingga \href, \url, dan sejenisnya ditolak.
  return katex.renderToString(src, {
    throwOnError: false,
    displayMode: display,
    trust: false,
    maxExpand: 200,
    maxSize: 20,
  });
}

/** Teks soal dengan rumus dan gambar. Selain itu teks biasa (tanpa HTML), baris baru dipertahankan. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN);
  return (
    <div className={cn('break-words whitespace-pre-wrap', className)}>
      {parts.map((part, i) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: potongan teks tak punya identitas lain.
        const key = i;
        if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
          return (
            <span
              key={key}
              className="my-2 block overflow-x-auto"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: keluaran KaTeX (trust mati).
              dangerouslySetInnerHTML={{ __html: math(part.slice(2, -2), true) }}
            />
          );
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2 && !part.startsWith('\\')) {
          return (
            <span
              key={key}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: keluaran KaTeX (trust mati).
              dangerouslySetInnerHTML={{ __html: math(part.slice(1, -1), false) }}
            />
          );
        }
        const img = IMAGE.exec(part);
        if (img) {
          return (
            // biome-ignore lint/performance/noImgElement: gambar soal kecil dari API sendiri.
            <img
              key={key}
              src={img[2]}
              alt={img[1] ?? ''}
              className="my-2 block max-h-72 max-w-full rounded-md border object-contain"
            />
          );
        }
        return <Fragment key={key}>{part.replace(/\\\$/g, '$')}</Fragment>;
      })}
    </div>
  );
}
