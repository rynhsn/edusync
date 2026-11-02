import { type Db, loadPlatformMessaging } from '@edusync/db';
import { AccountSync } from './account-sync';
import { Dispatcher } from './dispatcher';
import { startRuntimeStatus } from './runtime-status';
import { MessagingSchedulers } from './schedulers';
import { LogSender, type MessageSender } from './sender';
import { startSessionPrune } from './session-prune';
import { WhatsAppManager } from './whatsapp';

export interface MessagingEnv {
  MESSAGING_PROVIDER: 'log' | 'whatsapp';
  WA_CHROME_PATH?: string | undefined;
  WA_SESSION_DIR: string;
  /** Batas klien WhatsApp (Chrome) yang berjalan bersamaan di server ini. */
  WA_MAX_CLIENTS?: number | undefined;
}

/** Jalankan sinkronisasi akun, pengirim antrean, dan penjadwal pesan. Mengembalikan fungsi penutup. */
export function startMessaging(db: Db, env: MessagingEnv) {
  const getPlatform = () => loadPlatformMessaging(db);
  const manager =
    env.MESSAGING_PROVIDER === 'whatsapp'
      ? new WhatsAppManager(db, {
          sessionDir: env.WA_SESSION_DIR,
          chromePath: env.WA_CHROME_PATH,
          maxClients: env.WA_MAX_CLIENTS,
        })
      : undefined;
  const sender: MessageSender = manager ?? new LogSender();

  const sync = new AccountSync(db, { mode: env.MESSAGING_PROVIDER, manager, getPlatform });
  const dispatcher = new Dispatcher(db, sender, { getPlatform });
  const schedulers = new MessagingSchedulers(db, { getPlatform });
  // Status Chrome untuk konsol platform (jalur Chrome tetap dari env).
  const runtime = startRuntimeStatus(
    db,
    { chromePath: env.WA_CHROME_PATH, provider: env.MESSAGING_PROVIDER },
    {},
  );
  // Sekolah yang dihapus (mis. sekolah uji) meninggalkan profil Chrome puluhan MB; buang berkala.
  const prune = manager ? startSessionPrune(db, env.WA_SESSION_DIR) : undefined;
  sync.start();
  dispatcher.start();
  schedulers.start();

  return {
    stop: async () => {
      await Promise.all([sync.stop(), dispatcher.stop(), schedulers.stop(), runtime.stop(), prune?.stop()]);
      await manager?.shutdown();
    },
  };
}
