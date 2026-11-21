import {
  DEFAULT_DOCUMENT_TEMPLATE,
  type DocumentTemplateConfig,
  renderDocumentText,
  renderSignatureSlots,
  sectionShown,
} from '@edusync/contracts';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { GraduationStudent, PrintMeta, SklLabels } from '../../../../../lib/graduation';
import { sklVars } from '../../../../../lib/graduation';

const INK = '#111111';
const MUTED = '#555555';

const styles = StyleSheet.create({
  page: { padding: 51, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.5, color: INK },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: 14, textAlign: 'center' },
  center: { textAlign: 'center' },
  sub: { textAlign: 'center', fontSize: 9, color: '#444444' },
  p: { marginBottom: 5 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 12, marginBottom: 3 },
  row: { flexDirection: 'row', marginBottom: 2 },
  dt: { width: 120, fontFamily: 'Helvetica-Bold' },
  dd: { flex: 1 },
  note: { fontSize: 8.5, color: MUTED, marginTop: 4 },
  signs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  slot: { flex: 1, alignItems: 'center' },
  one: { justifyContent: 'flex-end' },
  oneSlot: { flex: 0, width: '50%' },
  space: { height: 52 },
  name: { fontFamily: 'Helvetica-Bold', textDecoration: 'underline', textAlign: 'center' },
  blank: { borderBottomWidth: 0.8, borderBottomColor: INK, width: '75%', height: 12 },
});

/**
 * PDF Surat Keterangan Lulus satu murid (A4 potret), dibangun dari templat dokumen sekolah. Tanpa templat (atau semua teks null)
 * isinya setara SKL cetak lama. Tanda tangan hanya ruang kosong untuk tanda tangan basah (tanpa gambar).
 */
export function SklDocument({
  student: s,
  labels: l,
  meta: m,
  template = null,
}: {
  student: GraduationStudent;
  labels: SklLabels;
  meta: PrintMeta;
  template?: DocumentTemplateConfig | null;
}) {
  const c = template ?? DEFAULT_DOCUMENT_TEMPLATE;
  const vars = sklVars(s, l, m);
  const custom = (value: string | null, fallback: string) =>
    value ? renderDocumentText(value, vars) : fallback;
  const shown = (name: string) => sectionShown(c, name);
  const sch = m.school;
  const draft = s.decision?.status !== 'final';
  const criteria = s.transcript?.policy.criteriaText;
  const rows: [string, string][] = [
    [l.name, s.name],
    [l.nis, s.nis ?? '-'],
    [l.nisn, s.nisn ?? '-'],
    [l.className, s.className],
    [l.year, m.yearName],
  ];
  const slots = c.signatures ? renderSignatureSlots(c.signatures, vars) : null;
  const anyPlace = slots?.some((x) => x.placeDate) ?? false;
  return (
    <Document title={`${l.title} - ${s.name}`} author={sch.name} creator="Edusync" producer="Edusync">
      <Page size="A4" style={styles.page}>
        {shown('letterhead') && (
          <>
            <Text style={[styles.h1, { fontSize: 16 }]}>{sch.name}</Text>
            <Text style={styles.sub}>
              {[sch.address, sch.city].filter(Boolean).join(', ') || '-'}
              {sch.npsn ? ` | ${l.npsn} ${sch.npsn}` : ''}
            </Text>
          </>
        )}
        <Text style={[styles.h1, { marginTop: 16 }]}>{custom(c.title, l.title)}</Text>
        {shown('number') && (
          <Text style={styles.center}>
            {l.number}: {s.decision?.sklNumber ?? l.numberMissing}
          </Text>
        )}
        <Text style={[styles.p, { marginTop: 12 }]}>{custom(c.intro, l.intro)}</Text>
        {shown('identity') && (
          <View style={{ marginVertical: 8 }}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={styles.dt}>{k}</Text>
                <Text style={styles.dd}>{v}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.p}>{custom(c.body, l.statement)}</Text>
        {criteria && shown('criteria') ? (
          <>
            <Text style={styles.h2}>{l.criteria}</Text>
            <Text style={styles.p}>{criteria}</Text>
          </>
        ) : null}

        {slots ? (
          <View wrap={false} style={slots.length === 1 ? [styles.signs, styles.one] : styles.signs}>
            {slots.map((x, i) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: slot tidak punya id; urutan tetap
                key={i}
                style={slots.length === 1 ? [styles.slot, styles.oneSlot] : styles.slot}
              >
                {x.placeDate ? <Text>{l.signPlace}</Text> : anyPlace ? <Text> </Text> : null}
                <Text>{x.label}</Text>
                <View style={styles.space} />
                {x.name ? <Text style={styles.name}>{x.name}</Text> : <View style={styles.blank} />}
                {x.note ? <Text>{x.note}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <View wrap={false} style={[styles.signs, styles.one]}>
            <View style={[styles.slot, styles.oneSlot]}>
              <Text>{l.signPlace}</Text>
              <Text>{l.principal}</Text>
              <View style={styles.space} />
              <Text style={styles.name}>{sch.principal?.name ?? '-'}</Text>
              {sch.principal?.nip ? (
                <Text>
                  {l.nip} {sch.principal.nip}
                </Text>
              ) : null}
            </View>
          </View>
        )}
        {draft && <Text style={styles.note}>{l.draftNote}</Text>}
        <Text style={styles.note}>{m.printedOnText}</Text>
      </Page>
    </Document>
  );
}
