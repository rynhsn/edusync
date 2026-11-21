import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { Fragment } from 'react';
import { type ReportDisplayOptions, reportView, subjectGroupHeading } from '../../../../lib/report-v2';
import { formatGrade, formatIdDate } from './format';
import type { ReportCardDoc } from './types';

const INK = '#111111';
const MUTED = '#555555';
const LINE = '#999999';
const SOFT = '#E5E5E5';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
  },
  kop: {
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
    marginBottom: 10,
  },
  school: { fontFamily: 'Helvetica-Bold', fontSize: 14, textAlign: 'center' },
  address: { fontSize: 8, color: MUTED, marginTop: 2, textAlign: 'center' },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },
  identity: { flexDirection: 'row', marginBottom: 10 },
  identityCol: { flex: 1 },
  idRow: { flexDirection: 'row', marginBottom: 2 },
  idLabel: { width: 70, color: MUTED },
  idValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  section: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 8, marginBottom: 4 },
  head: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: INK,
    backgroundColor: SOFT,
  },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  center: { textAlign: 'center' },
  small: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  attendance: { flexDirection: 'row', gap: 24 },
  note: { borderWidth: 0.75, borderColor: LINE, padding: 6, minHeight: 36 },
  responseBox: { borderWidth: 0.75, borderColor: LINE, padding: 6, minHeight: 54 },
  responseName: { fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  sign: { flexDirection: 'row', marginTop: 14 },
  signCol: { flex: 1, alignItems: 'center' },
  signSpace: { height: 48 },
  signName: { fontFamily: 'Helvetica-Bold', textDecoration: 'underline', textAlign: 'center' },
  watermark: {
    position: 'absolute',
    top: 14,
    right: 40,
    fontSize: 8,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
  },
});

// Lebar kolom tetap pada tabel nilai dan ekskul; kolom teks berbagi sisa lebar.
const W = { no: 24, grade: 38, pred: 46 };

function Signature({ label, name, nip }: { label: string; name?: string | null; nip?: string | null }) {
  return (
    <View style={styles.signCol} wrap={false}>
      <Text>{label}</Text>
      <View style={styles.signSpace} />
      <Text style={styles.signName}>{name || '..............................'}</Text>
      {nip ? <Text style={styles.small}>NIP. {nip}</Text> : null}
    </View>
  );
}

/**
 * Teks PDF yang mengikuti bahasa pengguna (PDF dirender di klien tanpa hook, jadi diteruskan lewat props): tanda tangan, judul,
 * label NSM, dan bagian kokurikuler. Teks PDF lain masih berbahasa Indonesia. Bagian opsional jatuh ke bahasa Indonesia.
 */
export interface SignLabels {
  parent: string;
  homeroom: string;
  principal: string;
  title?: string;
  docTitle?: string;
  /** Memuat `{name}`. */
  docTitleStudent?: string;
  nsm?: string;
  cocurricular?: { title: string; dimension: string; achievement: string; remark: string };
  /** Identitas keahlian di kop dan subjudul mapel tanpa kelompok (rapor SMK berkelompok). */
  expertise?: { field: string; program: string; concentration: string; groupOther: string };
  /** Blok Praktik Kerja Lapangan di bawah tabel mapel (5.4). */
  internship?: {
    title: string;
    time: string;
    present: string;
    schoolSup: string;
    industrySup: string;
    aspect: string;
    final: string;
    certificate: string;
  };
  /** Blok Uji Kompetensi Keahlian di bawah blok PKL (5.6). */
  ukk?: {
    title: string;
    pattern: string;
    concentration: string;
    attempt: string;
    score: string;
    band: string;
    certificate: string;
    statement: string;
    patterns: { lsp: string; industry: string; independent: string };
  };
}
const DEFAULT_SIGN_LABELS: Required<SignLabels> = {
  parent: 'Orang tua / wali',
  homeroom: 'Wali kelas',
  principal: 'Kepala sekolah',
  title: 'LAPORAN HASIL BELAJAR',
  docTitle: 'Rapor',
  docTitleStudent: 'Rapor {name}',
  nsm: 'NSM',
  cocurricular: {
    title: 'Penilaian Kokurikuler',
    dimension: 'Dimensi / Topik',
    achievement: 'Capaian',
    remark: 'Keterangan',
  },
  expertise: {
    field: 'Bidang Keahlian',
    program: 'Program Keahlian',
    concentration: 'Konsentrasi Keahlian',
    groupOther: 'Lainnya',
  },
  internship: {
    title: 'Praktik Kerja Lapangan',
    time: 'Waktu',
    present: 'Hari hadir',
    schoolSup: 'Pembimbing sekolah',
    industrySup: 'Pembimbing industri',
    aspect: 'Aspek',
    final: 'Nilai akhir',
    certificate: 'No. sertifikat',
  },
  ukk: {
    title: 'Uji Kompetensi Keahlian (UKK)',
    pattern: 'Pola',
    concentration: 'Konsentrasi',
    attempt: 'Percobaan',
    score: 'Nilai akhir',
    band: 'Kategori',
    certificate: 'No. sertifikat',
    statement: 'No. surat keterangan',
    patterns: { lsp: 'LSP', industry: 'Dunia kerja', independent: 'Mandiri' },
  },
};

/** Rapor satu siswa: halaman A4 portrait, menyambung ke halaman berikut (header tabel berulang) bila mapel banyak. */
export function ReportCardPage({
  doc,
  labels: given,
  display,
}: {
  doc: ReportCardDoc;
  labels?: SignLabels;
  /** Bendera pengaturan rapor (kokurikuler, kotak tanggapan). Dokumen v1 tanpa bendera tetap berwujud v1. */
  display?: ReportDisplayOptions;
}) {
  const { school, semester, student, attendance } = doc;
  const labels = { ...DEFAULT_SIGN_LABELS, ...given };
  const place = [school.city, formatIdDate(doc.generatedAt)].filter(Boolean).join(', ');
  const view = reportView(doc, display);
  return (
    <Page size="A4" style={styles.page}>
      {doc.status === 'draft' ? (
        <Text style={styles.watermark} fixed>
          DRAF
        </Text>
      ) : null}

      <View style={styles.kop}>
        <Text style={styles.school}>{school.name}</Text>
        {school.address ? <Text style={styles.address}>{school.address}</Text> : null}
        {doc.schoolNsm ? (
          <Text style={styles.address}>
            {labels.nsm} {doc.schoolNsm}
          </Text>
        ) : null}
        {doc.expertise ? (
          <>
            <Text style={styles.address}>
              {labels.expertise.field}: {doc.expertise.field}
            </Text>
            <Text style={styles.address}>
              {labels.expertise.program}: {doc.expertise.program}
            </Text>
            <Text style={styles.address}>
              {labels.expertise.concentration}: {doc.expertise.concentration}
            </Text>
          </>
        ) : null}
      </View>
      <Text style={styles.title}>{labels.title}</Text>

      <View style={styles.identity} wrap={false}>
        <View style={styles.identityCol}>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Nama</Text>
            <Text style={styles.idValue}>{student.name}</Text>
          </View>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>NIS / NISN</Text>
            <Text style={styles.idValue}>
              {[student.nis, student.nisn].filter(Boolean).join(' / ') || '-'}
            </Text>
          </View>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Kelas</Text>
            <Text style={styles.idValue}>{student.className}</Text>
          </View>
        </View>
        <View style={styles.identityCol}>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Semester</Text>
            <Text style={styles.idValue}>{semester.name}</Text>
          </View>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Tahun Ajaran</Text>
            <Text style={styles.idValue}>{semester.academicYear}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.section}>
        {view.descriptive ? 'Capaian Mata Pelajaran' : 'Nilai Mata Pelajaran'}
      </Text>
      {/* Header tabel dibungkus agar hanya diulang di halaman yang memuat baris nilai. */}
      <View>
        <View style={styles.head} fixed>
          <Text style={[styles.cell, styles.bold, styles.center, { width: W.no }]}>No</Text>
          <Text style={[styles.cell, styles.bold, { flex: 3 }]}>Mata Pelajaran</Text>
          {view.showNumbers ? (
            <>
              <Text style={[styles.cell, styles.bold, styles.center, { width: W.grade }]}>Nilai</Text>
              <Text style={[styles.cell, styles.bold, styles.center, { width: W.pred }]}>Predikat</Text>
            </>
          ) : null}
          <Text style={[styles.cell, styles.bold, { flex: 4 }]}>Deskripsi Capaian</Text>
        </View>
        {doc.subjects.map((s, i) => {
          const heading = subjectGroupHeading(doc.subjects, i);
          return (
            <Fragment key={s.subjectId}>
              {heading ? (
                <View style={styles.row} wrap={false} minPresenceAhead={30}>
                  <Text style={[styles.cell, styles.bold, { flex: 1 }]}>
                    {heading.label ?? labels.expertise.groupOther}
                  </Text>
                </View>
              ) : null}
              <View style={styles.row} wrap={false}>
                <Text style={[styles.cell, styles.center, { width: W.no }]}>{i + 1}</Text>
                <Text style={[styles.cell, { flex: 3 }]}>{s.name}</Text>
                {view.showNumbers ? (
                  <>
                    <Text
                      style={[styles.cell, styles.center, s.belowKkm ? styles.bold : {}, { width: W.grade }]}
                    >
                      {s.final == null ? '-' : `${formatGrade(s.final)}${s.belowKkm ? '*' : ''}`}
                    </Text>
                    <Text style={[styles.cell, styles.center, { width: W.pred }]}>{s.predicate ?? '-'}</Text>
                  </>
                ) : null}
                <Text style={[styles.cell, { flex: 4 }]}>{s.description || '-'}</Text>
              </View>
            </Fragment>
          );
        })}
      </View>
      {view.showBelowKkmNote ? (
        <Text style={styles.small}>* Nilai di bawah KKM (Kriteria Ketuntasan Minimal).</Text>
      ) : null}

      {doc.internship?.length ? (
        <View>
          <Text style={styles.section}>{labels.internship.title}</Text>
          {doc.internship.map((e) => (
            <View key={`${e.periodName}-${e.partner}-${e.startsOn}`} wrap={false} style={{ marginBottom: 4 }}>
              <Text style={styles.bold}>{e.partner}</Text>
              <Text style={styles.small}>
                {labels.internship.time}: {formatIdDate(e.startsOn)} - {formatIdDate(e.endsOn)} (
                {e.periodName}). {labels.internship.present}: {e.presentDays}
              </Text>
              {e.schoolSupervisor || e.industrySupervisor ? (
                <Text style={styles.small}>
                  {[
                    e.schoolSupervisor ? `${labels.internship.schoolSup}: ${e.schoolSupervisor}` : null,
                    e.industrySupervisor ? `${labels.internship.industrySup}: ${e.industrySupervisor}` : null,
                  ]
                    .filter(Boolean)
                    .join('. ')}
                </Text>
              ) : null}
              {view.showNumbers ? (
                <>
                  <View style={styles.head}>
                    <Text style={[styles.cell, styles.bold, { flex: 3 }]}>{labels.internship.aspect}</Text>
                    <Text style={[styles.cell, styles.bold, styles.center, { width: W.grade }]}>Nilai</Text>
                  </View>
                  {e.aspects.map((a) => (
                    <View key={a.name} style={styles.row}>
                      <Text style={[styles.cell, { flex: 3 }]}>{a.name}</Text>
                      <Text style={[styles.cell, styles.center, { width: W.grade }]}>
                        {a.value == null ? '-' : formatGrade(a.value)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.row}>
                    <Text style={[styles.cell, styles.bold, { flex: 3 }]}>
                      {labels.internship.final}
                      {e.predicate ? ` (${e.predicate})` : ''}
                    </Text>
                    <Text style={[styles.cell, styles.bold, styles.center, { width: W.grade }]}>
                      {e.final == null ? '-' : formatGrade(e.final)}
                    </Text>
                  </View>
                </>
              ) : null}
              {e.certificateNo ? (
                <Text style={styles.small}>
                  {labels.internship.certificate}: {e.certificateNo}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {doc.ukk?.length ? (
        <View>
          <Text style={styles.section}>{labels.ukk.title}</Text>
          {doc.ukk.map((u) => (
            <View key={`${u.title}-${u.attempt}`} wrap={false} style={{ marginBottom: 4 }}>
              <Text style={styles.bold}>{u.title}</Text>
              <Text style={styles.small}>
                {labels.ukk.pattern}: {labels.ukk.patterns[u.pattern]}. {labels.ukk.concentration}:{' '}
                {u.concentration}. {labels.ukk.attempt}: {u.attempt}
              </Text>
              <Text style={styles.small}>
                {[
                  view.showNumbers ? `${labels.ukk.score}: ${formatGrade(u.finalScore)}` : null,
                  u.band ? `${labels.ukk.band}: ${u.band.label}` : null,
                  u.certificateNo ? `${labels.ukk.certificate}: ${u.certificateNo}` : null,
                  u.statementNo ? `${labels.ukk.statement}: ${u.statementNo}` : null,
                ]
                  .filter(Boolean)
                  .join('. ')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View wrap={false}>
        <Text style={styles.section}>Ekstrakurikuler</Text>
        <View style={styles.head}>
          <Text style={[styles.cell, styles.bold, styles.center, { width: W.no }]}>No</Text>
          <Text style={[styles.cell, styles.bold, { flex: 3 }]}>Kegiatan</Text>
          <Text style={[styles.cell, styles.bold, styles.center, { width: W.pred }]}>Predikat</Text>
          <Text style={[styles.cell, styles.bold, { flex: 4 }]}>Keterangan</Text>
        </View>
        {doc.extracurriculars.length === 0 ? (
          <View style={styles.row}>
            <Text style={[styles.cell, styles.center, { width: W.no }]}>-</Text>
            <Text style={[styles.cell, { flex: 3 }]}>-</Text>
            <Text style={[styles.cell, styles.center, { width: W.pred }]}>-</Text>
            <Text style={[styles.cell, { flex: 4 }]}>-</Text>
          </View>
        ) : (
          doc.extracurriculars.map((e, i) => (
            <View key={`${e.name}-${e.predicate ?? ''}-${e.note ?? ''}`} style={styles.row}>
              <Text style={[styles.cell, styles.center, { width: W.no }]}>{i + 1}</Text>
              <Text style={[styles.cell, { flex: 3 }]}>{e.name}</Text>
              <Text style={[styles.cell, styles.center, { width: W.pred }]}>{e.predicate ?? '-'}</Text>
              <Text style={[styles.cell, { flex: 4 }]}>{e.note || '-'}</Text>
            </View>
          ))
        )}
      </View>

      {view.cocurricularPrograms ? (
        <View>
          <Text style={styles.section}>{labels.cocurricular.title}</Text>
          {view.cocurricularPrograms.map((p) => (
            <View key={p.programId} wrap={false} style={{ marginBottom: 4 }}>
              <Text style={styles.bold}>{p.title}</Text>
              <View style={styles.head}>
                <Text style={[styles.cell, styles.bold, { flex: 3 }]}>{labels.cocurricular.dimension}</Text>
                <Text style={[styles.cell, styles.bold, { flex: 2 }]}>{labels.cocurricular.achievement}</Text>
                <Text style={[styles.cell, styles.bold, { flex: 3 }]}>{labels.cocurricular.remark}</Text>
              </View>
              {p.items.map((i) => (
                <View key={i.code} style={styles.row}>
                  <Text style={[styles.cell, { flex: 3 }]}>{i.label}</Text>
                  <Text style={[styles.cell, { flex: 2 }]}>{i.level?.label ?? '-'}</Text>
                  <Text style={[styles.cell, { flex: 3 }]}>{i.note || '-'}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {view.cocurricular.show ? (
        <View wrap={false}>
          <Text style={styles.section}>Kokurikuler</Text>
          <View style={styles.note}>
            <Text>{view.cocurricular.text || '-'}</Text>
          </View>
        </View>
      ) : null}

      <View wrap={false}>
        <Text style={styles.section}>Ketidakhadiran</Text>
        <View style={styles.attendance}>
          <Text>Sakit: {attendance.sick} hari</Text>
          <Text>Izin: {attendance.excused} hari</Text>
          <Text>Tanpa keterangan: {attendance.absent} hari</Text>
        </View>
      </View>

      <View wrap={false}>
        <Text style={styles.section}>Catatan Wali Kelas</Text>
        <View style={styles.note}>
          <Text>{doc.homeroomNote || '-'}</Text>
        </View>
        {view.showRank && doc.rank ? (
          <Text style={{ marginTop: 6 }}>
            Peringkat: <Text style={styles.bold}>{doc.rank.position}</Text> dari {doc.rank.of} murid
          </Text>
        ) : null}
      </View>

      {view.development.show ? (
        <View wrap={false}>
          <Text style={styles.section}>Catatan Perkembangan</Text>
          <View style={styles.note}>
            <Text>{view.development.text || '-'}</Text>
          </View>
        </View>
      ) : null}

      {view.responseBox.show ? (
        <View wrap={false}>
          <Text style={styles.section}>Tanggapan Orang Tua / Wali</Text>
          {/* Dibiarkan kosong bila belum ada tanggapan, supaya dapat ditulis tangan pada rapor cetak. */}
          <View style={styles.responseBox}>
            {view.responseBox.items.map((r) => (
              <View key={`${r.guardianName}-${r.text}`} style={{ marginBottom: 3 }}>
                <Text style={styles.responseName}>{r.guardianName}</Text>
                <Text>{r.text}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View wrap={false}>
        <Text style={{ textAlign: 'right', marginTop: 12 }}>{place}</Text>
        <View style={styles.sign}>
          <Signature label={labels.parent} />
          <Signature
            label={labels.homeroom}
            name={doc.homeroomTeacher?.name}
            nip={doc.homeroomTeacher?.nip}
          />
          <Signature label={labels.principal} name={doc.principal?.name} nip={doc.principal?.nip} />
        </View>
      </View>
    </Page>
  );
}

/** Satu PDF berisi rapor satu atau banyak siswa, urutan halaman sesuai `docs`. */
export function ReportCardDocument({
  docs,
  labels,
  display,
}: {
  docs: ReportCardDoc[];
  labels?: SignLabels;
  display?: ReportDisplayOptions;
}) {
  const first = docs[0];
  const l = { ...DEFAULT_SIGN_LABELS, ...labels };
  const title =
    first && docs.length === 1 ? l.docTitleStudent.replace('{name}', first.student.name) : l.docTitle;
  return (
    <Document title={title} author="Edusync">
      {docs.map((d) => (
        <ReportCardPage key={d.student.id} doc={d} labels={labels} display={display} />
      ))}
    </Document>
  );
}
