import { executeRule, runAutoBilling } from '@edusync/billing';
import {
  academicYear,
  and,
  assignRoles,
  auditLog,
  classRoom,
  count,
  type Db,
  enrollment,
  entitlement,
  eq,
  finAutoBillingRule,
  finAutoBillingRun,
  finFeeType,
  finInvoice,
  foundation,
  inArray,
  member,
  outbox,
  school,
  seedSchoolRoles,
  semester,
  sql,
  student,
  subscription,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

/** Tahun ajaran berjalan menurut jam sistem: Juli Y0 sampai Juni Y0+1 (tes tidak bergantung pada tanggal hari ini). */
const nowReal = new Date();
const Y0 = nowReal.getUTCMonth() + 1 >= 7 ? nowReal.getUTCFullYear() : nowReal.getUTCFullYear() - 1;
const YEAR_NAME = `${Y0}/${Y0 + 1}`;
const pad = (n: number) => String(n).padStart(2, '0');
/** Tanggal TTTT-BB-HH pada bulan `m` (1..12) tahun ajaran. */
const ymd = (m: number, d: number) => `${m >= 7 ? Y0 : Y0 + 1}-${pad(m)}-${pad(d)}`;
const ym = (m: number) => ymd(m, 1).slice(0, 7);
/** Instan jam 02:00 WIB pada tanggal itu. */
const at = (date: string, time = '02:00') => new Date(`${date}T${time}:00+07:00`);

let app: Awaited<ReturnType<typeof buildApp>>;
let db: Db;
let schoolId = '';
let otherSchoolId = '';
let foundationId = '';
let otherFoundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let adminEmail = '';
let principalCookie = '';
let teacherCookie = '';
let otherRuleId = '';

const ids = { year: '', class7A: '', class8A: '', ani: '', budi: '', citra: '' };

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
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
  opts: { cookie?: string; school?: string } = {},
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: opts.cookie ?? adminCookie,
      'x-school-id': opts.school ?? schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

async function makeSchool(label: string, fId: string, subId: string, validUntil: Date) {
  const [s] = await db
    .insert(school)
    .values({ foundationId: fId, slug: `${label}-${run}`, name: `Sekolah ${label}-${run}` })
    .returning();
  await seedSchoolRoles(db, s!.id);
  await db
    .insert(entitlement)
    .values({ schoolId: s!.id, moduleKey: 'finance', subscriptionId: subId, validUntil });
  return s!.id;
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Tagihan Otomatis', slug: `yab-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000),
    })
    .returning();
  schoolId = await makeSchool('ab', foundationId, sub!.id, sub!.currentPeriodEnd);
  otherSchoolId = await makeSchool('ab2', foundationId, sub!.id, sub!.currentPeriodEnd);
  otherFoundationId = foundationId;

  const [y] = await db
    .insert(academicYear)
    .values({
      schoolId,
      name: YEAR_NAME,
      startsOn: `${Y0}-07-01`,
      endsOn: `${Y0 + 1}-06-30`,
      isActive: true,
    })
    .returning();
  ids.year = y!.id;
  await db.insert(semester).values([
    { schoolId, academicYearId: ids.year, name: 'Ganjil', startsOn: `${Y0}-07-13`, endsOn: `${Y0}-12-19` },
    {
      schoolId,
      academicYearId: ids.year,
      name: 'Genap',
      startsOn: `${Y0 + 1}-01-04`,
      endsOn: `${Y0 + 1}-06-26`,
    },
  ]);
  const mkClass = async (name: string, level: string) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: ids.year, name, level })
      .returning();
    return c!.id;
  };
  ids.class7A = await mkClass('7A', '7');
  ids.class8A = await mkClass('8A', '8');
  const mkStudent = async (classId: string, name: string, nis: string) => {
    const [st] = await db.insert(student).values({ schoolId, name, nis, gender: 'L' }).returning();
    await db.insert(enrollment).values({ schoolId, studentId: st!.id, classId, academicYearId: ids.year });
    return st!.id;
  };
  ids.ani = await mkStudent(ids.class7A, 'Ani', 'AB1');
  ids.budi = await mkStudent(ids.class7A, 'Budi', 'AB2');
  ids.citra = await mkStudent(ids.class8A, 'Citra', 'AB3');

  const admin = await makeUser('admin-ab');
  adminEmail = admin.email;
  const [m] = await db.insert(member).values({ userId: admin.id, schoolId }).returning();
  await assignRoles(db, m!.id, schoolId, ['school_admin']);
  adminCookie = await login(admin.email);

  const principal = await makeUser('principal-ab');
  const [pm] = await db.insert(member).values({ userId: principal.id, schoolId }).returning();
  await assignRoles(db, pm!.id, schoolId, ['principal']);
  principalCookie = await login(principal.email);

  const teacher = await makeUser('teacher-ab');
  const [tm] = await db.insert(member).values({ userId: teacher.id, schoolId }).returning();
  await assignRoles(db, tm!.id, schoolId, ['teacher']);
  teacherCookie = await login(teacher.email);

  // Aturan milik sekolah lain untuk uji isolasi.
  const [otherFee] = await db
    .insert(finFeeType)
    .values({ schoolId: otherSchoolId, name: `SPP lain ${run}`, kind: 'monthly' })
    .returning();
  const [otherRule] = await db
    .insert(finAutoBillingRule)
    .values({
      schoolId: otherSchoolId,
      feeTypeId: otherFee!.id,
      dueMode: 'fixed_day',
      runDay: 5,
      dueDay: 10,
      createdBy: 'test',
    })
    .returning();
  otherRuleId = otherRule!.id;
});

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'outbox',
      'fin_auto_billing_run',
      'fin_auto_billing_rule',
      'fin_invoice',
      'fin_fee_target',
      'fin_fee_plan',
      'fin_fee_type',
      'fin_counter',
      'enrollment',
      'class_room',
      'student',
      'semester',
      'academic_year',
      'member',
      'role',
      'entitlement',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db.delete(school).where(eq(school.id, sid));
  }
  await db.execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db.delete(foundation).where(eq(foundation.id, otherFoundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

beforeEach(async () => {
  // Tiap tes memulai dari nol aturan dan log (log ikut terhapus lewat cascade).
  await db.delete(finAutoBillingRule).where(eq(finAutoBillingRule.schoolId, schoolId));
  await db.delete(outbox).where(eq(outbox.schoolId, schoolId));
});

let feeSeq = 0;
/** Jenis biaya lewat API dengan tarif satu tingkat (7 dan 8) atau tanpa tarif. */
async function fee(
  kind: 'monthly' | 'semester' | 'one_time' | 'yearly',
  opts: { plan?: number | null; extra?: object } = {},
) {
  const name = `Biaya ${kind} ${++feeSeq} ${run}`;
  const res = await call('POST', '/v1/finance/fee-types', { name, kind, ...opts.extra });
  expect(res.statusCode).toBe(201);
  const id = res.json().id as string;
  if (opts.plan !== null) {
    const plan = await call('PUT', '/v1/finance/fee-plans', {
      academicYearId: ids.year,
      feeTypeId: id,
      level: null,
      amount: opts.plan ?? 100_000,
    });
    expect(plan.statusCode).toBe(200);
  }
  return { id, name };
}

async function rule(feeTypeId: string, over: Partial<typeof finAutoBillingRule.$inferInsert> = {}) {
  const [r] = await db
    .insert(finAutoBillingRule)
    .values({
      schoolId,
      feeTypeId,
      dueMode: 'fixed_day',
      runDay: 5,
      dueDay: 10,
      createdBy: 'test',
      ...over,
    })
    .returning();
  return r!.id;
}

const sweep = (now: Date, database: Db = db) => runAutoBilling(database, { now, schoolIds: [schoolId] });
const invoicesOf = (feeTypeId: string) =>
  db.select().from(finInvoice).where(eq(finInvoice.feeTypeId, feeTypeId));
const runsOf = (ruleId: string) =>
  db
    .select()
    .from(finAutoBillingRun)
    .where(eq(finAutoBillingRun.ruleId, ruleId))
    .orderBy(finAutoBillingRun.startedAt);

describe('penagihan otomatis: bulanan', () => {
  it('membuat tagihan pada tanggal jalan dengan jatuh tempo yang benar, idempoten pada sapuan berikutnya', async () => {
    const f = await fee('monthly');
    const ruleId = await rule(f.id);

    // Sehari sebelum tanggal jalan: belum ada apa pun.
    await sweep(at(ymd(8, 4)));
    expect(await invoicesOf(f.id)).toHaveLength(0);
    expect(await runsOf(ruleId)).toHaveLength(0);

    const first = await sweep(at(ymd(8, 5)));
    expect(first.ran).toHaveLength(1);
    expect(first.ran[0]).toMatchObject({
      period: ym(8),
      status: 'ok',
      created: 3,
      skipped: 0,
      trigger: 'auto',
    });
    const rows = await invoicesOf(f.id);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r).toMatchObject({
        period: ym(8),
        dueDate: ymd(8, 10),
        amount: 100_000,
        createdBy: 'system:auto-billing',
      });
      expect(r.title).toContain('Agustus');
    }

    // Sapuan ulang di hari dan hari-hari berikutnya: tidak ada tagihan ganda maupun baris log baru.
    await sweep(at(ymd(8, 5), '12:00'));
    await sweep(at(ymd(8, 20)));
    expect(await invoicesOf(f.id)).toHaveLength(3);
    const runs = await runsOf(ruleId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: 'ok',
      createdCount: 3,
      trigger: 'auto',
      academicYearId: ids.year,
    });

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.schoolId, schoolId), eq(auditLog.action, 'finance.auto_billing_run')));
    expect(audits.some((a) => a.entityId === ruleId)).toBe(true);
  });

  it('jatuh tempo di bulan berikutnya bila tanggalnya lebih kecil dari tanggal pembuatan', async () => {
    const f = await fee('monthly');
    await rule(f.id, { runDay: 25, dueDay: 3 });
    await sweep(at(ymd(9, 25)));
    const rows = await invoicesOf(f.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.dueDate === ymd(10, 3) && r.period === ym(9))).toBe(true);
  });

  it('days_after: jatuh tempo N hari setelah tanggal pembuatan', async () => {
    const f = await fee('monthly');
    await rule(f.id, { dueMode: 'days_after', dueDay: null, dueDays: 14 });
    await sweep(at(ymd(8, 5)));
    expect((await invoicesOf(f.id)).every((r) => r.dueDate === ymd(8, 19))).toBe(true);
  });

  it('catch-up: worker mati beberapa hari tetap membuat bulan berjalan, tanpa backfill bulan lalu', async () => {
    const f = await fee('monthly');
    const ruleId = await rule(f.id);
    // Worker baru hidup lagi pada 20 September; Agustus dan September tertinggal.
    await sweep(at(ymd(9, 20)));
    const rows = await invoicesOf(f.id);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.period))).toEqual(new Set([ym(9)]));
    expect(rows.every((r) => r.dueDate === ymd(9, 10))).toBe(true);
    expect((await runsOf(ruleId)).map((r) => r.period)).toEqual([ym(9)]);
  });

  it('aturan nonaktif diabaikan penjadwal', async () => {
    const f = await fee('monthly');
    await rule(f.id, { enabled: false });
    const r = await sweep(at(ymd(8, 5)));
    expect(r.rules).toBe(0);
    expect(await invoicesOf(f.id)).toHaveLength(0);
  });

  it('idempoten terhadap tagihan manual: tagihan yang sudah ada dilewati', async () => {
    const f = await fee('monthly');
    const ruleId = await rule(f.id);
    const manual = await call('POST', '/v1/finance/invoices/generate', {
      academicYearId: ids.year,
      feeTypeId: f.id,
      period: ym(10),
      classId: null,
      dueDate: ymd(10, 15),
    });
    expect(manual.statusCode).toBe(200);
    expect(manual.json().created).toBe(3);
    const r = await sweep(at(ymd(10, 5)));
    expect(r.ran[0]).toMatchObject({ status: 'ok', created: 0, skipped: 3 });
    const rows = await invoicesOf(f.id);
    expect(rows).toHaveLength(3);
    // Jatuh tempo manual tidak ditimpa.
    expect(rows.every((x) => x.dueDate === ymd(10, 15))).toBe(true);
    expect((await runsOf(ruleId))[0]?.status).toBe('ok');
  });

  it('pembatas kelas: hanya siswa kelas terpilih yang ditagih', async () => {
    const f = await fee('monthly');
    await rule(f.id, { classIds: [ids.class7A] });
    await sweep(at(ymd(8, 5)));
    const rows = await invoicesOf(f.id);
    expect(rows.map((r) => r.studentId).sort()).toEqual([ids.ani, ids.budi].sort());
  });

  it('pembatas kelas yang tidak ada di tahun ajaran aktif: partial, tidak menagih siapa pun', async () => {
    const f = await fee('monthly');
    const ruleId = await rule(f.id, { classIds: ['00000000-0000-7000-8000-000000000001'] });
    await sweep(at(ymd(8, 5)));
    expect(await invoicesOf(f.id)).toHaveLength(0);
    const runs = await runsOf(ruleId);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('partial');
    expect(runs[0]?.error).toContain('Kelas pembatas');
  });

  it('cakupan jenis biaya (kelas) tetap dihormati', async () => {
    const f = await fee('monthly', { extra: { scope: 'class', classIds: [ids.class8A] } });
    await rule(f.id);
    await sweep(at(ymd(8, 5)));
    const rows = await invoicesOf(f.id);
    expect(rows.map((r) => r.studentId)).toEqual([ids.citra]);
  });

  it('tanpa tarif: partial dengan missingPlan; log tidak dobel; setelah tarif ada, tagihan dibuat dan status ok', async () => {
    const f = await fee('monthly', { plan: null });
    const ruleId = await rule(f.id);
    const r1 = await sweep(at(ymd(8, 5)));
    expect(r1.ran[0]).toMatchObject({ status: 'partial', created: 0, missingPlan: 3 });
    expect(r1.ran[0]?.error).toContain('belum punya tarif');
    expect(await invoicesOf(f.id)).toHaveLength(0);

    // Percobaan harian berikutnya dengan hasil sama hanya menyentuh baris yang ada.
    await sweep(at(ymd(8, 6)));
    expect(await runsOf(ruleId)).toHaveLength(1);

    const plan = await call('PUT', '/v1/finance/fee-plans', {
      academicYearId: ids.year,
      feeTypeId: f.id,
      level: null,
      amount: 250_000,
    });
    expect(plan.statusCode).toBe(200);
    const r2 = await sweep(at(ymd(8, 7)));
    expect(r2.ran[0]).toMatchObject({ status: 'ok', created: 3, missingPlan: 0 });
    expect(await invoicesOf(f.id)).toHaveLength(3);
    const runs = await runsOf(ruleId);
    expect(runs.map((r) => r.status)).toEqual(['partial', 'ok']);
    // Sesudah ok, sapuan lagi tidak membuat baris.
    await sweep(at(ymd(8, 8)));
    expect(await runsOf(ruleId)).toHaveLength(2);
  });

  it('jenis biaya nonaktif: dilewati dan dicatat skipped sekali, tanpa tagihan', async () => {
    const f = await fee('monthly');
    const ruleId = await rule(f.id);
    await db.update(finFeeType).set({ active: false }).where(eq(finFeeType.id, f.id));
    await sweep(at(ymd(8, 5)));
    await sweep(at(ymd(8, 6)));
    expect(await invoicesOf(f.id)).toHaveLength(0);
    const runs = await runsOf(ruleId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'skipped', createdCount: 0 });
    expect(runs[0]?.error).toContain('tidak aktif');
    // Diaktifkan kembali: sapuan berikutnya langsung menagih bulan berjalan.
    await db.update(finFeeType).set({ active: true }).where(eq(finFeeType.id, f.id));
    await sweep(at(ymd(8, 7)));
    expect(await invoicesOf(f.id)).toHaveLength(3);
  });

  it('sekolah ditangguhkan dan modul keuangan mati: dilewati', async () => {
    const f = await fee('monthly');
    const ruleId = await rule(f.id);
    await db.update(school).set({ status: 'suspended' }).where(eq(school.id, schoolId));
    try {
      await sweep(at(ymd(8, 5)));
    } finally {
      await db.update(school).set({ status: 'active' }).where(eq(school.id, schoolId));
    }
    expect(await invoicesOf(f.id)).toHaveLength(0);
    expect((await runsOf(ruleId))[0]).toMatchObject({ status: 'skipped' });
    expect((await runsOf(ruleId))[0]?.error).toContain('ditangguhkan');

    const before = await db.select().from(entitlement).where(eq(entitlement.schoolId, schoolId));
    await db
      .update(entitlement)
      .set({ validUntil: new Date(`${Y0}-07-02T00:00:00Z`) })
      .where(eq(entitlement.schoolId, schoolId));
    try {
      await sweep(at(ymd(8, 6)));
    } finally {
      await db
        .update(entitlement)
        .set({ validUntil: before[0]!.validUntil })
        .where(eq(entitlement.schoolId, schoolId));
    }
    expect(await invoicesOf(f.id)).toHaveLength(0);
    const runs = await runsOf(ruleId);
    expect(runs.map((r) => r.status)).toEqual(['skipped', 'skipped']);
    expect(runs[1]?.error).toContain('Modul keuangan');
  });

  it('tanpa tahun ajaran aktif atau di luar rentangnya: tidak ada run', async () => {
    const f = await fee('monthly');
    const ruleId = await rule(f.id);
    await sweep(at(`${Y0 + 1}-07-10`));
    expect(await runsOf(ruleId)).toHaveLength(0);
    await db.update(academicYear).set({ isActive: false }).where(eq(academicYear.id, ids.year));
    try {
      await sweep(at(ymd(8, 5)));
    } finally {
      await db.update(academicYear).set({ isActive: true }).where(eq(academicYear.id, ids.year));
    }
    expect(await invoicesOf(f.id)).toHaveLength(0);
    expect(await runsOf(ruleId)).toHaveLength(0);
  });

  it('dua sapuan bersamaan tidak membuat tagihan ganda', async () => {
    const f = await fee('monthly');
    const ruleId = await rule(f.id);
    const now = at(ymd(11, 5));
    await Promise.all([sweep(now), sweep(now), sweep(now)]);
    expect(await invoicesOf(f.id)).toHaveLength(3);
    const runs = await runsOf(ruleId);
    expect(runs.filter((r) => r.trigger === 'auto' && r.status === 'ok')).toHaveLength(1);
  });

  it('galat satu aturan dicatat failed dan tidak menghentikan aturan lain', async () => {
    const bad = await fee('monthly');
    const good = await fee('monthly');
    const badRule = await rule(bad.id);
    const goodRule = await rule(good.id);
    // Transaksi kedua (fase eksekusi aturan pertama) gagal; sisanya normal.
    let n = 0;
    const flaky = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'transaction') {
          return (...args: unknown[]) => {
            n++;
            if (n === 2) throw new Error('boom-uji');
            return (target.transaction as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as Db;
    const res = await sweep(at(ymd(8, 5)), flaky);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.message).toContain('boom-uji');
    expect(res.ran).toHaveLength(1);
    const failed = await runsOf(badRule);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ status: 'failed', trigger: 'auto' });
    expect(failed[0]?.error).toContain('boom-uji');
    expect(await invoicesOf(bad.id)).toHaveLength(0);
    expect(await invoicesOf(good.id)).toHaveLength(3);
    expect((await runsOf(goodRule))[0]?.status).toBe('ok');
    // Sapuan berikutnya yang normal memulihkan aturan yang gagal.
    await sweep(at(ymd(8, 6)));
    expect(await invoicesOf(bad.id)).toHaveLength(3);
  });
});

describe('penagihan otomatis: semester, tahunan, sekali bayar', () => {
  it('semester: S1 pada tanggal mulai semester + selisih; S2 pada semester kedua; tanpa backfill', async () => {
    const f = await fee('semester', { plan: 900_000 });
    const ruleId = await rule(f.id, {
      runDay: null,
      dueMode: 'days_after',
      dueDay: null,
      dueDays: 14,
      semesterRun: 'custom',
      semesterOffsetDays: 7,
    });
    await sweep(at(`${Y0}-07-19`));
    expect(await invoicesOf(f.id)).toHaveLength(0);
    await sweep(at(`${Y0}-07-20`));
    const s1 = await invoicesOf(f.id);
    expect(s1).toHaveLength(3);
    expect(s1.every((r) => r.period === 'S1' && r.dueDate === `${Y0}-08-03` && r.amount === 900_000)).toBe(
      true,
    );
    expect(s1[0]?.title).toContain('Semester Ganjil');

    // Worker mati sepanjang semester ganjil tidak masalah; semester genap dibuat saat sapuan pertama sesudah tanggalnya.
    await sweep(at(`${Y0 + 1}-02-10`));
    const all = await invoicesOf(f.id);
    expect(all).toHaveLength(6);
    expect(all.filter((r) => r.period === 'S2')).toHaveLength(3);
    expect((await runsOf(ruleId)).map((r) => r.period)).toEqual(['S1', 'S2']);
  });

  it('semester start tanpa backfill S1 bila baru berjalan di semester kedua', async () => {
    const f = await fee('semester', { plan: 500_000 });
    await rule(f.id, {
      runDay: null,
      dueMode: 'days_after',
      dueDay: null,
      dueDays: 7,
      semesterRun: 'start',
    });
    await sweep(at(`${Y0 + 1}-03-01`));
    const rows = await invoicesOf(f.id);
    expect(new Set(rows.map((r) => r.period))).toEqual(new Set(['S2']));
  });

  it('sekali bayar dengan cicilan: C01..C03 pada tanggal runOn, sekali per tahun ajaran', async () => {
    const f = await fee('one_time', { plan: 600_000 });
    const ruleId = await rule(f.id, {
      runDay: null,
      dueMode: 'fixed_day',
      dueDay: 20,
      runOn: ymd(8, 10),
      installments: 3,
    });
    await sweep(at(ymd(8, 9)));
    expect(await invoicesOf(f.id)).toHaveLength(0);
    await sweep(at(ymd(8, 12)));
    const rows = await invoicesOf(f.id);
    expect(rows).toHaveLength(9);
    expect(new Set(rows.map((r) => r.period))).toEqual(new Set(['C01', 'C02', 'C03']));
    const c1 = rows.filter((r) => r.period === 'C01');
    expect(c1.every((r) => r.amount === 200_000 && r.dueDate === ymd(8, 20))).toBe(true);
    await sweep(at(ymd(9, 12)));
    expect(await invoicesOf(f.id)).toHaveLength(9);
    const runs = await runsOf(ruleId);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.period).toBe(YEAR_NAME);
  });

  it('tahunan dengan runOn di luar tahun ajaran aktif tidak pernah jalan', async () => {
    const f = await fee('yearly', { plan: 300_000 });
    const ruleId = await rule(f.id, {
      runDay: null,
      dueMode: 'days_after',
      dueDay: null,
      dueDays: 30,
      runOn: `${Y0 - 1}-08-01`,
    });
    await sweep(at(ymd(9, 1)));
    expect(await invoicesOf(f.id)).toHaveLength(0);
    expect(await runsOf(ruleId)).toHaveLength(0);
  });
});

describe('penagihan otomatis: email ringkasan', () => {
  it('mengirim satu email ke pengelola keuangan hanya bila ada tagihan baru', async () => {
    const f = await fee('monthly');
    await rule(f.id);
    await sweep(at(ymd(8, 5)));
    const mails = await db.select().from(outbox).where(eq(outbox.schoolId, schoolId));
    const forAdmin = mails.filter((m) => (m.payload as { to: string }).to === adminEmail);
    expect(forAdmin).toHaveLength(1);
    const payload = forAdmin[0]!.payload as { subject: string; text: string };
    expect(payload.subject).toContain(f.name);
    expect(payload.text).toContain('Tagihan baru: 3');
    // Kepala sekolah (finance:read saja) dan guru tidak menerima.
    expect(mails.every((m) => (m.payload as { to: string }).to === adminEmail)).toBe(true);
    // Sapuan ulang (tanpa tagihan baru): tidak ada email tambahan.
    await sweep(at(ymd(8, 6)));
    expect(await db.select().from(outbox).where(eq(outbox.schoolId, schoolId))).toHaveLength(mails.length);
  });

  it('tidak mengirim email bila semua tagihan sudah ada (created = 0)', async () => {
    const f = await fee('monthly');
    await rule(f.id);
    const manual = await call('POST', '/v1/finance/invoices/generate', {
      academicYearId: ids.year,
      feeTypeId: f.id,
      period: ym(9),
      classId: null,
      dueDate: ymd(9, 10),
    });
    expect(manual.statusCode).toBe(200);
    await db.delete(outbox).where(eq(outbox.schoolId, schoolId));
    await sweep(at(ymd(9, 5)));
    expect(await db.select().from(outbox).where(eq(outbox.schoolId, schoolId))).toHaveLength(0);
  });
});

describe('API aturan tagihan otomatis', () => {
  const ruleBody = (feeTypeId: string, over: object = {}) => ({
    feeTypeId,
    enabled: true,
    runDay: 5,
    dueMode: 'fixed_day',
    dueDay: 10,
    dueDays: null,
    classIds: null,
    semesterRun: null,
    semesterOffsetDays: null,
    runOn: null,
    installments: null,
    ...over,
  });

  it('PUT membuat lalu mengganti aturan (upsert), GET menampilkannya dengan jadwal berikutnya', async () => {
    const f = await fee('monthly');
    const created = await call('PUT', '/v1/finance/auto-billing/rules', ruleBody(f.id));
    expect(created.statusCode).toBe(200);
    const body = created.json();
    expect(body).toMatchObject({
      feeTypeId: f.id,
      feeKind: 'monthly',
      enabled: true,
      runDay: 5,
      dueMode: 'fixed_day',
      dueDay: 10,
      blockedReason: null,
      lastRun: null,
    });
    expect(Array.isArray(body.nextRuns)).toBe(true);

    const updated = await call(
      'PUT',
      '/v1/finance/auto-billing/rules',
      ruleBody(f.id, { runDay: 12, enabled: false }),
    );
    expect(updated.statusCode).toBe(200);
    expect(updated.json().id).toBe(body.id);
    expect(updated.json()).toMatchObject({ runDay: 12, enabled: false, nextRunDate: null });

    const list = await call('GET', '/v1/finance/auto-billing/rules');
    expect(list.statusCode).toBe(200);
    const items = list.json().items as { id: string }[];
    expect(items.filter((i) => i.id === body.id)).toHaveLength(1);

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.schoolId, schoolId), eq(auditLog.action, 'finance.auto_billing_rule_set')));
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it('validasi: kolom wajib, jenis non-bulanan, jenis biaya nonaktif, kelas asing', async () => {
    const m = await fee('monthly');
    const noRunDay = await call('PUT', '/v1/finance/auto-billing/rules', ruleBody(m.id, { runDay: null }));
    expect(noRunDay.statusCode).toBe(400);
    expect(noRunDay.json().error.code).toBe('invalid_rule');

    const monthlyInstallments = await call(
      'PUT',
      '/v1/finance/auto-billing/rules',
      ruleBody(m.id, { installments: 3 }),
    );
    expect(monthlyInstallments.statusCode).toBe(400);

    const daysAfterMissing = await call(
      'PUT',
      '/v1/finance/auto-billing/rules',
      ruleBody(m.id, { dueMode: 'days_after', dueDay: null, dueDays: null }),
    );
    expect(daysAfterMissing.statusCode).toBe(400);

    const sem = await fee('semester');
    const noSemesterRun = await call(
      'PUT',
      '/v1/finance/auto-billing/rules',
      ruleBody(sem.id, { runDay: null }),
    );
    expect(noSemesterRun.statusCode).toBe(400);
    const semOk = await call(
      'PUT',
      '/v1/finance/auto-billing/rules',
      ruleBody(sem.id, { runDay: null, semesterRun: 'custom', semesterOffsetDays: -5, installments: 4 }),
    );
    expect(semOk.statusCode).toBe(200);

    const once = await fee('one_time');
    const noRunOn = await call('PUT', '/v1/finance/auto-billing/rules', ruleBody(once.id, { runDay: null }));
    expect(noRunOn.statusCode).toBe(400);

    const foreignClass = await call(
      'PUT',
      '/v1/finance/auto-billing/rules',
      ruleBody(m.id, { classIds: ['00000000-0000-7000-8000-000000000002'] }),
    );
    expect(foreignClass.statusCode).toBe(400);
    expect(foreignClass.json().error.code).toBe('invalid_reference');

    const ghostFee = await call(
      'PUT',
      '/v1/finance/auto-billing/rules',
      ruleBody('00000000-0000-7000-8000-000000000003'),
    );
    expect(ghostFee.statusCode).toBe(400);

    await db.update(finFeeType).set({ active: false }).where(eq(finFeeType.id, m.id));
    const inactive = await call('PUT', '/v1/finance/auto-billing/rules', ruleBody(m.id));
    expect(inactive.statusCode).toBe(409);
    expect(inactive.json().error.code).toBe('inactive');
    const savedOff = await call('PUT', '/v1/finance/auto-billing/rules', ruleBody(m.id, { enabled: false }));
    expect(savedOff.statusCode).toBe(200);
    expect(savedOff.json()).toMatchObject({ feeActive: false });
  });

  it('GET menandai aturan yang terblokir (jenis biaya nonaktif)', async () => {
    const f = await fee('monthly');
    const id = await rule(f.id);
    await db.update(finFeeType).set({ active: false }).where(eq(finFeeType.id, f.id));
    const list = await call('GET', '/v1/finance/auto-billing/rules');
    const item = (
      list.json().items as { id: string; blockedReason: string | null; nextRunDate: string | null }[]
    ).find((i) => i.id === id);
    expect(item?.blockedReason).toBe('fee_inactive');
    expect(item?.nextRunDate).toBeNull();
  });

  it('run-now: menjalankan manual, idempoten, dengan periode yang bisa dipilih', async () => {
    const f = await fee('monthly');
    const id = await rule(f.id);
    const first = await call('POST', `/v1/finance/auto-billing/rules/${id}/run-now`, { period: ym(9) });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      period: ym(9),
      trigger: 'manual',
      status: 'ok',
      createdCount: 3,
      skippedCount: 0,
      feeTypeName: f.name,
    });
    const again = await call('POST', `/v1/finance/auto-billing/rules/${id}/run-now`, { period: ym(9) });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ createdCount: 0, skippedCount: 3, status: 'ok' });
    expect(await invoicesOf(f.id)).toHaveLength(3);
    expect((await invoicesOf(f.id)).every((r) => r.dueDate === ymd(9, 10))).toBe(true);

    // Run manual tidak menghalangi run otomatis berikutnya (idempoten, tak ada ganda).
    await sweep(at(ymd(9, 5)));
    expect(await invoicesOf(f.id)).toHaveLength(3);

    const bad = await call('POST', `/v1/finance/auto-billing/rules/${id}/run-now`, { period: '1999-01' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('period_invalid');

    const log = await call('GET', `/v1/finance/auto-billing/runs?ruleId=${id}`);
    expect(log.statusCode).toBe(200);
    const items = log.json().items as { trigger: string; status: string }[];
    expect(log.json().total).toBe(items.length);
    expect(items.filter((i) => i.trigger === 'manual')).toHaveLength(2);
    expect(items.some((i) => i.trigger === 'auto')).toBe(true);

    const filtered = await call('GET', `/v1/finance/auto-billing/runs?ruleId=${id}&status=failed`);
    expect(filtered.json().items).toHaveLength(0);

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.schoolId, schoolId), eq(auditLog.action, 'finance.auto_billing_run')));
    expect(
      audits.filter((a) => a.entityId === id && (a.details as { trigger: string }).trigger === 'manual'),
    ).toHaveLength(2);
  });

  it('run-now pada jenis biaya nonaktif: 409', async () => {
    const f = await fee('monthly');
    const id = await rule(f.id);
    await db.update(finFeeType).set({ active: false }).where(eq(finFeeType.id, f.id));
    const res = await call('POST', `/v1/finance/auto-billing/rules/${id}/run-now`, {});
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('fee_inactive');
    expect(await invoicesOf(f.id)).toHaveLength(0);
  });

  it('pratinjau: tiga jadwal berikutnya dan hitungan siswa tanpa menyimpan apa pun', async () => {
    const f = await fee('monthly', { plan: null });
    // Tarif hanya untuk tingkat 7: siswa tingkat 8 tidak punya tarif.
    await call('PUT', '/v1/finance/fee-plans', {
      academicYearId: ids.year,
      feeTypeId: f.id,
      level: '7',
      amount: 100_000,
    });
    const res = await call('POST', '/v1/finance/auto-billing/preview', {
      feeTypeId: f.id,
      ruleDraft: {
        runDay: 5,
        dueMode: 'fixed_day',
        dueDay: 10,
        dueDays: null,
        classIds: null,
        semesterRun: null,
        semesterOffsetDays: null,
        runOn: null,
        installments: null,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nextRuns.length).toBeLessThanOrEqual(3);
    if (body.nextRuns.length > 0) {
      expect(body.wouldCreate).toBe(2);
      expect(body.missingPlan).toBe(1);
      expect(body.error).toBeNull();
    }
    expect(await invoicesOf(f.id)).toHaveLength(0);

    const invalid = await call('POST', '/v1/finance/auto-billing/preview', {
      feeTypeId: f.id,
      ruleDraft: {
        runDay: null,
        dueMode: 'fixed_day',
        dueDay: 10,
        dueDays: null,
        classIds: null,
        semesterRun: null,
        semesterOffsetDays: null,
        runOn: null,
        installments: null,
      },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('DELETE menghapus aturan beserta lognya', async () => {
    const f = await fee('monthly');
    const id = await rule(f.id);
    await sweep(at(ymd(8, 5)));
    expect(await runsOf(id)).toHaveLength(1);
    const res = await call('DELETE', `/v1/finance/auto-billing/rules/${id}`);
    expect(res.statusCode).toBe(200);
    expect(await runsOf(id)).toHaveLength(0);
    expect((await call('DELETE', `/v1/finance/auto-billing/rules/${id}`)).statusCode).toBe(404);
    // Tagihan yang sudah dibuat tetap ada.
    expect(await invoicesOf(f.id)).toHaveLength(3);
  });
});

describe('penagihan otomatis: izin dan isolasi', () => {
  it('izin: kepala sekolah (finance:read) hanya membaca; guru ditolak; tanpa login 401', async () => {
    const f = await fee('monthly');
    const id = await rule(f.id);
    const body = {
      feeTypeId: f.id,
      enabled: true,
      runDay: 5,
      dueMode: 'fixed_day',
      dueDay: 10,
      dueDays: null,
      classIds: null,
      semesterRun: null,
      semesterOffsetDays: null,
      runOn: null,
      installments: null,
    };
    const readAs = { cookie: principalCookie };
    expect((await call('GET', '/v1/finance/auto-billing/rules', undefined, readAs)).statusCode).toBe(200);
    expect((await call('GET', '/v1/finance/auto-billing/runs', undefined, readAs)).statusCode).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/v1/finance/auto-billing/preview',
          { feeTypeId: f.id, ruleDraft: { ...body, feeTypeId: undefined, enabled: undefined } },
          readAs,
        )
      ).statusCode,
    ).toBe(200);
    expect((await call('PUT', '/v1/finance/auto-billing/rules', body, readAs)).statusCode).toBe(403);
    expect((await call('DELETE', `/v1/finance/auto-billing/rules/${id}`, undefined, readAs)).statusCode).toBe(
      403,
    );
    expect((await call('POST', `/v1/finance/auto-billing/rules/${id}/run-now`, {}, readAs)).statusCode).toBe(
      403,
    );

    const asTeacher = { cookie: teacherCookie };
    expect((await call('GET', '/v1/finance/auto-billing/rules', undefined, asTeacher)).statusCode).toBe(403);
    expect((await call('PUT', '/v1/finance/auto-billing/rules', body, asTeacher)).statusCode).toBe(403);

    const anon = await app.inject({
      method: 'GET',
      url: '/v1/finance/auto-billing/rules',
      headers: { 'x-school-id': schoolId },
    });
    expect(anon.statusCode).toBe(401);
  });

  it('modul keuangan mati: API menolak 403 module_disabled', async () => {
    const before = await db.select().from(entitlement).where(eq(entitlement.schoolId, schoolId));
    await db
      .update(entitlement)
      .set({ validUntil: new Date(Date.now() - 86_400_000) })
      .where(eq(entitlement.schoolId, schoolId));
    try {
      const res = await call('GET', '/v1/finance/auto-billing/rules');
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('module_disabled');
    } finally {
      await db
        .update(entitlement)
        .set({ validUntil: before[0]!.validUntil })
        .where(eq(entitlement.schoolId, schoolId));
    }
  });

  it('isolasi tenant: aturan dan log sekolah lain tidak terlihat atau tersentuh', async () => {
    const list = await call('GET', '/v1/finance/auto-billing/rules');
    expect((list.json().items as { id: string }[]).some((i) => i.id === otherRuleId)).toBe(false);
    expect((await call('POST', `/v1/finance/auto-billing/rules/${otherRuleId}/run-now`, {})).statusCode).toBe(
      404,
    );
    expect((await call('DELETE', `/v1/finance/auto-billing/rules/${otherRuleId}`)).statusCode).toBe(404);
    // Admin sekolah A bukan anggota sekolah B.
    expect(
      (await call('GET', '/v1/finance/auto-billing/rules', undefined, { school: otherSchoolId })).statusCode,
    ).toBe(403);
    // RLS di tingkat basis data: konteks sekolah A tidak melihat baris sekolah B.
    const seen = await withTenant(app.tenantDb, [schoolId], (tx) =>
      tx
        .select({ id: finAutoBillingRule.id })
        .from(finAutoBillingRule)
        .where(inArray(finAutoBillingRule.id, [otherRuleId])),
    );
    expect(seen).toHaveLength(0);
    const seenB = await withTenant(app.tenantDb, [otherSchoolId], (tx) =>
      tx.select({ n: count() }).from(finAutoBillingRule).where(eq(finAutoBillingRule.id, otherRuleId)),
    );
    expect(seenB[0]?.n).toBe(1);
    // Sapuan yang dibatasi ke sekolah A tidak menjalankan aturan sekolah B.
    const res = await sweep(at(ymd(8, 5)));
    expect(res.ran.every((r) => r.ruleId !== otherRuleId)).toBe(true);
  });

  it('executeRule manual untuk sekolah yang salah tidak menemukan aturan', async () => {
    await expect(
      executeRule(db, otherSchoolId, '00000000-0000-7000-8000-0000000000aa', {
        trigger: 'manual',
        now: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
