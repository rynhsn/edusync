import { createDb, eq, outbox, sql } from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from './env';
import { startWorker } from './worker';

const mailpit = 'http://localhost:8025/api/v1';
const platform = createDb(process.env.DATABASE_PLATFORM_URL as string);
const run = Math.random().toString(36).slice(2, 8);
let worker: Awaited<ReturnType<typeof startWorker>>;

async function inbox(subject: string) {
  const res = await fetch(`${mailpit}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
  return ((await res.json()) as { messages: { ID: string; Subject: string }[] }).messages;
}

async function removeFromInbox(ids: string[]) {
  await fetch(`${mailpit}/messages`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ IDs: ids }),
  });
}

async function waitFor<T>(fn: () => Promise<T | undefined | false>, ms = 20_000): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Waktu tunggu habis');
}

beforeAll(async () => {
  const up = await fetch(`${mailpit}/info`).catch(() => null);
  if (!up?.ok) throw new Error('Mailpit tidak berjalan di localhost:8025 (docker compose up -d mailpit)');
  // Tes selalu memakai Mailpit lokal, apa pun isi SMTP di .env, agar tidak pernah mengirim email sungguhan.
  worker = await startWorker(
    loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      RELAY_INTERVAL_MS: '300',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    }),
  );
});

afterAll(async () => {
  await worker?.stop();
  await platform.db.delete(outbox).where(sql`${outbox.payload}->>'to' like ${`%-${run}@example.test`}`);
  await platform.pool.end();
});

describe('outbox → pg-boss → email (Mailpit)', () => {
  it('pekerjaan di outbox sampai sebagai email dan ditandai sudah masuk antrean', async () => {
    const subject = `E2E ${run}`;
    const to = `penerima-${run}@example.test`;
    const id = await platform.db.transaction((tx) =>
      enqueue(tx, QUEUES.emailSend, { to, subject, text: 'Halo dari Edusync' }),
    );

    const msgs = await waitFor(async () => {
      const m = await inbox(subject);
      return m.length > 0 ? m : undefined;
    });
    expect(msgs).toHaveLength(1);

    const [row] = await platform.db.select().from(outbox).where(eq(outbox.id, id));
    expect(row?.status).toBe('enqueued');
    await removeFromInbox(msgs.map((m) => m.ID));
  });

  it('relay berulang tidak membuat email ganda', async () => {
    const subject = `Sekali ${run}`;
    await platform.db.transaction((tx) =>
      enqueue(tx, QUEUES.emailSend, { to: `sekali-${run}@example.test`, subject, text: 'Satu kali saja' }),
    );
    await waitFor(async () => (await inbox(subject)).length > 0);
    await new Promise((r) => setTimeout(r, 2000));
    const msgs = await inbox(subject);
    expect(msgs).toHaveLength(1);
    await removeFromInbox(msgs.map((m) => m.ID));
  });
});
