-- Satu perangkat kiosk boleh melayani beberapa unit dalam satu lembaga. Baris di sini adalah unit TAMBAHAN;
-- sekolah asal tetap di attendance_device.school_id, jadi perangkat yang sudah ada tidak berubah perilakunya.
CREATE TABLE "attendance_device_school" (
	"device_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_device_school_device_id_school_id_pk" PRIMARY KEY("device_id","school_id")
);
--> statement-breakpoint
ALTER TABLE "attendance_device_school" ADD CONSTRAINT "attendance_device_school_device_id_attendance_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_device"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_device_school" ADD CONSTRAINT "attendance_device_school_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "attendance_device_school_idx" ON "attendance_device_school" USING btree ("school_id");
--> statement-breakpoint
-- Kelayakan mengikuti perangkat (yang sendirinya ber-RLS menurut sekolah asal): sekolah lain di daftar ini
-- tidak bisa melihat atau mengubah baris, sehingga hanya sekolah asal yang mengatur jangkauan perangkat.
ALTER TABLE attendance_device_school ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attendance_device_school FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON attendance_device_school
  USING (EXISTS (SELECT 1 FROM attendance_device d WHERE d.id = device_id))
  WITH CHECK (EXISTS (SELECT 1 FROM attendance_device d WHERE d.id = device_id));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_device_school TO edusync_app;
