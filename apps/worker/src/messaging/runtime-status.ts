import { type Db, MESSAGING_RUNTIME_KEY, platformSetting, sql } from '@edusync/db';
import { type Loop, startLoop } from './loop';

/** Tulis status runtime ke platform_setting supaya konsol staf bisa menampilkan bahwa worker hidup (tanpa Chrome sejak Baileys). */
export async function writeRuntimeStatus(db: Db, input: { provider: 'log' | 'whatsapp' }, now = new Date()) {
  const value = { provider: input.provider, checkedAt: now.toISOString() };
  await db
    .insert(platformSetting)
    .values({ key: MESSAGING_RUNTIME_KEY, value, updatedBy: 'worker' })
    .onConflictDoUpdate({
      target: platformSetting.key,
      set: { value, updatedBy: 'worker', updatedAt: sql`now()` },
    });
}

/** Tulis saat start lalu tiap beberapa menit. */
export function startRuntimeStatus(
  db: Db,
  input: { provider: 'log' | 'whatsapp' },
  options: { intervalMs?: number; log?: Pick<Console, 'log' | 'error'> } = {},
): Loop {
  return startLoop(
    'status-runtime',
    options.intervalMs ?? 300_000,
    async () => void (await writeRuntimeStatus(db, input)),
    options.log,
  );
}
