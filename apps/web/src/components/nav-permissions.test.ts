import { readFileSync } from 'node:fs';
import { DEFAULT_CATALOG, PERMISSIONS, SYSTEM_ROLES } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';

/**
 * Menu samping harus konsisten dengan izin route API: peran yang melihat sebuah menu harus boleh memanggil
 * endpoint utama halamannya (kalau tidak, halaman terbuka tetapi datanya 403), dan modul menu harus sama dengan
 * modul yang dipasang di route. Izin route dibaca dari spesifikasi OpenAPI yang diekspor (`pnpm openapi:export`).
 */
const spec = JSON.parse(
  readFileSync(new URL('../../../../packages/contracts/openapi.json', import.meta.url), 'utf8'),
) as { paths: Record<string, Record<string, { description?: string }>> };

/** Endpoint utama tiap halaman (data yang dimuat saat halaman dibuka, atau aksi inti halaman pengaturan). */
const PRIMARY: Record<string, string> = {
  '/students': 'GET /v1/students',
  '/teachers': 'GET /v1/teachers',
  '/classes': 'GET /v1/classes',
  '/subjects': 'GET /v1/subjects',
  '/academic-years': 'GET /v1/academic-years',
  '/calendar': 'GET /v1/academic-years/{id}/calendar',
  '/school-settings': 'PUT /v1/school/settings',
  '/attendance': 'GET /v1/attendance/report',
  '/lessons': 'GET /v1/lessons',
  '/gate': 'GET /v1/gate/daily',
  '/attendance/cards': 'GET /v1/attendance/cards',
  '/attendance-settings': 'GET /v1/attendance/devices',
  '/schedule': 'GET /v1/schedule',
  '/grades': 'GET /v1/grading/my-assignments',
  '/report-cards': 'GET /v1/report-cards',
  '/extracurriculars': 'GET /v1/extracurriculars',
  '/grades/settings': 'PUT /v1/grading/settings',
  '/report-cards/settings': 'PUT /v1/report-cards/settings',
  '/tahfidz': 'GET /v1/tahfidz/halaqah',
  '/tahfidz/ibadah': 'GET /v1/tahfidz/ibadah-items',
  '/pkl': 'GET /v1/pkl/placements',
  '/pkl/partners': 'GET /v1/pkl/partners',
  '/tahfidz/settings': 'POST /v1/tahfidz/ibadah-items',
  '/pkl/settings': 'PUT /v1/pkl/settings-thresholds',
  '/finance': 'POST /v1/finance/payments',
  '/finance/invoices': 'GET /v1/finance/invoices',
  '/finance/reports': 'GET /v1/finance/reports/arrears',
  '/finance/settings': 'POST /v1/finance/fee-types',
  '/admissions': 'GET /v1/admissions/applications',
  '/admissions/periods': 'POST /v1/admissions/periods',
  '/letters': 'GET /v1/letters',
  '/letters/signers': 'GET /v1/letters/signers/me',
  '/letters/templates': 'POST /v1/letters/templates',
  '/announcements': 'GET /v1/announcements',
  '/messaging': 'GET /v1/messaging/messages',
  '/portal-admin': 'GET /v1/portal/accounts',
  '/site-settings': 'PUT /v1/site/profile',
  '/members': 'GET /v1/members',
  '/roles': 'GET /v1/roles',
};

/**
 * NAV_GROUPS dibaca dari teks app-shell.tsx: mengimpor komponennya menyeret next/react/ikon ke tes node.
 * Tiap item berbentuk { href, ..., permission, orPermission?, module? }.
 */
const shell = readFileSync(new URL('./app-shell.tsx', import.meta.url), 'utf8');
const navSrc = shell.slice(shell.indexOf('export const NAV_GROUPS'), shell.indexOf('] as const;'));
// Satu potongan per item: dari `href: '` sampai `href: '` berikutnya (item satu baris maupun berbaris-baris).
const allItems = navSrc
  .split("href: '")
  .slice(1)
  .map((chunk) => ({
    href: chunk.slice(0, chunk.indexOf("'")),
    permission: chunk.match(/\spermission: ('[^']+'|null)/)?.[1]?.replaceAll("'", '') ?? null,
    orPermission: chunk.match(/orPermission: '([^']+)'/)?.[1],
    module: chunk.match(/module: '([^']+)'/)?.[1],
  }))
  .map((i) => ({ ...i, permission: i.permission === 'null' ? null : i.permission }));

/** Beranda tidak punya endpoint utama (tanpa izin khusus; bagian-bagiannya menyaring sendiri). */
const items = allItems.filter((i) => i.href !== '/dashboard');

function opOf(key: string) {
  const [method, path] = key.split(' ') as [string, string];
  const op = spec.paths[path]?.[method.toLowerCase()];
  if (!op)
    throw new Error(
      `Endpoint ${key} tidak ada di OpenAPI (jalankan pnpm --filter @edusync/api openapi:export)`,
    );
  const doc = op.description ?? '';
  const izin = doc.match(/Izin: ([^.;]*)/)?.[1] ?? '';
  const first = izin.match(/`([a-z_]+:[a-z_]+)`/)?.[1] ?? null;
  const module = doc.match(/modul `([a-z_]+)`/)?.[1] ?? null;
  return { permission: first, module };
}

describe('menu samping vs izin route', () => {
  it('semua menu terbaca dari app-shell', () => {
    expect(allItems.length).toBeGreaterThan(30);
    expect(allItems.map((i) => i.href)).toContain('/dashboard');
  });

  it('setiap menu punya endpoint utama terdaftar (menu baru wajib dipetakan di tes ini)', () => {
    expect(items.map((i) => i.href).filter((h) => !PRIMARY[h])).toEqual([]);
  });

  it('izin dan modul menu valid menurut katalog', () => {
    const perms = new Set<string>(PERMISSIONS);
    const modules = new Set(DEFAULT_CATALOG.filter((c) => c.kind === 'module').map((c) => c.key));
    for (const i of items) {
      if (i.permission) expect(perms.has(i.permission), `${i.href} izin`).toBe(true);
      if (i.orPermission) expect(perms.has(i.orPermission), `${i.href} orPermission`).toBe(true);
      if (i.module) expect(modules.has(i.module), `${i.href} modul ${i.module}`).toBe(true);
    }
  });

  it('modul menu sama dengan modul route utamanya', () => {
    const bad: string[] = [];
    for (const i of items) {
      const api = opOf(PRIMARY[i.href]!);
      // Deskripsi sebagian route tidak menyebut modul; hanya bandingkan bila disebut.
      if (api.module && api.module !== (i.module ?? null)) {
        bad.push(`${i.href}: menu ${i.module ?? '-'} vs route ${api.module ?? '-'}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('peran yang melihat menu boleh memanggil route utamanya (tidak ada halaman yang terbuka tapi 403)', () => {
    const bad: string[] = [];
    for (const [role, def] of Object.entries(SYSTEM_ROLES)) {
      const have = new Set<string>(def.permissions);
      for (const i of items) {
        const sees =
          i.permission === null || have.has(i.permission) || (i.orPermission && have.has(i.orPermission));
        if (!sees) continue;
        const api = opOf(PRIMARY[i.href]!);
        if (api.permission && !have.has(api.permission)) {
          bad.push(`${role} melihat ${i.href} tetapi route butuh ${api.permission}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('menu tidak lebih longgar dari route: izin menu sama dengan izin route utamanya', () => {
    const bad: string[] = [];
    for (const i of items) {
      const api = opOf(PRIMARY[i.href]!);
      // Menu yang punya orPermission (penandatangan) sengaja lebih longgar dari route daftar.
      if (!i.orPermission && i.permission && api.permission && i.permission !== api.permission) {
        bad.push(`${i.href}: menu ${i.permission} vs route ${api.permission}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('wali dan siswa tidak melihat menu staf apa pun selain beranda', () => {
    for (const role of ['guardian', 'student'] as const) {
      const have = new Set<string>(SYSTEM_ROLES[role].permissions);
      const visible = allItems.filter(
        (i) =>
          i.permission === null || have.has(i.permission) || (i.orPermission && have.has(i.orPermission)),
      );
      expect(visible.map((i) => i.href)).toEqual(['/dashboard']);
    }
  });
});
