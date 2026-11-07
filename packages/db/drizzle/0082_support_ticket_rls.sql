-- support_ticket punya kolom school_id tetapi dibaca hanya lewat peran platform (peran aplikasi tidak punya akses,
-- lihat 0080). Aturan repo: setiap tabel ber-school_id mengaktifkan dan memaksa RLS. Tanpa kebijakan, peran yang tidak
-- mem-bypass RLS selalu melihat nol baris; peran platform tetap membaca dan menulis karena BYPASSRLS.
ALTER TABLE support_ticket ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE support_ticket FORCE ROW LEVEL SECURITY;
