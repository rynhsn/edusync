import { createDb, eq, foundation, outbox, school, sql, withTenant } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueue, QUEUES } from './index';

const app = createDb(process.env.DATABASE_URL as string);
const platform = createDb(process.env.DATABASE_PLATFORM_URL as string);
const run = Math.random().toString(36).slice(2, 8);
const mail = (n: number) => ({ to: `uji${n}-${run}@example.test`, subject: `Uji ${run} ${n}`, text: 'Halo' });

let schoolA = '';
let schoolB = '';
let foundationId = '';

const rowsFor = (to: string) =>
  platform.db.select().from(outbox).where(sql`${outbox.payload}->>'to' = ${to}`);

beforeAll(async () => {
  const [f] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan Antrean', slug: `ya-${run}` })
    .returning();
  foundationId = f!.id;
  const [a] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `a-${run}`, name: 'A' })
    .returning();
  const [b] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `b-${run}`, name: 'B' })
    .returning();
  schoolA = a!.id;
  schoolB = b!.id;
});

afterAll(async () => {
  await platform.db.delete(outbox).where(sql`${outbox.payload}->>'to' like ${`%-${run}@example.test`}`);
  await platform.db.delete(school).where(eq(school.id, schoolA));
  await platform.db.delete(school).where(eq(school.id, schoolB));
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await app.pool.end();
  await platform.pool.end();
});

describe('outbox', () => {
  it('pekerjaan tersimpan bersama transaksi yang di-commit', async () => {
    const m = mail(1);
    await withTenant(app.db, [schoolA], (tx) => enqueue(tx, QUEUES.emailSend, m, { schoolId: schoolA }));
    const rows = await rowsFor(m.to);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.schoolId).toBe(schoolA);
  });

  it('transaksi yang dibatalkan tidak meninggalkan pekerjaan', async () => {
    const m = mail(2);
    await expect(
      withTenant(app.db, [schoolA], async (tx) => {
        await enqueue(tx, QUEUES.emailSend, m, { schoolId: schoolA });
        throw new Error('gagal setelah enqueue');
      }),
    ).rejects.toThrow('gagal setelah enqueue');
    expect(await rowsFor(m.to)).toHaveLength(0);
  });

  it('payload yang tidak sesuai skema ditolak', async () => {
    await expect(
      withTenant(app.db, [schoolA], (tx) =>
        enqueue(tx, QUEUES.emailSend, { to: 'bukan-email', subject: 'x', text: 'y' }, { schoolId: schoolA }),
      ),
    ).rejects.toThrow();
  });

  it('sekolah tidak bisa menulis pekerjaan atas nama sekolah lain', async () => {
    await expect(
      withTenant(app.db, [schoolA], (tx) => enqueue(tx, QUEUES.emailSend, mail(3), { schoolId: schoolB })),
    ).rejects.toThrow();
  });

  it('sekolah tidak melihat pekerjaan sekolah lain', async () => {
    const m = mail(4);
    await withTenant(app.db, [schoolB], (tx) => enqueue(tx, QUEUES.emailSend, m, { schoolId: schoolB }));
    const seenByA = await withTenant(app.db, [schoolA], (tx) => tx.select().from(outbox));
    expect(seenByA.some((r) => r.payload.to === m.to)).toBe(false);
  });

  it('peran aplikasi tidak punya akses ke skema pg-boss', async () => {
    await expect(app.db.execute(sql`select 1 from pgboss.job limit 1`)).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/permission denied|does not exist/) },
    });
  });
});
