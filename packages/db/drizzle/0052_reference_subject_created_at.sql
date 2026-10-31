-- Mapel acuan yang sudah ada dianggap lama (bukan "baru" bagi sekolah yang mengadopsinya).
ALTER TABLE "ref_subject" ADD COLUMN "created_at" timestamp with time zone DEFAULT '2000-01-01T00:00:00Z' NOT NULL;--> statement-breakpoint
ALTER TABLE "ref_subject" ALTER COLUMN "created_at" SET DEFAULT now();
