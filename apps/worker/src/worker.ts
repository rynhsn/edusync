import { createRenewalInvoices, PaymentProviderResolver, sweepSubscriptions } from '@edusync/billing';
import { createDb } from '@edusync/db';
import { QUEUES, relayOutbox, setupJobs } from '@edusync/jobs';
import { PgBoss } from 'pg-boss';
import type { Env } from './env';
import { emailSendHandler } from './handlers';
import { createMailer } from './mailer';

export async function startWorker(env: Env) {
  await setupJobs(env.DATABASE_JOBS_URL);
  const boss = new PgBoss({ connectionString: env.DATABASE_JOBS_URL });
  boss.on('error', (error) => console.error('[worker] error', error));
  await boss.start();

  const mailer = createMailer(env);
  await boss.work(
    QUEUES.emailSend,
    { batchSize: 1, pollingIntervalSeconds: 1 },
    emailSendHandler(mailer, env.EMAIL_FROM),
  );

  // Peran platform melewati RLS supaya outbox semua sekolah terlihat.
  const platform = createDb(env.DATABASE_PLATFORM_URL);
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
      await sweepSubscriptions(platform.db);
    } catch (error) {
      console.error('[worker] siklus penagihan gagal', error);
    } finally {
      billingBusy = false;
    }
  };
  const billingTimer = setInterval(runBillingCycle, env.BILLING_CYCLE_MS);
  void runBillingCycle();

  return {
    boss,
    stop: async () => {
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
