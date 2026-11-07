'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type CameraStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'hidden'
  | 'insecure'
  | 'unsupported'
  | 'denied'
  | 'notfound'
  | 'busy';

/** Antarmuka minimal BarcodeDetector (belum ada di lib DOM TypeScript). */
interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = {
  new (options: { formats: string[] }): DetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

/** Interval minimal antar-pembacaan (~8 bingkai per detik). */
const FRAME_MS = 125;
/** Sisi terpanjang bingkai yang didekode jsQR; lebih kecil = lebih cepat, QR kartu tetap terbaca. */
const DECODE_SIDE = 480;

/** Jenis kegagalan kamera dari galat getUserMedia. */
export function cameraErrorStatus(error: unknown): CameraStatus {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'denied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'notfound';
  return 'busy';
}

/**
 * Pratinjau kamera belakang yang membaca QR terus-menerus. Memakai `BarcodeDetector` bawaan peramban bila ada, jika
 * tidak `jsqr`. Aliran kamera dimatikan saat komponen dilepas, saat `active` false, dan saat halaman tersembunyi.
 * Hanya melaporkan teks mentah lewat `onDetect`; penyaringan dan debounce dilakukan pemanggil.
 */
export function QrCamera({
  active,
  onDetect,
  onStatus,
  className,
}: {
  active: boolean;
  onDetect: (text: string) => void;
  onStatus?: (status: CameraStatus) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectRef = useRef(onDetect);
  const statusRef = useRef(onStatus);
  detectRef.current = onDetect;
  statusRef.current = onStatus;
  const [status, setStatusState] = useState<CameraStatus>('idle');

  useEffect(() => {
    const setStatus = (s: CameraStatus) => {
      setStatusState(s);
      statusRef.current?.(s);
    };
    if (!active) {
      setStatus('idle');
      return;
    }
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) {
      setStatus('insecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }

    let disposed = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = 0;
    let reading = false;
    let detector: DetectorLike | null = null;
    let decode: ((data: Uint8ClampedArray, w: number, h: number) => string | null) | null = null;
    let canvas: HTMLCanvasElement | null = null;
    const video = videoRef.current;

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
      if (video) video.srcObject = null;
    };

    async function prepareDecoder() {
      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (Ctor) {
        try {
          const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code'];
          // QR plus kode batang Code 128 (kartu bisa memuat QR absensi sebagai kode batang); hanya yang didukung.
          const wanted = ['qr_code', 'code_128'].filter((f) => formats.includes(f));
          if (wanted.includes('qr_code')) {
            detector = new Ctor({ formats: wanted });
            return;
          }
        } catch {
          // jatuh ke jsqr
        }
      }
      const { default: jsQR } = await import('jsqr');
      decode = (data, w, h) => jsQR(data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
    }

    async function readFrame() {
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      let text: string | null = null;
      if (detector) {
        const found = await detector.detect(video);
        text = found[0]?.rawValue ?? null;
      } else if (decode) {
        const scale = Math.min(1, DECODE_SIDE / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.max(1, Math.round(video.videoWidth * scale));
        const h = Math.max(1, Math.round(video.videoHeight * scale));
        canvas ??= document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        text = decode(ctx.getImageData(0, 0, w, h).data, w, h);
      }
      if (text) detectRef.current(text);
    }

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (reading || ts - last < FRAME_MS) return;
      last = ts;
      reading = true;
      readFrame()
        .catch(() => undefined)
        .finally(() => {
          reading = false;
        });
    };

    async function start() {
      if (disposed || stream) return;
      setStatus('starting');
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
          });
        } catch (e) {
          // Perangkat tanpa kamera belakang (mis. laptop): coba kamera apa pun.
          const name = (e as { name?: string }).name;
          if (name !== 'OverconstrainedError' && name !== 'NotFoundError') throw e;
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (disposed) {
          stop();
          return;
        }
        if (!detector && !decode) await prepareDecoder();
        if (disposed) {
          stop();
          return;
        }
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setStatus('ready');
        raf = requestAnimationFrame(loop);
      } catch (e) {
        stop();
        if (!disposed) setStatus(cameraErrorStatus(e));
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        stop();
        setStatus('hidden');
      } else if (!stream) {
        void start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.hidden) setStatus('hidden');
    else void start();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [active]);

  return (
    <div className={cn('relative aspect-square w-full overflow-hidden rounded-2xl bg-black', className)}>
      <video
        ref={videoRef}
        playsInline
        muted
        className={cn('size-full object-cover', status !== 'ready' && 'invisible')}
      />
      {status === 'ready' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[14%] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
        />
      )}
    </div>
  );
}
