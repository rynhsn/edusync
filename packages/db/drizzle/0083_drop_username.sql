-- Login hanya dengan email atau NIK: nama pengguna dicabut. Menghapus kolom dan constraint dari 0078.
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_username_ck";
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_username_uq";
--> statement-breakpoint
DROP INDEX IF EXISTS "user_username_uq";
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "username";
