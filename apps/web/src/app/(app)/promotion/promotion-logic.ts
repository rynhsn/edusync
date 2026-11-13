/**
 * Logika murni wizard kenaikan kelas: pilihan tahun tujuan, keputusan awal, aksi massal per kelas, pembentukan
 * payload simpan, pemblokiran tingkat akhir, catatan keputusan, dan pemetaan peringatan/alasan dari API.
 * Tanpa React supaya bisa diuji sendiri.
 *
 * Aturan fase 2C (K4): di tingkat akhir TIDAK ada keputusan bawaan. Kelulusan ditetapkan sekolah setelah ujian
 * satuan pendidikan, jadi pengguna wajib memilih "ditetapkan lulus" atau "tinggal" untuk tiap siswa sebelum
 * menyimpan atau lanjut.
 */

export type Decision = 'promote' | 'retain' | 'graduate';

export interface PromotionStudent {
  studentId: string;
  name: string;
  nis: string | null;
  decision: Decision | null;
  /** Saran bawaan; null di tingkat akhir (wajib dipilih eksplisit). */
  suggestedDecision: 'promote' | 'graduate' | null;
  toClassId: string | null;
  note: string | null;
  reason?: string | null;
  followUp?: string | null;
  meetingDate?: string | null;
  applied: boolean;
}

export interface PromotionClass {
  classId: string;
  name: string;
  level: string;
  nextLevel: string | null;
  isFinalLevel: boolean;
  /** Tingkat kelas tidak ada di daftar tingkat sekolah: tidak ada saran naik, dan naik butuh kelas tujuan. */
  levelUnknown?: boolean;
  students: PromotionStudent[];
}

export interface YearLike {
  id: string;
  name: string;
  startsOn: string;
  isActive?: boolean;
}

/** Pilihan siswa per studentId. Siswa tingkat akhir yang belum diputuskan tidak punya entri. */
export type Choices = Partial<Record<string, Decision>>;

/** Catatan keputusan satu siswa, sebagai teks isian ('' = kosong). */
export interface StudentDetails {
  reason: string;
  followUp: string;
  meetingDate: string;
}
/** Suntingan catatan per studentId; hanya field yang diubah pengguna. */
export type Details = Record<string, Partial<StudentDetails>>;

export interface DecisionItem {
  studentId: string;
  decision: Decision;
  toClassId?: string | null;
  note?: string | null;
  /** Nilai saat ini; `null` mengosongkan (server mempertahankan yang tersimpan bila field dihilangkan). */
  reason?: string | null;
  followUp?: string | null;
  meetingDate?: string | null;
}

/** Batas server per permintaan simpan. */
export const SAVE_CHUNK = 500;
/** Batas panjang alasan dan tindak lanjut di server. */
export const MAX_DETAIL_LENGTH = 1000;

/** Keputusan yang boleh dipilih untuk sebuah kelas: tingkat akhir ditetapkan lulus atau tinggal, selain itu naik atau tinggal. */
export function optionsFor(cls: Pick<PromotionClass, 'isFinalLevel' | 'levelUnknown'>): Decision[] {
  if (cls.isFinalLevel) return ['graduate', 'retain'];
  // Tingkat tak dikenal: tingkat berikutnya tidak diketahui, jadi naik hanya lewat kelas tujuan eksplisit.
  return cls.levelUnknown ? ['retain'] : ['promote', 'retain'];
}

/**
 * Pilihan per siswa. Di kelas bertingkat tak dikenal, "Naik" hanya tersedia bagi siswa yang sudah punya kelas
 * tujuan eksplisit tersimpan (antarmuka ini belum bisa memilih kelas tujuan).
 */
export function optionsForStudent(
  cls: Pick<PromotionClass, 'isFinalLevel' | 'levelUnknown'>,
  student: Pick<PromotionStudent, 'toClassId'>,
): Decision[] {
  const base = optionsFor(cls);
  return cls.levelUnknown && !cls.isFinalLevel && student.toClassId ? ['promote', ...base] : base;
}

/** Tahun tujuan yang sah: dimulai setelah tahun sumber, diurutkan dari yang paling dekat. */
export function eligibleTargets<T extends YearLike>(years: readonly T[], sourceId: string): T[] {
  const source = years.find((y) => y.id === sourceId);
  if (!source) return [];
  return years
    .filter((y) => y.startsOn > source.startsOn)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** Tahun sumber bawaan: tahun aktif, kalau tidak ada tahun terbaru. */
export function defaultSourceId(years: readonly YearLike[]): string {
  const active = years.find((y) => y.isActive);
  if (active) return active.id;
  return [...years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.id ?? '';
}

/**
 * Pilihan awal: keputusan tersimpan, atau saran backend. Saran null (tingkat akhir) dibiarkan tanpa entri,
 * jadi siswa itu tampil belum diputuskan sampai pengguna memilih.
 */
export function initialChoices(classes: readonly PromotionClass[]): Choices {
  const out: Choices = {};
  for (const c of classes) {
    for (const s of c.students) {
      const d = s.decision ?? s.suggestedDecision;
      if (d) out[s.studentId] = d;
    }
  }
  return out;
}

/** Aksi massal satu kelas. Siswa yang keputusannya sudah diterapkan tidak berubah; keputusan yang tak boleh untuk kelas itu diabaikan. */
export function setClassDecision(cls: PromotionClass, choices: Choices, decision: Decision): Choices {
  // Keputusan yang tak boleh bagi siapa pun di kelas ini diabaikan (objek yang sama dikembalikan).
  if (!cls.students.some((s) => optionsForStudent(cls, s).includes(decision))) return choices;
  const next = { ...choices };
  for (const s of cls.students) {
    if (!s.applied && optionsForStudent(cls, s).includes(decision)) next[s.studentId] = decision;
  }
  return next;
}

/* ---------- Catatan keputusan ---------- */

/** Catatan yang tersimpan di server untuk siswa ini. */
export function savedDetails(
  s: Pick<PromotionStudent, 'reason' | 'followUp' | 'meetingDate'>,
): StudentDetails {
  return { reason: s.reason ?? '', followUp: s.followUp ?? '', meetingDate: s.meetingDate ?? '' };
}

/** Catatan yang berlaku: suntingan bila ada, kalau tidak yang tersimpan. */
export function effectiveDetails(
  s: Pick<PromotionStudent, 'studentId' | 'reason' | 'followUp' | 'meetingDate'>,
  details: Details,
): StudentDetails {
  const saved = savedDetails(s);
  const edit = details[s.studentId];
  return {
    reason: edit?.reason ?? saved.reason,
    followUp: edit?.followUp ?? saved.followUp,
    meetingDate: edit?.meetingDate ?? saved.meetingDate,
  };
}

export function detailsChanged(
  s: Pick<PromotionStudent, 'studentId' | 'reason' | 'followUp' | 'meetingDate'>,
  details: Details,
): boolean {
  const saved = savedDetails(s);
  const now = effectiveDetails(s, details);
  return (
    now.reason.trim() !== saved.reason.trim() ||
    now.followUp.trim() !== saved.followUp.trim() ||
    now.meetingDate !== saved.meetingDate
  );
}

export function setDetail(
  details: Details,
  studentId: string,
  field: keyof StudentDetails,
  value: string,
): Details {
  return { ...details, [studentId]: { ...details[studentId], [field]: value } };
}

/** Tanggal musyawarah yang sama untuk seluruh siswa kelas yang belum diterapkan. Tanggal kosong menghapusnya. */
export function setClassMeetingDate(cls: PromotionClass, details: Details, date: string): Details {
  const next = { ...details };
  for (const s of cls.students) {
    if (!s.applied) next[s.studentId] = { ...next[s.studentId], meetingDate: date };
  }
  return next;
}

/** TTTT-BB-HH yang benar-benar ada di kalender. */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** Catatan yang tidak sah: tanggal bukan tanggal nyata (boleh kosong), atau teks melewati batas server. */
export function invalidDetailsFor(d: StudentDetails): (keyof StudentDetails)[] {
  const bad: (keyof StudentDetails)[] = [];
  if (d.reason.trim().length > MAX_DETAIL_LENGTH) bad.push('reason');
  if (d.followUp.trim().length > MAX_DETAIL_LENGTH) bad.push('followUp');
  if (d.meetingDate !== '' && !isIsoDate(d.meetingDate)) bad.push('meetingDate');
  return bad;
}

/* ---------- Penyimpanan ---------- */

/** Siswa yang perlu disimpan: sudah punya pilihan, belum diterapkan, dan pilihan atau catatannya beda dari yang tersimpan. */
export function pendingStudents(classes: readonly PromotionClass[], choices: Choices, details: Details = {}) {
  const out: { cls: PromotionClass; student: PromotionStudent; decision: Decision }[] = [];
  for (const cls of classes) {
    for (const student of cls.students) {
      const decision = choices[student.studentId];
      if (student.applied || !decision) continue;
      if (decision !== student.decision || detailsChanged(student, details)) {
        out.push({ cls, student, decision });
      }
    }
  }
  return out;
}

/**
 * Payload simpan. Kelas tujuan eksplisit yang tersimpan hanya dibawa bila keputusannya tidak berubah dan bukan lulus
 * (server menimpa kelas tujuan dengan null bila tidak dikirim). Catatan (`note`) dan catatan keputusan (alasan,
 * tindak lanjut, tanggal musyawarah) selalu dibawa dengan nilai efektifnya, karena yang dihilangkan menjadi kosong di server.
 */
export function buildSavePayload(
  classes: readonly PromotionClass[],
  choices: Choices,
  details: Details = {},
): DecisionItem[] {
  return pendingStudents(classes, choices, details).map(({ student, decision }) => {
    const item: DecisionItem = { studentId: student.studentId, decision };
    if (decision !== 'graduate' && decision === student.decision && student.toClassId) {
      item.toClassId = student.toClassId;
    }
    if (student.note) item.note = student.note;
    // Server mempertahankan field yang dihilangkan, jadi nilai kosong dikirim sebagai null eksplisit.
    const d = effectiveDetails(student, details);
    item.reason = d.reason.trim() || null;
    item.followUp = d.followUp.trim() || null;
    item.meetingDate = d.meetingDate || null;
    return item;
  });
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---------- Pemblokiran tingkat akhir ---------- */

/** Siswa tingkat akhir yang belum diterapkan dan belum punya pilihan (wajib diputuskan eksplisit). */
export function missingFinalStudents(classes: readonly PromotionClass[], choices: Choices) {
  const out: { cls: PromotionClass; student: PromotionStudent }[] = [];
  for (const cls of classes) {
    if (!cls.isFinalLevel) continue;
    for (const student of cls.students) {
      if (!student.applied && !choices[student.studentId]) out.push({ cls, student });
    }
  }
  return out;
}

export interface SaveBlockers {
  /** Siswa tingkat akhir tanpa keputusan. */
  missingFinal: number;
  /** Siswa yang akan disimpan tetapi catatannya tidak sah. */
  invalidDetails: number;
}

export function saveBlockers(
  classes: readonly PromotionClass[],
  choices: Choices,
  details: Details = {},
): SaveBlockers {
  const invalid = pendingStudents(classes, choices, details).filter(
    ({ student }) => invalidDetailsFor(effectiveDetails(student, details)).length > 0,
  );
  return { missingFinal: missingFinalStudents(classes, choices).length, invalidDetails: invalid.length };
}

/** Simpan dan Lanjut hanya terbuka bila semua siswa tingkat akhir sudah diputuskan dan catatan sah. */
export function isBlocked(b: SaveBlockers): boolean {
  return b.missingFinal > 0 || b.invalidDetails > 0;
}

/** Kelas yang masih punya siswa tingkat akhir belum diputuskan, untuk penanda di daftar. */
export function missingByClass(classes: readonly PromotionClass[], choices: Choices): Map<string, number> {
  const out = new Map<string, number>();
  for (const { cls } of missingFinalStudents(classes, choices)) {
    out.set(cls.classId, (out.get(cls.classId) ?? 0) + 1);
  }
  return out;
}

/* ---------- Daftar besar: pencarian ---------- */

/** Siswa kelas yang cocok dengan kata kunci (nama atau NIS, tanpa membedakan huruf besar-kecil). Kosong = semua. */
export function filterStudents<S extends Pick<PromotionStudent, 'name' | 'nis'>>(
  students: readonly S[],
  query: string,
): S[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...students];
  return students.filter((s) => s.name.toLowerCase().includes(q) || (s.nis ?? '').toLowerCase().includes(q));
}

/** Ambang jumlah seluruh siswa: di atasnya, kelas dilipat bawaan supaya daftar 100+ siswa tidak terlalu panjang. */
export const COLLAPSE_ABOVE = 40;

/** Apakah sebuah kelas terbuka: pilihan pengguna, kalau tidak bawaan (terbuka bila daftar kecil, atau ada yang belum diputuskan, atau ada yang cocok dengan pencarian). */
export function isClassOpen(opts: {
  userChoice: boolean | undefined;
  totalStudents: number;
  missing: number;
  searching: boolean;
}): boolean {
  if (opts.userChoice !== undefined) return opts.userChoice;
  if (opts.searching) return true;
  if (opts.missing > 0) return true;
  return opts.totalStudents <= COLLAPSE_ABOVE;
}

export interface Summary {
  total: number;
  promote: number;
  retain: number;
  graduate: number;
  /** Siswa tingkat akhir yang belum diputuskan. */
  undecided: number;
  /** Keputusan yang sudah diterapkan ke tahun tujuan (terkunci). */
  applied: number;
  /** Pilihan atau catatan yang belum tersimpan di server. */
  unsaved: number;
}

/** Ringkasan angka seluruh siswa. Siswa yang sudah diterapkan dihitung terpisah, bukan di naik/tinggal/lulus. */
export function summarize(
  classes: readonly PromotionClass[],
  choices: Choices,
  details: Details = {},
): Summary {
  const out: Summary = { total: 0, promote: 0, retain: 0, graduate: 0, undecided: 0, applied: 0, unsaved: 0 };
  for (const cls of classes) {
    for (const s of cls.students) {
      out.total++;
      if (s.applied) {
        out.applied++;
        continue;
      }
      const d = choices[s.studentId];
      if (d) out[d]++;
      // Hanya tingkat akhir yang wajib diputuskan; kelas bertingkat tak dikenal tanpa pilihan hanya dilewati.
      else if (cls.isFinalLevel) out.undecided++;
    }
  }
  out.unsaved = pendingStudents(classes, choices, details).length;
  return out;
}

/** Peta studentId -> nama untuk menampilkan hasil penerapan. */
export function studentNames(classes: readonly PromotionClass[]): Map<string, string> {
  return new Map(classes.flatMap((c) => c.students.map((s) => [s.studentId, s.name] as const)));
}

/* ---------- Peringatan salin tahun ajaran dan alasan siswa tak tertempatkan ---------- */

type Params = Record<string, string | number>;

/** Kode peringatan salin tahun ajaran yang punya terjemahan (`promotion.rolloverWarning.<kode>`). */
export const ROLLOVER_WARNING_CODES = [
  'class_level_unknown',
  'class_name_unmatched',
  'class_name_conflict',
  'class_level_mismatch',
  'final_level_not_copied',
  'inactive_homeroom_skipped',
  'homeroom_multiple',
  'inactive_teacher_skipped',
  'event_class_skipped',
  'event_out_of_year',
  'flow_inactive_objectives',
  'part_skipped_no_permission',
] as const;

/* ---------- Izin per bagian salinan tahun ajaran ---------- */

/** Bagian salinan menurut API (`part` pada peringatan `part_skipped_no_permission`). */
export type RolloverPart = 'classes' | 'calendar' | 'curriculum' | 'teachingPlans';

export interface RolloverOptions {
  copyClasses: boolean;
  copyAssignments: boolean;
  copyCalendar: boolean;
  copyCurriculum: boolean;
  copyTeachingPlans: boolean;
}

/** Izin spesifik tiap bagian (selain izin kenaikan kelas yang membuka layarnya); sama dengan yang diperiksa API. */
export const ROLLOVER_PART_PERMISSION: Record<RolloverPart, string> = {
  classes: 'class:manage',
  calendar: 'academic_year:manage',
  curriculum: 'curriculum:manage',
  teachingPlans: 'teaching_plan:write',
};

/** Bagian milik tiap pilihan salin. */
export const ROLLOVER_OPTION_PART: Record<keyof RolloverOptions, RolloverPart> = {
  copyClasses: 'classes',
  copyAssignments: 'classes',
  copyCalendar: 'calendar',
  copyCurriculum: 'curriculum',
  copyTeachingPlans: 'teachingPlans',
};

/** Izin yang dibutuhkan sebuah pilihan salin. */
export const permissionForOption = (option: keyof RolloverOptions): string =>
  ROLLOVER_PART_PERMISSION[ROLLOVER_OPTION_PART[option]];

/** Pilihan salin yang boleh dipakai pemanggil. */
export function allowedRolloverOptions(
  can: (permission: string) => boolean,
): Record<keyof RolloverOptions, boolean> {
  const out = {} as Record<keyof RolloverOptions, boolean>;
  for (const key of Object.keys(ROLLOVER_OPTION_PART) as (keyof RolloverOptions)[]) {
    out[key] = can(permissionForOption(key));
  }
  return out;
}

/** Pilihan yang benar-benar dikirim: yang tidak diizinkan dipaksa false (tidak pernah dikirim true). */
export function sendableRolloverOptions(
  options: RolloverOptions,
  can: (permission: string) => boolean,
): RolloverOptions {
  const allowed = allowedRolloverOptions(can);
  return {
    copyClasses: options.copyClasses && allowed.copyClasses,
    copyAssignments: options.copyAssignments && allowed.copyAssignments,
    copyCalendar: options.copyCalendar && allowed.copyCalendar,
    copyCurriculum: options.copyCurriculum && allowed.copyCurriculum,
    copyTeachingPlans: options.copyTeachingPlans && allowed.copyTeachingPlans,
  };
}

/** Bagian yang dikenal untuk diterjemahkan; selain itu peringatan memakai teks server. */
export const isRolloverPart = (part: unknown): part is RolloverPart =>
  typeof part === 'string' && part in ROLLOVER_PART_PERMISSION;

/** Kode alasan siswa tak tertempatkan yang punya terjemahan (`promotion.unplacedReason.<kode>`). */
export const UNPLACED_REASON_CODES = [
  'student_missing',
  'student_not_active',
  'source_class_missing',
  'target_class_invalid',
  'no_next_level',
  'no_target_class',
  'not_final_level',
] as const;

export type RolloverWarningCode = (typeof ROLLOVER_WARNING_CODES)[number];
export type UnplacedReasonCode = (typeof UNPLACED_REASON_CODES)[number];

export interface CodedMessage {
  /** Kode yang dikenal (punya terjemahan), atau null: tampilkan `fallback`. */
  code: string | null;
  params: Params;
  /** Teks bahasa Indonesia dari server, dipakai bila kode tak dikenal atau tak ada. */
  fallback: string;
}

const isKnown = (list: readonly string[], code: string | undefined): code is string =>
  code !== undefined && list.includes(code);

/**
 * Peringatan salin tahun ajaran untuk ditampilkan. `warningItems` sejajar dengan `warnings`; kode yang tak dikenal
 * (atau API lama tanpa `warningItems`) jatuh ke teks `warnings`. Peringatan kembar digabung.
 */
export function rolloverWarnings(res: {
  warnings: readonly string[];
  warningItems?: readonly { code: string; params: Params }[];
}): CodedMessage[] {
  const out: CodedMessage[] = [];
  const seen = new Set<string>();
  const n = Math.max(res.warnings.length, res.warningItems?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const item = res.warningItems?.[i];
    const fallback = res.warnings[i] ?? item?.code ?? '';
    const code = isKnown(ROLLOVER_WARNING_CODES, item?.code) ? item.code : null;
    const params = code && item ? item.params : {};
    const id = code ? `${code}:${JSON.stringify(params)}` : `text:${fallback}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ code, params, fallback });
  }
  return out;
}

/** Alasan siswa tak tertempatkan, menurut `reasonCode` bila dikenal. */
export function unplacedReason(u: {
  reason: string;
  reasonCode?: string;
  reasonParams?: Params;
}): CodedMessage {
  const code = isKnown(UNPLACED_REASON_CODES, u.reasonCode) ? u.reasonCode : null;
  return { code, params: code ? (u.reasonParams ?? {}) : {}, fallback: u.reason };
}

/* ---------- Peringatan penerapan: lulus tanpa rapor final ---------- */

/**
 * Jumlah siswa yang akan ditetapkan lulus padahal rapor semester terakhir kelasnya belum final. Membaca
 * `graduateReportNotFinal`; bila kosong (API lama), jumlah diambil dari peringatan terstruktur
 * `graduate_report_not_final`.
 */
export function graduateReportNotFinalCount(res: {
  graduateReportNotFinal?: number;
  warningItems?: readonly { code: string; params: Params }[];
}): number {
  if (typeof res.graduateReportNotFinal === 'number') return Math.max(0, res.graduateReportNotFinal);
  const item = res.warningItems?.find((w) => w.code === 'graduate_report_not_final');
  const n = Number(item?.params.count ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Penerapan tidak diblokir, tetapi butuh konfirmasi tambahan bila ada siswa lulus tanpa rapor final. */
export function needsGraduateConfirm(count: number): boolean {
  return count > 0;
}

/** Kelas yang tingkatnya tidak dikenal (butuh perbaikan daftar tingkat atau kelas tujuan eksplisit). */
export function levelUnknownClasses(classes: readonly PromotionClass[]): PromotionClass[] {
  return classes.filter((c) => c.levelUnknown === true);
}
