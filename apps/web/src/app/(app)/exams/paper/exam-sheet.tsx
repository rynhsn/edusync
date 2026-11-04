'use client';

import { type ExamPaperConfig, examDateParts, examTimeRange, renderExamTemplate } from '@edusync/contracts';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RichText } from '@/components/rich-text';
import type { paths } from '@/lib/api-types';

/** Data cetak satu ujian: bentuk sama dengan GET /v1/exams/{id}/print. */
export type SheetData = paths['/v1/exams/{id}/print']['get']['responses'][200]['content']['application/json'];
export type SheetView = 'questions' | 'answers' | 'key';
type SheetQuestion = SheetData['exam']['questions'][number];

// Lembar ujian selalu berbahasa Indonesia, apa pun bahasa antarmuka.
const L = {
  name: 'Nama',
  number: 'No. Peserta',
  class: 'Kelas',
  mcq: 'A. Pilihan Ganda',
  mcqHint: 'Pilihlah satu jawaban yang paling tepat!',
  essay: 'B. Uraian',
  essayHint: 'Jawablah pertanyaan berikut dengan benar!',
  points: 'poin',
  answerSheet: 'LEMBAR JAWABAN',
  keyTitle: 'KUNCI JAWABAN',
  essayAnswers: 'Jawaban uraian',
  essayNo: 'Soal uraian nomor',
  mcqKey: 'Pilihan ganda',
  guide: 'Pedoman jawaban',
  noGuide: '(tanpa pedoman)',
  total: 'Jumlah skor',
  questions: 'soal',
  tel: 'Telp.',
  fax: 'Fax.',
  email: 'Email',
  web: 'Web',
  minutes: 'menit',
} as const;

const PAPER_MM: Record<ExamPaperConfig['paperSize'], [number, number]> = {
  A4: [210, 297],
  F4: [215, 330],
  Letter: [215.9, 279.4],
};

/** "Jl. X, Desa, Kec. Y, Kota, Provinsi 40000" dari bagian-bagian identitas sekolah. */
export function composeAddress(s: SheetData['school']): string {
  const region = [s.city, [s.province, s.postalCode].filter(Boolean).join(' ')].filter(Boolean);
  return [s.street, s.village, s.district ? `Kec. ${s.district}` : null, ...region]
    .filter(Boolean)
    .join(', ');
}

/** Nilai penampung `{nama}` dari data ujian. */
export function sheetVars(d: SheetData) {
  const { exam } = d;
  const { day, date } = examDateParts(exam.examDate);
  return {
    examName: exam.typeName,
    examShort: exam.typeShort,
    semester: exam.semesterName,
    academicYear: d.academicYear,
    subject: exam.subjectName,
    class: exam.classNames.join(', '),
    day,
    date,
    dayDate: [day, date].filter(Boolean).join(', '),
    time: examTimeRange(exam.startTime, exam.durationMinutes, d.zoneLabel),
    duration: exam.durationMinutes ? `${exam.durationMinutes} ${L.minutes}` : '',
    teacher: d.teacherNames.join(', '),
    school: d.school.officialName || d.school.name,
  };
}

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

function Kop({ d }: { d: SheetData }) {
  const { config: c, school: s } = d;
  if (!c.kop.enabled) return null;
  const contact = [
    c.kop.show.phone && s.phone ? `${L.tel} ${s.phone}` : '',
    c.kop.show.fax && s.fax ? `${L.fax} ${s.fax}` : '',
    c.kop.show.email && s.email ? `${L.email}: ${s.email}` : '',
    c.kop.show.website && s.website ? `${L.web}: ${s.website}` : '',
  ].filter(Boolean);
  const address = c.kop.show.address ? composeAddress(s) : '';
  return (
    <header className="flex items-center gap-4 border-b-[3px] border-double border-black pb-2">
      {c.kop.showLogo && s.logoUrl && (
        // biome-ignore lint/performance/noImgElement: logo kecil dari API sendiri.
        <img src={s.logoUrl} alt="" className="size-20 shrink-0 object-contain" />
      )}
      <div className="min-w-0 flex-1 text-center leading-snug">
        {c.kop.preLines.filter(Boolean).map((line) => (
          <p key={line} className="font-semibold uppercase">
            {line}
          </p>
        ))}
        {c.kop.source === 'identity' ? (
          <>
            <p className="text-[1.35em] leading-tight font-bold uppercase">{s.officialName || s.name}</p>
            {address && <p className="text-[0.85em]">{address}</p>}
            {contact.length > 0 && <p className="text-[0.85em]">{contact.join(' · ')}</p>}
          </>
        ) : (
          c.kop.customLines
            .filter((l) => l.text.trim())
            .map((l, i) => (
              <p
                // biome-ignore lint/suspicious/noArrayIndexKey: baris kop boleh kembar, urutan adalah identitasnya.
                key={i}
                style={{ fontSize: `${l.sizePt}pt` }}
                className={l.bold ? 'font-bold' : undefined}
              >
                {l.text}
              </p>
            ))
        )}
      </div>
      {/* Penyeimbang logo supaya teks tetap di tengah halaman. */}
      {c.kop.showLogo && s.logoUrl && <span aria-hidden className="size-20 shrink-0" />}
    </header>
  );
}

function Heading({ d, title }: { d: SheetData; title?: string }) {
  const { config: c } = d;
  const vars = sheetVars(d);
  const rows = c.info.rows
    .map((r) => ({ label: r.label.trim(), value: renderExamTemplate(r.value, vars) }))
    .filter((r) => r.label || r.value);
  const fields = c.studentBlock.fields;
  return (
    <>
      <Kop d={d} />
      {title ? (
        <h1 className="mt-3 text-center font-bold uppercase">{title}</h1>
      ) : (
        c.title.enabled && (
          <h1 className="mt-3 text-center font-bold uppercase">
            {renderExamTemplate(c.title.template, vars)}
          </h1>
        )
      )}
      {c.info.enabled && rows.length > 0 && (
        <dl
          className="mt-3 grid gap-x-8 gap-y-0.5"
          style={{ gridTemplateColumns: c.info.columns === 2 ? '1fr 1fr' : '1fr' }}
        >
          {rows.map((r) => (
            <div key={`${r.label}-${r.value}`} className="flex gap-1">
              <dt className="w-[30mm] shrink-0">{r.label}</dt>
              <dd className="min-w-0 flex-1">: {r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {c.studentBlock.enabled && fields.length > 0 && (
        <div className="mt-3 grid gap-1.5 rounded border border-black p-2">
          {fields.map((f) => (
            <div key={f} className="flex items-end gap-1">
              <span className="w-[30mm] shrink-0">{L[f]}</span>
              <span>:</span>
              <span className="min-w-0 flex-1 border-b border-dotted border-black">&nbsp;</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Instructions({ d }: { d: SheetData }) {
  const ins = d.config.instructions;
  const items = ins.items.filter((i) => i.trim());
  if (!ins.enabled || items.length === 0) return null;
  return (
    <section className="mt-3 break-inside-avoid">
      <h2 className="font-bold">{ins.title}</h2>
      <ol className="list-decimal pl-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}

function groups(d: SheetData) {
  const qs = [...d.exam.questions].sort((a, b) => a.sort - b.sort);
  const mcq = qs.filter((q) => q.type === 'mcq');
  const essay = qs.filter((q) => q.type === 'essay');
  return { mcq, essay, total: qs.reduce((n, q) => n + q.points, 0) };
}

function QuestionBlock({ q, no, showPoints }: { q: SheetQuestion; no: number; showPoints: boolean }) {
  return (
    <li className="mb-2 flex break-inside-avoid gap-2">
      <span className="w-6 shrink-0 text-right">{no}.</span>
      <div className="min-w-0 flex-1">
        <RichText text={q.body} />
        {showPoints && (
          <p className="text-[0.85em] italic">
            ({q.points} {L.points})
          </p>
        )}
        {q.type === 'mcq' && (
          <ol className="mt-0.5 grid gap-0.5">
            {q.options.map((o) => (
              <li key={o.key} className="flex gap-2">
                <span className="w-5 shrink-0">{o.key.toUpperCase()}.</span>
                <RichText text={o.text} className="min-w-0 flex-1" />
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}

function QuestionsView({ d }: { d: SheetData }) {
  const { mcq, essay, total } = groups(d);
  return (
    <>
      <Heading d={d} />
      <Instructions d={d} />
      {mcq.length > 0 && (
        <section className="mt-4">
          <h2 className="font-bold">{L.mcq}</h2>
          <p className="mb-1 italic">{L.mcqHint}</p>
          <ol className="list-none">
            {mcq.map((q, i) => (
              <QuestionBlock key={q.id} q={q} no={i + 1} showPoints={false} />
            ))}
          </ol>
        </section>
      )}
      {essay.length > 0 && (
        <section className="mt-4">
          <h2 className="font-bold">{L.essay}</h2>
          <p className="mb-1 italic">{L.essayHint}</p>
          <ol className="list-none">
            {essay.map((q, i) => (
              <QuestionBlock key={q.id} q={q} no={mcq.length + i + 1} showPoints />
            ))}
          </ol>
        </section>
      )}
      <p className="mt-3 text-right text-[0.85em]">
        {mcq.length} {L.mcq.slice(3).toLowerCase()} · {essay.length} {L.essay.slice(3).toLowerCase()} ·{' '}
        {L.total}: {total}
      </p>
    </>
  );
}

/** Lembar jawaban: bulatan pilihan per nomor + garis tulis untuk uraian. Tahap OMR nanti dapat menambah penanda sudut. */
function AnswersView({ d }: { d: SheetData }) {
  const { mcq, essay } = groups(d);
  return (
    <>
      <Heading d={d} title={`${L.answerSheet} ${d.exam.typeShort}`} />
      {mcq.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-1 font-bold">{L.mcq}</h2>
          <ol className="grid list-none gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {mcq.map((q, i) => (
              <li key={q.id} className="flex items-center gap-1.5 break-inside-avoid">
                <span className="w-6 shrink-0 text-right">{i + 1}.</span>
                {KEYS.slice(0, Math.max(2, q.options.length)).map((k) => (
                  <span
                    key={k}
                    className="grid size-[1.6em] place-items-center rounded-full border border-black text-[0.75em] leading-none"
                  >
                    {k}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
      {essay.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-1 font-bold">{L.essayAnswers}</h2>
          {essay.map((q, i) => (
            <div key={q.id} className="mb-3 break-inside-avoid">
              <p>
                {L.essayNo} {mcq.length + i + 1} ({q.points} {L.points})
              </p>
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="h-[1.9em] border-b border-black" />
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function KeyView({ d }: { d: SheetData }) {
  const { mcq, essay } = groups(d);
  return (
    <>
      <Heading d={d} title={`${L.keyTitle} ${d.exam.typeShort}`} />
      {mcq.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-1 font-bold">{L.mcqKey}</h2>
          <ol className="grid list-none gap-x-6 gap-y-0.5" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {mcq.map((q, i) => (
              <li key={q.id}>
                {i + 1}. <strong>{(q.answer ?? '-').toUpperCase()}</strong>{' '}
                <span className="text-[0.8em]">({q.points})</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {essay.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-1 font-bold">{L.essayAnswers}</h2>
          <ol className="list-none">
            {essay.map((q, i) => (
              <li key={q.id} className="mb-2 break-inside-avoid">
                <p>
                  <strong>{mcq.length + i + 1}.</strong> ({q.points} {L.points}) {L.guide}:
                </p>
                {q.answer ? (
                  <RichText text={q.answer} className="pl-6" />
                ) : (
                  <p className="pl-6 italic">{L.noGuide}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

/**
 * Lembar ujian (kertas putih, teks hitam, apa pun tema). `mode="screen"` = kartu kertas berukuran asli untuk
 * pratinjau; `mode="print"` = tanpa lebar/bantalan karena margin diatur @page.
 */
export function ExamSheet({
  data,
  view = 'questions',
  mode = 'screen',
}: {
  data: SheetData;
  view?: SheetView;
  mode?: 'screen' | 'print';
}) {
  const c = data.config;
  const [w] = PAPER_MM[c.paperSize];
  const body =
    view === 'answers' ? (
      <AnswersView d={data} />
    ) : view === 'key' ? (
      <KeyView d={data} />
    ) : (
      <QuestionsView d={data} />
    );
  return (
    <div
      className="bg-white text-black"
      style={{
        colorScheme: 'light',
        fontSize: `${c.fontSizePt}pt`,
        fontFamily: '"Times New Roman", Times, serif',
        ...(mode === 'screen'
          ? { width: `${w}mm`, minHeight: `${PAPER_MM[c.paperSize][1]}mm`, padding: `${c.marginMm}mm` }
          : {}),
      }}
    >
      {body}
      {c.footer.trim() && <p className="mt-4 text-center text-[0.8em]">{c.footer}</p>}
    </div>
  );
}

/** Ukuran halaman cetak untuk @page, dari pengaturan kertas dan margin. */
export function pageCss(c: ExamPaperConfig) {
  const [w, h] = PAPER_MM[c.paperSize];
  return `@page { size: ${w}mm ${h}mm; margin: ${c.marginMm}mm; }`;
}

/**
 * Salinan lembar untuk dicetak, ditempel langsung di `body` supaya semua isi aplikasi lain cukup disembunyikan
 * (`display: none`) dan halaman mengalir normal ke beberapa lembar. Di layar salinan ini tersembunyi.
 */
export function PrintPortal({ data, view }: { data: SheetData; view: SheetView }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="exam-print-root">
      <style>{`
        .exam-print-root { display: none; }
        @media print {
          ${pageCss(data.config)}
          body > *:not(.exam-print-root) { display: none !important; }
          .exam-print-root { display: block !important; background: #fff; color: #000; }
        }
      `}</style>
      <ExamSheet data={data} view={view} mode="print" />
    </div>,
    document.body,
  );
}

/** Pratinjau di layar: kertas ukuran asli diperkecil (zoom) di dalam bingkai yang bisa digulir. */
export function SheetPreview({ data, view = 'questions' }: { data: SheetData; view?: SheetView }) {
  return (
    <div className="bg-muted/60 max-h-[80vh] overflow-auto rounded-xl border p-3">
      <div style={{ zoom: 0.6 }} className="mx-auto w-fit shadow-md">
        <ExamSheet data={data} view={view} />
      </div>
    </div>
  );
}
