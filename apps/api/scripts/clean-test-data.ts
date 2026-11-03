import { createDb } from '@edusync/db';
import type pg from 'pg';
import { loadEnv } from '../src/env';

/**
 * Pembersih sisa data uji di database dev (tes yang terhenti sebelum afterAll).
 *
 *   pnpm --filter @edusync/api clean:test            # dry-run (bawaan): hanya melaporkan
 *   pnpm --filter @edusync/api clean:test --apply    # benar-benar menghapus, dalam satu transaksi
 *
 * Yang dihapus HANYA yayasan yang slug-nya cocok TEST_FOUNDATION_PREFIXES (pola `<awalan>-<akhiran>` yang
 * dibuat tes: `yg-k3j9x2` dst.) beserta semua sekolah dan baris turunannya. Yayasan seed dev
 * (PROTECTED_FOUNDATIONS) tidak pernah disentuh, juga yayasan yang memiliki sekolah seed.
 * Tabel turunan ditemukan otomatis: kolom school_id/foundation_id lewat information_schema, kunci asing
 * lewat katalog Postgres (information_schema tidak memuat kolom FK majemuk dengan andal).
 */

/** Awalan slug yayasan yang dipakai tes (apps/api/src/*.test.ts), tiap awalan diikuti `-<akhiran acak>`. */
const TEST_FOUNDATION_PREFIXES = [
  'y',
  'yayasan',
  'ya',
  'yd',
  'ye',
  'yg',
  'yh',
  'yi',
  'yj',
  'yk',
  'ykr',
  'yl',
  'yld',
  'ym',
  'ymtx',
  'yn',
  'yp',
  'ypesan',
  'ypkl',
  'yps',
  'yr',
  'ys',
  'yt',
  'yu',
  'lu',
  'lu2',
];
/** Yayasan dan sekolah seed-dev.ts: dilindungi mutlak. */
const PROTECTED_FOUNDATIONS = ['miftahul-huda'];
const PROTECTED_SCHOOLS = ['smpit-miftahul-huda', 'smk-miftahul-huda'];

const isTestSlug = (slug: string) =>
  !PROTECTED_FOUNDATIONS.includes(slug) &&
  TEST_FOUNDATION_PREFIXES.some((p) => new RegExp(`^${p}-[a-z0-9][a-z0-9-]*$`).test(slug));

const apply = process.argv.includes('--apply');
/** Dengan --apply: jalankan semua DELETE lalu rollback (membuktikan urutan FK tanpa menyimpan apa pun). */
const rollbackOnly = process.argv.includes('--rollback');
const env = loadEnv();
if (env.NODE_ENV !== 'development') throw new Error('clean-test-data hanya untuk NODE_ENV=development');
const { pool } = createDb(env.DATABASE_PLATFORM_URL);

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

interface Fk {
  child: string;
  parent: string;
  childCol: string;
  parentCol: string;
  nullable: boolean;
}

async function main(c: pg.PoolClient) {
  const role = (
    await c.query(
      'select current_user as u, (select rolsuper from pg_roles where rolname = current_user) as su, (select rolbypassrls from pg_roles where rolname = current_user) as bypass',
    )
  ).rows[0];
  console.log(
    `Peran: ${role.u} (superuser=${role.su}, bypassrls=${role.bypass}); mode: ${apply ? 'APPLY' : 'dry-run'}`,
  );
  if (!role.su && !role.bypass)
    throw new Error('Peran platform harus mem-bypass RLS agar semua baris terlihat');

  const foundations = (await c.query('select id, slug, name, created_at from foundation order by created_at'))
    .rows;
  const schools = (await c.query('select id, slug, foundation_id from school')).rows;
  const protectedFoundationIds = new Set<string>(
    foundations.filter((f) => PROTECTED_FOUNDATIONS.includes(f.slug)).map((f) => f.id),
  );
  for (const s of schools)
    if (PROTECTED_SCHOOLS.includes(s.slug)) protectedFoundationIds.add(s.foundation_id);

  const targets = foundations.filter((f) => isTestSlug(f.slug) && !protectedFoundationIds.has(f.id));
  const kept = foundations.filter((f) => !targets.includes(f));
  const targetIds = targets.map((f) => f.id);
  const schoolIds = schools.filter((s) => targetIds.includes(s.foundation_id)).map((s) => s.id);

  console.log(`\nYayasan uji yang akan dihapus (${targets.length}), sekolahnya ${schoolIds.length}:`);
  for (const f of targets) {
    const n = schools.filter((s) => s.foundation_id === f.id).map((s) => s.slug);
    console.log(
      `  - ${f.slug}  "${f.name}"  ${new Date(f.created_at).toISOString()}  sekolah: ${n.join(', ') || '(tidak ada)'}`,
    );
  }
  console.log(`\nYayasan yang TIDAK disentuh (${kept.length}):`);
  for (const f of kept)
    console.log(`  - ${f.slug}  "${f.name}"${protectedFoundationIds.has(f.id) ? '  [dilindungi]' : ''}`);
  if (targets.length === 0) return;

  // Tabel ber-school_id / foundation_id (information_schema) dan semua kunci asing publik.
  const cols = (
    await c.query(
      `select c.table_name, c.column_name from information_schema.columns c
       join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.column_name in ('school_id', 'foundation_id')`,
    )
  ).rows;
  const hasCol = (t: string, col: string) => cols.some((r) => r.table_name === t && r.column_name === col);
  const fkRows = (
    await c.query(
      `select cl.relname as child, pl.relname as parent, ca.attname as child_col, pa.attname as parent_col,
              not ca.attnotnull as nullable, array_length(k.conkey, 1) as n
       from pg_constraint k
       join pg_class cl on cl.oid = k.conrelid join pg_class pl on pl.oid = k.confrelid
       join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
       join pg_attribute ca on ca.attrelid = k.conrelid and ca.attnum = k.conkey[1]
       join pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = k.confkey[1]
       where k.contype = 'f'`,
    )
  ).rows;
  if (fkRows.some((r) => r.n > 1)) {
    const bad = fkRows.filter((r) => r.n > 1).map((r) => `${r.child}->${r.parent}`);
    console.log(
      `Catatan: FK majemuk dilewati untuk penyaring (tetap dijaga oleh FK saat hapus): ${bad.join(', ')}`,
    );
  }
  const fks: Fk[] = fkRows
    .filter((r) => r.n === 1)
    .map((r) => ({
      child: r.child,
      parent: r.parent,
      childCol: r.child_col,
      parentCol: r.parent_col,
      nullable: r.nullable,
    }));

  // Tabel yang dihapus barisnya: ber-school_id/foundation_id, atau turunan FK (NOT NULL) dari tabel yang dihapus.
  const del = new Set<string>(['school', 'foundation', ...cols.map((r) => r.table_name)]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of fks) {
      if (del.has(f.parent) && !del.has(f.child) && !f.nullable) {
        del.add(f.child);
        grew = true;
      }
    }
  }
  // Turunan berkolom FK nullable tanpa school_id/foundation_id (mis. rujukan opsional): hanya dilaporkan.
  const nullableOnly = fks.filter((f) => del.has(f.parent) && !del.has(f.child) && f.nullable);

  // Penyaring baris per tabel: school_id/foundation_id yang cocok ATAU FK ke baris yang akan dihapus.
  // id dari kolom uuid hasil query sendiri, aman disisipkan sebagai literal (menghindari parameter tak terpakai).
  const lit = (ids: string[]) => `array[${ids.map((i) => `'${i}'`).join(',')}]::uuid[]`;
  const memo = new Map<string, string>();
  const filterOf = (t: string, stack: string[] = []): string => {
    const hit = memo.get(t);
    if (hit) return hit;
    if (stack.includes(t)) throw new Error(`Siklus FK tak terduga: ${[...stack, t].join(' -> ')}`);
    const parts: string[] = [];
    if (t === 'school') parts.push(`id = any(${lit(schoolIds)})`);
    else if (t === 'foundation') parts.push(`id = any(${lit(targetIds)})`);
    else {
      if (hasCol(t, 'school_id')) parts.push(`school_id = any(${lit(schoolIds)})`);
      if (hasCol(t, 'foundation_id')) parts.push(`foundation_id = any(${lit(targetIds)})`);
      for (const f of fks.filter((x) => x.child === t && del.has(x.parent) && x.parent !== t))
        parts.push(
          `${q(f.childCol)} in (select ${q(f.parentCol)} from ${q(f.parent)} where ${filterOf(f.parent, [...stack, t])})`,
        );
    }
    const out = parts.length ? `(${parts.join(' or ')})` : 'false';
    memo.set(t, out);
    return out;
  };

  // Urutan hapus: anak sebelum induk (FK tanpa self-reference).
  const order: string[] = [];
  const left = new Set(del);
  while (left.size) {
    const ready = [...left].filter(
      (t) => !fks.some((f) => f.parent === t && f.child !== t && left.has(f.child)),
    );
    if (ready.length === 0) throw new Error(`Siklus FK antartabel: ${[...left].join(', ')}`);
    for (const t of ready) {
      order.push(t);
      left.delete(t);
    }
  }

  const counts: [string, number][] = [];
  for (const t of order) {
    const n = Number((await c.query(`select count(*) from ${q(t)} where ${filterOf(t)}`)).rows[0].count);
    if (n > 0) counts.push([t, n]);
  }
  console.log(
    `\nBaris yang cocok (${counts.reduce((a, [, n]) => a + n, 0)} baris di ${counts.length} tabel, urutan hapus):`,
  );
  for (const [t, n] of counts) console.log(`  ${t.padEnd(36)} ${n}`);
  if (nullableOnly.length)
    console.log(
      `Turunan opsional (FK nullable, tidak dihapus): ${nullableOnly.map((f) => `${f.child}.${f.childCol}`).join(', ')}`,
    );

  if (!apply) {
    console.log('\nDry-run selesai; tidak ada yang dihapus. Jalankan dengan --apply untuk menghapus.');
    return;
  }
  await c.query('begin');
  try {
    const deleted: [string, number][] = [];
    for (const [t] of counts) {
      const r = await c.query(`delete from ${q(t)} where ${filterOf(t)}`);
      deleted.push([t, r.rowCount ?? 0]);
    }
    await c.query(rollbackOnly ? 'rollback' : 'commit');
    console.log(
      `\n${rollbackOnly ? '[ROLLBACK, tidak tersimpan] ' : ''}Dihapus${deleted.reduce((a, [, n]) => a + n, 0)} baris dari ${deleted.length} tabel:`,
    );
    for (const [t, n] of deleted) console.log(`  ${t.padEnd(36)} ${n}`);
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

const client = await pool.connect();
try {
  await main(client);
} finally {
  client.release();
  await pool.end();
}
