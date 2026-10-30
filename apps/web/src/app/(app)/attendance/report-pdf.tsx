import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface ReportPdfRow {
  name: string;
  nis: string | null;
  className: string;
  /** present, late, excused, sick, absent, notRecorded */
  days: number[];
  /** present, excused, sick, absent */
  lessons: number[];
  skipped: number;
}

export interface ReportPdfLabels {
  title: string;
  period: string;
  generated: string;
  effectiveDays: string;
  students: string;
  skipped: string;
  gateGroup: string;
  lessonGroup: string;
  student: string;
  className: string;
  totalRow: string;
  dayColumns: string[];
  lessonColumns: string[];
}

interface Props {
  schoolName: string;
  labels: ReportPdfLabels;
  /** Teks "Halaman x dari y" sudah diformat per bahasa; `{page}` dan `{total}` diisi saat render. */
  pageTemplate: string;
  effectiveDays: number;
  rows: ReportPdfRow[];
  /** Jumlah per kolom, urutan sama dengan baris. */
  totals: { days: number[]; lessons: number[]; skipped: number };
}

const TEAL = '#0F6B68';
const BORDER = '#D5E3E4';
const NUM = 34;
const styles = StyleSheet.create({
  page: { padding: 28, paddingBottom: 40, fontFamily: 'Helvetica', fontSize: 8.5, color: '#0D1F24' },
  header: {
    backgroundColor: TEAL,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  school: { color: '#CFEDEA', fontSize: 9, marginBottom: 3 },
  title: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Helvetica-Bold' },
  period: { color: '#CFEDEA', fontSize: 9, marginTop: 3 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    backgroundColor: '#FFFFFF22',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 70,
  },
  statValue: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Helvetica-Bold' },
  statLabel: { color: '#CFEDEA', fontSize: 7 },
  groupRow: { flexDirection: 'row', backgroundColor: '#EAF3F3' },
  headRow: {
    flexDirection: 'row',
    backgroundColor: '#EAF3F3',
    borderBottomWidth: 1,
    borderBottomColor: TEAL,
  },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, paddingVertical: 3 },
  totalRow: { flexDirection: 'row', backgroundColor: '#EAF3F3', paddingVertical: 4 },
  idx: { width: 22, paddingLeft: 4, color: '#6B7F86' },
  name: { flex: 1, paddingRight: 6 },
  cls: { width: 50 },
  num: { width: NUM, textAlign: 'right', paddingRight: 4 },
  group: { fontFamily: 'Helvetica-Bold', color: TEAL, textAlign: 'center', paddingVertical: 3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6B7F86', fontSize: 7 },
  skippedCell: { width: 44, textAlign: 'right', paddingRight: 4 },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 7,
    color: '#6B7F86',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

/** Dokumen PDF rekap absensi: judul sekolah, rentang tanggal, ringkasan, dan tabel per siswa (A4 lanskap). */
export function ReportPdf({ schoolName, labels, pageTemplate, effectiveDays, rows, totals }: Props) {
  const dayWidth = NUM * labels.dayColumns.length;
  const lessonWidth = NUM * labels.lessonColumns.length;
  return (
    <Document title={labels.title} author="Edusync">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header} wrap={false}>
          <View>
            <Text style={styles.school}>{schoolName}</Text>
            <Text style={styles.title}>{labels.title}</Text>
            <Text style={styles.period}>{labels.period}</Text>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{rows.length}</Text>
              <Text style={styles.statLabel}>{labels.students}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{effectiveDays}</Text>
              <Text style={styles.statLabel}>{labels.effectiveDays}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totals.skipped}</Text>
              <Text style={styles.statLabel}>{labels.skipped}</Text>
            </View>
          </View>
        </View>

        <View fixed>
          <View style={styles.groupRow}>
            <View style={{ flex: 1 }} />
            <Text style={[styles.group, { width: dayWidth }]}>{labels.gateGroup}</Text>
            <Text style={[styles.group, { width: lessonWidth }]}>{labels.lessonGroup}</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.headRow}>
            <Text style={[styles.idx, styles.bold]}>#</Text>
            <Text style={[styles.name, styles.bold]}>{labels.student}</Text>
            <Text style={[styles.cls, styles.bold]}>{labels.className}</Text>
            {labels.dayColumns.map((c) => (
              <Text key={`d-${c}`} style={[styles.num, styles.bold]}>
                {c}
              </Text>
            ))}
            {labels.lessonColumns.map((c) => (
              <Text key={`l-${c}`} style={[styles.num, styles.bold]}>
                {c}
              </Text>
            ))}
            <Text style={[styles.skippedCell, styles.bold]}>{labels.skipped}</Text>
          </View>
        </View>

        {rows.map((r, i) => (
          <View key={`${r.name}-${r.className}-${r.nis ?? i}`} style={styles.row} wrap={false}>
            <Text style={styles.idx}>{i + 1}</Text>
            <View style={styles.name}>
              <Text>{r.name}</Text>
              {r.nis && <Text style={styles.muted}>{r.nis}</Text>}
            </View>
            <Text style={styles.cls}>{r.className}</Text>
            {r.days.map((n, k) => (
              <Text key={`d${labels.dayColumns[k]}`} style={styles.num}>
                {n}
              </Text>
            ))}
            {r.lessons.map((n, k) => (
              <Text key={`l${labels.lessonColumns[k]}`} style={styles.num}>
                {n}
              </Text>
            ))}
            <Text
              style={[
                styles.skippedCell,
                r.skipped > 0 ? { color: '#B91C1C', fontFamily: 'Helvetica-Bold' } : {},
              ]}
            >
              {r.skipped}
            </Text>
          </View>
        ))}

        <View style={styles.totalRow} wrap={false}>
          <Text style={styles.idx} />
          <Text style={[styles.name, styles.bold]}>{labels.totalRow}</Text>
          <Text style={styles.cls} />
          {totals.days.map((n, k) => (
            <Text key={`td${labels.dayColumns[k]}`} style={[styles.num, styles.bold]}>
              {n}
            </Text>
          ))}
          {totals.lessons.map((n, k) => (
            <Text key={`tl${labels.lessonColumns[k]}`} style={[styles.num, styles.bold]}>
              {n}
            </Text>
          ))}
          <Text style={[styles.skippedCell, styles.bold]}>{totals.skipped}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {schoolName} · {labels.generated}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              pageTemplate.replace('{page}', String(pageNumber)).replace('{total}', String(totalPages))
            }
          />
        </View>
      </Page>
    </Document>
  );
}
