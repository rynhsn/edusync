import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './index';

/**
 * Tabel acuan platform (tanpa school_id, tanpa RLS) tidak dijaga RLS, jadi satu-satunya pagar penulisan adalah ACL:
 * peran aplikasi `edusync_app` hanya boleh SELECT. Bila tes ini gagal di DB lokal, periksa dulu apakah ACL DB menyimpang
 * dari migrasi (drift) sebelum mengubah tesnya.
 */

const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!platformUrl) throw new Error('DATABASE_PLATFORM_URL wajib diisi');
const platform = createDb(platformUrl);

const REFERENCE_TABLES = [
  'ref_subject_group',
  'ref_education_profile',
  'ref_subject',
  'ref_curriculum',
  'ref_school_level',
] as const;

afterAll(async () => {
  await platform.pool.end();
});

async function privilege(table: string, kind: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE') {
  const res = await platform.db.execute(
    sql`select has_table_privilege('edusync_app', ${`public.${table}`}, ${kind}) as allowed`,
  );
  return (res.rows[0] as { allowed: boolean }).allowed;
}

describe('ACL tabel acuan platform untuk edusync_app', () => {
  for (const table of REFERENCE_TABLES) {
    it(`${table}: hanya SELECT`, async () => {
      expect(await privilege(table, 'SELECT'), `${table} SELECT`).toBe(true);
      for (const kind of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] as const) {
        expect(await privilege(table, kind), `${table} ${kind}`).toBe(false);
      }
    });
  }

  it('tabel acuan tidak ber-RLS dan tidak punya school_id', async () => {
    const res = await platform.db.execute(sql`
      select c.relname, c.relrowsecurity,
        exists (select 1 from information_schema.columns k
                where k.table_name = c.relname and k.column_name = 'school_id') as has_school
      from pg_class c
      where c.relkind = 'r' and c.relname in (${sql.join(
        REFERENCE_TABLES.map((t) => sql`${t}`),
        sql`, `,
      )})
      order by c.relname`);
    const rows = res.rows as { relname: string; relrowsecurity: boolean; has_school: boolean }[];
    expect(rows.map((r) => r.relname)).toEqual([...REFERENCE_TABLES].sort());
    expect(rows.every((r) => !r.relrowsecurity && !r.has_school)).toBe(true);
  });
});
