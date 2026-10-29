import type { EffectiveDays, EventType, PlannerMonth } from '@edusync/contracts';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { KIND_COLORS, LEGEND, monthName, weekdayNames } from './planner-style';

export interface PdfEvent {
  id: string;
  type: EventType;
  title: string;
  /** Rentang sudah diformat menurut bahasa pengguna. */
  range: string;
  className: string | null;
}

export interface PdfLabels {
  title: string;
  effective: string;
  workdays: string;
  closures: string;
  eventsTitle: string;
  types: Record<EventType, string>;
  weekend: string;
  generated: string;
}

interface Props {
  locale: string;
  schoolName: string;
  yearName: string;
  months: PlannerMonth[];
  days: EffectiveDays;
  events: PdfEvent[];
  labels: PdfLabels;
}

const TEAL = '#0F6B68';
const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Helvetica', fontSize: 9, color: '#0D1F24' },
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
  title: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Helvetica-Bold' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    backgroundColor: '#FFFFFF22',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 64,
  },
  statValue: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Helvetica-Bold' },
  statLabel: { color: '#CFEDEA', fontSize: 7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  month: { width: '24%', borderWidth: 1, borderColor: '#D5E3E4', borderRadius: 6, padding: 6 },
  monthName: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: TEAL, marginBottom: 3 },
  row: { flexDirection: 'row' },
  head: { flex: 1, textAlign: 'center', fontSize: 6.5, color: '#6B7F86', paddingBottom: 2 },
  cell: { flex: 1, height: 15, margin: 0.6, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 7 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 10, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
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
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: TEAL, marginBottom: 8 },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#D5E3E4',
  },
  badge: { width: 58, borderRadius: 3, paddingVertical: 2, textAlign: 'center', fontSize: 7, marginRight: 8 },
});

function Legend({ labels }: { labels: PdfLabels }) {
  return (
    <View style={styles.legend}>
      {LEGEND.map((t) => (
        <View key={t} style={styles.legendItem}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: KIND_COLORS[t].bg, borderColor: KIND_COLORS[t].border },
            ]}
          />
          <Text>{labels.types[t]}</Text>
        </View>
      ))}
      <View style={styles.legendItem}>
        <View
          style={[
            styles.swatch,
            { backgroundColor: KIND_COLORS.weekend.bg, borderColor: KIND_COLORS.weekend.border },
          ]}
        />
        <Text>{labels.weekend}</Text>
      </View>
    </View>
  );
}

/** Dokumen PDF kalender akademik: halaman tahunan (12 bulan) dan halaman daftar acara. */
export function CalendarPdf({ locale, schoolName, yearName, months, days, events, labels }: Props) {
  const heads = weekdayNames(locale);
  const footer = (
    <View style={styles.footer} fixed>
      <Text>{schoolName}</Text>
      <Text>{labels.generated}</Text>
    </View>
  );
  return (
    <Document title={`${labels.title} ${yearName}`} author="Edusync">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.school}>{schoolName}</Text>
            <Text style={styles.title}>
              {labels.title} {yearName}
            </Text>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{days.effective}</Text>
              <Text style={styles.statLabel}>{labels.effective}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{days.workdays}</Text>
              <Text style={styles.statLabel}>{labels.workdays}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{days.nonEffective}</Text>
              <Text style={styles.statLabel}>{labels.closures}</Text>
            </View>
          </View>
        </View>

        <View style={styles.grid}>
          {months.map((m) => (
            <View key={`${m.year}-${m.month}`} style={styles.month} wrap={false}>
              <Text style={styles.monthName}>
                {monthName(locale, m.year, m.month)} {m.year}
              </Text>
              <View style={styles.row}>
                {heads.map((h) => (
                  <Text key={h} style={styles.head}>
                    {h.slice(0, 3)}
                  </Text>
                ))}
              </View>
              {m.weeks.map((w) => (
                <View key={w[0]?.date} style={styles.row}>
                  {w.map((c) => {
                    const color = c.inMonth && c.kind ? KIND_COLORS[c.kind] : null;
                    return (
                      <View key={c.date} style={[styles.cell, color ? { backgroundColor: color.bg } : {}]}>
                        {c.inMonth && (
                          <Text
                            style={[
                              styles.cellText,
                              color ? { color: color.fg, fontFamily: 'Helvetica-Bold' } : {},
                            ]}
                          >
                            {c.day}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ))}
        </View>
        <Legend labels={labels} />
        {footer}
      </Page>

      {events.length > 0 && (
        <Page size="A4" orientation="landscape" style={styles.page}>
          <Text style={styles.h2}>
            {labels.eventsTitle} · {yearName}
          </Text>
          {events.map((e) => (
            <View key={e.id} style={styles.event} wrap={false}>
              <Text
                style={[
                  styles.badge,
                  { backgroundColor: KIND_COLORS[e.type].bg, color: KIND_COLORS[e.type].fg },
                ]}
              >
                {labels.types[e.type]}
              </Text>
              <Text style={{ width: 170 }}>{e.range}</Text>
              <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold' }}>
                {e.title}
                {e.className ? `  (${e.className})` : ''}
              </Text>
            </View>
          ))}
          {footer}
        </Page>
      )}
    </Document>
  );
}
