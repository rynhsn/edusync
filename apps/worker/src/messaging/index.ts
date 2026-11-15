import { type Db, defaultMessagingProvider, loadPlatformMessaging } from '@edusync/db';
import { AccountSync } from './account-sync';
import { Dispatcher } from './dispatcher';
import { startRuntimeStatus } from './runtime-status';
import { MessagingSchedulers } from './schedulers';
import { LogSender, type MessageSender } from './sender';
import { WhatsAppManager } from './whatsapp';

export interface MessagingEnv {
  /** Kosong = ikut pilihan penyedia di konsol platform. */
  MESSAGING_PROVIDER?: 'log' | 'whatsapp' | undefined;
  /** Kunci enkripsi kredensial sesi WhatsApp di database (sama dengan AUTH_SECRET API). */
  AUTH_SECRET: string;
  /** Batas klien WhatsApp (Baileys) yang berjalan bersamaan di server ini. */
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
    authSecret: env.AUTH_SECRET,
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
  // Status worker untuk konsol platform.
  const runtime = startRuntimeStatus(
    db,
    { provider: env.MESSAGING_PROVIDER ?? defaultMessagingProvider() },
    {},
  );
  sync.start();
  dispatcher.start();
  schedulers.start();

  return {
    stop: async () => {
      await Promise.all([sync.stop(), dispatcher.stop(), schedulers.stop(), runtime.stop()]);
      await manager.shutdown();
    },
  };
}
