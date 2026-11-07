'use client';

import type { CardData, CardElement, CardField, CardLayout } from '@edusync/contracts';
import { User } from 'lucide-react';
import { CODE128_QUIET, code128Bars } from '@/lib/cards/code128';
import { codeText, elementText } from '@/lib/cards/elements';
import { fontPx } from '@/lib/cards/geometry';
import { qrShape } from '@/lib/cards/qr';
import { fitFontSize, LINE_HEIGHT } from '@/lib/cards/text-fit';

export const schoolFileUrl = (fileId: string) => `/v1/public/school-files/${fileId}`;

interface ElementProps {
  el: CardElement;
  data: CardData;
  /** px per mm. */
  scale: number;
  /** false = kolom terikat tampil sebagai nama kolom (‹Nama›) alih-alih data contoh. */
  sample: boolean;
  fieldLabel: (field: CardField) => string;
  photoUrl?: string | null;
}

/** Isi satu elemen sebagai HTML, ukurannya mengikuti kotak elemen (anak dari kotak berposisi mutlak). */
export function ElementPreview({ el, data, scale, sample, fieldLabel, photoUrl }: ElementProps) {
  switch (el.type) {
    case 'text':
    case 'field': {
      const text =
        el.type === 'field' && !sample
          ? `${el.prefix ?? ''}‹${fieldLabel(el.field)}›`
          : elementText(el, data);
      const size = fitFontSize({ text, fontSize: el.fontSize, bold: el.bold, widthMm: el.w, heightMm: el.h });
      return (
        <div
          className="size-full overflow-hidden whitespace-pre-wrap break-words"
          style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: fontPx(size, scale),
            lineHeight: LINE_HEIGHT,
            fontWeight: el.bold ? 700 : 400,
            color: el.color,
            textAlign: el.align,
          }}
        >
          {text}
        </div>
      );
    }
    case 'rect':
      return (
        <div
          className="size-full"
          style={{
            backgroundColor: el.fill ?? 'transparent',
            border:
              el.borderColor && el.borderWidth > 0
                ? `${Math.max(1, el.borderWidth * scale)}px solid ${el.borderColor}`
                : undefined,
            borderRadius: el.radius * scale,
            boxSizing: 'border-box',
          }}
        />
      );
    case 'line': {
      const t = Math.max(1, el.thickness * scale);
      if (el.w === 0 || el.h === 0) {
        return (
          <div
            style={{
              position: 'absolute',
              left: el.h === 0 ? 0 : -t / 2,
              top: el.h === 0 ? -t / 2 : 0,
              width: el.h === 0 ? '100%' : t,
              height: el.h === 0 ? t : '100%',
              backgroundColor: el.color,
            }}
          />
        );
      }
      return (
        <svg className="size-full overflow-visible" aria-hidden>
          <line x1={0} y1={0} x2={el.w * scale} y2={el.h * scale} stroke={el.color} strokeWidth={t} />
        </svg>
      );
    }
    case 'image':
      return el.fileId ? (
        // biome-ignore lint/performance/noImgElement: gambar privat per sekolah, bukan aset statis
        <img
          src={schoolFileUrl(el.fileId)}
          alt=""
          draggable={false}
          className="size-full"
          style={{ objectFit: el.fit }}
        />
      ) : null;
    case 'photo':
      return (
        <div
          className="bg-muted text-muted-foreground flex size-full items-center justify-center overflow-hidden"
          style={{ borderRadius: el.shape === 'circle' ? '50%' : 0 }}
        >
          {photoUrl ? (
            // biome-ignore lint/performance/noImgElement: foto siswa dari objek blob
            <img src={photoUrl} alt="" draggable={false} className="size-full object-cover" />
          ) : (
            <User className="size-1/2" aria-hidden />
          )}
        </div>
      );
    case 'qr': {
      const shape = qrShape(sample ? codeText(el, data) : '0');
      if (!shape) return null;
      return (
        <svg
          viewBox={`-1 -1 ${shape.size + 2} ${shape.size + 2}`}
          className="size-full"
          preserveAspectRatio="xMinYMin meet"
          aria-hidden
        >
          <path d={shape.path} fill={el.color} />
        </svg>
      );
    }
    case 'barcode': {
      const value = sample ? codeText(el, data) : '0000';
      const code = value ? code128Bars(value) : null;
      if (!code) return null;
      const total = code.modules + CODE128_QUIET * 2;
      return (
        <div className="flex size-full flex-col">
          <svg
            viewBox={`0 0 ${total} 10`}
            preserveAspectRatio="none"
            className="min-h-0 w-full flex-1"
            aria-hidden
          >
            {code.bars.map((b) => (
              <rect key={b.x} x={b.x + CODE128_QUIET} y={0} width={b.w} height={10} fill={el.color} />
            ))}
          </svg>
          {el.showText && (
            <div
              className="text-center leading-none"
              style={{ color: el.color, fontSize: Math.max(7, Math.min(4, el.h * 0.3) * scale * 0.8) }}
            >
              {value}
            </div>
          )}
        </div>
      );
    }
  }
}

/** Kartu utuh tanpa interaksi, untuk daftar templat dan pratinjau cetak. */
export function CardPreview({
  layout,
  backgroundUrl,
  data,
  width,
  fieldLabel,
  photoUrl,
  className,
}: {
  layout: CardLayout;
  backgroundUrl: string | null;
  data: CardData;
  /** Lebar tampilan dalam px. */
  width: number;
  fieldLabel: (field: CardField) => string;
  photoUrl?: string | null;
  className?: string;
}) {
  const scale = width / layout.widthMm;
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width,
        height: layout.heightMm * scale,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {backgroundUrl && (
        // biome-ignore lint/performance/noImgElement: gambar privat per sekolah, bukan aset statis
        <img
          src={backgroundUrl}
          alt=""
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {layout.elements.map((el, i) => (
        <div
          key={el.id ?? i}
          style={{
            position: 'absolute',
            left: el.x * scale,
            top: el.y * scale,
            width: el.w * scale,
            height: el.h * scale,
          }}
        >
          <ElementPreview
            el={el}
            data={data}
            scale={scale}
            sample
            fieldLabel={fieldLabel}
            photoUrl={photoUrl ?? null}
          />
        </div>
      ))}
    </div>
  );
}
