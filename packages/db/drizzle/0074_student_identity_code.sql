-- Kode identitas siswa: satu kode per siswa yang dicetak sebagai QR di kartu (ES1.<kode>) dan dipakai oleh fitur
-- mana pun (absensi, perpustakaan nanti). Tidak terikat modul. Kode hanya mengidentifikasi siswa; menu pemindai
-- yang menentukan tindakan, dan pemindai tetap butuh login + izin fiturnya.
CREATE TABLE "student_identity_code" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "student_identity_code_code_uq" UNIQUE("school_id","code"),
	CONSTRAINT "student_identity_code_student_uq" UNIQUE("student_id")
);
--> statement-breakpoint
ALTER TABLE "student_identity_code" ADD CONSTRAINT "student_identity_code_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_identity_code" ADD CONSTRAINT "student_identity_code_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE student_identity_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_identity_code FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON student_identity_code
  USING (school_id = ANY (app_school_ids()))
  WITH CHECK (school_id = ANY (app_school_ids()));
--> statement-breakpoint

-- Salin kode QR yang sudah tercetak (nilai persis sama agar kartu lama tetap berlaku), lalu hapus dari attendance_card
-- supaya tabel itu kembali hanya berisi kartu RFID. Bila ada lebih dari satu baris QR per siswa (tidak mungkin karena
-- indeks unik lama), yang terbaru dipakai.
INSERT INTO "student_identity_code" ("school_id", "student_id", "code", "created_at")
SELECT DISTINCT ON ("student_id") "school_id", "student_id", "code", "created_at"
FROM "attendance_card"
WHERE "kind" = 'qr'
ORDER BY "student_id", "created_at" DESC, "id" DESC;
--> statement-breakpoint
DELETE FROM "attendance_card" WHERE "kind" = 'qr';
--> statement-breakpoint
DROP INDEX IF EXISTS "attendance_card_qr_student_uq";
