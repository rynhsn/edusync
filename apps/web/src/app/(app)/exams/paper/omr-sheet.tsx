'use client';

import {
  OMR_BUBBLE_RADIUS_MM,
  OMR_MARKER,
  OMR_PAGE,
  OMR_QR,
  omrBubbleCenter,
  omrFits,
  omrMarkerCenters,
  omrNumberCenter,
  omrQrPayload,
} from '@edusync/contracts';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Lembar jawaban selalu berbahasa Indonesia, apa pun bahasa antarmuka.
const L = {
  instructions:
    'Gunakan pensil 2B atau pulpen hitam, hitamkan bulatan sepenuhnya, satu jawaban per nomor, hapus bersih bila salah.',
  blankQr: 'Tempel label siswa / tulis nama',
  name: 'Nama',
  nis: 'NIS',
  class: 'Kelas',
  subject: 'Mata pelajaran',
};
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export type OmrPage =
  | { kind: 'student'; studentId: string; name: string; nis: string | null; className: string }
  | { kind: 'blank' };

export interface OmrQuestionLike {
  type: 'mcq' | 'essay';
  optionKeys: string[];
}
export interface OmrStudentLike {
  studentId: string;
  name: string;
  nis: string | null;
  className: string;
  classId: string;
}

/** Jumlah soal pilihan ganda dan jumlah pilihan terbanyak, menurut urutan lembar. */
export function omrCounts(questions: OmrQuestionLike[]) {
  const mcq = questions.filter((q) => q.type === 'mcq');
  return { mcqCount: mcq.length, optionCount: Math.max(0, ...mcq.map((q) => q.optionKeys.length)) };
}

/** Satu halaman per siswa (disaring kelas bila `classId` ada), lalu `blank` halaman kosong. */
export function omrPages(students: OmrStudentLike[], classId: string, blank: number): OmrPage[] {
  const picked = students.filter((s) => !classId || s.classId === classId);
  return [
    ...picked.map((s) => ({
      kind: 'student' as const,
      studentId: s.studentId,
      name: s.name,
      nis: s.nis,
      className: s.className,
    })),
    ...Array.from({ length: Math.max(0, blank) }, () => ({ kind: 'blank' as const })),
  ];
}

/** Tidak muat satu lembar OMR (terlalu banyak soal atau pilihan); `ok` bila boleh dicetak. */
export const omrSupport = (mcqCount: number, optionCount: number) => omrFits(mcqCount, optionCount);

/** QR sebagai SVG sinkron (zona tenang 4 modul), memenuhi kotak QR pada lembar. */
function QrSvg({ text }: { text: string }) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const cells: string[] = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) if (modules.get(y, x)) cells.push(`M${x} ${y}h1v1h-1z`);
  }
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: QR dekoratif untuk pemindai, bukan konten bacaan.
    <svg
      data-omr="qr"
      viewBox={`-4 -4 ${n + 8} ${n + 8}`}
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      style={{ display: 'block' }}
    >
      <rect x={-4} y={-4} width={n + 8} height={n + 8} fill="#fff" />
      <path d={cells.join('')} fill="#000" />
    </svg>
  );
}

const abs = (x: number, y: number, w: number, h: number): React.CSSProperties => ({
  position: 'absolute',
  left: `${x}mm`,
  top: `${y}mm`,
  width: `${w}mm`,
  height: `${h}mm`,
});

/** Satu halaman OMR berukuran tepat A4 (210 x 297 mm), semua elemen diposisikan dalam milimeter. */
export function OmrSheet({
  page,
  examId,
  schoolName,
  examTitle,
  subjectName,
  classNames,
  mcqCount,
  optionCount,
}: {
  page: OmrPage;
  examId: string;
  schoolName: string;
  examTitle: string;
  subjectName: string;
  classNames: string;
  mcqCount: number;
  optionCount: number;
}) {
  const r = OMR_BUBBLE_RADIUS_MM;
  const markers = omrMarkerCenters();
  const bubbles: { q: number; o: number }[] = [];
  for (let q = 0; q < mcqCount; q += 1) for (let o = 0; o < optionCount; o += 1) bubbles.push({ q, o });

  return (
    <div
      className="omr-page"
      style={{
        ...abs(0, 0, OMR_PAGE.widthMm, OMR_PAGE.heightMm),
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
        color: '#000',
        colorScheme: 'light',
        fontFamily: 'Arial, Helvetica, sans-serif',
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      {markers.map((c, i) => {
        const size = i === 0 ? OMR_MARKER.topLeftSize : OMR_MARKER.size;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: empat penanda tetap menurut posisi.
            key={i}
            data-omr="marker"
            style={{ ...abs(c.x - size / 2, c.y - size / 2, size, size), background: '#000' }}
          />
        );
      })}

      {/* Header: sekolah, ujian, identitas siswa. Ruang bebas di kiri QR (x 24-144 mm, y 20-98 mm). */}
      <div style={{ ...abs(24, 20, 120, 44), fontSize: '3.4mm', lineHeight: 1.25 }}>
        <div style={{ fontWeight: 700, fontSize: '4.2mm' }}>{schoolName}</div>
        <div style={{ fontWeight: 700 }}>{examTitle}</div>
        <div>
          {L.subject}: {subjectName}
        </div>
        {page.kind === 'student' ? (
          <div style={{ marginTop: '3mm' }}>
            <div style={{ fontWeight: 700, fontSize: '5mm' }}>{page.name}</div>
            <div style={{ fontSize: '3.6mm' }}>
              {L.nis}: {page.nis ?? '-'} · {L.class}: {page.className}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '4mm', fontSize: '3.6mm' }}>
            <div>{L.name}: ................................................</div>
            <div style={{ marginTop: '2mm' }}>
              {L.class}: {classNames || '....................'}
              {'   '}
              {L.nis}: ................
            </div>
          </div>
        )}
      </div>

      <div style={abs(OMR_QR.x, OMR_QR.y, OMR_QR.size, OMR_QR.size)}>
        {page.kind === 'student' ? (
          <QrSvg text={omrQrPayload(examId, page.studentId)} />
        ) : (
          <div
            data-omr="blank-box"
            style={{
              width: '100%',
              height: '100%',
              border: '0.3mm dashed #444',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              fontSize: '3mm',
              padding: '2mm',
            }}
          >
            {L.blankQr}
          </div>
        )}
      </div>

      <div style={{ ...abs(24, 72, 172, 22), fontSize: '3mm', lineHeight: 1.3 }}>{L.instructions}</div>

      {Array.from({ length: mcqCount }, (_, q) => {
        const c = omrNumberCenter(q);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: nomor soal adalah posisinya.
            key={q}
            style={{
              ...abs(c.x - 4, c.y - 1.8, 7, 3.6),
              fontSize: '3.2mm',
              lineHeight: '3.6mm',
              textAlign: 'right',
              fontWeight: 700,
            }}
          >
            {q + 1}
          </div>
        );
      })}

      {bubbles.map(({ q, o }) => {
        const c = omrBubbleCenter(q, o);
        return (
          <div
            key={`${q}-${o}`}
            data-omr="bubble"
            style={{
              ...abs(c.x - r, c.y - r, r * 2, r * 2),
              boxSizing: 'border-box',
              border: '0.3mm solid #222',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.8mm',
              lineHeight: 1,
              color: '#8a8a8a',
            }}
          >
            {LETTERS[o]}
          </div>
        );
      })}
    </div>
  );
}

export type OmrSheetProps = Omit<React.ComponentProps<typeof OmrSheet>, 'page'>;

/** Semua halaman berurutan; tiap halaman pindah kertas saat dicetak. */
export function OmrPages({ pages, ...rest }: { pages: OmrPage[] } & OmrSheetProps) {
  return (
    <>
      {pages.map((page, i) => (
        <div
          key={page.kind === 'student' ? page.studentId : `blank-${i}`}
          className="omr-page-wrap"
          style={{ width: `${OMR_PAGE.widthMm}mm`, height: `${OMR_PAGE.heightMm}mm` }}
        >
          <OmrSheet page={page} {...rest} />
        </div>
      ))}
    </>
  );
}

/**
 * Salinan untuk dicetak: ditempel di `body` seperti PrintPortal lembar ujian, tetapi dengan @page A4 tanpa margin
 * (penanda sudut dan gelembung diukur dari tepi kertas) dan tanpa penskalaan.
 */
export function OmrPrintPortal({ pages, ...rest }: { pages: OmrPage[] } & OmrSheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="exam-print-root">
      <style>{`
        .exam-print-root { display: none; }
        @media print {
          @page { size: A4; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; }
          body > *:not(.exam-print-root) { display: none !important; }
          .exam-print-root { display: block !important; background: #fff; color: #000; }
          .omr-page-wrap { break-after: page; page-break-after: always; }
          .omr-page-wrap:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <OmrPages pages={pages} {...rest} />
    </div>,
    document.body,
  );
}
