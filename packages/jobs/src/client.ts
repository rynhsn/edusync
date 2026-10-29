import { outbox, type Tx } from '@edusync/db';
import { type PayloadOf, payloadSchemas, type QueueName } from './queues';

/**
 * Tulis pekerjaan ke outbox dalam transaksi pemanggil. Bila transaksi dibatalkan, pekerjaannya ikut
 * batal, sehingga tidak ada email terkirim untuk data yang tidak pernah tersimpan. Worker yang
 * memindahkannya ke antrean, jadi peran aplikasi tidak pernah menyentuh skema pg-boss.
 */
export async function enqueue<Q extends QueueName>(
  tx: Tx,
  queue: Q,
  payload: PayloadOf<Q>,
  options: { schoolId?: string } = {},
) {
  const data = payloadSchemas[queue].parse(payload);
  const [row] = await tx
    .insert(outbox)
    .values({ queue, payload: data, ...(options.schoolId ? { schoolId: options.schoolId } : {}) })
    .returning({ id: outbox.id });
  if (!row) throw new Error(`Pekerjaan ${queue} tidak dapat dibuat`);
  return row.id;
}
