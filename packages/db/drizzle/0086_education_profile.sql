-- Profil jenjang: satu unit sekolah = satu jenjang. Acuan global (dikelola platform) menentukan tingkat dan fase bawaan,
-- model pengajar (guru mapel atau guru kelas), dan apakah jenjangnya kejuruan. Sekolah lama diisi dari kurikulum yang
-- sudah diadopsi bila tepat satu kelompok jenjang; sisanya dibiarkan kosong (tidak ditebak).
CREATE TABLE "ref_education_profile" (
  "key" text PRIMARY KEY,
  "name" text NOT NULL,
  "level_group" text NOT NULL,
  "authority" text NOT NULL,
  "teacher_model" text NOT NULL,
  "vocational" boolean NOT NULL DEFAULT false,
  "levels" jsonb NOT NULL,
  "sort" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "ref_education_profile_authority_ck" CHECK ("authority" IN ('kemendikdasmen', 'kemenag')),
  CONSTRAINT "ref_education_profile_teacher_model_ck" CHECK ("teacher_model" IN ('subject', 'class'))
);
--> statement-breakpoint
REVOKE ALL ON ref_education_profile FROM edusync_app;
--> statement-breakpoint
GRANT SELECT ON ref_education_profile TO edusync_app;
--> statement-breakpoint
INSERT INTO ref_education_profile (key, name, level_group, authority, teacher_model, vocational, levels, sort) VALUES
  ('sd', 'SD', 'sd', 'kemendikdasmen', 'class', false,
    '[{"code":"1","label":"Kelas 1","phase":"A"},{"code":"2","label":"Kelas 2","phase":"A"},{"code":"3","label":"Kelas 3","phase":"B"},{"code":"4","label":"Kelas 4","phase":"B"},{"code":"5","label":"Kelas 5","phase":"C"},{"code":"6","label":"Kelas 6","phase":"C"}]', 1),
  ('mi', 'MI (Madrasah Ibtidaiyah)', 'sd', 'kemenag', 'class', false,
    '[{"code":"1","label":"Kelas 1","phase":"A"},{"code":"2","label":"Kelas 2","phase":"A"},{"code":"3","label":"Kelas 3","phase":"B"},{"code":"4","label":"Kelas 4","phase":"B"},{"code":"5","label":"Kelas 5","phase":"C"},{"code":"6","label":"Kelas 6","phase":"C"}]', 2),
  ('smp', 'SMP', 'smp', 'kemendikdasmen', 'subject', false,
    '[{"code":"7","label":"Kelas 7","phase":"D"},{"code":"8","label":"Kelas 8","phase":"D"},{"code":"9","label":"Kelas 9","phase":"D"}]', 3),
  ('mts', 'MTs (Madrasah Tsanawiyah)', 'smp', 'kemenag', 'subject', false,
    '[{"code":"7","label":"Kelas 7","phase":"D"},{"code":"8","label":"Kelas 8","phase":"D"},{"code":"9","label":"Kelas 9","phase":"D"}]', 4),
  ('sma', 'SMA', 'sma', 'kemendikdasmen', 'subject', false,
    '[{"code":"X","label":"Kelas X","phase":"E"},{"code":"XI","label":"Kelas XI","phase":"F"},{"code":"XII","label":"Kelas XII","phase":"F"}]', 5),
  ('ma', 'MA (Madrasah Aliyah)', 'sma', 'kemenag', 'subject', false,
    '[{"code":"X","label":"Kelas X","phase":"E"},{"code":"XI","label":"Kelas XI","phase":"F"},{"code":"XII","label":"Kelas XII","phase":"F"}]', 6),
  ('smk', 'SMK', 'smk', 'kemendikdasmen', 'subject', true,
    '[{"code":"X","label":"Kelas X","phase":"E"},{"code":"XI","label":"Kelas XI","phase":"F"},{"code":"XII","label":"Kelas XII","phase":"F"}]', 7),
  ('mak', 'MAK (Madrasah Aliyah Kejuruan)', 'smk', 'kemenag', 'subject', true,
    '[{"code":"X","label":"Kelas X","phase":"E"},{"code":"XI","label":"Kelas XI","phase":"F"},{"code":"XII","label":"Kelas XII","phase":"F"}]', 8);
--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "education_profile" text REFERENCES "ref_education_profile"("key");
--> statement-breakpoint
UPDATE "school" s SET "education_profile" = g.level_group
FROM (
  SELECT school_id, min(level_group) AS level_group
  FROM school_curriculum
  GROUP BY school_id
  HAVING count(DISTINCT level_group) = 1
) g
WHERE g.school_id = s.id AND g.level_group IN ('sd', 'smp', 'sma', 'smk');
