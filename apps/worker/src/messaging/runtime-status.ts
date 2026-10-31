import { existsSync, statSync } from 'node:fs';
import { type Db, MESSAGING_RUNTIME_KEY, platformSetting, sql } from '@edusync/db';
import { type Loop, startLoop } from './loop';

export type ChromeStatus = 'detected' | 'not_configured' | 'not_found';

/** Periksa jalur Chrome dari env (jalur tetap di env, tidak dipindah ke database). */
export function checkChrome(
  chromePath: string | undefined,
  fileExists: (p: string) => boolean = (p) => existsSync(p) && statSync(p).isFile(),
): ChromeStatus {
  if (!chromePath?.trim()) return 'not_configured';
  return fileExists(chromePath.trim()) ? 'detected' : 'not_found';
}

/** Tulis status runtime ke platform_setting supaya konsol staf bisa menampilkannya. */
export async function writeRuntimeStatus(
  db: Db,
  input: { chromePath: string | undefined; provider: 'log' | 'whatsapp' },
  now = new Date(),
) {
  const value = {
    chrome: { status: checkChrome(input.chromePath), path: input.chromePath?.trim() || null },
    provider: input.provider,
    checkedAt: now.toISOString(),
  };
  await db
    .insert(platformSetting)
    .values({ key: MESSAGING_RUNTIME_KEY, value, updatedBy: 'worker' })
    .onConflictDoUpdate({
      target: platformSetting.key,
      set: { value, updatedBy: 'worker', updatedAt: sql`now()` },
    });
}

/** Tulis saat start lalu tiap beberapa menit (Chrome bisa dipasang atau dihapus saat worker berjalan). */
export function startRuntimeStatus(
  db: Db,
  input: { chromePath: string | undefined; provider: 'log' | 'whatsapp' },
  options: { intervalMs?: number; log?: Pick<Console, 'log' | 'error'> } = {},
): Loop {
  return startLoop(
    'status-runtime',
    options.intervalMs ?? 300_000,
    async () => void (await writeRuntimeStatus(db, input)),
    options.log,
  );
}
