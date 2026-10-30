'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { bodyLines, splitSignatureTail } from './format';
import './letters.css';

export interface PaperSigner {
  name: string;
  title: string;
  nip?: string | null;
  signatureData?: string | null;
}

export interface LetterPaperProps {
  schoolName: string;
  address?: string | null;
  /** Nomor surat; null bila belum ada (draf di penyusun). */
  number: string | null;
  /** Isi surat yang sudah terisi (tanpa {{...}}). */
  text: string;
  /** Tanggal surat dalam kata ("30 Oktober 2026"), dipakai bila ekor surat tidak memuat tanggal. */
  dateText: string;
  status: 'draft' | 'signed' | 'revoked';
  signer?: PaperSigner | null;
  /** Data URL QR; hanya ada setelah ditandatangani. */
  qr?: string | null;
  /** Tampilkan tanda air "DRAF". */
  watermark?: boolean;
  className?: string;
}

/**
 * Kertas surat A4 (kop, nomor, isi, blok tanda tangan). Ukuran huruf memakai satuan kontainer sehingga seluruh
 * kertas ikut mengecil/membesar mengikuti lebar pembungkus (lihat `.lt-sheet`).
 */
export function LetterPaper({
  schoolName,
  address,
  number,
  text,
  dateText,
  status,
  signer,
  qr,
  watermark = true,
  className,
}: LetterPaperProps) {
  const t = useTranslations('letters');
  const { lines, dateLine } = useMemo(
    () => splitSignatureTail(bodyLines(text), signer ?? null),
    [text, signer],
  );
  const showNumberRow = number && !text.includes(number);

  return (
    <div className={cn('lt-paper', className)}>
      <div className="lt-paper-inner">
        <div className="lt-kop">
          <div className="lt-kop-name">{schoolName}</div>
          {address && <div className="lt-kop-addr">{address}</div>}
        </div>

        {showNumberRow && (
          <div style={{ marginBottom: '1.2cqw' }}>
            {t('paperNumber')}: {number}
          </div>
        )}

        <div>
          {lines.length === 0 && (
            <div style={{ color: '#9a98ae', fontStyle: 'italic' }}>{t('paperEmpty')}</div>
          )}
          {lines.map((l, i) =>
            l.kind === 'blank' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: baris statis hasil pecahan teks
              <div key={i} className="lt-blank" />
            ) : l.kind === 'title' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: baris statis hasil pecahan teks
              <div key={i} className="lt-title">
                {l.text}
              </div>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: baris statis hasil pecahan teks
              <div key={i} className="lt-line">
                {l.text}
              </div>
            ),
          )}
        </div>

        {signer && (
          <div className="lt-sign-block">
            <div className="lt-qr">
              {qr ? (
                // biome-ignore lint/performance/noImgElement: data URL QR
                <img src={qr} alt={t('qrAlt')} />
              ) : (
                <div className="lt-qr-empty">{t('qrPending')}</div>
              )}
              <span>{qr ? t('qrCaption') : null}</span>
            </div>
            <div className="lt-signer">
              <div>{dateLine ?? dateText}</div>
              <div>{signer.title}</div>
              <div className="lt-signer-space">
                {signer.signatureData && status !== 'draft' ? (
                  // biome-ignore lint/performance/noImgElement: data URL tanda tangan
                  <img src={signer.signatureData} alt={t('signatureAlt')} />
                ) : null}
              </div>
              <div className="lt-signer-name">{signer.name}</div>
              {signer.nip && <div style={{ fontSize: '0.9em' }}>NIP. {signer.nip}</div>}
            </div>
          </div>
        )}

        {watermark && status === 'draft' && <div className="lt-draft-mark">{t('markDraft')}</div>}
        {status === 'revoked' && <div className="lt-revoked-mark">{t('markRevoked')}</div>}
      </div>
    </div>
  );
}

/** Pembungkus kertas dengan zoom ringan; lebar kertas = persentase lebar pembungkus. */
export function PaperSheet({ zoom, children }: { zoom: number; children: React.ReactNode }) {
  return (
    <div className="lt-desk overflow-auto rounded-xl p-3 sm:p-6">
      <div className="lt-sheet" style={{ width: `${zoom}%`, maxWidth: `${(zoom / 100) * 794}px` }}>
        {children}
      </div>
    </div>
  );
}
