import type { paths } from './api-types';
import { type FieldErrors, type FieldIssue, isRealDate } from './form-validation';
import { escapeHtml } from './ledger';

/**
 * Logika murni berita acara musyawarah dewan pendidik (tahap 3C.3, tanpa React): isian formulir, validasi, isi permintaan ke
 * API, daftar murid yang dapat ditautkan, dan HTML cetak. Aturannya mengikuti apps/api/src/routes/council-meetings.ts.
 */

export type MeetingDetail =
  paths['/v1/council-meetings/{id}']['get']['responses'][200]['content']['application/json'];
export type MeetingListItem =
  paths['/v1/council-meetings']['get']['responses'][200]['content']['application/json']['items'][number];
export type MeetingDigest = MeetingDetail['digest'];

export const MEETING_KINDS = ['promotion', 'graduation', 'other'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];
export const ATTENDEE_ROLES = ['chair', 'secretary', 'member'] as const;
export type AttendeeRole = (typeof ATTENDEE_ROLES)[number];

export const LIMITS = {
  title: 160,
  location: 200,
  person: 160,
  position: 120,
  agenda: 4000,
  summary: 8000,
  attendees: 80,
} as const;

export interface AttendeeForm {
  /** Kunci tampilan stabil (bukan dikirim ke server). */
  key: string;
  teacherId: string;
  name: string;
  positionTitle: string;
  role: AttendeeRole;
}

export interface MeetingForm {
  kind: MeetingKind;
  title: string;
  heldOn: string;
  semesterId: string;
  classId: string;
  location: string;
  chairName: string;
  secretaryName: string;
  agenda: string;
  summary: string;
  attendees: AttendeeForm[];
}

export type MeetingField =
  | 'title'
  | 'heldOn'
  | 'location'
  | 'chairName'
  | 'secretaryName'
  | 'agenda'
  | 'summary'
  | 'attendees';
export const MEETING_ORDER: MeetingField[] = [
  'title',
  'heldOn',
  'location',
  'chairName',
  'secretaryName',
  'agenda',
  'summary',
  'attendees',
];

export const EMPTY_MEETING: MeetingForm = {
  kind: 'promotion',
  title: '',
  heldOn: '',
  semesterId: '',
  classId: '',
  location: '',
  chairName: '',
  secretaryName: '',
  agenda: '',
  summary: '',
  attendees: [],
};

let keyCounter = 0;
export const newAttendeeKey = () => `att-${++keyCounter}`;

export function newAttendee(role: AttendeeRole = 'member'): AttendeeForm {
  return { key: newAttendeeKey(), teacherId: '', name: '', positionTitle: '', role };
}

/** Formulir awal untuk berita acara baru: tanggal hari ini dan judul bawaan (diterjemahkan oleh pemanggil). */
export function newMeetingForm(today: string, kind: MeetingKind, title: string): MeetingForm {
  return { ...EMPTY_MEETING, kind, heldOn: today, attendees: [], title };
}

export function formFromDetail(d: MeetingDetail): MeetingForm {
  return {
    kind: d.kind,
    title: d.title,
    heldOn: d.heldOn,
    semesterId: d.semesterId ?? '',
    classId: d.classId ?? '',
    location: d.location ?? '',
    chairName: d.chairName ?? '',
    secretaryName: d.secretaryName ?? '',
    agenda: d.agenda ?? '',
    summary: d.summary ?? '',
    attendees: d.attendees.map((a) => ({
      key: newAttendeeKey(),
      teacherId: a.teacherId ?? '',
      name: a.name,
      positionTitle: a.positionTitle ?? '',
      role: a.role,
    })),
  };
}

const tooLong = (v: string, max: number): FieldIssue | undefined =>
  v.trim().length > max ? { code: 'tooLong', max } : undefined;

export function validateMeeting(f: MeetingForm): FieldErrors<MeetingField> {
  const out: FieldErrors<MeetingField> = {};
  const set = (k: MeetingField, i: FieldIssue | undefined) => {
    if (i) out[k] = i;
  };
  const title = f.title.trim();
  set('title', title === '' ? { code: 'required' } : tooLong(title, LIMITS.title));
  set(
    'heldOn',
    f.heldOn === '' ? { code: 'required' } : isRealDate(f.heldOn) ? undefined : { code: 'dateInvalid' },
  );
  set('location', tooLong(f.location, LIMITS.location));
  set('chairName', tooLong(f.chairName, LIMITS.person));
  set('secretaryName', tooLong(f.secretaryName, LIMITS.person));
  set('agenda', tooLong(f.agenda, LIMITS.agenda));
  set('summary', tooLong(f.summary, LIMITS.summary));
  if (f.attendees.some((a) => a.teacherId === '' && a.name.trim() === '')) {
    set('attendees', { code: 'custom', key: 'minutes.attendeeNeedsName' });
  } else if (
    f.attendees.some(
      (a) => a.name.trim().length > LIMITS.person || a.positionTitle.trim().length > LIMITS.position,
    )
  ) {
    set('attendees', { code: 'tooLong', max: LIMITS.person });
  } else if (f.attendees.length > LIMITS.attendees) {
    set('attendees', { code: 'tooLong', max: LIMITS.attendees });
  }
  return out;
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

/** Isi permintaan POST/PUT: kosong menjadi null, peserta tanpa nama diisi server dari data guru. */
export function buildMeetingBody(f: MeetingForm) {
  return {
    kind: f.kind,
    title: f.title.trim(),
    heldOn: f.heldOn,
    semesterId: f.semesterId || null,
    classId: f.classId || null,
    location: orNull(f.location),
    chairName: orNull(f.chairName),
    secretaryName: orNull(f.secretaryName),
    agenda: orNull(f.agenda),
    summary: orNull(f.summary),
    attendees: f.attendees.map((a) => ({
      teacherId: a.teacherId || null,
      ...(a.name.trim() ? { name: a.name.trim() } : {}),
      positionTitle: orNull(a.positionTitle),
      role: a.role,
    })),
  };
}

/** Peserta yang belum terpilih sebagai guru (untuk daftar pilihan guru di baris peserta lain). */
export const teacherIdsTaken = (f: MeetingForm) =>
  new Set(f.attendees.map((a) => a.teacherId).filter(Boolean));

/* ---------- Murid yang dapat ditautkan ---------- */

export interface LinkableStudent {
  studentId: string;
  name: string;
  className: string;
  decision: 'promote' | 'retain' | 'graduate';
  meetingId: string | null;
}

/** Murid berkeputusan dari data wizard (`GET /v1/academic-years/{id}/promotions`), mendatar dan terurut kelas lalu nama. */
export function linkableStudents(data: {
  classes: {
    name: string;
    students: {
      studentId: string;
      name: string;
      decision: 'promote' | 'retain' | 'graduate' | null;
      meetingId?: string | null | undefined;
    }[];
  }[];
}): LinkableStudent[] {
  const out: LinkableStudent[] = [];
  for (const c of data.classes) {
    for (const s of c.students) {
      if (!s.decision) continue;
      out.push({
        studentId: s.studentId,
        name: s.name,
        className: c.name,
        decision: s.decision,
        meetingId: s.meetingId ?? null,
      });
    }
  }
  return out;
}

/** Himpunan awal yang dicentang untuk berita acara ini: yang sudah tertaut ke berita acara ini. */
export const linkedTo = (list: readonly LinkableStudent[], meetingId: string) =>
  new Set(list.filter((s) => s.meetingId === meetingId).map((s) => s.studentId));

/** Saran centang: semua yang tinggal kelas (bahan utama berita acara) yang belum tertaut ke berita acara lain. */
export const suggestRetained = (list: readonly LinkableStudent[], meetingId: string) =>
  new Set(
    list
      .filter((s) => s.decision === 'retain' && (s.meetingId === null || s.meetingId === meetingId))
      .map((s) => s.studentId),
  );

/** Apakah himpunan centang berbeda dari yang tertaut saat ini. */
export function linkChanged(
  list: readonly LinkableStudent[],
  meetingId: string,
  picked: ReadonlySet<string>,
) {
  const current = linkedTo(list, meetingId);
  if (current.size !== picked.size) return true;
  for (const id of picked) if (!current.has(id)) return true;
  return false;
}

/* ---------- Cetak ---------- */

export interface MinutesLabels {
  title: string;
  kind: string;
  heldOn: string;
  location: string;
  class: string;
  allClasses: string;
  agenda: string;
  attendees: string;
  colNo: string;
  colName: string;
  colPosition: string;
  colRole: string;
  colSignature: string;
  roles: Record<AttendeeRole, string>;
  decisionsTitle: string;
  colClass: string;
  colPromote: string;
  colRetain: string;
  colGraduate: string;
  colTotal: string;
  retainedTitle: string;
  colStudent: string;
  colReason: string;
  colFollowUp: string;
  noRetained: string;
  summary: string;
  chair: string;
  secretary: string;
  draftNote: string;
  printedOn: string;
  none: string;
}

/**
 * Dokumen HTML mandiri berita acara untuk dicetak atau disimpan sebagai PDF lewat dialog cetak peramban (potret, A4).
 * Semua teks di-escape; baris tanda tangan peserta disediakan kosong.
 */
export function minutesPrintHtml(
  d: MeetingDetail,
  l: MinutesLabels,
  meta: { schoolName: string; yearName: string; kindName: string; heldOnText: string; printedOn: string },
): string {
  const e = escapeHtml;
  const dash = '-';
  const text = (v: string | null) => (v && v.trim() !== '' ? e(v).replace(/\n/g, '<br>') : dash);
  const att = d.attendees
    .map(
      (a, i) =>
        `<tr><td class="num">${i + 1}</td><td>${e(a.name)}</td><td>${e(a.positionTitle ?? dash)}</td>` +
        `<td>${e(l.roles[a.role])}</td><td class="sign"></td></tr>`,
    )
    .join('');
  const classes = d.digest.classes
    .map(
      (c) =>
        `<tr><td>${e(c.name)}</td><td class="num">${c.promote}</td><td class="num">${c.retain}</td>` +
        `<td class="num">${c.graduate}</td><td class="num">${c.promote + c.retain + c.graduate}</td></tr>`,
    )
    .join('');
  const t = d.digest.totals;
  const retained = d.digest.retained
    .map(
      (r, i) =>
        `<tr><td class="num">${i + 1}</td><td>${e(r.name)}</td><td>${e(r.className)}</td>` +
        `<td>${text(r.reason)}</td><td>${text(r.followUp)}</td></tr>`,
    )
    .join('');
  const notes = d.status === 'draft' ? `<p class="note">${e(l.draftNote)}</p>` : '';
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${e(`${l.title} - ${d.title}`)}</title>` +
    '<style>@page{size:A4;margin:16mm}' +
    'body{font:12px/1.45 system-ui,sans-serif;color:#111;margin:0}' +
    'h1{font-size:17px;margin:0 0 2px;text-align:center}h2{font-size:13px;margin:14px 0 4px}' +
    'p{margin:0 0 4px}.center{text-align:center}.note{font-size:11px;color:#555}' +
    'dl{display:grid;grid-template-columns:130px 1fr;gap:2px 8px;margin:10px 0}dt{font-weight:600}dd{margin:0}' +
    'table{border-collapse:collapse;width:100%;margin-top:4px}th,td{border:1px solid #888;padding:3px 6px;text-align:left;vertical-align:top}' +
    'th{background:#eee}td.num{text-align:right;width:1%;white-space:nowrap}td.sign{width:30%}' +
    'tr{break-inside:avoid}thead{display:table-header-group}' +
    '.sigs{display:flex;justify-content:space-between;margin-top:36px;break-inside:avoid}.sigs div{width:44%;text-align:center}' +
    '.sigs .line{margin-top:56px;border-top:1px solid #111;padding-top:2px}</style></head><body>' +
    `<h1>${e(l.title)}</h1><p class="center">${e(meta.schoolName)} | ${e(meta.yearName)}</p>` +
    '<dl>' +
    `<dt>${e(l.kind)}</dt><dd>${e(meta.kindName)}: ${e(d.title)}</dd>` +
    `<dt>${e(l.heldOn)}</dt><dd>${e(meta.heldOnText)}</dd>` +
    `<dt>${e(l.location)}</dt><dd>${text(d.location)}</dd>` +
    `<dt>${e(l.class)}</dt><dd>${e(d.className ?? l.allClasses)}</dd>` +
    `<dt>${e(l.agenda)}</dt><dd>${text(d.agenda)}</dd></dl>` +
    `<h2>${e(l.attendees)}</h2>` +
    (att
      ? `<table><thead><tr><th>${e(l.colNo)}</th><th>${e(l.colName)}</th><th>${e(l.colPosition)}</th><th>${e(l.colRole)}</th><th>${e(l.colSignature)}</th></tr></thead><tbody>${att}</tbody></table>`
      : `<p>${dash}</p>`) +
    `<h2>${e(l.decisionsTitle)}</h2>` +
    (classes
      ? `<table><thead><tr><th>${e(l.colClass)}</th><th>${e(l.colPromote)}</th><th>${e(l.colRetain)}</th><th>${e(l.colGraduate)}</th><th>${e(l.colTotal)}</th></tr></thead><tbody>${classes}` +
        `<tr><th>${e(l.colTotal)}</th><th class="num">${t.promote}</th><th class="num">${t.retain}</th><th class="num">${t.graduate}</th><th class="num">${t.total}</th></tr></tbody></table>`
      : `<p>${dash}</p>`) +
    `<h2>${e(l.retainedTitle)}</h2>` +
    (retained
      ? `<table><thead><tr><th>${e(l.colNo)}</th><th>${e(l.colStudent)}</th><th>${e(l.colClass)}</th><th>${e(l.colReason)}</th><th>${e(l.colFollowUp)}</th></tr></thead><tbody>${retained}</tbody></table>`
      : `<p>${e(l.noRetained)}</p>`) +
    `<h2>${e(l.summary)}</h2><p>${text(d.summary)}</p>` +
    `<div class="sigs"><div>${e(l.chair)}<div class="line">${e(d.chairName ?? dash)}</div></div>` +
    `<div>${e(l.secretary)}<div class="line">${e(d.secretaryName ?? dash)}</div></div></div>` +
    `${notes}<p class="note">${e(l.printedOn)} ${e(meta.printedOn)}</p>` +
    '</body></html>'
  );
}

/** Nama berkas yang aman untuk unduhan/judul cetak. */
export function minutesFileName(title: string, heldOn: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `berita-acara-${slug || 'rapat'}-${heldOn}`;
}
