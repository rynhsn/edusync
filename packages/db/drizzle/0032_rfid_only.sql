DELETE FROM "attendance_card" WHERE "kind" = 'qr';
--> statement-breakpoint
ALTER TABLE "attendance_policy" DROP COLUMN "methods";