'use client';

import type { CardData, CardElement, CardField } from '@edusync/contracts';
import { useEffect, useRef } from 'react';
import { boxOf, minSizeOf } from '@/lib/cards/elements';
import { GRID_MM, HANDLES, type Handle, moveBox, resizeBox } from '@/lib/cards/geometry';
import { cn } from '@/lib/utils';
import { ElementPreview } from '../element-preview';
import type { CardEditor, EditorDoc } from './use-card-editor';

const HANDLE_POS: Record<Handle, string> = {
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
};

interface Props {
  editor: CardEditor;
  /** px per mm. */
  scale: number;
  snap: boolean;
  sample: boolean;
  data: CardData;
  backgroundUrl: string | null;
  fieldLabel: (field: CardField) => string;
  ariaLabel: string;
}

/** Kanvas bergambar dalam mm yang dikali skala; elemen bisa dipilih, digeser, dan diubah ukurannya dengan pointer. */
export function EditorCanvas({
  editor,
  scale,
  snap,
  sample,
  data,
  backgroundUrl,
  fieldLabel,
  ariaLabel,
}: Props) {
  const { doc, selectedId } = editor;
  const { widthMm, heightMm, elements } = doc.layout;
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  function startDrag(event: React.PointerEvent, el: CardElement, mode: 'move' | Handle) {
    if (event.button !== 0 || !el.id) return;
    event.stopPropagation();
    editor.select(el.id);
    const id = el.id;
    const base: EditorDoc = editor.docRef.current;
    const orig = boxOf(el);
    const min = minSizeOf(el);
    const startX = event.clientX;
    const startY = event.clientY;
    const canvas = { w: widthMm, h: heightMm };
    let moved = false;

    const onMove = (e: PointerEvent) => {
      const grid = snap && !e.altKey ? GRID_MM : 0;
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 2) return;
      moved = true;
      const box =
        mode === 'move'
          ? moveBox(orig, dx, dy, canvas, grid)
          : resizeBox(orig, mode, dx, dy, canvas, grid, min);
      editor.transient((d) => ({
        ...d,
        layout: {
          ...d.layout,
          elements: d.layout.elements.map((x) => (x.id === id ? ({ ...x, ...box } as CardElement) : x)),
        },
      }));
    };
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      cleanup.current = null;
      if (moved) editor.commit(base);
    };
    cleanup.current?.();
    cleanup.current = finish;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  return (
    <div
      role="application"
      aria-label={ariaLabel}
      className="relative shrink-0 bg-white shadow-md ring-1 ring-black/15"
      style={{ width: widthMm * scale, height: heightMm * scale, touchAction: 'none' }}
      onPointerDown={() => editor.select(null)}
    >
      {backgroundUrl && (
        // biome-ignore lint/performance/noImgElement: gambar privat per sekolah, bukan aset statis
        <img
          src={backgroundUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full select-none"
          style={{ objectFit: 'cover' }}
        />
      )}
      {snap && scale >= 5 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(circle, #000 0.6px, transparent 0.8px)',
            backgroundSize: `${scale * 2}px ${scale * 2}px`,
          }}
        />
      )}
      {elements.map((el) => {
        const selected = el.id === selectedId;
        const flat = el.w === 0 || el.h === 0;
        // Garis tipis diberi area sentuh yang cukup besar.
        const pad = flat ? 4 : 0;
        return (
          // biome-ignore lint/a11y/useSemanticElements: kotak elemen digeser dengan pointer; papan ketik dipasang pada kanvas
          <div
            key={el.id}
            role="button"
            tabIndex={-1}
            aria-label={el.type}
            data-selected={selected || undefined}
            className={cn(
              'absolute cursor-move select-none',
              selected
                ? 'outline-primary outline-1 outline-offset-0 outline-dashed'
                : 'hover:outline-primary/50 hover:outline-1 hover:outline-dashed',
            )}
            style={{
              left: el.x * scale - pad,
              top: el.y * scale - pad,
              width: el.w * scale + pad * 2,
              height: el.h * scale + pad * 2,
            }}
            onPointerDown={(e) => startDrag(e, el, 'move')}
          >
            <div
              className="pointer-events-none absolute"
              style={{ left: pad, top: pad, width: el.w * scale, height: el.h * scale }}
            >
              <ElementPreview el={el} data={data} scale={scale} sample={sample} fieldLabel={fieldLabel} />
            </div>
            {selected &&
              HANDLES.map((h) => {
                // Pegangan sumbu yang terkunci (garis lurus) tidak ditampilkan.
                if (el.w === 0 && h.includes('e')) return null;
                if (el.w === 0 && h.includes('w')) return null;
                if (el.h === 0 && h.includes('n')) return null;
                if (el.h === 0 && h.includes('s')) return null;
                return (
                  <span
                    key={h}
                    onPointerDown={(e) => startDrag(e, el, h)}
                    className={cn(
                      'bg-primary absolute size-2.5 rounded-sm border border-white',
                      HANDLE_POS[h],
                    )}
                  />
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
