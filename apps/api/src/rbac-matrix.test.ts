import { DEFAULT_CATALOG, PERMISSIONS, SYSTEM_ROLES, type SystemRoleKey } from '@edusync/contracts';
import {
  assignRoles,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import * as guards from './identity/guards';

/**
 * Tes matriks peran x endpoint. Daftar route dan izinnya DIBACA dari aplikasi yang sebenarnya (hook `onRoute`
 * pada Fastify + penanda pada requirePermission/requireModule), jadi tidak ada salinan manual yang bisa basi:
 * route baru otomatis ikut diuji. Ekspektasi diturunkan dari SYSTEM_ROLES.
 */
const reg = vi.hoisted(() => ({
  routes: [] as {
    method: string | string[];
    url: string;
    onRequest?: unknown;
    preHandler?: unknown;
    schema?: { body?: unknown; description?: string };
  }[],
}));

vi.mock('fastify', async (orig) => {
  const actual = await orig<{ default: (opts?: unknown) => { addHook: (n: string, f: unknown) => void } }>();
  const wrapped = (opts?: unknown) => {
    const app = actual.default(opts);
    app.addHook('onRoute', (r: (typeof reg.routes)[number]) => reg.routes.push(r));
    return app;
  };
  return { ...actual, default: wrapped };
});

vi.mock('./identity/guards', async (orig) => {
  const actual = await orig<typeof import('./identity/guards')>();
  return {
    ...actual,
    requirePermission: (...needed: string[]) =>
      Object.assign(actual.requirePermission(...(needed as never[])), { perms: needed }),
    requireModule: (key: string) => Object.assign(actual.requireModule(key), { moduleKey: key }),
    requireStaff: (...a: Parameters<typeof actual.requireStaff>) =>
      Object.assign(actual.requireStaff(...a), { staff: true }),
  };
});

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const FAKE_UUID = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

type Tagged = ((...a: never[]) => unknown) & { perms?: string[]; moduleKey?: string; staff?: boolean };
interface Ep {
  method: string;
  url: string;
  perms: string[];
  modules: string[];
  hasBody: boolean;
  description: string;
  /** 'perm' = requirePermission; 'tenant' = requireTenant saja; 'user' = requireUser; 'staff'; 'open' = tanpa gerbang. */
  kind: 'perm' | 'tenant' | 'user' | 'staff' | 'open';
}

function describeRoutes(): Ep[] {
  const out: Ep[] = [];
  for (const r of reg.routes) {
    const methods = (Array.isArray(r.method) ? r.method : [r.method]).filter(
      (m) => m !== 'HEAD' && m !== 'OPTIONS',
    );
    const gates = [r.onRequest, r.preHandler].flat().filter(Boolean) as Tagged[];
    const perms = gates.flatMap((g) => g.perms ?? []);
    const modules = gates.flatMap((g) => (g.moduleKey ? [g.moduleKey] : []));
    let kind: Ep['kind'] = 'open';
    if (perms.length) kind = 'perm';
    else if (gates.includes(guards.requireTenant as Tagged)) kind = 'tenant';
    else if (gates.includes(guards.requireUser as Tagged)) kind = 'user';
    else if (gates.some((g) => g.staff)) kind = 'staff';
    for (const method of methods) {
      out.push({
        method,
        url: r.url,
        perms,
        modules,
        hasBody: Boolean(r.schema?.body),
        description: r.schema?.description ?? '',
        kind,
      });
    }
  }
  return out;
}

/** Pengisi parameter path: id -> uuid, tanggal -> tanggal, lainnya -> teks. */
function fill(url: string) {
  return url.replace(/:(\w+)/g, (_m, name: string) => {
    if (/id$/i.test(name)) return FAKE_UUID;
    if (/date|day/i.test(name)) return '2026-01-01';
    return 'x';
  });
}

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let foundationId = '';
const userIds: string[] = [];
const cookies = {} as Record<SystemRoleKey, string>;
const roleKeys = Object.keys(SYSTEM_ROLES) as SystemRoleKey[];
let eps: Ep[] = [];
let ipCounter = 0;

async function makeUser(label: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  return { id: res.user.id, email };
}
async function login(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** Batas laju dihitung per IP: tiap permintaan memakai IP palsu bergantian agar ribuan panggilan tidak kena 429. */
function nextIp() {
  ipCounter++;
  return `10.${(ipCounter >> 14) & 255}.${(ipCounter >> 6) & 255}.${(ipCounter & 63) + 1}`;
}

function hit(role: SystemRoleKey, ep: Ep) {
  const isGet = ep.method === 'GET';
  return app.inject({
    method: ep.method as 'GET',
    url: fill(ep.url),
    remoteAddress: nextIp(),
    headers: {
      cookie: cookies[role],
      'x-school-id': schoolId,
      origin,
      ...(isGet ? {} : { 'content-type': 'application/json' }),
    },
    // Badan bertipe salah (array) selalu gagal validasi skema objek: 400 tanpa efek samping.
    ...(isGet ? {} : { payload: '[]' }),
  });
}

const allows = (role: SystemRoleKey, ep: Ep) => {
  const have = new Set<string>(SYSTEM_ROLES[role].permissions);
  return ep.perms.every((p) => have.has(p));
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  eps = describeRoutes();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Matriks', slug: `ymtx-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const [s] = await db
    .insert(school)
    .values({ foundationId, slug: `mtx-${run}`, name: 'Sekolah Matriks' })
    .returning();
  schoolId = s!.id;
  await seedSchoolRoles(db, schoolId);
  // Semua modul yang dirujuk route aktif, agar yang diuji murni izin peran.
  for (const moduleKey of new Set(eps.flatMap((e) => e.modules))) {
    await db
      .insert(entitlement)
      .values({ schoolId, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
  }
  for (const role of roleKeys) {
    const u = await makeUser(`mtx-${role}`);
    const [m] = await db.insert(member).values({ userId: u.id, schoolId }).returning();
    await assignRoles(db, m!.id, schoolId, [role]);
    cookies[role] = await login(u.email);
  }
}, 60_000);

afterAll(async () => {
  const db = app.platformDb;
  // Panggilan GET dapat membuat data bawaan (mis. jenis dokumen SPMB), jadi bersihkan semua tabel ber-school_id.
  const tables = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'school_id' and table_name <> 'school'`,
  );
  for (let pass = 0; pass < 4; pass++) {
    for (const { table_name } of tables.rows) {
      await db
        .execute(sql`delete from ${sql.identifier(table_name)} where school_id = ${schoolId}`)
        .catch(() => undefined);
    }
  }
  await db.delete(school).where(eq(school.id, schoolId));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('katalog route', () => {
  it('setiap izin yang dipakai route ada di katalog PERMISSIONS', () => {
    const known = new Set<string>(PERMISSIONS);
    const unknown = eps.flatMap((e) => e.perms.filter((p) => !known.has(p)).map((p) => `${e.url} ${p}`));
    expect(unknown).toEqual([]);
  });

  it('peran bawaan hanya memuat izin yang ada di katalog', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of roleKeys) {
      for (const p of SYSTEM_ROLES[role].permissions) expect(known.has(p), `${role}: ${p}`).toBe(true);
    }
  });

  it('route sekolah yang cukup requireTenant (semua anggota, termasuk wali dan siswa) hanya yang disengaja', () => {
    const rows = eps
      .filter((e) => e.kind === 'tenant')
      .map((e) => `${e.method} ${e.url}`)
      .sort();
    // Semuanya menyaring isi menurut izin/modul di handler (lihat live.test.ts dan school-settings.test.ts).
    // Identitas sekolah (logo, alamat, kontak) bukan rahasia: sudah tampil di situs publik dan kop surat.
    expect(rows).toEqual([
      'GET /v1/live/events',
      'GET /v1/live/snapshot',
      'GET /v1/school/identifier',
      'GET /v1/school/identity',
      'GET /v1/school/settings',
    ]);
  });

  it('route akun tanpa sekolah (requireUser) hanya yang disengaja', () => {
    // Akun/yayasan/pendaftaran: kepemilikan yayasan diperiksa di pustaka billing (404 bila bukan pemilik).
    const stray = eps
      .filter((e) => e.kind === 'user')
      .filter(
        (e) =>
          !/^\/v1\/(account|me$|registrations|invitations\/by-token\/|platform\/staff\/invitations\/by-token\/)/.test(
            e.url,
          ),
      )
      .map((e) => `${e.method} ${e.url}`);
    expect(stray).toEqual([]);
  });

  it('route tanpa gerbang sama sekali hanya publik, kiosk, webhook, atau sistem', () => {
    const allowed = [
      /^\/(health|ready|version|openapi\.json)$/,
      /^\/docs/,
      /^\/internal\/tls-ask$/,
      /^\/api\/auth/,
      /^\/v1\/(config|catalog|education-profiles|version|auth\/recovery\/|slugs\/|public\/|kiosk\/|webhooks\/|dev\/|invitations\/by-token\/:token$|platform\/staff\/invitations\/by-token\/:token$)/,
    ];
    const stray = eps
      .filter((e) => e.kind === 'open')
      .filter((e) => !allowed.some((re) => re.test(e.url)))
      .map((e) => `${e.method} ${e.url}`);
    expect(stray).toEqual([]);
  });

  it('modul yang dirujuk route semuanya ada di katalog modul', () => {
    const catalog = new Set(DEFAULT_CATALOG.filter((c) => c.kind === 'module').map((c) => c.key));
    const unknown = [...new Set(eps.flatMap((e) => e.modules))].filter((m) => !catalog.has(m));
    expect(unknown).toEqual([]);
  });

  it('izin pertama di deskripsi OpenAPI sama dengan yang dipasang di route', () => {
    const bad: string[] = [];
    for (const e of eps.filter((x) => x.kind === 'perm')) {
      const doc = e.description.match(/Izin: ([^.;]*)/)?.[1] ?? '';
      const first = doc.match(/`([a-z_]+:[a-z_]+)`/)?.[1];
      // Pola "baca + (kelola atau pemilik data)": dokumen menyebut :manage, route memasang :read, pemilik diperiksa di handler.
      const ownerOrManage = first?.endsWith(':manage') && e.perms.includes(first.replace(':manage', ':read'));
      if (!first || !(e.perms.includes(first) || ownerOrManage)) {
        bad.push(`${e.method} ${e.url}: kode [${e.perms}] vs dokumen [${first ?? 'tidak ada'}]`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('ringkasan: jumlah route berizin dan hak tiap peran per kelompok', () => {
    const group = (e: Ep) => e.url.split('/')[2] ?? '';
    const groups = [...new Set(eps.filter((e) => e.kind === 'perm').map(group))].sort();
    const lines = groups.map((g) => {
      const list = eps.filter((e) => e.kind === 'perm' && group(e) === g);
      const cells = roleKeys.map((r) => {
        const read = list.filter((e) => e.method === 'GET' && allows(r, e)).length;
        const write = list.filter((e) => e.method !== 'GET' && allows(r, e)).length;
        return `${r}=${read}/${write}`;
      });
      return `${g} (${list.length}): ${cells.join(' ')}`;
    });
    console.log(`\nKELOMPOK (baca/tulis diizinkan)\n${lines.join('\n')}`);
    expect(eps.filter((e) => e.kind === 'perm').length).toBeGreaterThan(100);
  });
});

describe.each(roleKeys)('matriks izin: peran %s', (role) => {
  it('semua route berizin: diizinkan tepat bila peran punya semua izinnya', async () => {
    const bad: string[] = [];
    for (const ep of eps.filter((e) => e.kind === 'perm')) {
      const allowed = allows(role, ep);
      // Route tulis tanpa skema badan akan benar-benar berjalan bila diizinkan; hanya penolakannya yang diuji.
      if (allowed && ep.method !== 'GET' && !ep.hasBody) continue;
      const res = await hit(role, ep);
      const code = (() => {
        try {
          return res.json().error?.code as string | undefined;
        } catch {
          return undefined;
        }
      })();
      const denied = res.statusCode === 403 && code === 'forbidden';
      if (allowed && (res.statusCode === 401 || res.statusCode === 403 || res.statusCode >= 500)) {
        bad.push(`DITOLAK padahal berhak: ${ep.method} ${ep.url} -> ${res.statusCode} ${code}`);
      }
      if (!allowed && !denied) {
        bad.push(
          `LOLOS padahal tak berhak: ${ep.method} ${ep.url} (${ep.perms.join(',')}) -> ${res.statusCode} ${code}`,
        );
      }
    }
    expect(bad).toEqual([]);
  }, 300_000);
});

/** Kebijakan peran bawaan yang tidak boleh bergeser tanpa disengaja (dikunci eksplisit, bukan diturunkan). */
describe('kebijakan peran bawaan', () => {
  const perms = (r: SystemRoleKey) => new Set<string>(SYSTEM_ROLES[r].permissions);
  const writeLike = (p: string) => /:(manage|pay|input|configure)$/.test(p);

  it('kepala sekolah hanya membaca (satu-satunya tulis: menandatangani surat)', () => {
    expect([...perms('principal')].filter(writeLike)).toEqual([]);
    expect(perms('principal').has('letter:sign')).toBe(true);
  });

  it('bendahara tidak punya akses nilai, rapor, absensi, surat, atau pesan', () => {
    for (const p of perms('treasurer')) {
      expect(p, p).toMatch(/^(finance:|academic_year:read|student:read|class:read|announcement:read)/);
    }
  });

  it('operator tidak boleh menerima pembayaran atau mengelola keuangan, peran, dan anggota', () => {
    for (const p of ['finance:pay', 'finance:manage', 'role:manage', 'member:manage', 'letter:sign']) {
      expect(perms('operator').has(p), p).toBe(false);
    }
  });

  it('guru hanya menulis absensi dan nilai; tidak ada izin kelola lain', () => {
    expect([...perms('teacher')].filter(writeLike).sort()).toEqual(['attendance:manage', 'grade:input']);
  });

  it('wali hanya punya portal:read dan portal:respond; siswa hanya portal:read', () => {
    expect([...perms('guardian')].sort()).toEqual(['portal:read', 'portal:respond']);
    expect([...perms('student')]).toEqual(['portal:read']);
  });

  it('portal:respond hanya di peran wali (dan admin sekolah yang memegang semua izin), tidak di siswa atau staf lain', () => {
    const holders = roleKeys.filter((r) => perms(r).has('portal:respond')).sort();
    expect(holders).toEqual(['guardian', 'school_admin']);
  });

  it('rute tulis tanggapan wali di portal memasang portal:respond dan modul parent_portal', () => {
    const put = eps.find((e) => e.method === 'PUT' && e.url.endsWith('/report-cards/:semesterId/response'));
    expect(put?.perms).toEqual(['portal:respond']);
    expect(put?.modules).toContain('parent_portal');
    expect(put?.modules).toContain('grades');
    const get = eps.find((e) => e.method === 'GET' && e.url.endsWith('/report-cards/:semesterId/response'));
    expect(get?.perms).toEqual(['portal:read']);
  });

  it('rute kaitan TP dan ketercapaian TP (tahap 3.3) memasang izin dan modul grades yang benar', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const link = find('PUT', '/v1/assessments/:id/objectives');
    expect([link?.perms, link?.modules]).toEqual([['grade:input'], ['grades']]);
    const read = find('GET', '/v1/grading/objective-achievement');
    expect([read?.perms, read?.modules]).toEqual([['grade:read'], ['grades']]);
    const write = find('PUT', '/v1/grading/objective-achievement');
    expect([write?.perms, write?.modules]).toEqual([['grade:input'], ['grades']]);
    // Peran yang hanya membaca atau tanpa izin nilai tidak dapat menulis kaitan dan keputusan guru.
    for (const r of roleKeys) {
      const holds = (p: string) => perms(r).has(p as never);
      expect(allows(r, link!), r).toBe(holds('grade:input'));
      expect(allows(r, read!), r).toBe(holds('grade:read'));
    }
    for (const r of ['guardian', 'student', 'principal'] as const) expect(allows(r, write!), r).toBe(false);
  });

  it('rute pendampingan dan percobaan remedial (tahap 3.5) memasang izin dan modul grades yang benar', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const reads = [
      find('GET', '/v1/learning-supports'),
      find('GET', '/v1/assessments/:id/remedial-attempts'),
      find('GET', '/v1/grading/remedial-candidates'),
    ];
    const writes = [
      find('POST', '/v1/learning-supports'),
      find('PUT', '/v1/learning-supports/:id'),
      find('DELETE', '/v1/learning-supports/:id'),
      find('PUT', '/v1/learning-supports/:id/participants'),
      find('POST', '/v1/assessments/:id/remedial-attempts'),
      find('DELETE', '/v1/remedial-attempts/:id'),
    ];
    for (const e of reads) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['grade:read'], ['grades']]);
      expect(e?.description).toContain('Izin: `grade:read`');
    }
    for (const e of writes) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['grade:input'], ['grades']]);
      expect(e?.description).toContain('Izin: `grade:input`');
    }
    // Peran tanpa izin nilai tidak dapat menulis; yang hanya membaca tidak dapat mencatat remedial.
    for (const r of roleKeys) {
      const holds = (p: string) => perms(r).has(p as never);
      for (const e of reads) expect(allows(r, e!), `${r} ${e?.url}`).toBe(holds('grade:read'));
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(holds('grade:input'));
    }
    for (const r of ['guardian', 'student', 'principal'] as const) {
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(false);
    }
    // Kebijakan remedial berubah lewat rute pengaturan yang sama (grade:configure).
    const settings = find('PUT', '/v1/grading/settings');
    expect([settings?.perms, settings?.modules]).toEqual([['grade:configure'], ['grades']]);
  });

  it('rute mutasi murid dan riwayat rombel (tahap 3C.1) memasang izin student:read/student:manage tanpa modul', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const reads = [
      find('GET', '/v1/student-transfers'),
      find('GET', '/v1/student-transfers/:id'),
      find('GET', '/v1/students/:id/transfers'),
      find('GET', '/v1/students/:id/academic-history'),
    ];
    const writes = [
      find('POST', '/v1/students/:id/transfer-out'),
      find('POST', '/v1/students/transfer-in'),
      find('PUT', '/v1/student-transfers/:id'),
      find('DELETE', '/v1/student-transfers/:id'),
    ];
    for (const e of reads) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['student:read'], []]);
      expect(e?.description).toContain('Izin: `student:read`');
    }
    for (const e of writes) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['student:manage'], []]);
      expect(e?.description).toContain('Izin: `student:manage`');
    }
    const classMove = find('PUT', '/v1/students/:id/class');
    expect(classMove?.perms).toEqual(['student:manage']);
    // Peran hanya dapat mengubah mutasi bila memegang student:manage; wali dan siswa tidak membaca.
    for (const r of roleKeys) {
      const holds = (p: string) => perms(r).has(p as never);
      for (const e of reads) expect(allows(r, e!), `${r} ${e?.url}`).toBe(holds('student:read'));
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(holds('student:manage'));
    }
    for (const r of ['guardian', 'student', 'principal', 'teacher', 'treasurer'] as const) {
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(false);
    }
  });

  it('rute berita acara dan laporan ringkas keputusan (tahap 3C.3) memasang izin sesuai rancangan tanpa modul', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const reads = [
      find('GET', '/v1/council-meetings'),
      find('GET', '/v1/council-meetings/:id'),
      find('GET', '/v1/academic-years/:id/promotions/summary'),
    ];
    const writes = [
      find('POST', '/v1/council-meetings'),
      find('PUT', '/v1/council-meetings/:id'),
      find('DELETE', '/v1/council-meetings/:id'),
      find('POST', '/v1/council-meetings/:id/finalize'),
      find('POST', '/v1/council-meetings/:id/reopen'),
      find('PUT', '/v1/council-meetings/:id/decisions'),
    ];
    for (const e of reads) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['report_card:read_all'], []]);
      expect(e?.description).toContain('Izin: `report_card:read_all`');
    }
    for (const e of writes) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['promotion:manage'], []]);
      expect(e?.description).toContain('Izin: `promotion:manage`');
    }
    for (const r of roleKeys) {
      const holds = (p: string) => perms(r).has(p as never);
      for (const e of reads) expect(allows(r, e!), `${r} ${e?.url}`).toBe(holds('report_card:read_all'));
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(holds('promotion:manage'));
    }
    for (const r of ['guardian', 'student', 'principal', 'teacher', 'treasurer'] as const) {
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(false);
    }
  });

  it('rute pilihan mapel (tahap 3B.1) memasang izin sesuai rancangan tanpa modul', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const classReads = [
      find('GET', '/v1/classes/:id/subject-participation'),
      find('GET', '/v1/classes/:id/subject-choices'),
      find('GET', '/v1/classes/:id/subject-choices/summary'),
    ];
    // Penulis rombel: class:read di gerbang; pemegang subject_choice:manage atau wali kelas diperiksa di handler.
    const classWrites = [
      find('PUT', '/v1/classes/:id/subject-participation'),
      find('PUT', '/v1/classes/:id/subject-choices'),
      find('POST', '/v1/classes/:id/subject-choices/from-religion'),
    ];
    for (const e of [...classReads, ...classWrites]) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['class:read'], []]);
    }
    for (const e of classWrites) expect(e?.description).toContain('subject_choice:manage');
    const studentChoices = find('GET', '/v1/students/:id/subject-choices');
    expect([studentChoices?.perms, studentChoices?.modules]).toEqual([['student:read'], []]);
    const ruleRead = find('GET', '/v1/subject-choice-rules');
    expect([ruleRead?.perms, ruleRead?.modules]).toEqual([['subject:read'], []]);
    const ruleWrites = [
      find('POST', '/v1/subject-choice-rules'),
      find('PUT', '/v1/subject-choice-rules/:id'),
      find('DELETE', '/v1/subject-choice-rules/:id'),
    ];
    for (const e of ruleWrites) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['subject_choice:manage'], []]);
      expect(e?.description).toContain('Izin: `subject_choice:manage`');
      for (const r of roleKeys) {
        expect(allows(r, e!), `${r} ${e?.url}`).toBe(['school_admin', 'curriculum', 'operator'].includes(r));
      }
    }
  });

  it('rute legger kelas (tahap 3C.2) memakai hak daftar rapor dan modul grades', () => {
    const ledger = eps.find((e) => e.method === 'GET' && e.url === '/v1/report-cards/ledger');
    const list = eps.find((e) => e.method === 'GET' && e.url === '/v1/report-cards');
    expect([ledger?.perms, ledger?.modules]).toEqual([list?.perms, list?.modules]);
    expect([ledger?.perms, ledger?.modules]).toEqual([['report_card:read'], ['grades']]);
    expect(ledger?.description).toContain('Izin: `report_card:read`');
    // Gerbang sama dengan daftar rapor untuk semua peran; kekhususan kelas (wali kelas) diperiksa di handler.
    for (const r of roleKeys) expect(allows(r, ledger!), r).toBe(allows(r, list!));
  });

  it('rute kelulusan (tahap 3C.4) memasang izin graduation:read/manage dan modul grades sesuai rancangan', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const reads = [
      find('GET', '/v1/academic-years/:id/graduation-policy'),
      find('GET', '/v1/academic-years/:id/school-exams'),
      find('GET', '/v1/school-exams/:id/scores'),
      find('GET', '/v1/academic-years/:id/graduations'),
    ];
    const writes = [
      find('PUT', '/v1/academic-years/:id/graduation-policy'),
      find('DELETE', '/v1/academic-years/:id/graduation-policy'),
      find('POST', '/v1/academic-years/:id/school-exams'),
      find('PUT', '/v1/school-exams/:id'),
      find('DELETE', '/v1/school-exams/:id'),
      find('PUT', '/v1/school-exams/:id/scores'),
      find('PUT', '/v1/academic-years/:id/graduations'),
      find('POST', '/v1/academic-years/:id/graduations/finalize'),
      find('POST', '/v1/academic-years/:id/graduations/reopen'),
      find('PUT', '/v1/academic-years/:id/graduations/diploma-numbers'),
    ];
    for (const e of reads) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['graduation:read'], ['grades']]);
      expect(e?.description).toContain('Izin: `graduation:read`');
    }
    for (const e of writes) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['graduation:manage'], ['grades']]);
      expect(e?.description).toContain('Izin: `graduation:manage`');
    }
    for (const r of roleKeys) {
      const holds = (p: string) => perms(r).has(p as never);
      for (const e of reads) expect(allows(r, e!), `${r} ${e?.url}`).toBe(holds('graduation:read'));
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(holds('graduation:manage'));
    }
    for (const r of ['guardian', 'student', 'principal', 'operator', 'teacher', 'treasurer'] as const) {
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(false);
    }
    // Wizard kenaikan tidak bergantung pada modul nilai.
    expect(find('PUT', '/v1/academic-years/:id/promotions')?.modules).toEqual([]);
  });

  it('rute kokurikuler (tahap 4.1) memasang cocurricular:read/manage dan modul grades', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const reads = [
      find('GET', '/v1/reference/profile-frameworks'),
      find('GET', '/v1/cocurricular/profile-items'),
      find('GET', '/v1/cocurricular/rubric-levels'),
    ];
    const writes = [
      find('POST', '/v1/cocurricular/profile-items/adopt'),
      find('PUT', '/v1/cocurricular/profile-items'),
      find('PUT', '/v1/cocurricular/rubric-levels'),
    ];
    for (const e of reads) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['cocurricular:read'], ['grades']]);
      expect(e?.description).toContain('Izin: `cocurricular:read`');
    }
    for (const e of writes) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['cocurricular:manage'], ['grades']]);
      expect(e?.description).toContain('Izin: `cocurricular:manage`');
    }
    const readers = ['school_admin', 'principal', 'curriculum', 'operator', 'teacher'];
    const writers = ['school_admin', 'curriculum'];
    for (const r of roleKeys) {
      for (const e of reads) expect(allows(r, e!), `${r} ${e?.url}`).toBe(readers.includes(r));
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(writers.includes(r));
    }
  });

  it('rute program kokurikuler (tahap 4.2) memasang cocurricular:read/manage dan modul grades', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const reads = [
      find('GET', '/v1/cocurricular/programs'),
      find('GET', '/v1/cocurricular/programs/:id'),
      find('GET', '/v1/cocurricular/periods-summary'),
    ];
    const writes = [
      find('POST', '/v1/cocurricular/programs'),
      find('PUT', '/v1/cocurricular/programs/:id'),
      find('DELETE', '/v1/cocurricular/programs/:id'),
      find('PUT', '/v1/cocurricular/programs/:id/classes'),
      find('PUT', '/v1/cocurricular/programs/:id/targets'),
      find('PUT', '/v1/cocurricular/programs/:id/facilitators'),
    ];
    for (const e of reads) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['cocurricular:read'], ['grades']]);
      expect(e?.description).toContain('Izin: `cocurricular:read`');
    }
    for (const e of writes) {
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['cocurricular:manage'], ['grades']]);
      expect(e?.description).toContain('Izin: `cocurricular:manage`');
    }
    const readers = ['school_admin', 'principal', 'curriculum', 'operator', 'teacher'];
    const writers = ['school_admin', 'curriculum'];
    for (const r of roleKeys) {
      for (const e of reads) expect(allows(r, e!), `${r} ${e?.url}`).toBe(readers.includes(r));
      for (const e of writes) expect(allows(r, e!), `${r} ${e?.url}`).toBe(writers.includes(r));
    }
  });

  it('rute penilaian dan bukti kokurikuler (tahap 4.3) memakai gerbang cocurricular:read dan modul grades; hak menilai kontekstual', () => {
    const find = (method: string, url: string) => eps.find((e) => e.method === method && e.url === url);
    const base = '/v1/cocurricular/programs/:id';
    const routes = [
      find('GET', `${base}/assessment-options`),
      find('GET', `${base}/assessments`),
      find('PUT', `${base}/assessments`),
      find('GET', `${base}/evidence`),
      find('POST', `${base}/evidence`),
      find('DELETE', `${base}/evidence/:evidenceId`),
    ];
    const readers = ['school_admin', 'principal', 'curriculum', 'operator', 'teacher'];
    for (const e of routes) {
      // Tidak ada izin baru: gerbang cukup baca; keputusan menilai (pengelola, koordinator, fasilitator rombel) ada di handler.
      expect([e?.perms, e?.modules], `${e?.method} ${e?.url}`).toEqual([['cocurricular:read'], ['grades']]);
      expect(e?.description).toContain('Izin: `cocurricular:read`');
      for (const r of roleKeys)
        expect(allows(r, e!), `${r} ${e?.method} ${e?.url}`).toBe(readers.includes(r));
    }
    expect(PERMISSIONS).not.toContain('cocurricular:assess');
  });

  it('rute ekspor akademik (tahap 3C.5) memasang data_export:run tanpa modul di gerbang', () => {
    const e = eps.find((x) => x.method === 'GET' && x.url === '/v1/exports/academic');
    // Modul grades hanya diperiksa di handler untuk dataset nilai (400 dataset_requires_module), bukan di gerbang rute.
    expect([e?.perms, e?.modules]).toEqual([['data_export:run'], []]);
    expect(e?.description).toContain('Izin: `data_export:run`');
    expect(e?.description).toContain('BUKAN format impor');
    for (const r of roleKeys) {
      expect(allows(r, e!), r).toBe(['school_admin', 'curriculum', 'operator'].includes(r));
    }
  });

  it('hanya admin sekolah yang mengelola peran dan anggota', () => {
    for (const r of roleKeys.filter((k) => k !== 'school_admin')) {
      expect(perms(r).has('role:manage'), r).toBe(false);
      expect(perms(r).has('member:manage'), r).toBe(false);
    }
  });
});

describe('NSM madrasah (tahap 4.5)', () => {
  it('PUT /v1/school/identifier memakai school:manage; GET cukup anggota sekolah', () => {
    const put = eps.find((e) => e.method === 'PUT' && e.url === '/v1/school/identifier');
    expect(put?.perms).toEqual(['school:manage']);
    expect(put?.description).toContain('Izin: `school:manage`');
    const get = eps.find((e) => e.method === 'GET' && e.url === '/v1/school/identifier');
    expect(get?.kind).toBe('tenant');
    for (const r of roleKeys) {
      const has = (SYSTEM_ROLES[r].permissions as readonly string[]).includes('school:manage');
      expect(allows(r, put!), r).toBe(has);
    }
  });
});

describe('route akun yayasan', () => {
  it('anggota sekolah yang bukan pemilik yayasan tidak melihat pemilik yayasan itu (404)', async () => {
    const ep = { method: 'GET', url: `/v1/account/foundations/${foundationId}/owners` } as Ep;
    for (const role of roleKeys) expect((await hit(role, ep)).statusCode, role).toBe(404);
  });
});

describe('route konsol platform', () => {
  it('semua peran sekolah (bahkan admin sekolah) ditolak di route staf platform', async () => {
    const bad: string[] = [];
    for (const role of roleKeys) {
      for (const ep of eps.filter((e) => e.kind === 'staff')) {
        const res = await hit(role, ep);
        if (res.statusCode !== 403) bad.push(`${role} ${ep.method} ${ep.url} -> ${res.statusCode}`);
      }
    }
    expect(bad).toEqual([]);
  }, 300_000);
});
