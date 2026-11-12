import { z } from 'zod';
import { CALCULATION_MODES, type CalculationMode } from './grading';
import { CRITERIA_MODES, type KktpRow } from './kktp';

/**
 * Salinan beku konfigurasi nilai satu semester (tabel `semester_grading_config`), bentuk `config_version` = 1.
 * Kolom `components` dan `criteria` di tabel berbentuk jsonb; zod di sini memvalidasi saat dibaca. Tanpa akses database.
 * Rancangan: docs/rancangan-pembekuan-konfigurasi-nilai.md.
 */

/** Asal sebuah baris beku. */
export const FREEZE_ORIGINS = ['finalize', 'semester_closed', 'sync', 'backfill', 'manual'] as const;
export type FreezeOrigin = (typeof FREEZE_ORIGINS)[number];

/** Versi bentuk salinan yang ditulis kode ini. Naikkan bila bentuk jsonb berubah (mis. KKTP per TP); pembaca per versi. */
export const GRADING_CONFIG_VERSION = 1;

export interface FrozenComponent {
  id: string;
  name: string;
  weight: number;
  sort: number;
}

/** KktpRow beserta mapelnya. Hanya baris aktif tanpa TP: `objectiveId` selalu null, `active` selalu true. */
export interface FrozenCriteria extends KktpRow {
  subjectId: string;
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
}

export const frozenComponentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  weight: z.number().int(),
  sort: z.number().int(),
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

export const frozenComponentsSchema = z.array(frozenComponentSchema);
export const frozenCriteriaListSchema = z.array(frozenCriteriaSchema);

export const frozenGradingConfigSchema = z.object({
  kkm: z.number().int(),
  predicateA: z.number().int(),
  predicateB: z.number().int(),
  predicateC: z.number().int(),
  calculationMode: z.enum(CALCULATION_MODES),
  components: frozenComponentsSchema,
  criteria: frozenCriteriaListSchema,
});
