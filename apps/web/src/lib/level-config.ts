/**
 * Logika murni konfigurasi tingkat kelas (fase 2C, K2): menit per JP dan minggu efektif. Nilai ini opsional;
 * dipakai menghitung jam efektif dan boleh dikosongkan. Server mempertahankan field yang tidak dikirim,
 * jadi klien hanya mengirim yang berubah.
 */

export const MIN_PERIOD_MINUTES = 1;
export const MAX_PERIOD_MINUTES = 300;
export const MIN_EFFECTIVE_WEEKS = 1;
export const MAX_EFFECTIVE_WEEKS = 60;

export interface LevelConfigSaved {
  periodMinutes?: number | null;
  effectiveWeeks?: number | null;
}

/** Isian dialog sebagai teks apa adanya ('' = kosong). */
export interface LevelConfigDraft {
  periodMinutes: string;
  effectiveWeeks: string;
}

export interface LevelConfigBody {
  periodMinutes?: number | null;
  effectiveWeeks?: number | null;
}

export function configToDraft(saved: LevelConfigSaved): LevelConfigDraft {
  return {
    periodMinutes: saved.periodMinutes == null ? '' : String(saved.periodMinutes),
    effectiveWeeks: saved.effectiveWeeks == null ? '' : String(saved.effectiveWeeks),
  };
}

/** '' menjadi null, bilangan bulat dalam rentang menjadi angka, selain itu 'invalid'. */
export function parseBounded(text: string, min: number, max: number): number | null | 'invalid' {
  const s = text.trim();
  if (s === '') return null;
  if (!/^\d{1,3}$/.test(s)) return 'invalid';
  const n = Number(s);
  return n >= min && n <= max ? n : 'invalid';
}

export interface LevelConfigPatch {
  /** Hanya field yang berubah dibanding data tersimpan. */
  body: LevelConfigBody;
  invalid: (keyof LevelConfigDraft)[];
}

/** Badan permintaan berisi hanya field yang berubah; mengosongkan isian mengirim null. */
export function levelConfigPatch(saved: LevelConfigSaved, draft: LevelConfigDraft): LevelConfigPatch {
  const body: LevelConfigBody = {};
  const invalid: (keyof LevelConfigDraft)[] = [];
  const minutes = parseBounded(draft.periodMinutes, MIN_PERIOD_MINUTES, MAX_PERIOD_MINUTES);
  const weeks = parseBounded(draft.effectiveWeeks, MIN_EFFECTIVE_WEEKS, MAX_EFFECTIVE_WEEKS);
  if (minutes === 'invalid') invalid.push('periodMinutes');
  else if (minutes !== (saved.periodMinutes ?? null)) body.periodMinutes = minutes;
  if (weeks === 'invalid') invalid.push('effectiveWeeks');
  else if (weeks !== (saved.effectiveWeeks ?? null)) body.effectiveWeeks = weeks;
  return { body, invalid };
}

export interface LevelSuggestion {
  periodMinutes: number | null;
  effectiveWeeks: number | null;
}

/** Saran dari profil jenjang. Hanya mengisi isian bila pengguna menekan "Pakai saran"; tidak pernah otomatis. */
export function applySuggestion(draft: LevelConfigDraft, suggestion: LevelSuggestion): LevelConfigDraft {
  return {
    periodMinutes: suggestion.periodMinutes == null ? draft.periodMinutes : String(suggestion.periodMinutes),
    effectiveWeeks:
      suggestion.effectiveWeeks == null ? draft.effectiveWeeks : String(suggestion.effectiveWeeks),
  };
}

export function hasSuggestion(s: LevelSuggestion | null | undefined): s is LevelSuggestion {
  return !!s && (s.periodMinutes != null || s.effectiveWeeks != null);
}

/** Jam efektif per tahun dari JP tahunan dan menit per JP, satu desimal; null bila menit belum diatur. */
export function effectiveHours(
  yearlyPeriods: number,
  periodMinutes: number | null | undefined,
): number | null {
  if (periodMinutes == null || periodMinutes <= 0) return null;
  return Math.round(((yearlyPeriods * periodMinutes) / 60) * 10) / 10;
}

/* ---------- Program: lama studi dan tingkat akhir (K3) ---------- */

export const PROGRAM_DURATIONS = [3, 4] as const;

export interface ProgramConfigSaved {
  durationYears?: number | null;
  finalLevelCode?: string | null;
}

/** Isian program: '' = belum ditentukan. */
export interface ProgramConfigDraft {
  durationYears: '' | '3' | '4';
  finalLevelCode: string;
}

export function programConfigToDraft(saved: ProgramConfigSaved): ProgramConfigDraft {
  return {
    durationYears: saved.durationYears === 3 ? '3' : saved.durationYears === 4 ? '4' : '',
    finalLevelCode: saved.finalLevelCode ?? '',
  };
}

/**
 * Field konfigurasi program yang dikirim. Program baru (`saved` kosong) mengirim yang terisi saja; program yang
 * diubah hanya mengirim yang berubah (server mempertahankan yang tidak dikirim, null mengosongkan).
 */
export function programConfigPatch(
  saved: ProgramConfigSaved,
  draft: ProgramConfigDraft,
): { durationYears?: 3 | 4 | null; finalLevelCode?: string | null } {
  const out: { durationYears?: 3 | 4 | null; finalLevelCode?: string | null } = {};
  const duration = draft.durationYears === '' ? null : (Number(draft.durationYears) as 3 | 4);
  const final = draft.finalLevelCode === '' ? null : draft.finalLevelCode;
  if (duration !== (saved.durationYears ?? null)) out.durationYears = duration;
  if (final !== (saved.finalLevelCode ?? null)) out.finalLevelCode = final;
  return out;
}
