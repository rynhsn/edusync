/** Loop berkala tanpa tumpang tindih: putaran berikutnya baru jalan setelah putaran sebelumnya selesai. */
export interface Loop {
  /** Jalankan satu putaran sekarang (tidak melakukan apa-apa bila putaran sedang berjalan). */
  runNow(): Promise<void>;
  /** Hentikan penjadwalan dan tunggu putaran yang sedang berjalan. */
  stop(): Promise<void>;
}

export function startLoop(
  name: string,
  intervalMs: number,
  tick: () => Promise<void>,
  log: Pick<Console, 'error'> = console,
): Loop {
  let stopped = false;
  let running: Promise<void> | null = null;
  let timer: NodeJS.Timeout | undefined;

  const runNow = async () => {
    if (running || stopped) return;
    running = (async () => {
      try {
        await tick();
      } catch (error) {
        log.error(`[pesan] ${name} gagal`, error);
      }
    })();
    try {
      await running;
    } finally {
      running = null;
    }
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await runNow();
      schedule();
    }, intervalMs);
  };
  void runNow().then(schedule);

  return {
    runNow,
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (running) await running;
    },
  };
}
