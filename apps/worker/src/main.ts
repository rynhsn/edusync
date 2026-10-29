import { loadEnv } from './env';
import { startWorker } from './worker';

const worker = await startWorker(loadEnv());
console.log('[worker] siap menerima pekerjaan');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await worker.stop();
    process.exit(0);
  });
}
