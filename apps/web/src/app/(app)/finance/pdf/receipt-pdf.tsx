import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatIdDate, methodLabel, rupiahText, terbilangRupiah } from './format';
import type { ReceiptDoc } from './types';

const INK = '#111111';
const MUTED = '#555555';
const LINE = '#999999';
const SOFT = '#E5E5E5';

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
  },
  kop: {
    alignItems: 'center',
    paddingBottom: 5,
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
    marginBottom: 8,
  },
  school: { fontFamily: 'Helvetica-Bold', fontSize: 13, textAlign: 'center' },
  address: { fontSize: 8, color: MUTED, marginTop: 2, textAlign: 'center' },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 6,
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: 78, color: MUTED },
  value: { flex: 1, fontFamily: 'Helvetica-Bold' },
  head: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: INK,
    backgroundColor: SOFT,
    marginTop: 4,
  },
  item: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  right: { textAlign: 'right' },
  totalRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK },
  terbilang: { marginTop: 5, fontStyle: 'italic' },
  note: { marginTop: 4, color: MUTED, fontSize: 8 },
  sign: { alignItems: 'center', width: 170, alignSelf: 'flex-end', marginTop: 10 },
  signSpace: { height: 36 },
  signName: { fontFamily: 'Helvetica-Bold', textDecoration: 'underline', textAlign: 'center' },
  watermark: {
    position: 'absolute',
    top: 150,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    fontSize: 64,
    color: '#DC2626',
    opacity: 0.18,
    transform: 'rotate(-18deg)',
  },
  voidReason: {
    position: 'absolute',
    top: 232,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
    color: '#B91C1C',
    fontFamily: 'Helvetica-Bold',
  },
});

const W = { no: 26, amount: 100 };

/** Kwitansi pembayaran satu halaman A5 lanskap; rincian yang sangat panjang menyambung ke halaman berikut. */
export function ReceiptDocument({ receipt }: { receipt: ReceiptDoc }) {
  const place = formatIdDate(receipt.paidAt);
  const student = receipt.student;
  return (
    <Document title={`Kwitansi ${receipt.receiptNo}`} author="Edusync">
      <Page size="A5" orientation="landscape" style={styles.page}>
        {receipt.voided ? (
          <>
            <Text style={styles.watermark} fixed>
              DIBATALKAN
            </Text>
            {receipt.voidReason ? (
              <Text style={styles.voidReason} fixed>
                {receipt.voidReason}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={styles.kop}>
          <Text style={styles.school}>{receipt.school.name}</Text>
          {receipt.school.address ? <Text style={styles.address}>{receipt.school.address}</Text> : null}
        </View>
        <Text style={styles.title}>KWITANSI PEMBAYARAN</Text>

        <View style={styles.meta} wrap={false}>
          <View style={{ flex: 1 }}>
            <View style={styles.row}>
              <Text style={styles.label}>Nomor</Text>
              <Text style={styles.value}>{receipt.receiptNo}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Telah diterima dari</Text>
              <Text style={styles.value}>
                {student.name}
                {student.nis ? ` (${student.nis})` : ''}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Kelas</Text>
              <Text style={styles.value}>{student.className || '-'}</Text>
            </View>
          </View>
          <View style={{ width: 170 }}>
            <View style={styles.row}>
              <Text style={styles.label}>Tanggal</Text>
              <Text style={styles.value}>{place}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Metode</Text>
              <Text style={styles.value}>{methodLabel(receipt.method)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.head} fixed>
          <Text style={[styles.cell, styles.bold, { width: W.no }]}>No</Text>
          <Text style={[styles.cell, styles.bold, { flex: 1 }]}>Keterangan</Text>
          <Text style={[styles.cell, styles.bold, styles.right, { width: W.amount }]}>Jumlah</Text>
        </View>
        {receipt.items.map((it, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: baris kwitansi statis, satu tagihan bisa muncul lebih dari sekali
          <View key={`${it.invoiceId}-${i}`} style={styles.item} wrap={false}>
            <Text style={[styles.cell, { width: W.no }]}>{i + 1}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>{it.title}</Text>
            <Text style={[styles.cell, styles.right, { width: W.amount }]}>{rupiahText(it.amount)}</Text>
          </View>
        ))}
        <View style={styles.totalRow} wrap={false}>
          <Text style={[styles.cell, styles.bold, { flex: 1 }]}>Total</Text>
          <Text style={[styles.cell, styles.bold, styles.right, { width: W.amount }]}>
            {rupiahText(receipt.total)}
          </Text>
        </View>

        <Text style={styles.terbilang} wrap={false}>
          Terbilang: {terbilangRupiah(receipt.total)}
        </Text>
        {receipt.note ? <Text style={styles.note}>Catatan: {receipt.note}</Text> : null}

        <View style={styles.sign} wrap={false}>
          <Text>{place}</Text>
          <Text>Penerima,</Text>
          <View style={styles.signSpace} />
          <Text style={styles.signName}>{receipt.cashierName || '..............................'}</Text>
        </View>
      </Page>
    </Document>
  );
}
