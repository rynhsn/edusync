-- Data diri siswa yang lebih lengkap. Semua opsional; siswa lama tetap sah tanpa isian ini.
-- phone disimpan dalam digit berawalan 62 (sama dengan nomor wali); email disiapkan untuk login siswa/orang tua nanti.
ALTER TABLE "student" ADD COLUMN "birth_place" text;
--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "nik" text;
--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "religion" text;
--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "address" text;
--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "phone" text;
--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "email" text;
