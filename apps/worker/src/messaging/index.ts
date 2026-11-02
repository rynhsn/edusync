import { type Db, defaultMessagingProvider, loadPlatformMessaging } from '@edusync/db';
import { AccountSync } from './account-sync';
import { Dispatcher } from './dispatcher';
import { startRuntimeStatus } from './runtime-status';
import { MessagingSchedulers } from './schedulers';
import { LogSender, type MessageSender } from './sender';
import { startSessionPrune } from './session-prune';
import { WhatsAppManager } from './whatsapp';

export interface MessagingEnv {
  /** Kosong = ikut pilihan penyedia di konsol platform. */
  MESSAGING_PROVIDER?: 'log' | 'whatsapp' | undefined;
  WA_CHROME_PATH?: string | undefined;
  WA_SESSION_DIR: string;
  /** Batas klien WhatsApp (Chrome) yang berjalan bersamaan di server ini. */
  WA_MAX_CLIENTS?: number | undefined;
}

/** Jalankan sinkronisasi akun, pengirim antrean, dan penjadwal pesan. Mengembalikan fungsi penutup. */
export function startMessaging(db: Db, env: MessagingEnv) {
  // Env mengunci penyedia bila diisi; kalau kosong, ikut pilihan di konsol platform (dibaca ulang tiap putaran).
  let provider: 'log' | 'whatsapp' = env.MESSAGING_PROVIDER ?? defaultMessagingProvider();
  const getPlatform = async () => {
    const platform = await loadPlatformMessaging(db);
    provider = env.MESSAGING_PROVIDER ?? platform.provider;
    return platform;
  };
  const manager = new WhatsAppManager(db, {
    sessionDir: env.WA_SESSION_DIR,
    chromePath: env.WA_CHROME_PATH,
    maxClients: env.WA_MAX_CLIENTS,
  });
  const log = new LogSender();
  const sender: MessageSender = {
    send: (schoolId, phone, text) =>
      provider === 'whatsapp' ? manager.send(schoolId, phone, text) : log.send(schoolId, phone, text),
  };

  const sync = new AccountSync(db, { mode: env.MESSAGING_PROVIDER, manager, getPlatform });
  const dispatcher = new Dispatcher(db, sender, { getPlatform });
  const schedulers = new MessagingSchedulers(db, { getPlatform });
  // Status Chrome untuk konsol platform (jalur Chrome tetap dari env).
  const runtime = startRuntimeStatus(
    db,
    { chromePath: env.WA_CHROME_PATH, provider: env.MESSAGING_PROVIDER ?? defaultMessagingProvider() },
    {},
  );
  // Sekolah yang dihapus (mis. sekolah uji) meninggalkan profil Chrome puluhan MB; buang berkala.
  const prune = startSessionPrune(db, env.WA_SESSION_DIR);
  sync.start();
  dispatcher.start();
  schedulers.start();

  return {
    stop: async () => {
      await Promise.all([sync.stop(), dispatcher.stop(), schedulers.stop(), runtime.stop(), prune.stop()]);
      await manager.shutdown();
    },
  };
}
