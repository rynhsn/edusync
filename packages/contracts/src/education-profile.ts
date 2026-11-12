import { z } from 'zod';

/**
 * Profil jenjang: satu unit sekolah = satu jenjang. Acuannya (`ref_education_profile`) menentukan tingkat dan fase bawaan,
 * model pengajar, dan kemampuan (mis. kejuruan). Fitur mengikuti kemampuan ini, bukan nama jenjang.
 */
/** Isian jenjang pada pendaftaran unit; kunci diperiksa terhadap acuan (400 `invalid_education_profile`). */
export const educationProfileKeySchema = z
  .string()
  .min(1)
  .max(20)
  .describe('Jenjang unit (wajib): kunci dari GET /v1/education-profiles. Galat: invalid_education_profile.');

export const educationProfileLevelSchema = z.object({
  code: z.string(),
  label: z.string(),
  phase: z
    .string()
    .describe('Fase Kurikulum Merdeka: A (kelas 1-2), B (3-4), C (5-6), D (7-9), E (10), F (11-12)'),
});

export const educationProfileSchema = z.object({
  key: z.string().describe('Kunci profil: sd, mi, smp, mts, sma, ma, smk, mak'),
  name: z.string(),
  levelGroup: z.string().describe('Kelompok jenjang bank kurikulum (`ref_school_level.key`)'),
  authority: z.enum(['kemendikdasmen', 'kemenag']),
  teacherModel: z
    .enum(['subject', 'class'])
    .describe('`subject` = guru mapel; `class` = guru kelas (SD/MI) yang mengampu banyak mapel'),
  vocational: z.boolean().describe('Jenjang kejuruan: PKL dan UKK tersedia'),
  levels: z.array(educationProfileLevelSchema),
  suggestedPeriodMinutes: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      'SARAN menit per JP (35/40/45 menurut jenjang); bukan nilai tersimpan, sekolah mengaturnya per tingkat',
    ),
  suggestedEffectiveWeeks: z
    .number()
    .int()
    .optional()
    .describe('SARAN minggu efektif per tahun (36; tingkat akhir 32); bukan nilai tersimpan'),
});

export type EducationProfile = z.infer<typeof educationProfileSchema>;

/** Ringkasan profil yang dibawa ke web (menu dan pintasan mengikutinya). */
export const educationProfileBriefSchema = educationProfileSchema.pick({
  key: true,
  name: true,
  teacherModel: true,
  vocational: true,
});

export type EducationProfileBrief = z.infer<typeof educationProfileBriefSchema>;

/** Fase suatu tingkat menurut profil; null bila tingkat itu tidak ada di profil. */
export function phaseOf(profile: Pick<EducationProfile, 'levels'>, levelCode: string): string | null {
  return profile.levels.find((l) => l.code === levelCode)?.phase ?? null;
}
