import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { type Db, school } from '@edusync/db';
import { type Loop, startLoop } from './loop';

const SESSION_DIR = /^session-([0-9a-f-]{36})$/;

/**
 * Hapus folder sesi WhatsApp yang sekolahnya sudah tidak ada atau yang tidak sedang dipakai klien.
 * Fungsi murni terhadap sistem berkas: daftar sekolah dan klien aktif disuntik, supaya bisa diuji tanpa database.
 * Mengembalikan id sekolah yang folder sesinya dihapus.
 */
export async function pruneSessionDirs(
  dir: string,
  existingSchoolIds: ReadonlySet<string>,
  activeSchoolIds: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const removed: string[] = [];
  for (const e of entries) {
    const id = e.isDirectory() ? SESSION_DIR.exec(e.name)?.[1] : undefined;
    if (!id || existingSchoolIds.has(id) || activeSchoolIds.has(id)) continue;
    // Folder yang masih terkunci Chrome dilewati; dicoba lagi pada putaran berikutnya.
    const ok = await rm(join(dir, e.name), { recursive: true, force: true }).then(
      () => true,
      () => false,
    );
    if (ok) removed.push(id);
  }
  return removed;
}

const SIX_HOURS = 6 * 3_600_000;

/** Bersihkan sesi yatim saat worker menyala lalu tiap beberapa jam (sekolah uji dan sekolah yang dihapus). */
export function startSessionPrune(
  db: Db,
  dir: string,
  log: Pick<Console, 'log' | 'error'> = console,
  intervalMs = SIX_HOURS,
): Loop {
  return startLoop(
    'pembersihan sesi',
    intervalMs,
    async () => {
      const existing = new Set((await db.select({ id: school.id }).from(school)).map((r) => r.id));
      const removed = await pruneSessionDirs(dir, existing);
      if (removed.length > 0) log.log(`[wa] ${removed.length} folder sesi yatim dihapus`);
    },
    log,
  );
}
