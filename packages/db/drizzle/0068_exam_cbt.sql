-- CBT: acak soal/opsi per ujian; waktu mulai, batas, dan kumpul per percobaan siswa.
ALTER TABLE "exam" ADD COLUMN "shuffle_questions" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "shuffle_options" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "exam_attempt" ADD COLUMN "started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "exam_attempt" ADD COLUMN "deadline_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "exam_attempt" ADD COLUMN "submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "exam_attempt" ADD COLUMN "blur_count" integer DEFAULT 0 NOT NULL;
