import { readFileSync } from 'node:fs';
import { createDb } from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Menjalankan migrasi 0075 pada tabel sementara `card_template` (pg_temp lebih dulu di search_path), jadi tidak
 * menyentuh data dev. Memastikan: QR berisi NIS/RFID pada kartu siswa menjadi qrCode, kode batang berisi NIS/RFID
 * dihapus (terlalu sempit untuk kode identitas), kartu ujian menjadi participantNo, urutan dan kunci lain terjaga,
 * dan teks biasa tidak disentuh.
 */
const sqlFile = new URL('../../../packages/db/drizzle/0075_card_template_bindings.sql', import.meta.url);
const statements = readFileSync(sqlFile, 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

const url = process.env.DATABASE_OWNER_URL;
const { pool } = createDb(url ?? 'postgres://invalid');

/** Satu sesi koneksi (tabel sementara hanya terlihat di sesi yang membuatnya). */
interface Conn {
  query: <R = unknown>(text: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  release: () => void;
}

const el = (type: string, field: string | undefined, extra: Record<string, unknown> = {}) => ({
  type,
  x: 1,
  y: 2,
  w: 10,
  h: 10,
  ...(field ? { field } : {}),
  ...extra,
});

describe.skipIf(!url)('migrasi 0075_card_template_bindings', () => {
  const client = { current: null as Conn | null };

  beforeAll(async () => {
    client.current = (await pool.connect()) as unknown as Conn;
    await client.current.query(
      `CREATE TEMP TABLE card_template (id serial PRIMARY KEY, kind text NOT NULL, elements jsonb NOT NULL)`,
    );
  });

  afterAll(async () => {
    client.current?.release();
    await pool.end();
  });

  it('mengalihkan ikatan kode tanpa mengubah urutan atau elemen lain', async () => {
    const c = client.current;
    if (!c) throw new Error('tanpa koneksi');
    const student = [
      el('rect', undefined, { fill: '#111111' }),
      el('qr', 'nis', { color: '#000000' }),
      el('field', 'nis', { prefix: 'NIS: ' }),
      el('barcode', 'rfidCode', { showText: true }),
      el('qr', 'qrCode'),
    ];
    const exam = [el('qr', 'participantNo'), el('barcode', 'nis'), el('field', 'name'), el('qr', 'rfidCode')];
    const okStudent = [el('qr', 'qrCode'), el('field', 'nis')];
    await c.query(
      `INSERT INTO card_template (kind, elements) VALUES ('student', $1), ('exam', $2), ('student', $3), ('student', '[]')`,
      [JSON.stringify(student), JSON.stringify(exam), JSON.stringify(okStudent)],
    );

    for (const s of statements) await c.query(s);

    const rows = await c.query<{ kind: string; elements: Array<Record<string, unknown>> }>(
      'SELECT kind, elements FROM card_template ORDER BY id',
    );
    const [s, e, ok, empty] = rows.rows;
    expect(s?.elements.map((x) => [x.type, x.field])).toEqual([
      ['rect', undefined],
      ['qr', 'qrCode'],
      ['field', 'nis'],
      ['qr', 'qrCode'],
    ]);
    expect(s?.elements[1]).toMatchObject({ color: '#000000', x: 1, w: 10 });
    expect(e?.elements.map((x) => [x.type, x.field])).toEqual([
      ['qr', 'participantNo'],
      ['barcode', 'participantNo'],
      ['field', 'name'],
      ['qr', 'participantNo'],
    ]);
    expect(ok?.elements).toEqual(okStudent);
    expect(empty?.elements).toEqual([]);
  });
});
