import {
  createRenewalInvoices,
  PaymentProviderResolver,
  runAutoBilling,
  SmtpResolver,
  sweepSubscriptions,
} from '@edusync/billing';
import { createDb, loadPlatformMessaging } from '@edusync/db';
import { QUEUES, relayOutbox, setupJobs } from '@edusync/jobs';
import { PgBoss } from 'pg-boss';
import type { Env } from './env';
import { emailSendHandler, whatsappOtpHandler } from './handlers';
import { createMailer, smtpBase } from './mailer';
import { startMessaging } from './messaging';

export async function startWorker(env: Env) {
  await setupJobs(env.DATABASE_JOBS_URL);
  const boss = new PgBoss({ connectionString: env.DATABASE_JOBS_URL });
  boss.on('error', (error) => console.error('[worker] error', error));
  await boss.start();

  // Peran platform melewati RLS supaya outbox semua sekolah terlihat.
  const platform = createDb(env.DATABASE_PLATFORM_URL);

  // SMTP mengikuti pengaturan di konsol platform (menimpa variabel lingkungan) tanpa restart.
  const mailer = createMailer(new SmtpResolver(platform.db, env.AUTH_SECRET, smtpBase(env)));
  await boss.work(QUEUES.emailSend, { batchSize: 1, pollingIntervalSeconds: 1 }, emailSendHandler(mailer));
  // Kode WhatsApp mengikuti penyedia pesan di konsol platform (env menimpa), dibaca tiap pesan.
  await boss.work(
    QUEUES.whatsappOtp,
    { batchSize: 1, pollingIntervalSeconds: 1 },
    whatsappOtpHandler(
      async () => env.MESSAGING_PROVIDER ?? (await loadPlatformMessaging(platform.db)).provider,
    ),
  );

  // Penagihan otomatis tagihan sekolah: cron harian 01:15 WIB, ditambah satu sapuan saat worker menyala (catch-up
  // bila worker sempat mati). Idempoten: periode yang sudah ditagih dilewati, periode lampau tidak pernah diisi mundur.
  const runSchoolAutoBilling = async () => {
    const result = await runAutoBilling(platform.db, { webUrl: env.WEB_URL, log: console });
    if (result.ran.length > 0 || result.errors.length > 0) {
      console.log(
        `[worker] penagihan otomatis: ${result.rules} aturan, ${result.ran.length} run, ${result.errors.length} galat`,
      );
    }
  };
  await boss.work(
    QUEUES.financeAutoBilling,
    { batchSize: 1, pollingIntervalSeconds: 30 },
    runSchoolAutoBilling,
  );
  await boss.schedule(QUEUES.financeAutoBilling, '15 1 * * *', {}, { tz: 'Asia/Jakarta' });
  void runSchoolAutoBilling().catch((error) => console.error('[worker] penagihan otomatis gagal', error));

  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await relayOutbox(platform.db, boss);
    } catch (error) {
      console.error('[worker] relay gagal', error);
    } finally {
      busy = false;
    }
  }, env.RELAY_INTERVAL_MS);

  // Siklus penagihan: invoice perpanjangan dan perubahan status langganan. Idempoten, aman diulang.
  // Penyedia pembayaran mengikuti pengaturan di konsol platform (menimpa variabel lingkungan) tanpa restart.
  const payments = new PaymentProviderResolver(platform.db, env.AUTH_SECRET, {
    provider: env.PAYMENT_PROVIDER,
    webUrl: env.WEB_URL,
    devSecret: env.PAYMENT_DEV_SECRET,
    midtransServerKey: env.MIDTRANS_SERVER_KEY,
    midtransSnapUrl: env.MIDTRANS_SNAP_URL,
  });
  let billingBusy = false;
  const runBillingCycle = async () => {
    if (billingBusy) return;
    billingBusy = true;
    try {
      await createRenewalInvoices(platform.db, await payments.get());
      await sweepSubscriptions(platform.db, new Date(), { webUrl: env.WEB_URL });
    } catch (error) {
      console.error('[worker] siklus penagihan gagal', error);
    } finally {
      billingBusy = false;
    }
  };
  const billingTimer = setInterval(runBillingCycle, env.BILLING_CYCLE_MS);
  void runBillingCycle();

  // Pesan WhatsApp ke wali murid: sinkronisasi akun, pengirim antrean, dan penjadwal.
  const messaging = startMessaging(platform.db, env);

  return {
    boss,
    stop: async () => {
      await messaging.stop();
      clearInterval(timer);
      clearInterval(billingTimer);
      while (billingBusy) await new Promise((r) => setTimeout(r, 50));
      while (busy) await new Promise((r) => setTimeout(r, 50));
      await boss.stop({ graceful: true, timeout: 10_000 });
      await platform.pool.end();
      mailer.close();
    },
  };
}
