import { facilitatorShapeValid, RUBRIC_LEVEL_LIMIT } from '@edusync/contracts';

/** Pembantu murni untuk halaman Pengaturan kokurikuler (tahap 4.1). */

export interface ItemDraft {
  /** Kunci lokal stabil (id server, atau `new-n` untuk butir baru). */
  key: string;
  id?: string;
  frameworkKey: string;
  refCode: string | null;
  code: string;
  label: string;
  description: string;
  active: boolean;
}

export interface LevelDraft {
  key: string;
  id?: string;
  code: string;
  label: string;
  description: string;
  active: boolean;
}

type LocaleLabels = { labelId: string; labelEn: string; labelSu: string };

/** Label acuan menurut bahasa antarmuka (Indonesia bila bahasanya tak dikenal). */
export function refLabel(item: LocaleLabels, locale: string): string {
  if (locale === 'en') return item.labelEn;
  if (locale === 'su') return item.labelSu;
  return item.labelId;
}

/** Pindah satu posisi (-1 = naik, 1 = turun); di ujung tidak berubah. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Badan PUT butir: urutan = posisi dalam kerangkanya (kelipatan 10). Butir baru tanpa `id`. */
export function itemsBody(drafts: readonly ItemDraft[]) {
  const seen = new Map<string, number>();
  return drafts.map((d) => {
    const n = (seen.get(d.frameworkKey) ?? 0) + 1;
    seen.set(d.frameworkKey, n);
    return {
      ...(d.id ? { id: d.id } : {}),
      frameworkKey: d.frameworkKey,
      code: d.code.trim(),
      label: d.label.trim(),
      description: d.description.trim() === '' ? null : d.description.trim(),
      sort: n * 10,
      active: d.active,
    };
  });
}

/** Badan PUT rubrik: urutan = posisi dalam daftar (dari 1). */
export function levelsBody(drafts: readonly LevelDraft[]) {
  return drafts.map((d, i) => ({
    ...(d.id ? { id: d.id } : {}),
    code: d.code.trim(),
    label: d.label.trim(),
    description: d.description.trim() === '' ? null : d.description.trim(),
    sort: i + 1,
    active: d.active,
  }));
}

/** Isian wajib terisi dan kode tidak kembar; kunci galatnya dipakai tampilan untuk menahan simpan. */
export function levelsValid(drafts: readonly LevelDraft[]): boolean {
  const codes = drafts.map((d) => d.code.trim());
  return (
    drafts.length <= RUBRIC_LEVEL_LIMIT &&
    drafts.every((d) => d.code.trim() !== '' && d.label.trim() !== '') &&
    new Set(codes).size === codes.length
  );
}

export function itemsValid(drafts: readonly ItemDraft[]): boolean {
  const keys = drafts.map((d) => `${d.frameworkKey}\u0000${d.code.trim()}`);
  return (
    drafts.every((d) => d.label.trim() !== '' && d.code.trim() !== '') && new Set(keys).size === keys.length
  );
}

/** Sama bila isi (bukan kunci lokal) tidak berubah; dipakai penanda "belum disimpan". */
export function sameDrafts<T extends { key: string }>(a: readonly T[], b: readonly T[]): boolean {
  const strip = (list: readonly T[]) => JSON.stringify(list.map(({ key: _key, ...rest }) => rest));
  return strip(a) === strip(b);
}

/* ---------- Program kokurikuler (tahap 4.2) ---------- */

export interface ProgramDraft {
  semesterId: string;
  form: 'collaborative' | 'g7kaih' | 'other';
  title: string;
  theme: string;
  description: string;
  plannedPeriods: string;
  showInReport: boolean;
  status: 'draft' | 'active' | 'closed';
}

export const EMPTY_PROGRAM: ProgramDraft = {
  semesterId: '',
  form: 'collaborative',
  title: '',
  theme: '',
  description: '',
  plannedPeriods: '',
  showInReport: true,
  status: 'draft',
};

const PERIODS_MAX = 100000;

/** Judul wajib; rencana JP kosong atau bilangan bulat 0..100000 (sama dengan kontrak API). */
export function programValid(d: ProgramDraft): boolean {
  const p = d.plannedPeriods.trim();
  return d.title.trim() !== '' && (p === '' || (/^\d+$/.test(p) && Number(p) <= PERIODS_MAX));
}

/** Badan POST/PUT data pokok program; isian kosong menjadi null. */
export function programBody(d: ProgramDraft) {
  const orNull = (v: string) => (v.trim() === '' ? null : v.trim());
  return {
    semesterId: d.semesterId === '' ? null : d.semesterId,
    form: d.form,
    title: d.title.trim(),
    theme: orNull(d.theme),
    description: orNull(d.description),
    plannedPeriods: d.plannedPeriods.trim() === '' ? null : Number(d.plannedPeriods),
    showInReport: d.showInReport,
    status: d.status,
  };
}

export interface FacilitatorDraft {
  key: string;
  teacherId: string;
  /** '' = koordinator (seluruh rombel program). */
  classId: string;
  role: 'coordinator' | 'facilitator';
}

/** Badan PUT fasilitator; koordinator selalu tanpa rombel. */
export function facilitatorsBody(drafts: readonly FacilitatorDraft[]) {
  return drafts.map((d) => ({
    teacherId: d.teacherId,
    classId: d.role === 'coordinator' || d.classId === '' ? null : d.classId,
    role: d.role,
  }));
}

/** Guru terpilih, bentuk peran benar, rombel termasuk rombel program, dan tidak ada pasangan guru+rombel ganda. */
export function facilitatorsValid(
  drafts: readonly FacilitatorDraft[],
  programClassIds: ReadonlySet<string>,
): boolean {
  const body = facilitatorsBody(drafts);
  const keys = body.map((f) => `${f.teacherId}\u0000${f.classId ?? ''}`);
  return (
    body.every(
      (f) =>
        f.teacherId !== '' &&
        facilitatorShapeValid(f) &&
        (f.classId === null || programClassIds.has(f.classId)),
    ) && new Set(keys).size === keys.length
  );
}

/** Tambah bila belum ada, buang bila sudah ada (pilihan centang). */
export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Sama bila isinya sama tanpa memandang urutan; penanda "belum disimpan" untuk daftar id. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && new Set([...a, ...b]).size === a.length;
}

/* ---------- Penilaian dan bukti (tahap 4.3) ---------- */

export { isEvidenceUrl } from '@edusync/contracts';

export interface CellDraft {
  /** '' = belum dinilai. */
  levelId: string;
  note: string;
}
/** Kunci: `studentId|profileItemId`. Sel kosong (tingkat dan catatan kosong) tidak disimpan di peta. */
export type CellMap = Record<string, CellDraft>;

export const cellKey = (studentId: string, itemId: string) => `${studentId}|${itemId}`;
const EMPTY_CELL: CellDraft = { levelId: '', note: '' };
export const getCell = (map: CellMap, studentId: string, itemId: string): CellDraft =>
  map[cellKey(studentId, itemId)] ?? EMPTY_CELL;

export function cellMapFrom(
  cells: readonly {
    studentId: string;
    profileItemId: string;
    rubricLevelId: string | null;
    note: string | null;
  }[],
): CellMap {
  const map: CellMap = {};
  for (const c of cells) {
    map[cellKey(c.studentId, c.profileItemId)] = { levelId: c.rubricLevelId ?? '', note: c.note ?? '' };
  }
  return map;
}

/** Ubah satu sel; sel yang jadi kosong dibuang dari peta. */
export function setCell(map: CellMap, studentId: string, itemId: string, patch: Partial<CellDraft>): CellMap {
  const next = { ...map };
  const merged = { ...getCell(map, studentId, itemId), ...patch };
  if (merged.levelId === '' && merged.note.trim() === '') delete next[cellKey(studentId, itemId)];
  else next[cellKey(studentId, itemId)] = merged;
  return next;
}

/** Isi massal: satu tingkat untuk satu butir pada semua murid (catatan yang ada dipertahankan). */
export function fillColumn(
  map: CellMap,
  studentIds: readonly string[],
  itemId: string,
  levelId: string,
): CellMap {
  return studentIds.reduce((m, s) => setCell(m, s, itemId, { levelId }), map);
}

/** Badan PUT: hanya sel yang berbeda dari data server; sel yang dikosongkan dikirim null/null (hapus). */
export function changedCells(draft: CellMap, server: CellMap) {
  const out: {
    profileItemId: string;
    studentId: string;
    rubricLevelId: string | null;
    note: string | null;
  }[] = [];
  for (const key of new Set([...Object.keys(draft), ...Object.keys(server)])) {
    const a = draft[key] ?? EMPTY_CELL;
    const b = server[key] ?? EMPTY_CELL;
    if (a.levelId === b.levelId && a.note.trim() === b.note.trim()) continue;
    const [studentId, profileItemId] = key.split('|') as [string, string];
    out.push({
      profileItemId,
      studentId,
      rubricLevelId: a.levelId === '' ? null : a.levelId,
      note: a.note.trim() === '' ? null : a.note.trim(),
    });
  }
  return out;
}

/** Bagi daftar menjadi kelompok sebesar batas API (500 sel per simpan). */
export function chunkBy<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Semester awal layar penilaian: yang memuat `today`; bila tidak ada, yang terakhir sudah dimulai; bila belum, yang pertama. */
export function pickSemester(
  semesters: readonly { id: string; startsOn: string; endsOn: string }[],
  today: string,
): string {
  const sorted = [...semesters].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const current = sorted.find((s) => s.startsOn <= today && today <= s.endsOn);
  if (current) return current.id;
  const started = sorted.filter((s) => s.startsOn <= today);
  return (started[started.length - 1] ?? sorted[0])?.id ?? '';
}
