import type { CardData, CardElement, CardLayout } from '@edusync/contracts';
import { Document, Image, Line, Page, Path, Rect, Svg, Text, View } from '@react-pdf/renderer';
import { CODE128_QUIET, code128Bars } from '../../../../lib/cards/code128';
import { codeText, elementText } from '../../../../lib/cards/elements';
import { mmToPt } from '../../../../lib/cards/geometry';
import { qrShape } from '../../../../lib/cards/qr';
import {
  bestSheetGrid,
  cropLength,
  cropMarkSegments,
  paginate,
  type SheetOptions,
  slotPosition,
} from '../../../../lib/cards/sheet-layout';
import { fitFontSize, LINE_HEIGHT } from '../../../../lib/cards/text-fit';

export interface CardAssets {
  /** Data URL latar kartu, atau null. */
  background: string | null;
  /** Data URL gambar elemen `image` menurut `fileId`. */
  images: Record<string, string>;
}

export interface PdfCard {
  data: CardData;
  /** Data URL foto siswa, atau null bila belum ada. */
  photo: string | null;
}

export interface CardsPdfInput {
  title: string;
  layout: CardLayout;
  assets: CardAssets;
  cards: PdfCard[];
  /** `single`: satu kartu per halaman seukuran kartu; `sheet`: beberapa kartu per lembar kertas. */
  mode: 'single' | 'sheet';
  sheet: SheetOptions;
}

const pt = mmToPt;

function TextBox({ el, data }: { el: Extract<CardElement, { type: 'text' | 'field' }>; data: CardData }) {
  const text = elementText(el, data);
  if (!text) return null;
  const size = fitFontSize({ text, fontSize: el.fontSize, bold: el.bold, widthMm: el.w, heightMm: el.h });
  return (
    <View style={{ position: 'absolute', left: pt(el.x), top: pt(el.y), width: pt(el.w), height: pt(el.h) }}>
      <Text
        style={{
          fontFamily: el.bold ? 'Helvetica-Bold' : 'Helvetica',
          fontSize: size,
          lineHeight: LINE_HEIGHT,
          color: el.color,
          textAlign: el.align,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function Barcode({ el, data }: { el: Extract<CardElement, { type: 'barcode' }>; data: CardData }) {
  const value = codeText(el, data);
  const code = value ? code128Bars(value) : null;
  if (!code) return null;
  const textH = el.showText ? Math.min(4, el.h * 0.3) : 0;
  const barsH = el.h - textH;
  const total = code.modules + CODE128_QUIET * 2;
  return (
    <View style={{ position: 'absolute', left: pt(el.x), top: pt(el.y), width: pt(el.w), height: pt(el.h) }}>
      <Svg width={pt(el.w)} height={pt(barsH)} viewBox={`0 0 ${total} 10`} preserveAspectRatio="none">
        {code.bars.map((b) => (
          <Rect key={b.x} x={b.x + CODE128_QUIET} y={0} width={b.w} height={10} fill={el.color} />
        ))}
      </Svg>
      {el.showText && (
        <Text
          style={{
            fontFamily: 'Helvetica',
            fontSize: Math.max(4, pt(textH) * 0.8),
            color: el.color,
            textAlign: 'center',
          }}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

function ElementView({
  el,
  data,
  photo,
  assets,
}: {
  el: CardElement;
  data: CardData;
  photo: string | null;
  assets: CardAssets;
}) {
  const box = {
    position: 'absolute',
    left: pt(el.x),
    top: pt(el.y),
    width: pt(el.w),
    height: pt(el.h),
  } as const;
  switch (el.type) {
    case 'text':
    case 'field':
      return <TextBox el={el} data={data} />;
    case 'rect':
      return (
        <View
          style={{
            ...box,
            ...(el.fill ? { backgroundColor: el.fill } : {}),
            ...(el.borderColor && el.borderWidth > 0
              ? { borderColor: el.borderColor, borderWidth: pt(el.borderWidth) }
              : {}),
            borderRadius: pt(el.radius),
          }}
        />
      );
    case 'line': {
      if (el.w === 0 || el.h === 0) {
        const t = pt(el.thickness);
        return (
          <View
            style={{
              position: 'absolute',
              left: el.h === 0 ? pt(el.x) : pt(el.x) - t / 2,
              top: el.h === 0 ? pt(el.y) - t / 2 : pt(el.y),
              width: el.h === 0 ? pt(el.w) : t,
              height: el.h === 0 ? t : pt(el.h),
              backgroundColor: el.color,
            }}
          />
        );
      }
      return (
        <View style={box}>
          <Svg width={pt(el.w)} height={pt(el.h)} viewBox={`0 0 ${el.w} ${el.h}`}>
            <Line x1={0} y1={0} x2={el.w} y2={el.h} stroke={el.color} strokeWidth={el.thickness} />
          </Svg>
        </View>
      );
    }
    case 'image': {
      const src = assets.images[el.fileId];
      if (!src) return null;
      return (
        <View style={box}>
          <Image src={src} style={{ width: '100%', height: '100%', objectFit: el.fit }} />
        </View>
      );
    }
    case 'photo': {
      const radius = el.shape === 'circle' ? pt(Math.min(el.w, el.h) / 2) : 0;
      return (
        <View style={{ ...box, borderRadius: radius, overflow: 'hidden', backgroundColor: '#e5e7eb' }}>
          {photo && <Image src={photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </View>
      );
    }
    case 'qr': {
      const shape = qrShape(codeText(el, data));
      if (!shape) return null;
      const side = Math.min(el.w, el.h);
      return (
        <View style={box}>
          <Svg width={pt(side)} height={pt(side)} viewBox={`-1 -1 ${shape.size + 2} ${shape.size + 2}`}>
            <Path d={shape.path} fill={el.color} />
          </Svg>
        </View>
      );
    }
    case 'barcode':
      return <Barcode el={el} data={data} />;
  }
}

/** Satu kartu: latar lalu elemen menurut urutan lapisan. Ukuran = ukuran kartu. */
export function CardFace({
  layout,
  assets,
  card,
}: {
  layout: CardLayout;
  assets: CardAssets;
  card: PdfCard;
}) {
  return (
    <View
      style={{
        position: 'relative',
        width: pt(layout.widthMm),
        height: pt(layout.heightMm),
        overflow: 'hidden',
        backgroundColor: '#ffffff',
      }}
    >
      {assets.background && (
        <Image
          src={assets.background}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: pt(layout.widthMm),
            height: pt(layout.heightMm),
            objectFit: 'cover',
          }}
        />
      )}
      {layout.elements.map((el, i) => (
        <ElementView key={el.id ?? i} el={el} data={card.data} photo={card.photo} assets={assets} />
      ))}
    </View>
  );
}

/** Dokumen PDF kartu. */
export function CardsDocument({ input }: { input: CardsPdfInput }) {
  const { layout, cards, assets } = input;
  if (input.mode === 'single') {
    return (
      <Document title={input.title}>
        {cards.map((card, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: satu halaman per kartu, urutan tetap
          <Page key={i} size={[pt(layout.widthMm), pt(layout.heightMm)]} style={{ padding: 0 }}>
            <CardFace layout={layout} assets={assets} card={card} />
          </Page>
        ))}
      </Document>
    );
  }
  const grid = bestSheetGrid(layout.widthMm, layout.heightMm, input.sheet);
  const pages = paginate(cards, grid.perPage);
  const len = input.sheet.cropMarks ? cropLength(input.sheet.gap) : 0;
  return (
    <Document title={input.title}>
      {pages.map((group, p) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: halaman lembar berurutan
        <Page key={p} size={[pt(grid.pageW), pt(grid.pageH)]} style={{ padding: 0 }}>
          {group.map((card, slot) => {
            const pos = slotPosition(grid, layout.widthMm, layout.heightMm, input.sheet.gap, slot);
            return (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: posisi slot tetap
                key={slot}
                style={{ position: 'absolute', left: pt(pos.x), top: pt(pos.y) }}
              >
                <CardFace layout={layout} assets={assets} card={card} />
              </View>
            );
          })}
          {len > 0 && (
            <Svg
              style={{ position: 'absolute', left: 0, top: 0 }}
              width={pt(grid.pageW)}
              height={pt(grid.pageH)}
              viewBox={`0 0 ${grid.pageW} ${grid.pageH}`}
            >
              {group.flatMap((_, slot) => {
                const pos = slotPosition(grid, layout.widthMm, layout.heightMm, input.sheet.gap, slot);
                return cropMarkSegments(pos.x, pos.y, layout.widthMm, layout.heightMm, len).map((s, k) => (
                  <Line
                    // biome-ignore lint/suspicious/noArrayIndexKey: segmen tetap per slot
                    key={`${slot}-${k}`}
                    x1={s.x1}
                    y1={s.y1}
                    x2={s.x2}
                    y2={s.y2}
                    stroke="#555555"
                    strokeWidth={0.15}
                  />
                ));
              })}
            </Svg>
          )}
        </Page>
      ))}
    </Document>
  );
}
