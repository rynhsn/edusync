import { and, type Db, eq, outbox } from '@edusync/db';
import type { PgBoss } from 'pg-boss';
import type { QueueName } from './queues';

/**
 * Pindahkan baris outbox yang menunggu ke antrean pg-boss. `Db` di sini harus memakai peran platform
 * agar semua tenant terlihat. `singletonKey` = id outbox, jadi bila proses mati antara kirim dan
 * penandaan, percobaan berikutnya tidak membuat pekerjaan ganda.
 */
export async function relayOutbox(db: Db, boss: Pick<PgBoss, 'send'>, batch = 100) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: outbox.id, queue: outbox.queue, payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.status, 'pending'))
      .orderBy(outbox.createdAt)
      .limit(batch)
      .for('update', { skipLocked: true });

    for (const row of rows) {
      await boss.send(row.queue as QueueName, row.payload, { singletonKey: row.id });
      await tx
        .update(outbox)
        .set({ status: 'enqueued', enqueuedAt: new Date() })
        .where(and(eq(outbox.id, row.id), eq(outbox.status, 'pending')));
    }
    return rows.length;
  });
}
