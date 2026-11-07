import { and, eq, foundation, foundationOwner, invoice, isNull, sql, type Tx, user } from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';

const DAY = 86_400_000;

export type LifecycleNotice = 'past_due' | 'suspended' | 'reactivated';

const fmtDate = (d: Date) =>
  d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

/** Tautan portal pemilik di host utama; halaman tagihan adalah tempat membayar. */
export const ownerBillingUrl = (webUrl: string) => `${webUrl.replace(/\/$/, '')}/account/billing`;

/**
 * Antre email pemberitahuan siklus langganan ke semua pemilik yayasan. Dipanggil dalam transaksi yang sama
 * dengan perubahan statusnya, jadi tiap peralihan status mengirim tepat satu putaran email (perubahan status
 * hanya terjadi sekali; putaran penyapu berikutnya tidak menemukan baris yang sama lagi).
 */
export async function queueLifecycleNotice(
  tx: Tx,
  kind: LifecycleNotice,
  input: { foundationId: string; periodEnd: Date; graceDays: number; webUrl: string },
) {
  const owners = await tx
    .select({ name: user.name, email: user.email })
    .from(foundationOwner)
    .innerJoin(user, eq(user.id, foundationOwner.userId))
    .where(eq(foundationOwner.foundationId, input.foundationId));
  if (owners.length === 0) return 0;

  const [found] = await tx
    .select({ name: foundation.name })
    .from(foundation)
    .where(eq(foundation.id, input.foundationId));
  const foundationName = found?.name ?? 'lembaga Anda';

  // Tagihan perpanjangan yang masih terbuka (bukan pendaftaran dan bukan pesanan perubahan paket).
  const [open] = await tx
    .select({ amount: invoice.amount })
    .from(invoice)
    .where(
      and(
        eq(invoice.foundationId, input.foundationId),
        isNull(invoice.registrationId),
        eq(invoice.status, 'open'),
        sql`not exists (select 1 from change_order c where c.invoice_id = ${invoice.id})`,
      ),
    );
  const amountLine = open ? `Jumlah tagihan: ${rupiah(open.amount)}.\n` : '';
  const link = ownerBillingUrl(input.webUrl);
  const graceEnd = new Date(input.periodEnd.getTime() + input.graceDays * DAY);

  const subject =
    kind === 'past_due'
      ? 'Langganan Edusync jatuh tempo'
      : kind === 'suspended'
        ? 'Sekolah ditangguhkan: langganan Edusync belum diperpanjang'
        : 'Langganan Edusync aktif kembali';

  const body = (name: string) => {
    if (kind === 'past_due') {
      return (
        `Halo ${name},\n\n` +
        `Langganan Edusync untuk ${foundationName} jatuh tempo pada ${fmtDate(input.periodEnd)}.\n` +
        amountLine +
        `Masa tenggang sampai ${fmtDate(graceEnd)}; sekolah tetap bisa dipakai selama masa tenggang. ` +
        `Setelah itu akses sekolah dihentikan sementara sampai tagihan dibayar.\n\n` +
        `Bayar di portal pemilik lembaga: ${link}`
      );
    }
    if (kind === 'suspended') {
      return (
        `Halo ${name},\n\n` +
        `Masa tenggang langganan ${foundationName} sudah berakhir (${fmtDate(graceEnd)}), ` +
        `sehingga akses semua sekolah di lembaga ini ditangguhkan.\n` +
        amountLine +
        `Akses dibuka kembali otomatis begitu tagihan dibayar. Data sekolah tetap aman.\n\n` +
        `Bayar di portal pemilik lembaga: ${link}`
      );
    }
    return (
      `Halo ${name},\n\n` +
      `Pembayaran diterima. Langganan ${foundationName} aktif kembali sampai ${fmtDate(input.periodEnd)} ` +
      `dan akses sekolah yang sempat ditangguhkan karena tagihan sudah dibuka.\n\n` +
      `Rincian langganan: ${link}`
    );
  };

  for (const o of owners) {
    await enqueue(tx, QUEUES.emailSend, { to: o.email, subject, text: body(o.name) });
  }
  return owners.length;
}
