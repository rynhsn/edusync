/**
 * Berita acara musyawarah dewan pendidik (tahap 3C.3): jenis rapat, status, dan peran peserta. CHECK di migrasi 0103
 * menjaga ketiganya, jadi menambah nilai butuh migrasi.
 */

export const COUNCIL_MEETING_KINDS = ['promotion', 'graduation', 'other'] as const;
export type CouncilMeetingKind = (typeof COUNCIL_MEETING_KINDS)[number];

export const COUNCIL_MEETING_STATUSES = ['draft', 'final'] as const;
export type CouncilMeetingStatus = (typeof COUNCIL_MEETING_STATUSES)[number];

export const COUNCIL_ATTENDEE_ROLES = ['chair', 'secretary', 'member'] as const;
export type CouncilAttendeeRole = (typeof COUNCIL_ATTENDEE_ROLES)[number];

/** Kode galat: berita acara sudah final, jadi isinya dan keputusan yang tertaut terkunci. */
export const MEETING_FINAL_CODE = 'meeting_final';
