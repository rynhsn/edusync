-- Satu anggota hanya boleh menjadi satu guru (NULL boleh banyak). Bila ada data lama yang ganda, migrasi gagal
-- dan perlu dibereskan dulu; ini sengaja agar tidak ada tautan yang diam-diam dibuang.
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_member_uq" UNIQUE ("member_id");
--> statement-breakpoint
-- Undangan boleh membawa guru yang akan ditautkan ke akun penerima saat undangan diterima.
ALTER TABLE "invitation" ADD COLUMN "teacher_id" uuid;
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE set null ON UPDATE no action;
