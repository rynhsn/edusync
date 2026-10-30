import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatIdDate, rupiahText } from '../pdf/format';
import type { ArrearsRow } from '../pdf/types';

interface Props {
  schoolName: string;
  /** Contoh: "Tahun ajaran 2026/2027 · Semua kelas". */
  scope: string;
  asOf: string;
  generated: string;
  rows: ArrearsRow[];
  totals: { students: number; openInvoices: number; outstanding: number; overdueOutstanding: number };
}

const TEAL = '#0F6B68';
const BORDER = '#D5E3E4';
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
  statValue: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Helvetica-Bold' },
  statLabel: { color: '#CFEDEA', fontSize: 7 },
  headRow: {
    flexDirection: 'row',
    backgroundColor: '#EAF3F3',
    borderBottomWidth: 1,
    borderBottomColor: TEAL,
    paddingVertical: 3,
  },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, paddingVertical: 3 },
  totalRow: { flexDirection: 'row', backgroundColor: '#EAF3F3', paddingVertical: 4 },
  idx: { width: 24, paddingLeft: 4, color: '#6B7F86' },
  name: { flex: 1, paddingRight: 6 },
  cls: { width: 56 },
  cnt: { width: 50, textAlign: 'right', paddingRight: 6 },
  money: { width: 90, textAlign: 'right', paddingRight: 6 },
  due: { width: 80, textAlign: 'right', paddingRight: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6B7F86', fontSize: 7 },
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

/** PDF laporan tunggakan SPP: ringkasan dan tabel per siswa (A4 lanskap). Teks tetap Bahasa Indonesia seperti PDF rapor. */
export function ArrearsPdf({ schoolName, scope, asOf, generated, rows, totals }: Props) {
  return (
    <Document title="Laporan Tunggakan" author="Edusync">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header} wrap={false}>
          <View>
            <Text style={styles.school}>{schoolName}</Text>
            <Text style={styles.title}>Laporan Tunggakan</Text>
            <Text style={styles.period}>
              {scope} · Per {formatIdDate(asOf)}
            </Text>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totals.students}</Text>
              <Text style={styles.statLabel}>Siswa</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{rupiahText(totals.outstanding)}</Text>
              <Text style={styles.statLabel}>Total tunggakan</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{rupiahText(totals.overdueOutstanding)}</Text>
              <Text style={styles.statLabel}>Lewat jatuh tempo</Text>
            </View>
          </View>
        </View>

        <View style={styles.headRow} fixed>
          <Text style={[styles.idx, styles.bold]}>#</Text>
          <Text style={[styles.name, styles.bold]}>Siswa</Text>
          <Text style={[styles.cls, styles.bold]}>Kelas</Text>
          <Text style={[styles.cnt, styles.bold]}>Tagihan</Text>
          <Text style={[styles.money, styles.bold]}>Tunggakan</Text>
          <Text style={[styles.money, styles.bold]}>Lewat tempo</Text>
          <Text style={[styles.due, styles.bold]}>Jatuh tempo tertua</Text>
        </View>

        {rows.map((r, i) => (
          <View key={r.studentId} style={styles.row} wrap={false}>
            <Text style={styles.idx}>{i + 1}</Text>
            <View style={styles.name}>
              <Text>{r.name}</Text>
              {r.nis ? <Text style={styles.muted}>{r.nis}</Text> : null}
            </View>
            <Text style={styles.cls}>{r.className}</Text>
            <Text style={styles.cnt}>{r.openInvoices}</Text>
            <Text style={styles.money}>{rupiahText(r.outstanding)}</Text>
            <Text style={[styles.money, r.overdueOutstanding > 0 ? { color: '#B91C1C' } : {}]}>
              {rupiahText(r.overdueOutstanding)}
            </Text>
            <Text style={styles.due}>{r.oldestDue ? formatIdDate(r.oldestDue) : '-'}</Text>
          </View>
        ))}

        <View style={styles.totalRow} wrap={false}>
          <Text style={styles.idx} />
          <Text style={[styles.name, styles.bold]}>Total</Text>
          <Text style={styles.cls} />
          <Text style={[styles.cnt, styles.bold]}>{totals.openInvoices}</Text>
          <Text style={[styles.money, styles.bold]}>{rupiahText(totals.outstanding)}</Text>
          <Text style={[styles.money, styles.bold]}>{rupiahText(totals.overdueOutstanding)}</Text>
          <Text style={styles.due} />
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {schoolName} · {generated}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
