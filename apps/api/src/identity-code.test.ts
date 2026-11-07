import { readFileSync } from 'node:fs';
import { formatIdentityPayload } from '@edusync/contracts';
import {
  assignRoles,
  attendanceCard,
  eq,
  foundation,
  member,
  school,
  seedSchoolRoles,
  sql,
  student,
  studentIdentityCode,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { ensureIdentityCodes, resolveIdentityPayload, rotateIdentityCode } from './identity-code';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const QR_RE = /^ES1\.[0-9A-HJKMNP-TV-Z]{20}$/;

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolA = '';
let schoolB = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
const stu = { ani: '', budi: '', citra: '', dina: '', gone: '', asing: '' };

const inA = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app.tenantDb, [schoolA], fn);
const inB = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app.tenantDb, [schoolB], fn);

async function joinAdmin(label: string, sid: string) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await app.platformDb.insert(member).values({ userId: res.user.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, ['school_admin']);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Identitas', slug: `yi-${run}` })
    .returning();
  foundationId = f!.id;
  const make = async (slug: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug, name: `Sekolah ${slug}` })
      .returning();
    await seedSchoolRoles(db, s!.id);
    return s!.id;
  };
  // Sengaja TANPA entitlement modul apa pun: kode identitas tidak boleh bergantung pada modul.
  schoolA = await make(`idc-a-${run}`);
  schoolB = await make(`idc-b-${run}`);
  const mk = async (sid: string, name: string, nis: string) => {
    const [s] = await db.insert(student).values({ schoolId: sid, name, nis, gender: 'P' }).returning();
    return s!.id;
  };
  stu.ani = await mk(schoolA, 'Ani', `I${run}1`);
  stu.budi = await mk(schoolA, 'Budi', `I${run}2`);
  stu.citra = await mk(schoolA, 'Citra', `I${run}3`);
  stu.dina = await mk(schoolA, 'Dina', `I${run}4`);
  stu.gone = await mk(schoolA, 'Hilang', `I${run}5`);
  stu.asing = await mk(schoolB, 'Asing', `I${run}9`);
  adminCookie = await joinAdmin('admin-idc', schoolA);
});

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolA, schoolB]) {
    for (const table of [
      'audit_log',
      'student_identity_code',
      'attendance_card',
      'student',
      'member',
      'role',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

const rowsOf = (studentId: string) =>
  app.platformDb.select().from(studentIdentityCode).where(eq(studentIdentityCode.studentId, studentId));

describe('ensureIdentityCodes', () => {
  it('membuat kode malas, idempoten, satu per siswa, format Crockford 20 karakter', async () => {
    const first = await inA((tx) => ensureIdentityCodes(tx, schoolA, [stu.ani, stu.budi, stu.ani]));
    expect(first.created).toBe(2);
    expect(first.codes.size).toBe(2);
    for (const code of first.codes.values()) expect(formatIdentityPayload(code)).toMatch(QR_RE);
    expect(new Set(first.codes.values()).size).toBe(2);

    const again = await inA((tx) => ensureIdentityCodes(tx, schoolA, [stu.ani, stu.budi]));
    expect(again.created).toBe(0);
    expect(again.codes.get(stu.ani)).toBe(first.codes.get(stu.ani));
    expect(await rowsOf(stu.ani)).toHaveLength(1);
    expect((await inA((tx) => ensureIdentityCodes(tx, schoolA, []))).codes.size).toBe(0);
  });

  it('permintaan serentak tidak membuat dua kode untuk siswa yang sama', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => inA((tx) => ensureIdentityCodes(tx, schoolA, [stu.citra]))),
    );
    expect(new Set(results.map((r) => r.codes.get(stu.citra))).size).toBe(1);
    expect(results.reduce((n, r) => n + r.created, 0)).toBe(1);
    expect(await rowsOf(stu.citra)).toHaveLength(1);
  });
});

describe('resolveIdentityPayload', () => {
  it('kode sah menunjuk siswa; format salah 400 invalid_qr; kode tak dikenal 404 unknown_qr', async () => {
    const { codes } = await inA((tx) => ensureIdentityCodes(tx, schoolA, [stu.dina]));
    const payload = formatIdentityPayload(codes.get(stu.dina) as string);
    const ok = await inA((tx) => resolveIdentityPayload(tx, payload));
    expect(ok).toMatchObject({
      studentId: stu.dina,
      name: 'Dina',
      nis: `I${run}4`,
      status: 'active',
      active: true,
      className: null,
    });
    // Huruf kecil dan spasi di tepi ditoleransi.
    expect((await inA((tx) => resolveIdentityPayload(tx, ` ${payload.toLowerCase()} `))).studentId).toBe(
      stu.dina,
    );

    for (const bad of ['halo', 'ES1.ABC', `ES2.${'A'.repeat(20)}`, `${payload}X`, '']) {
      await expect(inA((tx) => resolveIdentityPayload(tx, bad))).rejects.toMatchObject({
        status: 400,
        code: 'invalid_qr',
      });
    }
    await expect(inA((tx) => resolveIdentityPayload(tx, `ES1.${'A'.repeat(20)}`))).rejects.toMatchObject({
      status: 404,
      code: 'unknown_qr',
    });
  });

  it('siswa yang sudah dihapus tidak dikenal; siswa tidak aktif tetap teridentifikasi (active=false)', async () => {
    const { codes } = await inA((tx) => ensureIdentityCodes(tx, schoolA, [stu.gone]));
    const payload = formatIdentityPayload(codes.get(stu.gone) as string);
    await app.platformDb.update(student).set({ status: 'graduated' }).where(eq(student.id, stu.gone));
    const graduated = await inA((tx) => resolveIdentityPayload(tx, payload));
    expect(graduated).toMatchObject({ studentId: stu.gone, status: 'graduated', active: false });
    await app.platformDb.update(student).set({ deletedAt: new Date() }).where(eq(student.id, stu.gone));
    await expect(inA((tx) => resolveIdentityPayload(tx, payload))).rejects.toMatchObject({
      code: 'unknown_qr',
    });
  });
});

describe('rotateIdentityCode', () => {
  it('mengganti kode di tempat: kode lama tidak berlaku, baris sama, rotated_at terisi', async () => {
    const { codes } = await inA((tx) => ensureIdentityCodes(tx, schoolA, [stu.ani]));
    const old = formatIdentityPayload(codes.get(stu.ani) as string);
    const [before] = await rowsOf(stu.ani);
    expect(before?.rotatedAt).toBeNull();

    const next = await inA((tx) => rotateIdentityCode(tx, schoolA, stu.ani));
    expect(next).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(next).not.toBe(codes.get(stu.ani));
    const after = await rowsOf(stu.ani);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before?.id);
    expect(after[0]?.rotatedAt).toBeInstanceOf(Date);

    await expect(inA((tx) => resolveIdentityPayload(tx, old))).rejects.toMatchObject({ code: 'unknown_qr' });
    expect(
      (await inA((tx) => resolveIdentityPayload(tx, formatIdentityPayload(next as string)))).studentId,
    ).toBe(stu.ani);
  });

  it('siswa tanpa kode langsung mendapat kode baru; siswa tak ada atau milik sekolah lain null', async () => {
    const fresh = await inA((tx) => rotateIdentityCode(tx, schoolA, crypto.randomUUID()));
    expect(fresh).toBeNull();
    await app.platformDb.delete(studentIdentityCode).where(eq(studentIdentityCode.studentId, stu.budi));
    const created = await inA((tx) => rotateIdentityCode(tx, schoolA, stu.budi));
    expect(created).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(await rowsOf(stu.budi)).toHaveLength(1);
    expect(await inA((tx) => rotateIdentityCode(tx, schoolA, stu.asing))).toBeNull();
  });

  it('rotasi serentak tetap menyisakan tepat satu baris', async () => {
    await Promise.all(
      Array.from({ length: 5 }, () => inA((tx) => rotateIdentityCode(tx, schoolA, stu.citra))),
    );
    expect(await rowsOf(stu.citra)).toHaveLength(1);
  });
});

describe('isolasi antarsekolah (RLS)', () => {
  it('kode sekolah lain tidak terbaca, tidak teridentifikasi, dan tidak bisa disisipkan lintas sekolah', async () => {
    const { codes } = await inB((tx) => ensureIdentityCodes(tx, schoolB, [stu.asing]));
    const asing = formatIdentityPayload(codes.get(stu.asing) as string);
    const ani = formatIdentityPayload(
      (await inA((tx) => ensureIdentityCodes(tx, schoolA, [stu.ani]))).codes.get(stu.ani) as string,
    );

    await expect(inA((tx) => resolveIdentityPayload(tx, asing))).rejects.toMatchObject({
      code: 'unknown_qr',
    });
    await expect(inB((tx) => resolveIdentityPayload(tx, ani))).rejects.toMatchObject({ code: 'unknown_qr' });
    expect(await inB((tx) => tx.select().from(studentIdentityCode))).toHaveLength(1);

    await expect(
      inB((tx) =>
        tx
          .insert(studentIdentityCode)
          .values({ schoolId: schoolA, studentId: stu.ani, code: 'Z'.repeat(20) }),
      ),
    ).rejects.toThrow();
  });
});

describe('batas dengan kiosk RFID dan modul', () => {
  it('kode identitas tidak pernah ada di attendance_card', async () => {
    const { codes } = await inA((tx) => ensureIdentityCodes(tx, schoolA, [stu.ani]));
    const code = codes.get(stu.ani) as string;
    const rows = await app.platformDb.select().from(attendanceCard).where(eq(attendanceCard.code, code));
    expect(rows).toHaveLength(0);
    const kinds = await app.platformDb.execute(sql`select distinct kind from attendance_card`);
    expect(kinds.rows.every((r) => (r as { kind: string }).kind === 'rfid')).toBe(true);
  });

  it('endpoint kode identitas tidak butuh modul absensi, tetapi pemindai absensi tetap butuh modulnya', async () => {
    const h = { cookie: adminCookie, 'x-school-id': schoolA, origin };
    const got = await app.inject({
      method: 'GET',
      url: `/v1/students/${stu.dina}/identity-code`,
      headers: h,
    });
    expect(got.statusCode).toBe(200);
    const qr = got.json().qr as string;
    expect(qr).toMatch(QR_RE);

    const scan = await app.inject({
      method: 'POST',
      url: '/v1/gate/scan',
      headers: { ...h, 'content-type': 'application/json' },
      payload: { payload: qr, direction: 'in' },
    });
    expect(scan.statusCode).toBe(403);
    expect(scan.json().error.code).toBe('module_disabled');
  });
});

describe('migrasi 0074', () => {
  it('menyalin kode QR lama dengan nilai persis sama lalu menghapusnya dari attendance_card', () => {
    const sqlText = readFileSync(
      new URL('../../../packages/db/drizzle/0074_student_identity_code.sql', import.meta.url),
      'utf8',
    );
    expect(sqlText).toMatch(
      /INSERT INTO "student_identity_code"[\s\S]+SELECT[\s\S]+"code"[\s\S]+FROM "attendance_card"[\s\S]+WHERE "kind" = 'qr'/,
    );
    expect(sqlText).toMatch(/DELETE FROM "attendance_card" WHERE "kind" = 'qr'/);
    expect(sqlText.indexOf('INSERT INTO "student_identity_code"')).toBeLessThan(
      sqlText.indexOf('DELETE FROM "attendance_card"'),
    );
    expect(sqlText).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sqlText).toMatch(/UNIQUE\("school_id","code"\)/);
    expect(sqlText).toMatch(/"student_identity_code_student_uq" UNIQUE\("student_id"\)/);
  });
});
