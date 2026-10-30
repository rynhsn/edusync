'use client';

import { Eraser, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type Point, paintStroke, strokesToDataUrl } from './signature-image';
import '../letters.css';

const HEIGHT = 180;

/**
 * Kanvas tanda tangan: menggambar dengan mouse, jari, atau pena. `onChange` menerima PNG transparan hasil
 * pangkas setiap goresan selesai, atau null bila kosong atau terlalu besar.
 */
export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null, tooLarge: boolean) => void;
}) {
  const t = useTranslations('letters');
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const redraw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes.current) paintStroke(ctx, s);
  }, []);

  // Ukuran kanvas mengikuti lebar pembungkus; goresan digambar ulang setelah ukuran berubah.
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.round(el.clientWidth * ratio);
      c.height = Math.round(HEIGHT * ratio);
      c.style.width = `${el.clientWidth}px`;
      c.style.height = `${HEIGHT}px`;
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [redraw]);

  const emit = () => {
    const url = strokesToDataUrl(strokes.current);
    setEmpty(strokes.current.length === 0);
    onChange(url, strokes.current.length > 0 && url === null);
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="grid gap-2">
      <div ref={wrap} className="lt-pad relative overflow-hidden rounded-xl border">
        <canvas
          ref={canvas}
          role="img"
          aria-label={t('padLabel')}
          className="block"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            strokes.current.push([pos(e)]);
            redraw();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            strokes.current[strokes.current.length - 1]?.push(pos(e));
            redraw();
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = false;
            emit();
          }}
          onPointerCancel={() => {
            drawing.current = false;
            emit();
          }}
        />
        {empty && (
          <span className="text-muted-foreground pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm select-none">
            {t('padHint')}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={empty}
          onClick={() => {
            strokes.current.pop();
            redraw();
            emit();
          }}
        >
          <Undo2 className="size-3.5" /> {t('padUndo')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={empty}
          onClick={() => {
            strokes.current = [];
            redraw();
            emit();
          }}
        >
          <Eraser className="size-3.5" /> {t('padClear')}
        </Button>
      </div>
    </div>
  );
}
