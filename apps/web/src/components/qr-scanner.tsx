'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Kode yang sama berturut-turut dalam jangka ini diabaikan supaya satu kartu tidak terbaca berulang kali. */
const REPEAT_MS = 3000;
const SCAN_INTERVAL_MS = 150;

type ErrorKind = 'denied' | 'noCamera' | 'unsupported' | 'failed';

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface DetectorCtor {
  new (opts?: { formats?: string[] }): DetectorLike;
}

/**
 * Pemindai kode QR lewat kamera belakang. Memakai BarcodeDetector bawaan peramban bila ada, jika tidak
 * memakai jsQR lewat canvas. Aliran kamera dihentikan saat `active` false atau komponen dilepas.
 */
export function QrScanner({
  onScan,
  active,
  className,
}: {
  onScan: (code: string) => void;
  active: boolean;
  className?: string;
}) {
  const t = useTranslations('gate');
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<ErrorKind | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = { code: '', at: 0 };
    setError(null);

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (e) {
        const name = (e as DOMException).name;
        if (cancelled) return;
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'noCamera'
              : 'failed',
        );
        return;
      }
      if (cancelled) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Pemutaran dibatalkan (komponen dilepas); aliran dibersihkan di fungsi pembersih.
      }

      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const detector = Native ? new Native({ formats: ['qr_code'] }) : null;
      const jsQR = detector ? null : (await import('jsqr')).default;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            let value: string | null = null;
            if (detector) {
              value = (await detector.detect(video))[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              // Kecilkan bingkai agar pemindaian ringan di perangkat murah.
              const scale = Math.min(1, 640 / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              value =
                jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
            }
            const now = Date.now();
            if (value && !(value === last.code && now - last.at < REPEAT_MS)) {
              last = { code: value, at: now };
              onScanRef.current(value);
            }
          }
        } catch {
          // Satu bingkai gagal dibaca; coba lagi pada bingkai berikutnya.
        }
        if (!cancelled) timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    }
    start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (stream) for (const track of stream.getTracks()) track.stop();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active]);

  if (!active) return null;
  if (error) {
    return (
      <div role="alert" className={cn('rounded-lg border p-3 text-sm', className)}>
        {t(`scanner.error_${error}`)}
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      aria-label={t('scanner.preview')}
      className={cn('rounded-lg border bg-black object-cover', className)}
    />
  );
}
