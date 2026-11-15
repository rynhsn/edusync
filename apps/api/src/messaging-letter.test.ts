import { createHash } from 'node:crypto';
import {
  assignRoles,
  entitlement,
  eq,
  foundation,
  letter,
  member,
  msgAttachment,
  school,
  seedSchoolRoles,
  signedDocument,
  signerCredential,
  sql,
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
let schoolId = '';
let otherId = '';
let noMessagingId = '';
let foundationId = '';
const userIds: string[] = [];
const cookies = { admin: '', principal: '', operator: '', teacher: '', other: '', noMessaging: '' };

const pdf = (tag: string) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(tag)]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

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
  return { cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id };
}
const upload = (letterId: string, cookie: string, bytes: Buffer, sid: string = schoolId) =>
  app.inject({
    method: 'POST',
    url: `/v1/letters/${letterId}/whatsapp-attachment`,
    headers: { cookie, 'x-school-id': sid, origin, 'content-type': 'application/json' },
    payload: { fileName: 'Surat Panggilan.pdf', dataBase64: bytes.toString('base64') },
  });
const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;

let signerId = '';
let operatorSignerId = '';
let seq = 0;
/** Surat keluar bertanda tangan langsung lewat DB (alur tanda tangan sudah diuji di letters.test.ts). */
async function makeLetter(opts: {
  status?: 'draft' | 'signed' | 'revoked';
  hash?: string | null;
  revoked?: boolean;
  sid?: string;
  signer?: string;
}) {
  const sid = opts.sid ?? schoolId;
  const db = app.platformDb;
  const [l] = await db
    .insert(letter)
    .values({
      schoolId: sid,
      direction: 'outgoing',
      number: `WA/${run}/${++seq}`,
      subject: 'Pemanggilan orang tua',
      party: 'Orang tua',
      letterDate: '2036-01-01',
      status: opts.status ?? 'signed',
      createdBy: 'test',
    })
    .returning();
  if ((opts.status ?? 'signed') !== 'draft') {
    await db.insert(signedDocument).values({
      schoolId: sid,
      letterId: l!.id,
      signerId: opts.signer ?? signerId,
      token: `tok-${run}-${seq}`,
      pdfSha256: opts.hash ?? null,
      signerName: 'Kepala',
      signerTitle: 'Kepala Sekolah',
      ...(opts.revoked ? { revokedAt: new Date(), revokedReason: 'salah' } : {}),
    });
  }
  return l!.id;
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MESSAGING_PROVIDER: undefined }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Surat WA', slug: `ysuratwa-${run}` })
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
  const make = async (slug: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `SMP ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await make(`lsw-${run}`, ['messaging', 'administration']);
  otherId = await make(`lsw-lain-${run}`, ['messaging', 'administration']);
  noMessagingId = await make(`lsw-nomsg-${run}`, ['administration']);
  const admin = await join('admin-lsw', schoolId, ['school_admin']);
  const principal = await join('kepsek-lsw', schoolId, ['principal']);
  const operator = await join('operator-lsw', schoolId, ['operator']);
  cookies.admin = admin.cookie;
  cookies.principal = principal.cookie;
  cookies.operator = operator.cookie;
  cookies.teacher = (await join('guru-lsw', schoolId, ['teacher'])).cookie;
  cookies.other = (await join('admin-lain-lsw', otherId, ['school_admin'])).cookie;
  cookies.noMessaging = (await join('admin-nomsg-lsw', noMessagingId, ['school_admin'])).cookie;
  const [sc] = await db
    .insert(signerCredential)
    .values({ schoolId, memberId: principal.memberId, name: 'Kepala', title: 'Kepala Sekolah' })
    .returning();
  signerId = sc!.id;
  const [sc2] = await db
    .insert(signerCredential)
    .values({ schoolId, memberId: operator.memberId, name: 'Operator', title: 'TU' })
    .returning();
  operatorSignerId = sc2!.id;
});

afterAll(async () => {
  const db = app.platformDb;
  const sids = [schoolId, otherId, noMessagingId];
  // Tabel dulu, sekolah kemudian: surat sekolah tanpa modul memakai penandatangan sekolah lain.
  for (const table of [
    'msg_batch',
    'msg_attachment',
    'audit_log',
    'signed_document',
    'letter',
    'signer_credential',
    'member',
    'role',
    'entitlement',
  ]) {
    for (const sid of sids) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
  }
  for (const sid of sids) await db.delete(school).where(eq(school.id, sid));
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('PDF surat sebagai lampiran WhatsApp', () => {
  it('hash cocok: lampiran tersimpan, bisa diunduh pengirim, audit letter.whatsapp tercatat', async () => {
    const bytes = pdf('cocok');
    const id = await makeLetter({ hash: sha(bytes) });
    const res = await upload(id, cookies.operator, bytes);
    expect(res.statusCode).toBe(200);
    const meta = res.json();
    expect(meta).toMatchObject({
      fileName: 'Surat Panggilan.pdf',
      mime: 'application/pdf',
      size: bytes.length,
      purged: false,
    });
    const [row] = await app.platformDb.select().from(msgAttachment).where(eq(msgAttachment.id, meta.id));
    expect(row?.sha256).toBe(sha(bytes));
    const audits = await app.platformDb.execute(
      sql`select 1 from audit_log where school_id = ${schoolId} and action = 'letter.whatsapp' and entity_id = ${id}`,
    );
    expect(audits.rows).toHaveLength(1);
    const dl = await app.inject({
      method: 'GET',
      url: `/v1/messaging/attachments/${meta.id}/content`,
      headers: { cookie: cookies.operator, 'x-school-id': schoolId, origin },
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.equals(bytes)).toBe(true);
  });

  it('hash tidak cocok: 409 hash_mismatch dan tidak ada lampiran baru', async () => {
    const id = await makeLetter({ hash: sha(pdf('asli')) });
    const count = async () =>
      (await app.platformDb.select().from(msgAttachment).where(eq(msgAttachment.schoolId, schoolId))).length;
    const before = await count();
    const res = await upload(id, cookies.admin, pdf('diubah'));
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('hash_mismatch');
    expect(await count()).toBe(before);
  });

  it('hash belum terdaftar: penandatangan mendaftarkannya sekali; yang bukan penandatangan dan tanpa letter:manage ditolak', async () => {
    const bytes = pdf('baru');
    const id = await makeLetter({ hash: null });
    expect((await upload(id, cookies.principal, bytes)).statusCode).toBe(200);
    const [sd] = await app.platformDb.select().from(signedDocument).where(eq(signedDocument.letterId, id));
    expect(sd?.pdfSha256).toBe(sha(bytes));
    expect(code(await upload(id, cookies.principal, pdf('lain')))).toBe('hash_mismatch');
    expect((await upload(id, cookies.principal, bytes)).statusCode).toBe(200);
    // Kepala sekolah tanpa letter:manage dan bukan penandatangan surat ini: hash tidak didaftarkan.
    const foreign = await makeLetter({ hash: null, signer: operatorSignerId });
    const res = await upload(foreign, cookies.principal, bytes);
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('hash_not_registered');
    const [still] = await app.platformDb
      .select()
      .from(signedDocument)
      .where(eq(signedDocument.letterId, foreign));
    expect(still?.pdfSha256).toBeNull();
    // Pengelola surat (admin) boleh mendaftarkannya.
    expect((await upload(foreign, cookies.admin, bytes)).statusCode).toBe(200);
  });

  it('surat dicabut, draf, bukan PDF, atau tak dikenal ditolak', async () => {
    const bytes = pdf('x');
    const revoked = await makeLetter({ status: 'revoked', hash: sha(bytes), revoked: true });
    expect(code(await upload(revoked, cookies.admin, bytes))).toBe('revoked');
    const draft = await makeLetter({ status: 'draft' });
    expect(code(await upload(draft, cookies.admin, bytes))).toBe('not_signed');
    const ok = await makeLetter({ hash: sha(bytes) });
    const notPdf = await upload(ok, cookies.admin, Buffer.from('<html>bukan pdf</html>'));
    expect(notPdf.statusCode).toBe(400);
    expect(code(notPdf)).toBe('attachment_type');
    expect((await upload('019a0000-0000-7000-8000-000000000000', cookies.admin, bytes)).statusCode).toBe(404);
  });

  it('izin: guru 403, tanpa sesi 401, sekolah tanpa modul messaging 403; admin, kepala sekolah, operator boleh', async () => {
    const bytes = pdf('izin');
    const id = await makeLetter({ hash: sha(bytes) });
    expect((await upload(id, cookies.teacher, bytes)).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: `/v1/letters/${id}/whatsapp-attachment`, payload: {} }))
        .statusCode,
    ).toBe(401);
    const noMsgLetter = await makeLetter({ hash: sha(bytes), sid: noMessagingId });
    const blocked = await upload(noMsgLetter, cookies.noMessaging, bytes, noMessagingId);
    expect(blocked.statusCode).toBe(403);
    expect(code(blocked)).toBe('module_disabled');
    for (const c of [cookies.admin, cookies.principal, cookies.operator]) {
      expect((await upload(id, c, bytes)).statusCode).toBe(200);
    }
  });

  it('tenant: surat sekolah lain tidak terlihat (404) dan tidak ada lampiran terbuat', async () => {
    const bytes = pdf('tenant');
    const id = await makeLetter({ hash: sha(bytes) });
    const res = await upload(id, cookies.other, bytes, otherId);
    expect(res.statusCode).toBe(404);
    const rows = await app.platformDb.select().from(msgAttachment).where(eq(msgAttachment.schoolId, otherId));
    expect(rows).toHaveLength(0);
  });
});
