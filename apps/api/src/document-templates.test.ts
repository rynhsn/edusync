import { DEFAULT_DOCUMENT_TEMPLATE, DEFAULT_SIGNATURE_SLOTS } from '@edusync/contracts';
import {
  and,
  assignRoles,
  auditLog,
  documentTemplate,
  entitlement,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  subscription,
  user,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let schoolId = '';
let otherId = '';
let adminCookie = '';
let principalCookie = '';
let teacherCookie = '';
let otherCookie = '';
const userIds: string[] = [];

async function join(label: string, sid: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (
  method: 'GET' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  sid = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const custom = {
  title: 'SURAT KETERANGAN LULUS',
  subtitle: null,
  intro: 'Menerangkan bahwa {{nama_murid}} (NISN {{nisn}}) dinyatakan {{status_lulus}}.',
  body: null,
  sections: { criteria: false },
  signatures: DEFAULT_SIGNATURE_SLOTS.skl,
};

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Templat Dokumen', slug: `ytd-${run}` })
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
  const makeSchool = async (slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db.insert(entitlement).values({
        schoolId: s!.id,
        moduleKey,
        subscriptionId: sub!.id,
        validUntil: sub!.currentPeriodEnd,
      });
    }
    return s!.id;
  };
  schoolId = await makeSchool(`tdok-${run}`, ['grades', 'internship']);
  otherId = await makeSchool(`tdok-lain-${run}`, ['grades']);
  adminCookie = await join('admin-tdok', schoolId, ['school_admin']);
  principalCookie = await join('kepsek-tdok', schoolId, ['principal']);
  teacherCookie = await join('guru-tdok', schoolId, ['teacher']);
  otherCookie = await join('admin-tdok-lain', otherId, ['school_admin']);
});

afterAll(async () => {
  const db = app.platformDb;
  await db.delete(auditLog).where(eq(auditLog.schoolId, schoolId));
  await db.delete(documentTemplate).where(eq(documentTemplate.schoolId, schoolId));
  await db.delete(documentTemplate).where(eq(documentTemplate.schoolId, otherId));
  for (const id of userIds) await db.delete(user).where(eq(user.id, id));
  await app.close();
});

describe('templat dokumen (SKL dan sertifikat PKL)', () => {
  it('sekolah tanpa templat tersimpan mendapat bawaan', async () => {
    const r = await call('GET', '/v1/document-templates/skl', adminCookie);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ kind: 'skl', isDefault: true, updatedAt: null });
    expect(r.json().config).toEqual(DEFAULT_DOCUMENT_TEMPLATE);
  });

  it('menyimpan, membaca ulang, dan mencatat audit', async () => {
    const put = await call('PUT', '/v1/document-templates/skl', adminCookie, custom);
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({ isDefault: false });
    const get = await call('GET', '/v1/document-templates/skl', adminCookie);
    expect(get.json()).toMatchObject({ isDefault: false, config: custom });
    const logs = await app.platformDb
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.schoolId, schoolId), eq(auditLog.action, 'document_template.update')));
    expect(logs.length).toBeGreaterThan(0);
    // Simpan kedua menimpa (tetap satu baris).
    const again = await call('PUT', '/v1/document-templates/skl', adminCookie, { ...custom, title: 'SKL' });
    expect(again.statusCode, again.body).toBe(200);
    const rows = await app.platformDb
      .select()
      .from(documentTemplate)
      .where(eq(documentTemplate.schoolId, schoolId));
    expect(rows).toHaveLength(1);
  });

  it('menolak variabel dan bagian yang tidak dikenal serta isi tak sah', async () => {
    const v = await call('PUT', '/v1/document-templates/skl', adminCookie, {
      ...custom,
      intro: 'Halo {{nilai_akhir}}',
    });
    expect(v.statusCode).toBe(400);
    expect(v.json().error.code).toBe('unknown_variable');
    // Variabel milik PKL tidak berlaku di SKL, dan sebaliknya.
    const sig = await call('PUT', '/v1/document-templates/pkl_certificate', adminCookie, {
      ...custom,
      sections: {},
      signatures: [{ label: 'X', name: '{{nisn}}', note: '', placeDate: false }],
    });
    expect(sig.statusCode).toBe(400);
    const sec = await call('PUT', '/v1/document-templates/skl', adminCookie, {
      ...custom,
      sections: { aspects: false },
    });
    expect(sec.statusCode).toBe(400);
    expect(sec.json().error.code).toBe('unknown_section');
    const many = await call('PUT', '/v1/document-templates/skl', adminCookie, {
      ...custom,
      signatures: Array.from({ length: 5 }, () => ({ label: 'a', name: '', note: '', placeDate: false })),
    });
    expect(many.statusCode).toBe(400);
  });

  it('templat sekolah lain terpisah (RLS) dan modul dijaga', async () => {
    const other = await call('GET', '/v1/document-templates/skl', otherCookie, undefined, otherId);
    expect(other.json().isDefault).toBe(true);
    // Sekolah lain tidak punya modul internship.
    const noModule = await call(
      'GET',
      '/v1/document-templates/pkl_certificate',
      otherCookie,
      undefined,
      otherId,
    );
    expect(noModule.statusCode).toBe(403);
    // Header sekolah lain dengan cookie sekolah ini ditolak.
    const cross = await call('GET', '/v1/document-templates/skl', adminCookie, undefined, otherId);
    expect(cross.statusCode).toBe(403);
  });

  it('izin: kepala sekolah hanya membaca, guru tidak boleh membaca SKL', async () => {
    const read = await call('GET', '/v1/document-templates/skl', principalCookie);
    expect(read.statusCode).toBe(200);
    expect((await call('PUT', '/v1/document-templates/skl', principalCookie, custom)).statusCode).toBe(403);
    expect((await call('DELETE', '/v1/document-templates/skl', principalCookie)).statusCode).toBe(403);
    expect((await call('GET', '/v1/document-templates/skl', teacherCookie)).statusCode).toBe(403);
  });

  it('sertifikat PKL: simpan lalu kembalikan ke bawaan', async () => {
    const cfg = {
      ...DEFAULT_DOCUMENT_TEMPLATE,
      body: '{{nama_murid}} magang di {{mitra}} ({{periode}}) dengan nilai {{nilai_akhir}}.',
      sections: { aspects: false },
      signatures: DEFAULT_SIGNATURE_SLOTS.pkl_certificate,
    };
    expect((await call('PUT', '/v1/document-templates/pkl_certificate', adminCookie, cfg)).statusCode).toBe(
      200,
    );
    expect((await call('GET', '/v1/document-templates/pkl_certificate', adminCookie)).json().isDefault).toBe(
      false,
    );
    const del = await call('DELETE', '/v1/document-templates/pkl_certificate', adminCookie);
    expect(del.statusCode, del.body).toBe(200);
    const after = await call('GET', '/v1/document-templates/pkl_certificate', adminCookie);
    expect(after.json()).toMatchObject({ isDefault: true, config: DEFAULT_DOCUMENT_TEMPLATE });
    // Mengembalikan yang sudah bawaan tidak error.
    expect((await call('DELETE', '/v1/document-templates/pkl_certificate', adminCookie)).statusCode).toBe(
      200,
    );
  });

  it('terdokumentasi di OpenAPI', async () => {
    const spec = (await app.inject('/openapi.json')).json();
    const put = spec.paths['/v1/document-templates/skl'].put;
    expect(put.summary).toBeTruthy();
    expect(put.description).toContain('graduation:manage');
    expect(spec.paths['/v1/document-templates/pkl_certificate'].put.description).toContain('pkl:manage');
  });
});
