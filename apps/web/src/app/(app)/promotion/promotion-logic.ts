/**
 * Logika murni wizard kenaikan kelas: pilihan tahun tujuan, keputusan awal, aksi massal per kelas, pembentukan
 * payload simpan, dan ringkasan. Tanpa React supaya bisa diuji sendiri.
 */

export type Decision = 'promote' | 'retain' | 'graduate';

export interface PromotionStudent {
  studentId: string;
  name: string;
  nis: string | null;
  decision: Decision | null;
  suggestedDecision: 'promote' | 'graduate';
  toClassId: string | null;
  note: string | null;
  applied: boolean;
}

export interface PromotionClass {
  classId: string;
  name: string;
  level: string;
  nextLevel: string | null;
  isFinalLevel: boolean;
  students: PromotionStudent[];
}

export interface YearLike {
  id: string;
  name: string;
  startsOn: string;
  isActive?: boolean;
}

/** Pilihan siswa per studentId (keputusan tersimpan, atau saran bawaan bila belum diputuskan). */
export type Choices = Record<string, Decision>;

export interface DecisionItem {
  studentId: string;
  decision: Decision;
  toClassId?: string | null;
  note?: string | null;
}

/** Batas server per permintaan simpan. */
export const SAVE_CHUNK = 500;

/** Keputusan yang boleh dipilih untuk sebuah kelas: tingkat terakhir lulus atau tinggal, selain itu naik atau tinggal. */
export function optionsFor(cls: Pick<PromotionClass, 'isFinalLevel'>): Decision[] {
  return cls.isFinalLevel ? ['graduate', 'retain'] : ['promote', 'retain'];
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

/** Pilihan awal: keputusan tersimpan, atau saran backend untuk yang belum diputuskan. */
export function initialChoices(classes: readonly PromotionClass[]): Choices {
  const out: Choices = {};
  for (const c of classes) {
    for (const s of c.students) out[s.studentId] = s.decision ?? s.suggestedDecision;
  }
  return out;
}

/** Aksi massal satu kelas. Siswa yang keputusannya sudah diterapkan tidak berubah; keputusan yang tak boleh untuk kelas itu diabaikan. */
export function setClassDecision(cls: PromotionClass, choices: Choices, decision: Decision): Choices {
  if (!optionsFor(cls).includes(decision)) return choices;
  const next = { ...choices };
  for (const s of cls.students) if (!s.applied) next[s.studentId] = decision;
  return next;
}

/** Siswa yang perlu disimpan: belum diterapkan dan pilihannya beda dari yang tersimpan (atau belum pernah disimpan). */
export function pendingStudents(classes: readonly PromotionClass[], choices: Choices) {
  const out: { cls: PromotionClass; student: PromotionStudent; decision: Decision }[] = [];
  for (const cls of classes) {
    for (const student of cls.students) {
      const decision = choices[student.studentId];
      if (student.applied || !decision) continue;
      if (decision !== student.decision) out.push({ cls, student, decision });
    }
  }
  return out;
}

/**
 * Payload simpan. Kelas tujuan eksplisit yang tersimpan hanya dibawa bila keputusannya tidak berubah dan bukan lulus
 * (server menimpa kelas tujuan dengan null bila tidak dikirim); catatan selalu dibawa.
 */
export function buildSavePayload(classes: readonly PromotionClass[], choices: Choices): DecisionItem[] {
  return pendingStudents(classes, choices).map(({ student, decision }) => {
    const item: DecisionItem = { studentId: student.studentId, decision };
    if (decision !== 'graduate' && decision === student.decision && student.toClassId) {
      item.toClassId = student.toClassId;
    }
    if (student.note) item.note = student.note;
    return item;
  });
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface Summary {
  total: number;
  promote: number;
  retain: number;
  graduate: number;
  /** Keputusan yang sudah diterapkan ke tahun tujuan (terkunci). */
  applied: number;
  /** Pilihan yang belum tersimpan di server. */
  unsaved: number;
}

/** Ringkasan angka seluruh siswa. Siswa yang sudah diterapkan dihitung terpisah, bukan di naik/tinggal/lulus. */
export function summarize(classes: readonly PromotionClass[], choices: Choices): Summary {
  const out: Summary = { total: 0, promote: 0, retain: 0, graduate: 0, applied: 0, unsaved: 0 };
  for (const cls of classes) {
    for (const s of cls.students) {
      out.total++;
      if (s.applied) {
        out.applied++;
        continue;
      }
      const d = choices[s.studentId];
      if (d) out[d]++;
    }
  }
  out.unsaved = pendingStudents(classes, choices).length;
  return out;
}

/** Peta studentId -> nama untuk menampilkan hasil penerapan. */
export function studentNames(classes: readonly PromotionClass[]): Map<string, string> {
  return new Map(classes.flatMap((c) => c.students.map((s) => [s.studentId, s.name] as const)));
}
