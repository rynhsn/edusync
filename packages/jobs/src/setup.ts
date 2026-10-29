import { PgBoss } from 'pg-boss';
import { QUEUES, queueOptions } from './queues';

/**
 * Pasang skema pg-boss dan buat antrean. Dijalankan dengan pemilik skema atau peran khusus worker,
 * tidak pernah dengan peran aplikasi. Aman dipanggil berulang.
 */
export async function setupJobs(connectionString: string) {
  const boss = new PgBoss({ connectionString, supervise: false, schedule: false });
  boss.on('error', (error) => console.error('[jobs] error', error));
  await boss.start();
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name, queueOptions[name]);
  }
  await boss.stop({ graceful: false, close: true });
}
