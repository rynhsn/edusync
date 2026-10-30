/** Hasil satu percobaan kirim. `retryable` menentukan apakah dispatcher boleh mencoba lagi. */
export type SendResult = { ok: true } | { ok: false; retryable: boolean; error: string };

export interface MessageSender {
  send(schoolId: string, phone: string, text: string): Promise<SendResult>;
}

/** Tidak mengirim apa pun; hanya mencatat. Untuk pengembangan lokal dan tes. */
export class LogSender implements MessageSender {
  constructor(private readonly log: Pick<Console, 'log'> = console) {}

  async send(schoolId: string, phone: string, text: string): Promise<SendResult> {
    this.log.log(`[pesan:log] sekolah=${schoolId} ke=${phone} isi=${JSON.stringify(text)}`);
    return { ok: true };
  }
}

export interface RecordedSend {
  schoolId: string;
  phone: string;
  text: string;
}

/** Pengirim palsu untuk tes: merekam panggilan dan bisa diprogram gagal. */
export class FakeSender implements MessageSender {
  readonly calls: RecordedSend[] = [];
  /** Hasil berikutnya (diambil satu per panggilan); kosong = pakai `fallback`. */
  private queue: SendResult[] = [];
  /** Hasil bawaan setelah antrean habis. */
  fallback: SendResult = { ok: true };
  /** Jeda buatan agar tes konkurensi bisa membuat dua pengirim bertumpuk. */
  delayMs = 0;

  program(...results: SendResult[]) {
    this.queue.push(...results);
    return this;
  }

  async send(schoolId: string, phone: string, text: string): Promise<SendResult> {
    this.calls.push({ schoolId, phone, text });
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    return this.queue.shift() ?? this.fallback;
  }
}
