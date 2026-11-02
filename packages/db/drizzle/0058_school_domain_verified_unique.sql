-- Hostname tidak lagi unik global: sekolah lain tidak boleh mengunci domain milik orang lain hanya dengan
-- mendaftarkannya lebih dulu. Yang unik global hanya domain terverifikasi; satu sekolah tetap tak boleh dobel.
ALTER TABLE "school_domain" DROP CONSTRAINT "school_domain_hostname_uq";
--> statement-breakpoint
ALTER TABLE "school_domain" ADD CONSTRAINT "school_domain_school_hostname_uq" UNIQUE ("school_id", "hostname");
--> statement-breakpoint
CREATE UNIQUE INDEX "school_domain_verified_hostname_uq" ON "school_domain" ("hostname") WHERE "status" = 'verified';
