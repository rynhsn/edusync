// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildYearPlanner } from '@edusync/contracts';
import { renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

import { ReportPdf } from './attendance/report-pdf';
import { CalendarPdf } from './calendar/year/calendar-pdf';
import { ReceiptDocument } from './finance/pdf/receipt-pdf';
import type { ArrearsRow, ReceiptDoc } from './finance/pdf/types';
import { ArrearsPdf } from './finance/reports/arrears-pdf';
import { LetterDocument } from './letters/pdf/letter-pdf';
import type { LetterPdfDoc } from './letters/pdf/types';
import { CertificateDocument } from './pkl/pdf/certificate-pdf';
import type { CertificateDoc } from './pkl/pdf/types';
import { ReportCardDocument } from './report-cards/pdf/report-card-pdf';
import type { ReportCardDoc } from './report-cards/pdf/types';

/** Isi PDF_OUT dengan folder untuk menyimpan hasil render (pratinjau visual). */
const OUT = process.env.PDF_OUT;

const LONG_NAME = 'Muhammad Raden Alif Naufal Pradipta Wicaksono Kusumawardhana bin Abdurrahman Al-Ghifari';
const SCHOOL = 'SMP Islam Terpadu Miftahul Huda Nusantara Bandung Barat';
const ADDRESS = 'Jl. Raya Lembang No. 123, Kec. Parongpong, Kab. Bandung Barat, Jawa Barat 40559';

/** Hitung halaman dari objek /Type /Page (bukan /Pages). */
function pageCount(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
}

async function render(name: string, el: ReactElement): Promise<Buffer> {
  const buf = await renderToBuffer(el as never);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${name}.pdf`), buf);
  }
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(1000);
  expect(buf.length).toBeLessThan(2_000_000);
  return buf;
}

const PNG_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('PDF kwitansi', () => {
  const base: ReceiptDoc = {
    id: 'p1',
    receiptNo: 'KW/2026/10/0001',
    paidAt: '2026-10-30T03:15:00.000Z',
    method: 'transfer',
    methodLabel: 'Transfer Bank BSI',
    total: 1_250_000,
    note: 'Pembayaran SPP Oktober dan uang kegiatan',
    voided: false,
    voidReason: null,
    cashierName: 'Siti Aisyah, S.Pd.',
    school: { name: SCHOOL, address: ADDRESS },
    student: { id: 's1', name: LONG_NAME, nis: '2026001', className: 'VII-A Unggulan Tahfidz' },
    items: [
      { invoiceId: 'i1', title: 'SPP Oktober 2026', amount: 1_000_000 },
      { invoiceId: 'i2', title: 'Uang kegiatan & seragam (Pramuka)', amount: 250_000 },
    ],
  };

  it('merender kwitansi normal satu halaman', async () => {
    expect(pageCount(await render('kwitansi-normal', <ReceiptDocument receipt={base} />))).toBe(1);
  });

  it('merender kwitansi batal dan data kosong tanpa galat', async () => {
    const empty: ReceiptDoc = {
      ...base,
      voided: true,
      voidReason: 'Salah input nominal, diganti kwitansi KW/2026/10/0002',
      methodLabel: undefined,
      note: null,
      cashierName: null,
      total: 0,
      school: { name: 'S', address: null },
      student: { id: 's', name: 'A', nis: null, className: null },
      items: [],
    };
    expect(pageCount(await render('kwitansi-kosong-batal', <ReceiptDocument receipt={empty} />))).toBe(1);
  });

  it('merender kwitansi dengan 60 butir tagihan lebih dari satu halaman', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      invoiceId: `i${i}`,
      title: `Tagihan bulanan ke-${i + 1} (SPP, komite, dan ekstrakurikuler)`,
      amount: 150_000 + i,
    }));
    const buf = await render(
      'kwitansi-banyak',
      <ReceiptDocument receipt={{ ...base, items, total: items.reduce((a, b) => a + b.amount, 0) }} />,
    );
    expect(pageCount(buf)).toBeGreaterThanOrEqual(2);
  });
});

describe('PDF laporan tunggakan', () => {
  const mk = (n: number): ArrearsRow[] =>
    Array.from({ length: n }, (_, i) => ({
      studentId: `s${i}`,
      name: i % 7 === 0 ? LONG_NAME : `Siswa Contoh ${i + 1}`,
      nis: i % 5 === 0 ? null : `2026${String(i).padStart(3, '0')}`,
      className: i % 3 === 0 ? 'XII Teknik Komputer dan Jaringan 2' : 'VII-A',
      openInvoices: (i % 4) + 1,
      outstanding: 1_000_000 * ((i % 4) + 1),
      overdueOutstanding: i % 2 ? 500_000 : 0,
      oldestDue: i % 6 === 0 ? null : '2026-08-10',
    }));
  const totals = (rows: ArrearsRow[]) => ({
    students: rows.length,
    openInvoices: rows.reduce((a, r) => a + r.openInvoices, 0),
    outstanding: rows.reduce((a, r) => a + r.outstanding, 0),
    overdueOutstanding: rows.reduce((a, r) => a + r.overdueOutstanding, 0),
  });
  const props = (rows: ArrearsRow[]) => ({
    schoolName: SCHOOL,
    scope: 'Tahun ajaran 2026/2027 · Semua kelas',
    asOf: '2026-10-30',
    generated: 'Dibuat 30 Oktober 2026',
    rows,
    totals: totals(rows),
  });

  it('merender laporan kosong satu halaman', async () => {
    expect(pageCount(await render('tunggakan-kosong', <ArrearsPdf {...props([])} />))).toBe(1);
  });

  it('merender 120 baris menjadi beberapa halaman', async () => {
    const buf = await render('tunggakan-banyak', <ArrearsPdf {...props(mk(120))} />);
    expect(pageCount(buf)).toBeGreaterThanOrEqual(3);
  });
});

describe('PDF surat bertanda tangan', () => {
  const base = async (text: string, extra: Partial<LetterPdfDoc> = {}): Promise<LetterPdfDoc> => ({
    schoolName: SCHOOL,
    address: ADDRESS,
    number: '045/SMPIT-MH/X/2026',
    text,
    dateText: '30 Oktober 2026',
    dateIso: '2026-10-30',
    signer: {
      name: 'Drs. H. Ahmad Fauzi, M.Pd.',
      title: 'Kepala Sekolah',
      nip: '196501011990031004',
      signatureData: null,
    },
    qrDataUrl: await QRCode.toDataURL('https://edusync.test/verify/abc', { margin: 1, width: 360 }),
    verifyUrl: 'https://smpit-miftahul-huda.edusync.test/verifikasi/0123456789abcdef0123456789abcdef',
    subject: 'Surat Keterangan Aktif Belajar',
    ...extra,
  });

  it('merender surat pendek satu halaman dengan tanda tangan gambar', async () => {
    const doc = await base(
      'SURAT KETERANGAN\nNomor: 045/SMPIT-MH/X/2026\n\nYang bertanda tangan di bawah ini menerangkan bahwa Muhammad Hafizh, kelas VII-A, adalah siswa aktif.\n\n30 Oktober 2026\nKepala Sekolah\n\nDrs. H. Ahmad Fauzi, M.Pd.',
      {
        signer: {
          name: 'Drs. H. Ahmad Fauzi, M.Pd.',
          title: 'Kepala Sekolah',
          nip: null,
          signatureData: PNG_PIXEL,
        },
      },
    );
    expect(pageCount(await render('surat-pendek', <LetterDocument doc={doc} />))).toBe(1);
  });

  it('merender surat kosong tanpa alamat', async () => {
    const doc = await base('', { address: null });
    expect(pageCount(await render('surat-kosong', <LetterDocument doc={doc} />))).toBe(1);
  });

  it('merender surat panjang lebih dari satu halaman', async () => {
    const para =
      'Dengan hormat, kami sampaikan bahwa kegiatan belajar mengajar semester ganjil berlangsung sesuai kalender akademik; mohon kerja sama Bapak/Ibu wali murid dalam pendampingan belajar di rumah, termasuk kehadiran pada pertemuan wali murid.';
    const doc = await base(`SURAT EDARAN\n\n${Array.from({ length: 40 }, () => para).join('\n\n')}`);
    expect(pageCount(await render('surat-panjang', <LetterDocument doc={doc} />))).toBeGreaterThanOrEqual(2);
  });
});

describe('PDF sertifikat PKL', () => {
  const base: CertificateDoc = {
    schoolName: SCHOOL,
    studentName: LONG_NAME,
    className: 'XII Teknik Komputer dan Jaringan 2',
    partnerName: 'PT Telekomunikasi Indonesia (Persero) Tbk Witel Jawa Barat Selatan',
    periodName: 'PKL Semester Ganjil 2026/2027',
    startsOn: '2026-07-20',
    endsOn: '2026-11-20',
    finalScore: 88.5,
    predicate: 'B',
    aspects: [
      { name: 'Disiplin dan tanggung jawab', weight: 30, value: 90 },
      { name: 'Kompetensi teknis', weight: 40, value: 85.5 },
      { name: 'Komunikasi dan kerja sama tim', weight: 30, value: null },
    ],
    place: 'Bandung Barat',
    dateIso: '2026-11-25',
    principalName: 'Drs. H. Ahmad Fauzi, M.Pd.',
    industrySupervisorName: 'Ir. Budi Santoso',
  };

  it('merender sertifikat lengkap satu halaman', async () => {
    expect(pageCount(await render('sertifikat-lengkap', <CertificateDocument doc={base} />))).toBe(1);
  });

  it('merender sertifikat tanpa aspek, kota, kelas, dan pembimbing', async () => {
    const doc = {
      ...base,
      aspects: [],
      place: '',
      className: null,
      industrySupervisorName: null,
      predicate: 'D' as const,
      finalScore: 0,
    };
    expect(pageCount(await render('sertifikat-kosong', <CertificateDocument doc={doc} />))).toBe(1);
  });

  it('merender sertifikat dengan 25 aspek penilaian', async () => {
    const aspects = Array.from({ length: 25 }, (_, i) => ({
      name: `Aspek penilaian nomor ${i + 1}`,
      weight: 4,
      value: 80 + (i % 10),
    }));
    await render('sertifikat-banyak-aspek', <CertificateDocument doc={{ ...base, aspects }} />);
  });
});

describe('PDF rapor', () => {
  const subj = (i: number, below = false) => ({
    subjectId: `m${i}`,
    name: i % 4 === 0 ? 'Pendidikan Agama Islam dan Budi Pekerti' : `Mata Pelajaran ${i + 1}`,
    kkm: 75,
    final: below ? 60 : 80 + (i % 15),
    predicate: (below ? 'D' : 'B') as 'D' | 'B',
    description:
      'Ananda menunjukkan penguasaan yang baik dalam memahami materi, namun perlu meningkatkan ketelitian dalam menyelesaikan soal bertipe analisis.',
    belowKkm: below,
  });
  const base: ReportCardDoc = {
    status: 'final',
    school: { name: SCHOOL, address: ADDRESS, city: 'Bandung Barat' },
    semester: { id: 'sm1', name: 'Ganjil', academicYear: '2026/2027' },
    student: { id: 's1', name: LONG_NAME, nis: '2026001', nisn: '0123456789', className: 'VII-A', level: 7 },
    subjects: Array.from({ length: 12 }, (_, i) => subj(i, i === 3)),
    extracurriculars: [
      { name: 'Pramuka', predicate: 'A', note: 'Aktif dan disiplin' },
      { name: "Tahfidz Al-Qur'an", predicate: null, note: null },
    ],
    attendance: { sick: 2, excused: 1, absent: 0 },
    homeroomNote: 'Pertahankan prestasi dan tingkatkan kedisiplinan. Ananda sangat aktif di kelas.',
    homeroomTeacher: { name: 'Hj. Nurul Hidayati, S.Pd.', nip: '198001012005012001' },
    principal: { name: 'Drs. H. Ahmad Fauzi, M.Pd.', nip: null },
    rank: { position: 3, of: 32 },
    generatedAt: '2026-12-18T02:00:00.000Z',
  };

  it('merender rapor final satu siswa', async () => {
    const buf = await render('rapor-final', <ReportCardDocument docs={[base]} />);
    expect(pageCount(buf)).toBeGreaterThanOrEqual(1);
  });

  it('merender rapor draf dengan data kosong', async () => {
    const empty: ReportCardDoc = {
      ...base,
      status: 'draft',
      subjects: [],
      extracurriculars: [],
      homeroomNote: null,
      homeroomTeacher: null,
      principal: null,
      rank: null,
      school: { name: 'S', address: null, city: null },
      student: { id: 's', name: 'A', nis: null, nisn: null, className: '-', level: null },
    };
    expect(pageCount(await render('rapor-kosong-draf', <ReportCardDocument docs={[empty]} />))).toBe(1);
  });

  it('merender rapor dengan 40 mapel lebih dari satu halaman', async () => {
    const doc = { ...base, subjects: Array.from({ length: 40 }, (_, i) => subj(i, i % 9 === 0)) };
    expect(
      pageCount(await render('rapor-banyak-mapel', <ReportCardDocument docs={[doc]} />)),
    ).toBeGreaterThanOrEqual(2);
  });

  it('menggabungkan tiga rapor menjadi sedikitnya tiga halaman', async () => {
    const docs = [1, 2, 3].map((n) => ({
      ...base,
      student: { ...base.student, id: `s${n}`, name: `Siswa ${n}` },
    }));
    expect(pageCount(await render('rapor-tiga', <ReportCardDocument docs={docs} />))).toBeGreaterThanOrEqual(
      3,
    );
  });
});

describe('PDF rekap presensi', () => {
  const labels = {
    title: 'Rekap Presensi',
    period: '1 – 31 Oktober 2026',
    generated: 'Dibuat 30 Oktober 2026',
    effectiveDays: 'Hari efektif',
    students: 'Siswa',
    skipped: 'Bolos',
    gateGroup: 'Gerbang (hari)',
    lessonGroup: 'Pelajaran (jam)',
    student: 'Siswa',
    className: 'Kelas',
    totalRow: 'Total',
    dayColumns: ['Hadir', 'Telat', 'Izin', 'Sakit', 'Alpa', 'Kosong'],
    lessonColumns: ['Hadir', 'Izin', 'Sakit', 'Alpa'],
  };
  const row = (i: number) => ({
    name: i % 6 === 0 ? LONG_NAME : `Siswa Contoh ${i + 1}`,
    nis: i % 4 === 0 ? null : `2026${i}`,
    className: i % 3 === 0 ? 'XII Teknik Komputer dan Jaringan 2' : 'VII-A',
    days: [18, 1, 1, 1, 0, 0],
    lessons: [100, 2, 3, 0],
    skipped: i % 5,
  });
  const totals = (n: number) => ({
    days: [18 * n, n, n, n, 0, 0],
    lessons: [100 * n, 2 * n, 3 * n, 0],
    skipped: n,
  });
  const props = (n: number) => ({
    schoolName: SCHOOL,
    labels,
    pageTemplate: 'Halaman {page} dari {total}',
    effectiveDays: 20,
    rows: Array.from({ length: n }, (_, i) => row(i)),
    totals: totals(n),
  });

  it('merender rekap kosong satu halaman', async () => {
    expect(pageCount(await render('presensi-kosong', <ReportPdf {...props(0)} />))).toBe(1);
  });

  it('merender 150 siswa menjadi beberapa halaman', async () => {
    expect(pageCount(await render('presensi-banyak', <ReportPdf {...props(150)} />))).toBeGreaterThanOrEqual(
      3,
    );
  });
});

describe('PDF kalender akademik', () => {
  const range = { startsOn: '2026-07-13', endsOn: '2027-06-26' };
  const events = [
    {
      id: 'e1',
      type: 'holiday' as const,
      title: 'Hari Kemerdekaan RI',
      startsOn: '2026-08-17',
      endsOn: '2026-08-17',
      className: null,
    },
    {
      id: 'e2',
      type: 'exam' as const,
      title: 'Penilaian Tengah Semester',
      startsOn: '2026-10-05',
      endsOn: '2026-10-09',
      className: 'VII-A',
    },
  ];
  const labels = {
    title: 'Kalender Akademik',
    effective: 'Hari efektif',
    workdays: 'Hari kerja',
    closures: 'Libur',
    eventsTitle: 'Daftar acara',
    types: { holiday: 'Libur', break: 'Jeda', exam: 'Ujian', activity: 'Kegiatan' },
    weekend: 'Akhir pekan',
    generated: 'Dibuat 30 Oktober 2026',
  };
  const days = { total: 349, workdays: 250, nonEffective: 40, effective: 210 };
  const pdfEvents = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      type: (['holiday', 'break', 'exam', 'activity'] as const)[i % 4],
      title: `Kegiatan sekolah tahunan nomor ${i + 1} dengan judul yang cukup panjang`,
      range: '17 Agustus 2026 – 19 Agustus 2026',
      className: i % 3 ? null : 'XII Teknik Komputer dan Jaringan 2',
    }));

  it('merender kalender tanpa acara satu halaman', async () => {
    const months = buildYearPlanner(range, []);
    const el = (
      <CalendarPdf
        locale="id"
        schoolName={SCHOOL}
        yearName="2026/2027"
        months={months}
        days={days}
        events={[]}
        labels={labels}
      />
    );
    expect(pageCount(await render('kalender-kosong', el))).toBe(1);
  });

  it('merender kalender dengan 80 acara menjadi beberapa halaman', async () => {
    const months = buildYearPlanner(range, events);
    for (const locale of ['id', 'en', 'su']) {
      const el = (
        <CalendarPdf
          locale={locale}
          schoolName={SCHOOL}
          yearName="2026/2027"
          months={months}
          days={days}
          events={pdfEvents(80)}
          labels={labels}
        />
      );
      expect(pageCount(await render(`kalender-banyak-${locale}`, el))).toBeGreaterThanOrEqual(2);
    }
  });
});
