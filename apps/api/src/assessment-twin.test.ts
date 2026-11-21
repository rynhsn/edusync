import { todayIn } from '@edusync/contracts';
import {
  academicYear,
  and,
  assessment,
  assignRoles,
  auditLog,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  inArray,
  member,
  reportCard,
  school,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  subject,
  subscription,
  teacher,
  teachingAssignment,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3B.5: penilaian kembar lintas rombel. Menguji pembuatan serentak (satu transaksi, semua atau tidak), kegagalan per rombel
 * (pengampu, tanpa pengambil, rapor final), respons sparse tanpa `alsoClassIds`, ubah serentak (`applyToTwins`, 409 `twin_blocked`),
 * hapus tidak menyebar, dan isolasi tenant.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';
const today = todayIn('Asia/Jakarta');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const day = (n: number) => addDays(today, n);

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherSchoolId = '';
let foundationId = '';
let adminCookie = '';
let guruACookie = '';
let otherAdminCookie = '';
const userIds: string[] = [];
const ids: Record<string, string> = {};

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
  cookie: string,
  payload?: object,
  sid: string = schoolId,
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
const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code;
const countRows = async () =>
  (await app.platformDb.select().from(assessment).where(eq(assessment.schoolId, schoolId))).length;

const body = (extra: object = {}) => ({
  semesterId: ids.ganjil,
  classId: ids.xiA,
  subjectId: ids.fis,
  componentId: ids.component,
  title: 'Ulangan Kembar',
  date: day(-3),
  maxScore: 100,
  ...extra,
});

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Nilai Kembar', slug: `ynk-${run}` })
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
  const mkSchool = async (slug: string, name: string) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name })
      .returning();
    await seedSchoolRoles(db, s!.id);
    await db.insert(entitlement).values({
      schoolId: s!.id,
      moduleKey: 'grades',
      subscriptionId: sub!.id,
      validUntil: sub!.currentPeriodEnd,
    });
    return s!.id;
  };
  schoolId = await mkSchool('nkm', 'Sekolah Nilai Kembar');
  otherSchoolId = await mkSchool('nkm2', 'Sekolah Lain Kembar');

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: 'Berjalan', startsOn: day(-100), endsOn: day(200), isActive: true })
    .returning();
  ids.year = y!.id;
  const [sem] = await db
    .insert(semester)
    .values({
      schoolId,
      academicYearId: y!.id,
      name: 'Ganjil',
      startsOn: day(-100),
      endsOn: day(100),
      isActive: true,
    })
    .returning();
  ids.ganjil = sem!.id;

  const mkClass = async (name: string, sid = schoolId, yearId = ids.year!) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: yearId, name, level: 'XI' })
      .returning();
    return c!.id;
  };
  ids.xiA = await mkClass('XI A');
  ids.xiB = await mkClass('XI B');
  ids.xiC = await mkClass('XI C');
  const [oy] = await db
    .insert(academicYear)
    .values({ schoolId: otherSchoolId, name: 'Lain', startsOn: day(-100), endsOn: day(200), isActive: true })
    .returning();
  ids.otherClass = await mkClass('XI Lain', otherSchoolId, oy!.id);

  const [fis] = await db.insert(subject).values({ schoolId, code: 'FIS', name: 'Fisika' }).returning();
  ids.fis = fis!.id;
  const [comp] = await db
    .insert(gradeComponent)
    .values({ schoolId, name: 'Ulangan', weight: 100, sort: 0 })
    .returning();
  ids.component = comp!.id;

  const mkStudent = async (key: string, name: string, classKey: string) => {
    const [st] = await db
      .insert(student)
      .values({ schoolId, name, gender: 'L', status: 'active', nis: `${key}-${run}` })
      .returning();
    ids[key] = st!.id;
    await db
      .insert(enrollment)
      .values({ schoolId, studentId: st!.id, classId: ids[classKey]!, academicYearId: ids.year! });
  };
  await mkStudent('ani', 'Ani', 'xiA');
  await mkStudent('eka', 'Eka', 'xiB');
  await mkStudent('lia', 'Lia', 'xiC');

  const admin = await makeUser('admin-kembar');
  const [am] = await db.insert(member).values({ userId: admin.id, schoolId }).returning();
  await assignRoles(db, am!.id, schoolId, ['school_admin']);
  adminCookie = await login(admin.email);

  // Guru A mengampu FIS di XI A; guru B mengampu FIS di XI B; XI C tanpa pengampu.
  const mkTeacher = async (label: string, classKey: string) => {
    const u = await makeUser(label);
    const [m] = await db.insert(member).values({ userId: u.id, schoolId }).returning();
    await assignRoles(db, m!.id, schoolId, ['teacher']);
    const [t] = await db.insert(teacher).values({ schoolId, name: label, memberId: m!.id }).returning();
    await db
      .insert(teachingAssignment)
      .values({ schoolId, classId: ids[classKey]!, subjectId: ids.fis!, teacherId: t!.id });
    ids[label] = t!.id;
    return login(u.email);
  };
  guruACookie = await mkTeacher('guruA', 'xiA');
  await mkTeacher('guruB', 'xiB');

  const other = await makeUser('admin-lain-kembar');
  const [om] = await db.insert(member).values({ userId: other.id, schoolId: otherSchoolId }).returning();
  await assignRoles(db, om!.id, otherSchoolId, ['school_admin']);
  otherAdminCookie = await login(other.email);
}, 180_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'report_card',
      'score',
      'assessment',
      'grade_component',
      'class_subject_participation',
      'teaching_assignment',
      'teacher',
      'enrollment',
      'class_room',
      'subject',
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
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db.delete(user).where(eq(user.id, uid));
  await app.close();
});

describe('tanpa alsoClassIds: perilaku dan respons seperti sebelumnya', () => {
  it('penilaian biasa tanpa twinKey/twinCount/twins, kolom twin_key NULL', async () => {
    const res = await call('POST', '/v1/assessments', adminCookie, body({ title: 'Biasa' }));
    expect(res.statusCode, res.body).toBe(201);
    const json = res.json();
    expect(json).not.toHaveProperty('twinKey');
    expect(json).not.toHaveProperty('twinCount');
    expect(json).not.toHaveProperty('twins');
    const list = (await call('GET', `/v1/assessments?semesterId=${ids.ganjil}`, adminCookie)).json();
    expect(JSON.stringify(list)).not.toContain('twin');
    const [row] = await app.platformDb.select().from(assessment).where(eq(assessment.id, json.id));
    expect(row!.twinKey).toBeNull();
    // alsoClassIds kosong sama dengan tidak dikirim.
    const empty = await call(
      'POST',
      '/v1/assessments',
      adminCookie,
      body({ title: 'Kosong', alsoClassIds: [] }),
    );
    expect(empty.statusCode).toBe(201);
    expect(empty.json()).not.toHaveProperty('twinKey');
  });
});

describe('buat serentak', () => {
  let primaryId = '';
  let twinId = '';
  let twinKey = '';

  it('sukses: dua baris dengan twin_key sama, pengampu per rombel, audit per baris', async () => {
    const res = await call('POST', '/v1/assessments', adminCookie, body({ alsoClassIds: [ids.xiB] }));
    expect(res.statusCode, res.body).toBe(201);
    const json = res.json();
    primaryId = json.id;
    expect(json.classId).toBe(ids.xiA);
    expect(json.twinCount).toBe(2);
    expect(json.twins).toHaveLength(1);
    expect(json.twins[0]).toMatchObject({ classId: ids.xiB, className: 'XI B' });
    twinId = json.twins[0].id;
    twinKey = json.twinKey;
    const rows = await app.platformDb
      .select()
      .from(assessment)
      .where(inArray(assessment.id, [primaryId, twinId]));
    expect(rows.map((r) => r.twinKey)).toEqual([twinKey, twinKey]);
    expect(rows.find((r) => r.id === primaryId)!.teacherId).toBe(ids.guruA);
    expect(rows.find((r) => r.id === twinId)!.teacherId).toBe(ids.guruB);
    const audits = await app.platformDb
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.schoolId, schoolId), eq(auditLog.action, 'assessment.create')));
    const mine = audits.filter((a) => [primaryId, twinId].includes(a.entityId ?? ''));
    expect(mine).toHaveLength(2);
    expect(mine.every((a) => a.details.twinCount === 2)).toBe(true);
  });

  it('daftar membawa twinKey dan twinCount pada kedua anggota', async () => {
    const list = (await call('GET', `/v1/assessments?semesterId=${ids.ganjil}`, adminCookie)).json();
    const twins = list.filter((a: { twinKey?: string }) => a.twinKey === twinKey);
    expect(twins.map((a: { twinCount: number }) => a.twinCount)).toEqual([2, 2]);
    // Guru A hanya melihat anggota miliknya, twinCount tetap jumlah grup.
    const mine = (await call('GET', `/v1/assessments?semesterId=${ids.ganjil}`, guruACookie)).json();
    expect(mine.filter((a: { twinKey?: string }) => a.twinKey === twinKey)).toHaveLength(1);
  });

  it('galat validasi daftar rombel tambahan tidak membuat apa pun', async () => {
    const before = await countRows();
    const many = Array.from({ length: 12 }, () => crypto.randomUUID());
    expect(code(await call('POST', '/v1/assessments', adminCookie, body({ alsoClassIds: many })))).toBe(
      'too_many_twins',
    );
    expect(
      code(await call('POST', '/v1/assessments', adminCookie, body({ alsoClassIds: [ids.xiB, ids.xiB] }))),
    ).toBe('invalid_twin_classes');
    expect(code(await call('POST', '/v1/assessments', adminCookie, body({ alsoClassIds: [ids.xiA] })))).toBe(
      'invalid_twin_classes',
    );
    expect(await countRows()).toBe(before);
  });

  it('guru bukan pengampu salah satu rombel: 403 dan tidak ada yang dibuat', async () => {
    const before = await countRows();
    const res = await call('POST', '/v1/assessments', guruACookie, body({ alsoClassIds: [ids.xiB] }));
    expect([res.statusCode, code(res)]).toEqual([403, 'forbidden']);
    expect(await countRows()).toBe(before);
  });

  it('rombel tanpa pengambil mapel: 400 twin_class_no_takers dan tidak ada yang dibuat', async () => {
    const mark = await call('PUT', `/v1/classes/${ids.xiC}/subject-participation`, adminCookie, {
      subjects: [{ subjectId: ids.fis, mode: 'selected' }],
    });
    expect(mark.statusCode, mark.body).toBe(200);
    const before = await countRows();
    const res = await call(
      'POST',
      '/v1/assessments',
      adminCookie,
      body({ alsoClassIds: [ids.xiB, ids.xiC] }),
    );
    expect([res.statusCode, code(res)]).toEqual([400, 'twin_class_no_takers']);
    expect(await countRows()).toBe(before);
  });

  it('rapor final satu rombel: 409 report_final dan semuanya batal', async () => {
    await app.platformDb.insert(reportCard).values({
      schoolId,
      semesterId: ids.ganjil!,
      studentId: ids.eka!,
      classId: ids.xiB!,
      status: 'final',
    });
    const before = await countRows();
    const res = await call('POST', '/v1/assessments', adminCookie, body({ alsoClassIds: [ids.xiB] }));
    expect([res.statusCode, code(res)]).toEqual([409, 'report_final']);
    expect(await countRows()).toBe(before);
  });

  it('rombel sekolah lain ditolak 400 invalid_reference', async () => {
    const before = await countRows();
    const res = await call('POST', '/v1/assessments', adminCookie, body({ alsoClassIds: [ids.otherClass] }));
    expect([res.statusCode, code(res)]).toEqual([400, 'invalid_reference']);
    expect(await countRows()).toBe(before);
  });

  it('ubah serentak diblokir rapor final: 409 twin_blocked, tidak ada yang berubah', async () => {
    // XI B masih final dari tes sebelumnya.
    const res = await call('PUT', `/v1/assessments/${primaryId}`, adminCookie, {
      componentId: ids.component,
      title: 'Judul Baru',
      date: day(-2),
      maxScore: 80,
      applyToTwins: true,
    });
    expect([res.statusCode, code(res)]).toEqual([409, 'twin_blocked']);
    expect(res.json().error.blocked).toEqual([
      { classId: ids.xiB, className: 'XI B', reason: 'report_final' },
    ]);
    const [a] = await app.platformDb.select().from(assessment).where(eq(assessment.id, primaryId));
    expect(a!.title).toBe('Ulangan Kembar');
    expect(a!.maxScore).toBe(100);
    // Tanpa applyToTwins hanya penilaian itu yang berubah (XI A tidak final).
    const single = await call('PUT', `/v1/assessments/${primaryId}`, adminCookie, {
      componentId: ids.component,
      title: 'Hanya XI A',
      date: day(-3),
      maxScore: 100,
    });
    expect(single.statusCode, single.body).toBe(200);
    const [b] = await app.platformDb.select().from(assessment).where(eq(assessment.id, twinId));
    expect(b!.title).toBe('Ulangan Kembar');
  });

  it('ubah serentak sukses setelah rapor dibuka: semua kembar sama', async () => {
    await app.platformDb.delete(reportCard).where(eq(reportCard.schoolId, schoolId));
    const res = await call('PUT', `/v1/assessments/${primaryId}`, adminCookie, {
      componentId: ids.component,
      title: 'Serentak',
      date: day(-1),
      maxScore: 50,
      applyToTwins: true,
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = await app.platformDb
      .select()
      .from(assessment)
      .where(inArray(assessment.id, [primaryId, twinId]));
    expect(rows.map((r) => [r.title, r.date, r.maxScore])).toEqual([
      ['Serentak', day(-1), 50],
      ['Serentak', day(-1), 50],
    ]);
  });

  it('skor melebihi skor maksimum baru pada kembar: twin_blocked score_exceeds_max', async () => {
    await app.platformDb
      .insert(score)
      .values({ schoolId, assessmentId: twinId, studentId: ids.eka!, value: 45, updatedBy: 'uji' });
    const res = await call('PUT', `/v1/assessments/${primaryId}`, adminCookie, {
      componentId: ids.component,
      title: 'Serentak',
      date: day(-1),
      maxScore: 40,
      applyToTwins: true,
    });
    expect([res.statusCode, code(res)]).toEqual([409, 'twin_blocked']);
    expect(res.json().error.blocked[0]).toMatchObject({ classId: ids.xiB, reason: 'score_exceeds_max' });
  });

  it('guru yang tidak mengampu rombel kembar: twin_blocked not_assignee; satu per satu tetap bisa', async () => {
    const res = await call('PUT', `/v1/assessments/${primaryId}`, guruACookie, {
      componentId: ids.component,
      title: 'Serentak',
      date: day(-1),
      maxScore: 50,
      applyToTwins: true,
    });
    expect([res.statusCode, code(res)]).toEqual([409, 'twin_blocked']);
    expect(res.json().error.blocked[0]).toMatchObject({ classId: ids.xiB, reason: 'not_assignee' });
    const single = await call('PUT', `/v1/assessments/${primaryId}`, guruACookie, {
      componentId: ids.component,
      title: 'Serentak',
      date: day(-1),
      maxScore: 60,
    });
    expect(single.statusCode, single.body).toBe(200);
  });

  it('applyToTwins pada penilaian tanpa grup sama dengan ubah biasa', async () => {
    const single = (await call('POST', '/v1/assessments', adminCookie, body({ title: 'Sendiri' }))).json();
    const res = await call('PUT', `/v1/assessments/${single.id}`, adminCookie, {
      componentId: ids.component,
      title: 'Sendiri 2',
      date: day(-3),
      maxScore: 100,
      applyToTwins: true,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).not.toHaveProperty('twinKey');
  });

  it('hapus satu anggota tidak menyentuh kembar; grup menyusut', async () => {
    const del = await call('DELETE', `/v1/assessments/${primaryId}`, adminCookie);
    expect(del.statusCode, del.body).toBe(200);
    const left = await app.platformDb.select().from(assessment).where(eq(assessment.id, twinId));
    expect(left).toHaveLength(1);
    const list = (await call('GET', `/v1/assessments?semesterId=${ids.ganjil}`, adminCookie)).json();
    expect(list.find((a: { id: string }) => a.id === twinId)).toMatchObject({ twinKey, twinCount: 1 });
  });

  it('isolasi tenant: sekolah lain tidak melihat kembar, RLS menyembunyikan barisnya', async () => {
    const list = (
      await call(
        'GET',
        `/v1/assessments?semesterId=${ids.ganjil}`,
        otherAdminCookie,
        undefined,
        otherSchoolId,
      )
    ).json();
    expect(list).toEqual([]);
    const rows = await withTenant(app.tenantDb, [otherSchoolId], (tx) =>
      tx.select().from(assessment).where(eq(assessment.twinKey, twinKey)),
    );
    expect(rows).toEqual([]);
    const put = await call(
      'PUT',
      `/v1/assessments/${twinId}`,
      otherAdminCookie,
      { componentId: ids.component, title: 'X', date: day(-1), maxScore: 10, applyToTwins: true },
      otherSchoolId,
    );
    expect([404, 400]).toContain(put.statusCode);
  });
});
