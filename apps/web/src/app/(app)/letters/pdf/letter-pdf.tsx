import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { bodyLines, splitSignatureTail } from '../format';
import type { LetterPdfDoc } from './types';

const INK = '#2d2a6b';
const TEXT = '#1d1b26';
const MUTED = '#55536b';

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 48,
    paddingHorizontal: 62,
    fontFamily: 'Times-Roman',
    fontSize: 12,
    lineHeight: 1.45,
    color: TEXT,
  },
  kop: {
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 3,
    borderBottomColor: INK,
    marginBottom: 3,
  },
  kopRule: { borderBottomWidth: 0.75, borderBottomColor: INK, marginBottom: 16 },
  school: {
    fontFamily: 'Times-Bold',
    fontSize: 17,
    color: INK,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  address: { fontSize: 9.5, color: MUTED, marginTop: 3, textAlign: 'center' },
  title: {
    fontFamily: 'Times-Bold',
    fontSize: 13,
    textAlign: 'center',
    textDecoration: 'underline',
    letterSpacing: 1.5,
    marginVertical: 4,
  },
  line: { textAlign: 'justify' },
  blank: { height: 8 },
  signBlock: { marginTop: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  qrCol: { width: 150 },
  qr: { width: 88, height: 88 },
  qrNote: { fontSize: 7.5, color: MUTED, marginTop: 4, lineHeight: 1.3 },
  qrUrl: { fontSize: 6.5, color: MUTED, marginTop: 2 },
  signCol: { width: 200, alignItems: 'center' },
  signSpace: { height: 62, justifyContent: 'center', alignItems: 'center' },
  signImg: { maxHeight: 60, maxWidth: 170, objectFit: 'contain' },
  signName: { fontFamily: 'Times-Bold', textDecoration: 'underline', textAlign: 'center' },
  small: { fontSize: 10.5 },
});

const fixedDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

/** Dokumen PDF satu surat bertanda tangan: kop, isi, dan blok tanda tangan dengan QR verifikasi. */
export function LetterDocument({ doc }: { doc: LetterPdfDoc }) {
  const { lines, dateLine } = splitSignatureTail(bodyLines(doc.text), doc.signer);
  const hasNumber = doc.text.includes(doc.number);
  return (
    <Document
      title={doc.subject}
      author={doc.schoolName}
      subject={doc.number}
      creator="Edusync"
      producer="Edusync"
      // Tanggal tetap agar PDF yang dibuat ulang dari data yang sama menghasilkan byte (dan hash) yang sama.
      creationDate={fixedDate(doc.dateIso)}
      modificationDate={fixedDate(doc.dateIso)}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.kop}>
          <Text style={styles.school}>{doc.schoolName}</Text>
          {doc.address ? <Text style={styles.address}>{doc.address}</Text> : null}
        </View>
        <View style={styles.kopRule} />

        {hasNumber ? null : <Text style={{ marginBottom: 8 }}>Nomor: {doc.number}</Text>}

        {lines.map((l, i) =>
          l.kind === 'blank' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: baris statis hasil pecahan teks
            <View key={i} style={styles.blank} />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: baris statis hasil pecahan teks
            <Text key={i} style={l.kind === 'title' ? styles.title : styles.line}>
              {l.text}
            </Text>
          ),
        )}

        <View style={styles.signBlock} wrap={false}>
          <View style={styles.qrCol}>
            <Image src={doc.qrDataUrl} style={styles.qr} />
            <Text style={styles.qrNote}>
              Dokumen ini ditandatangani secara elektronik. Pindai kode QR untuk memeriksa keasliannya.
            </Text>
            <Text style={styles.qrUrl}>{doc.verifyUrl}</Text>
          </View>
          <View style={styles.signCol}>
            <Text>{dateLine ?? doc.dateText}</Text>
            <Text>{doc.signer.title}</Text>
            <View style={styles.signSpace}>
              {doc.signer.signatureData ? (
                <Image src={doc.signer.signatureData} style={styles.signImg} />
              ) : null}
            </View>
            <Text style={styles.signName}>{doc.signer.name}</Text>
            {doc.signer.nip ? <Text style={styles.small}>NIP. {doc.signer.nip}</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}
