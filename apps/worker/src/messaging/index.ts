import { type Db, loadPlatformMessaging } from '@edusync/db';
import { AccountSync } from './account-sync';
import { Dispatcher } from './dispatcher';
import { MessagingSchedulers } from './schedulers';
import { LogSender, type MessageSender } from './sender';
import { WhatsAppManager } from './whatsapp';

export interface MessagingEnv {
  MESSAGING_PROVIDER: 'log' | 'whatsapp';
  WA_CHROME_PATH?: string | undefined;
  WA_SESSION_DIR: string;
}

/** Jalankan sinkronisasi akun, pengirim antrean, dan penjadwal pesan. Mengembalikan fungsi penutup. */
export function startMessaging(db: Db, env: MessagingEnv) {
  const getPlatform = () => loadPlatformMessaging(db);
  const manager =
    env.MESSAGING_PROVIDER === 'whatsapp'
      ? new WhatsAppManager(db, { sessionDir: env.WA_SESSION_DIR, chromePath: env.WA_CHROME_PATH })
      : undefined;
  const sender: MessageSender = manager ?? new LogSender();

  const sync = new AccountSync(db, { mode: env.MESSAGING_PROVIDER, manager, getPlatform });
  const dispatcher = new Dispatcher(db, sender, { getPlatform });
  const schedulers = new MessagingSchedulers(db, { getPlatform });
  sync.start();
  dispatcher.start();
  schedulers.start();

  return {
    stop: async () => {
      await Promise.all([sync.stop(), dispatcher.stop(), schedulers.stop()]);
      await manager?.shutdown();
    },
  };
}
