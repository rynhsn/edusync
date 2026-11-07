-- Foto siswa untuk kartu cetak: berkas ada di school_file (kind student_photo), kolom ini hanya penunjuknya.
ALTER TABLE "student" ADD COLUMN "photo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_photo_file_id_school_file_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."school_file"("id") ON DELETE set null ON UPDATE no action;
