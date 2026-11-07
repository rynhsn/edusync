-- Nama pengguna untuk masuk (selain email dan NIK) dan kode pemulihan kata sandi per saluran (email/WhatsApp).
-- Nama pengguna disimpan huruf kecil; unik; tidak boleh berupa email (tanpa @) atau 16 digit (itu NIK).
ALTER TABLE "user" ADD COLUMN "username" text;
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_uq" UNIQUE ("username");
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_ck" CHECK ("username" IS NULL OR ("username" ~ '^[a-z0-9._-]{3,30}$' AND "username" !~ '^[0-9]{16}$'));
--> statement-breakpoint
-- Satu kode aktif per pengguna dan saluran. Kode disimpan sebagai HMAC, bukan teks asli.
CREATE TABLE "password_reset_otp" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_otp_user_channel_uq" UNIQUE("user_id","channel"),
	CONSTRAINT "password_reset_otp_channel_ck" CHECK ("channel" IN ('email', 'whatsapp'))
);
--> statement-breakpoint
ALTER TABLE "password_reset_otp" ADD CONSTRAINT "password_reset_otp_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Hanya peran platform (alur pemulihan di API); peran aplikasi tidak boleh menyentuhnya.
REVOKE ALL ON password_reset_otp FROM edusync_app;
