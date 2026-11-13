import { z } from 'zod';
import { CALCULATION_MODES, type CalculationMode } from './grading';
import { CRITERIA_MODES, type KktpRow } from './kktp';

/**
 * Salinan beku konfigurasi nilai satu semester (tabel `semester_grading_config`), bentuk `config_version` 1 dan 2.
 * Kolom `components` dan `criteria` di tabel berbentuk jsonb; zod di sini memvalidasi saat dibaca. Tanpa akses database.
 * Rancangan: docs/rancangan-pembekuan-konfigurasi-nilai.md dan docs/rancangan-fase-3-asesmen-rapor.md (bagian 3.1 dan 3.2).
 *
 * Pembaca menerima versi 1 (bentuk sekarang) dan versi 2 (bentuk fase 3: kategori komponen, kriteria per TP, aturan agregasi TP,
 * kebijakan remedial). Semua field v2 OPSIONAL dan ditulis jarang (sparse): kunci yang hilang berarti nilai bawaan
 * (sumatif, ikut nilai akhir, tanpa kriteria TP, rata-rata, `record_only`), yang benar secara historis karena sebelum fase 3
 * tidak ada yang lain. Penulis (`GRADING_CONFIG_VERSION`) tetap 1 sampai ada salinan yang memuat isi v2.
 */

/** Asal sebuah baris beku. */
export const FREEZE_ORIGINS = ['finalize', 'semester_closed', 'sync', 'backfill', 'manual'] as const;
export type FreezeOrigin = (typeof FREEZE_ORIGINS)[number];

/** Versi bentuk salinan yang ditulis kode ini. Naikkan bila bentuk jsonb berubah (mis. KKTP per TP); pembaca per versi. */
export const GRADING_CONFIG_VERSION = 1;

/** Versi yang dapat dibaca. Versi 2 dikenali lebih dulu supaya rilis fase 3 berikutnya dan pembatalannya tidak gagal parse. */
export const GRADING_CONFIG_READABLE_VERSIONS = [1, 2] as const;

export const COMPONENT_CATEGORIES = ['formative', 'summative'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];
export const OBJECTIVE_AGGREGATIONS = ['mean', 'latest', 'max'] as const;
export type ObjectiveAggregation = (typeof OBJECTIVE_AGGREGATIONS)[number];
export const REMEDIAL_POLICIES = [
  'record_only',
  'replace_latest',
  'max',
  'cap_at_criteria',
  'mean_with_original',
] as const;
export type RemedialPolicy = (typeof REMEDIAL_POLICIES)[number];

/** Nilai bawaan untuk kunci yang tidak ada pada salinan (dan yang tidak pernah ditulis, supaya jsonb tetap sparse). */
export const FROZEN_COMPONENT_DEFAULTS = { category: 'summative', includeInFinal: true } as const;
export const DEFAULT_OBJECTIVE_AGGREGATION: ObjectiveAggregation = 'mean';
export const DEFAULT_REMEDIAL_POLICY: RemedialPolicy = 'record_only';

export interface FrozenComponent {
  id: string;
  name: string;
  weight: number;
  sort: number;
  /** v2, opsional. Hilang = `summative`. */
  category?: ComponentCategory;
  /** v2, opsional. Hilang = true. */
  includeInFinal?: boolean;
}

/** KktpRow beserta mapelnya. Hanya baris aktif tanpa TP: `objectiveId` selalu null, `active` selalu true. */
export interface FrozenCriteria extends KktpRow {
  subjectId: string;
}

/** Kriteria ketercapaian per TP (v2, kolom terpisah `objective_criteria`): KktpRow dengan `objectiveId` terisi. */
export interface FrozenObjectiveCriteria extends KktpRow {
  subjectId: string;
  objectiveId: string;
}

export interface FrozenGradingConfig {
  kkm: number;
  predicateA: number;
  predicateB: number;
  predicateC: number;
  calculationMode: CalculationMode;
  /** SEMUA komponen sekolah saat dibekukan, urut `sort` lalu nama. */
  components: FrozenComponent[];
  criteria: FrozenCriteria[];
  /** v2, opsional. Hilang = tanpa kriteria TP. */
  objectiveCriteria?: FrozenObjectiveCriteria[];
  /** v2, opsional. Hilang = `mean`. */
  objectiveAggregation?: ObjectiveAggregation | null;
  /** v2, opsional. Hilang = `record_only`. */
  remedialPolicy?: RemedialPolicy | null;
}

export const frozenComponentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  weight: z.number().int(),
  sort: z.number().int(),
  category: z.enum(COMPONENT_CATEGORIES).optional(),
  includeInFinal: z.boolean().optional(),
});

const frozenLevelSchema = z.object({
  label: z.string(),
  descriptor: z.string().nullable().optional(),
  minScore: z.number().nullable().optional(),
  maxScore: z.number().nullable().optional(),
  isAchieved: z.boolean(),
});

export const frozenCriteriaSchema = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  mode: z.enum(CRITERIA_MODES),
  threshold: z.number().nullable().optional(),
  levelCode: z.string().nullable(),
  programId: z.uuid().nullable(),
  objectiveId: z.null(),
  active: z.literal(true),
  levels: z.array(frozenLevelSchema),
});

/** Seperti `frozenCriteriaSchema` untuk kriteria per TP: `objectiveId` wajib terisi. Hanya untuk kolom `objective_criteria`. */
export const frozenObjectiveCriteriaSchema = frozenCriteriaSchema.extend({ objectiveId: z.uuid() });

export const frozenComponentsSchema = z.array(frozenComponentSchema);
export const frozenCriteriaListSchema = z.array(frozenCriteriaSchema);
export const frozenObjectiveCriteriaListSchema = z.array(frozenObjectiveCriteriaSchema);

export const frozenGradingConfigSchema = z.object({
  kkm: z.number().int(),
  predicateA: z.number().int(),
  predicateB: z.number().int(),
  predicateC: z.number().int(),
  calculationMode: z.enum(CALCULATION_MODES),
  components: frozenComponentsSchema,
  criteria: frozenCriteriaListSchema,
  objectiveCriteria: frozenObjectiveCriteriaListSchema.optional(),
  objectiveAggregation: z.enum(OBJECTIVE_AGGREGATIONS).nullable().optional(),
  remedialPolicy: z.enum(REMEDIAL_POLICIES).nullable().optional(),
});

/* ---------- Penulisan sparse dan pembacaan lintas versi ---------- */

/**
 * Buang kunci yang bernilai sama dengan bawaannya (dan yang `undefined`) supaya jsonb hanya memuat yang bukan bawaan.
 * Kunci yang tidak ada di `defaults` dipertahankan. Dipakai penulis salinan (rancangan fase 3, risiko R3): sekolah yang tidak
 * memakai fitur baru tetap menghasilkan jsonb v1 byte demi byte, jadi `matchesLive` dan snapshot lama tidak bergeser.
 */
export function omitDefaults<T extends object>(value: T, defaults: Partial<Record<keyof T, unknown>>): T {
  const bawaan = defaults as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(value).filter(([k, v]) => v !== undefined && !(k in bawaan && Object.is(bawaan[k], v))),
  ) as T;
}

/** Komponen untuk ditulis ke salinan: `category` dan `includeInFinal` hanya bila bukan bawaan. */
export function sparseFrozenComponent(c: FrozenComponent): FrozenComponent {
  return omitDefaults(c, FROZEN_COMPONENT_DEFAULTS);
}

export type ResolvedFrozenComponent = FrozenComponent & {
  category: ComponentCategory;
  includeInFinal: boolean;
};

/** Baris `semester_grading_config` (atau bentuk setara). Kolom v2 boleh tidak ada (versi 1 dan kode sebelum migrasi). */
export interface FrozenConfigRowInput {
  configVersion: number;
  kkm: number;
  predicateA: number;
  predicateB: number;
  predicateC: number;
  calculationMode: CalculationMode;
  components: unknown;
  criteria: unknown;
  objectiveCriteria?: unknown;
  objectiveAggregation?: string | null;
  remedialPolicy?: string | null;
}

export interface ResolvedFrozenGradingConfig {
  configVersion: number;
  kkm: number;
  predicateA: number;
  predicateB: number;
  predicateC: number;
  calculationMode: CalculationMode;
  components: ResolvedFrozenComponent[];
  criteria: FrozenCriteria[];
  objectiveCriteria: FrozenObjectiveCriteria[];
  objectiveAggregation: ObjectiveAggregation;
  remedialPolicy: RemedialPolicy;
}

export const isReadableGradingConfigVersion = (v: number) =>
  (GRADING_CONFIG_READABLE_VERSIONS as readonly number[]).includes(v);

/** Tolak versi yang tidak dikenal dengan pesan jelas (lebih baik gagal keras daripada menafsirkan bentuk asing). */
export function assertReadableGradingConfigVersion(v: number): void {
  if (!isReadableGradingConfigVersion(v)) {
    throw new Error(
      `Versi salinan konfigurasi nilai ${v} tidak dikenali (dapat dibaca: ${GRADING_CONFIG_READABLE_VERSIONS.join(', ')}).`,
    );
  }
}

/**
 * Baca salinan beku versi 1 atau 2 menjadi bentuk lengkap: kunci yang hilang ditafsirkan sebagai nilai bawaan
 * (komponen `summative` dan ikut nilai akhir, tanpa kriteria TP, agregasi `mean`, kebijakan `record_only`).
 * Salinan v1 dan salinan v2 yang tidak memakai fitur baru menghasilkan hasil yang sama persis.
 */
export function resolveFrozenGradingConfig(row: FrozenConfigRowInput): ResolvedFrozenGradingConfig {
  assertReadableGradingConfigVersion(row.configVersion);
  return {
    configVersion: row.configVersion,
    kkm: row.kkm,
    predicateA: row.predicateA,
    predicateB: row.predicateB,
    predicateC: row.predicateC,
    calculationMode: row.calculationMode,
    components: frozenComponentsSchema.parse(row.components).map((c) => ({
      ...c,
      category: c.category ?? FROZEN_COMPONENT_DEFAULTS.category,
      includeInFinal: c.includeInFinal ?? FROZEN_COMPONENT_DEFAULTS.includeInFinal,
    })),
    criteria: frozenCriteriaListSchema.parse(row.criteria),
    objectiveCriteria: frozenObjectiveCriteriaListSchema.parse(row.objectiveCriteria ?? []),
    objectiveAggregation:
      z
        .enum(OBJECTIVE_AGGREGATIONS)
        .nullable()
        .parse(row.objectiveAggregation ?? null) ?? DEFAULT_OBJECTIVE_AGGREGATION,
    remedialPolicy:
      z
        .enum(REMEDIAL_POLICIES)
        .nullable()
        .parse(row.remedialPolicy ?? null) ?? DEFAULT_REMEDIAL_POLICY,
  };
}
