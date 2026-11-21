import {
  DEFAULT_DOCUMENT_TEMPLATE,
  DEFAULT_SIGNATURE_SLOTS,
  type DocumentTemplateConfig,
  renderDocumentText,
  renderSignatureSlots,
  sectionShown,
} from '@edusync/contracts';
import { Circle, Document, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import {
  CERTIFICATE_DEFAULT_TEXT,
  formatGrade,
  formatIdDate,
  PREDICATE_WORD,
  periodRangeText,
  placeAndDate,
} from './format';
import type { CertificateDoc } from './types';

const COPPER = '#b4541a';
const COPPER_SOFT = '#f6e3d4';
const TEAL = '#0f766e';
const INK = '#26211c';
const MUTED = '#6b6259';

const styles = StyleSheet.create({
  page: { backgroundColor: '#fffaf4', padding: 20, fontFamily: 'Times-Roman', color: INK },
  outer: { flex: 1, borderWidth: 3, borderColor: COPPER, padding: 6 },
  inner: {
    flex: 1,
    borderWidth: 0.8,
    borderColor: TEAL,
    paddingHorizontal: 48,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
  },
  corner: { position: 'absolute', width: 54, height: 54 },
  school: {
    fontFamily: 'Times-Bold',
    fontSize: 11,
    letterSpacing: 2.5,
    color: TEAL,
    textTransform: 'uppercase',
  },
  title: { fontFamily: 'Times-Bold', fontSize: 30, letterSpacing: 4, color: COPPER, marginTop: 8 },
  subtitle: { fontFamily: 'Times-Bold', fontSize: 13, letterSpacing: 5, color: INK, marginTop: 2 },
  rule: { width: 120, borderBottomWidth: 1, borderBottomColor: COPPER, marginTop: 9, marginBottom: 9 },
  lead: { fontSize: 11, color: MUTED, fontFamily: 'Times-Italic' },
  name: { fontFamily: 'Times-BoldItalic', fontSize: 28, color: INK, marginTop: 4 },
  nameLine: { width: 340, borderBottomWidth: 0.8, borderBottomColor: COPPER, marginTop: 3 },
  cls: { fontSize: 11, color: MUTED, marginTop: 4 },
  body: { fontSize: 11.5, lineHeight: 1.5, textAlign: 'center', marginTop: 8, maxWidth: 560 },
  strong: { fontFamily: 'Times-Bold' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginTop: 9 },
  scoreBox: {
    borderWidth: 1.2,
    borderColor: COPPER,
    backgroundColor: COPPER_SOFT,
    paddingVertical: 4,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  scoreLabel: { fontSize: 8, letterSpacing: 1.5, color: MUTED, textTransform: 'uppercase' },
  scoreValue: { fontFamily: 'Times-Bold', fontSize: 24, color: COPPER },
  predBox: { marginLeft: 12, alignItems: 'center' },
  predLetter: {
    fontFamily: 'Times-Bold',
    fontSize: 22,
    color: '#ffffff',
    backgroundColor: TEAL,
    width: 38,
    height: 38,
    textAlign: 'center',
    paddingTop: 7,
  },
  predWord: { fontSize: 9.5, color: TEAL, marginTop: 2, fontFamily: 'Times-Bold' },
  aspects: {
    flexDirection: 'row',
    marginTop: 11,
    borderTopWidth: 0.6,
    borderBottomWidth: 0.6,
    borderColor: '#d9c7b6',
  },
  aspectCell: { paddingVertical: 4, paddingHorizontal: 12, alignItems: 'center', minWidth: 92 },
  aspectName: { fontSize: 8.5, color: MUTED, textAlign: 'center' },
  aspectValue: { fontFamily: 'Times-Bold', fontSize: 13, color: INK },
  aspectWeight: { fontSize: 7.5, color: MUTED },
  signRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 'auto' },
  signCol: { width: 230, alignItems: 'center' },
  signRole: { fontSize: 10.5 },
  signSpace: { height: 46 },
  signName: {
    fontFamily: 'Times-Bold',
    fontSize: 11,
    borderBottomWidth: 0.8,
    borderBottomColor: INK,
    minWidth: 170,
    textAlign: 'center',
    paddingBottom: 1,
  },
});

/** Hiasan sudut: dua garis tembaga bersiku, titik teal. `flip` memutar ke sudut lain. */
function Corner({
  top,
  left,
  right,
  bottom,
  rotate,
}: {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  rotate: number;
}) {
  return (
    <View
      style={{
        ...styles.corner,
        ...(top !== undefined ? { top } : {}),
        ...(left !== undefined ? { left } : {}),
        ...(right !== undefined ? { right } : {}),
        ...(bottom !== undefined ? { bottom } : {}),
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <Svg viewBox="0 0 54 54" width={54} height={54}>
        <Path d="M3 51 V3 H51" stroke={COPPER} strokeWidth={2} fill="none" />
        <Path d="M10 51 V10 H51" stroke={TEAL} strokeWidth={0.8} fill="none" />
        <Circle cx={10} cy={10} r={3} fill={COPPER} />
        <Path d="M18 3 L22 7 L26 3" stroke={COPPER} strokeWidth={1} fill="none" />
      </Svg>
    </View>
  );
}

/** Medali kecil bergerigi (lambang kerja) di atas judul. */
function Medal() {
  return (
    <Svg viewBox="0 0 40 40" width={38} height={38}>
      <Circle cx={20} cy={20} r={18} fill={COPPER_SOFT} stroke={COPPER} strokeWidth={1.5} />
      <Circle cx={20} cy={20} r={13} fill="none" stroke={TEAL} strokeWidth={0.8} />
      <Path d="M12 24 a8 7 0 0 1 16 0 z" fill={TEAL} />
      <Path d="M10.5 24.5 H29.5" stroke={COPPER} strokeWidth={2.2} />
      <Path d="M20 14 V17" stroke={COPPER} strokeWidth={2} />
    </Svg>
  );
}

/** Variabel templat sertifikat PKL ({{nama_murid}}, dst.) dari data dokumen. */
export function certificateVars(doc: CertificateDoc): Record<string, string> {
  return {
    nama_murid: doc.studentName,
    kelas: doc.className ?? '',
    sekolah: doc.schoolName,
    mitra: doc.partnerName,
    periode: periodRangeText(doc.startsOn, doc.endsOn),
    nama_periode: doc.periodName,
    nilai_akhir: formatGrade(doc.finalScore),
    predikat: doc.predicate,
    kata_predikat: PREDICATE_WORD[doc.predicate],
    nomor_sertifikat: doc.certificateNo ?? '',
    pembimbing_industri: doc.industrySupervisorName ?? '',
    kepala_sekolah: doc.principalName,
    nip_kepala_sekolah: doc.principalNip ?? '',
    tempat: doc.place,
    tanggal: formatIdDate(doc.dateIso),
  };
}

/**
 * Dokumen PDF sertifikat PKL: A4 lanskap, bingkai ornamen, nilai akhir, ringkasan aspek, dan tanda tangan. `template` =
 * templat dokumen sekolah; tanpa templat hasilnya sama seperti bawaan lama. Tanda tangan hanya ruang kosong (tanda tangan basah).
 */
export function CertificateDocument({
  doc,
  template = null,
}: {
  doc: CertificateDoc;
  template?: DocumentTemplateConfig | null;
}) {
  const c = template ?? DEFAULT_DOCUMENT_TEMPLATE;
  const vars = certificateVars(doc);
  const custom = (value: string | null, fallback: string) =>
    value ? renderDocumentText(value, vars) : fallback;
  const shown = (name: string) => sectionShown(c, name);
  const slots = renderSignatureSlots(c.signatures ?? DEFAULT_SIGNATURE_SLOTS.pkl_certificate, vars);
  const anyPlace = slots.some((x) => x.placeDate);
  return (
    <Document
      title={`Sertifikat PKL ${doc.studentName}`}
      author={doc.schoolName}
      subject={doc.periodName}
      creator="Edusync"
      producer="Edusync"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.outer}>
          <View style={styles.inner}>
            <Corner top={4} left={4} rotate={0} />
            <Corner top={4} right={4} rotate={90} />
            <Corner bottom={4} right={4} rotate={180} />
            <Corner bottom={4} left={4} rotate={270} />

            {doc.certificateNo && shown('number') ? (
              <Text style={{ position: 'absolute', top: 12, right: 26, fontSize: 9, color: MUTED }}>
                No. {doc.certificateNo}
              </Text>
            ) : null}
            <Medal />
            {shown('schoolName') && <Text style={[styles.school, { marginTop: 4 }]}>{doc.schoolName}</Text>}
            <Text style={styles.title}>{custom(c.title, CERTIFICATE_DEFAULT_TEXT.title)}</Text>
            <Text style={styles.subtitle}>{custom(c.subtitle, CERTIFICATE_DEFAULT_TEXT.subtitle)}</Text>
            <View style={styles.rule} />
            <Text style={styles.lead}>{custom(c.intro, CERTIFICATE_DEFAULT_TEXT.intro)}</Text>
            <Text style={styles.name}>{doc.studentName}</Text>
            <View style={styles.nameLine} />
            {doc.className && shown('className') ? (
              <Text style={styles.cls}>Kelas {doc.className}</Text>
            ) : null}
            <Text style={styles.body}>
              {c.body ? (
                renderDocumentText(c.body, vars)
              ) : (
                <>
                  telah melaksanakan Praktik Kerja Lapangan di{' '}
                  <Text style={styles.strong}>{doc.partnerName}</Text> pada{' '}
                  {periodRangeText(doc.startsOn, doc.endsOn)} ({doc.periodName}) dengan hasil penilaian
                  sebagai berikut.
                </>
              )}
            </Text>

            {shown('score') && (
              <View style={styles.scoreRow}>
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreLabel}>Nilai akhir</Text>
                  <Text style={styles.scoreValue}>{formatGrade(doc.finalScore)}</Text>
                </View>
                <View style={styles.predBox}>
                  <Text style={styles.predLetter}>{doc.predicate}</Text>
                  <Text style={styles.predWord}>{PREDICATE_WORD[doc.predicate]}</Text>
                </View>
              </View>
            )}

            {shown('aspects') && doc.aspects.length > 0 && (
              <View style={styles.aspects}>
                {doc.aspects.map((a) => (
                  <View key={a.name} style={styles.aspectCell}>
                    <Text style={styles.aspectName}>{a.name}</Text>
                    <Text style={styles.aspectValue}>{a.value === null ? '-' : formatGrade(a.value)}</Text>
                    <Text style={styles.aspectWeight}>bobot {a.weight}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.signRow}>
              {slots.map((x, i) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: slot tidak punya id; urutan tetap
                  key={i}
                  style={slots.length > 2 ? { ...styles.signCol, width: undefined, flex: 1 } : styles.signCol}
                >
                  {x.placeDate ? (
                    <Text style={styles.signRole}>{placeAndDate(doc.place, doc.dateIso)}</Text>
                  ) : anyPlace ? (
                    <Text style={styles.signRole}> </Text>
                  ) : null}
                  <Text style={styles.signRole}>{x.label || ' '}</Text>
                  <View style={styles.signSpace} />
                  <Text style={styles.signName}>{x.name || ' '}</Text>
                  {x.note ? (
                    <Text style={[styles.signRole, { fontSize: 9, color: MUTED }]}>{x.note}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
