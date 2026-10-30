/**
 * Bentuk data langsung untuk peta sekolah. Mengikuti kontrak GET /v1/live/snapshot dan /v1/live/events.
 * Bagian snapshot bernilai null bila modul tidak aktif atau pengguna tidak punya izin.
 */
export interface LiveSnapshot {
  date: string;
  time: string;
  closed: { type: string; title: string } | null;
  attendance: {
    total: number;
    present: number;
    late: number;
    excused: number;
    sick: number;
    absent: number;
    notYet: number;
  } | null;
  lessons: {
    running: {
      className: string;
      subjectName: string;
      periodNumber: number;
      startsAt: string;
      endsAt: string;
    }[];
    currentPeriod: number | null;
    nextPeriodStartsAt: string | null;
    unfilled: number;
  } | null;
  finance: {
    openInvoices: number;
    outstanding: number;
    overdueOutstanding: number;
    paidToday: number;
  } | null;
  messaging: { queued: number; failed24h: number } | null;
  extracurricular: { sessionsToday: number } | null;
}

export interface LiveEvent {
  id: string;
  kind: 'arrival' | 'departure';
  at: string;
  className: string | null;
  studentName: string | null;
}

export type BuildingKind = 'gate' | 'classes' | 'teachers' | 'office' | 'field' | 'mail';

export type SkyPhase = 'night' | 'morning' | 'noon' | 'evening';

export type Pt = readonly [number, number];
