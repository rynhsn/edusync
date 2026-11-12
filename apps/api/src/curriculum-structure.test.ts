import {
  academicYear,
  assignRoles,
  curriculumSubjectAllocation,
  eq,
  foundation,
  member,
  program,
  refCurriculum,
  refSchoolLevel,
  refSubject,
  school,
  schoolCurriculumVersion,
  schoolLevel,
  seedSchoolRoles,
  sql,
  subject,
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
const refKey = `tst-${run}`;

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherSchoolId = '';
let foundationId = '';
const userIds: string[] = [];
let adminCookie = '';
let curriculumCookie = '';
let operatorCookie = '';
let teacherCookie = '';
let otherCookie = '';
let createdLevelKey = false;

const years = {} as Record<'y1' | 'y2' | 'other', string>;
const sub = {} as Record<string, string>;
let programId = '';
let otherSubjectId = '';
let otherProgramId = '';

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

async function member_(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await app.platformDb.insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(app.platformDb, m!.id, sid, roles);
  return login(u.email);
}

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

const db = () => app.platformDb;
const allocUrl = (year: string) => `/v1/academic-years/${year}/curriculum/allocations`;
const verUrl = (year: string) => `/v1/academic-years/${year}/curriculum/versions`;
const putAlloc = (year: string, allocations: object[], cookie = adminCookie, sid = schoolId) =>
  call('PUT', allocUrl(year), cookie, { allocations }, sid);
const putVer = (year: string, versions: object[], cookie = adminCookie) =>
  call('PUT', verUrl(year), cookie, { versions });

type Alloc = {
  levelCode: string;
  programId: string | null;
  subjectCode: string;
  weeklyPeriods: number | null;
  yearlyPeriods: number | null;
  note: string | null;
};
const listAlloc = async (year: string, query = '', cookie = adminCookie) =>
  (await call('GET', `${allocUrl(year)}${query}`, cookie)).json().allocations as Alloc[];

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Struktur Kurikulum', slug: `ysk-${run}` })
    .returning();
  foundationId = f!.id;
  const ids: string[] = [];
  for (const slug of [`sk-${run}`, `sk2-${run}`]) {
    const [s] = await db().insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(db(), s!.id);
    ids.push(s!.id);
  }
  [schoolId, otherSchoolId] = ids as [string, string];

  await db()
    .insert(schoolLevel)
    .values(['7', '8', '9'].map((code, i) => ({ schoolId, code, label: `Kelas ${code}`, sort: i + 1 })));

  // Acuan khusus tes (kurikulum sendiri) supaya tidak mengganggu tes lain yang membaca bank data bersama.
  const [lvl] = await db().select().from(refSchoolLevel).where(eq(refSchoolLevel.key, 'smp'));
  if (!lvl) {
    await db().insert(refSchoolLevel).values({ key: 'smp', name: 'SMP', sort: 2, active: true });
    createdLevelKey = true;
  }
  await db()
    .insert(refCurriculum)
    .values({ key: refKey, name: `Kurikulum Uji ${run}` });

  const mkYear = async (
    key: keyof typeof years,
    name: string,
    startsOn: string,
    endsOn: string,
    sid = schoolId,
  ) => {
    const [y] = await db()
      .insert(academicYear)
      .values({ schoolId: sid, name, startsOn, endsOn, isActive: key !== 'y2' })
      .returning();
    years[key] = y!.id;
  };
  await mkYear('y1', '2026/2027', '2026-07-13', '2027-06-30');
  await mkYear('y2', '2027/2028', '2027-07-12', '2028-06-30');
  await mkYear('other', '2026/2027', '2026-07-13', '2027-06-30', otherSchoolId);

  for (const [key, code] of [
    ['mtk', 'MTK'],
    ['ipa', 'IPA'],
    ['bin', 'BIN'],
  ] as const) {
    const [s] = await db().insert(subject).values({ schoolId, code, name: code }).returning();
    sub[key] = s!.id;
  }
  const [p] = await db().insert(program).values({ schoolId, code: 'IPA', name: 'IPA' }).returning();
  programId = p!.id;
  const [os] = await db()
    .insert(subject)
    .values({ schoolId: otherSchoolId, code: 'MTK', name: 'Matematika lain' })
    .returning();
  otherSubjectId = os!.id;
  const [op] = await db()
    .insert(program)
    .values({ schoolId: otherSchoolId, code: 'X', name: 'X' })
    .returning();
  otherProgramId = op!.id;

  adminCookie = await member_('admin', schoolId, ['school_admin']);
  curriculumCookie = await member_('kurikulum', schoolId, ['curriculum']);
  operatorCookie = await member_('operator', schoolId, ['operator']);
  teacherCookie = await member_('guru', schoolId, ['teacher']);
  otherCookie = await member_('admin2', otherSchoolId, ['school_admin']);
}, 60_000);

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'curriculum_subject_allocation',
      'school_curriculum_version',
      'school_curriculum',
      'subject',
      'program',
      'school_level',
      'academic_year',
      'member',
      'role',
    ]) {
      await db().execute(sql`delete from ${sql.identifier(table)} where school_id = ${sid}`);
    }
    await db().delete(school).where(eq(school.id, sid));
  }
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await db().delete(refSubject).where(eq(refSubject.curriculumKey, refKey));
  await db().delete(refCurriculum).where(eq(refCurriculum.key, refKey));
  if (createdLevelKey) await db().delete(refSchoolLevel).where(eq(refSchoolLevel.key, 'smp'));
  await app.close();
});

describe('izin curriculum:manage', () => {
  it('admin dan peran kurikulum memilikinya; operator dan guru tidak', async () => {
    const body = { allocations: [] };
    for (const [cookie, status] of [
      [adminCookie, 200],
      [curriculumCookie, 200],
      [operatorCookie, 403],
      [teacherCookie, 403],
    ] as const) {
      expect((await call('PUT', allocUrl(years.y1), cookie, body)).statusCode, 'alokasi').toBe(status);
      expect((await call('PUT', verUrl(years.y1), cookie, { versions: [] })).statusCode, 'versi').toBe(
        status,
      );
    }
  });

  it('membaca butuh subject:read dan tanpa sesi ditolak', async () => {
    for (const cookie of [teacherCookie, operatorCookie, curriculumCookie]) {
      expect((await call('GET', allocUrl(years.y1), cookie)).statusCode).toBe(200);
      expect((await call('GET', verUrl(years.y1), cookie)).statusCode).toBe(200);
    }
    const res = await app.inject({
      method: 'GET',
      url: allocUrl(years.y1),
      headers: { 'x-school-id': schoolId },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('CRUD mapel dengan metadata', () => {
  it('klien lama tanpa field baru tetap bekerja dan metadata berdefault', async () => {
    const created = await call('POST', '/v1/subjects', operatorCookie, {
      code: `OLD-${run}`,
      name: 'Mapel lama',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      code: `OLD-${run}`,
      name: 'Mapel lama',
      refSubjectId: null,
      subjectGroup: null,
      isLocalContent: false,
      sortOrder: 0,
      active: true,
    });
    const put = await call('PUT', `/v1/subjects/${created.json().id}`, operatorCookie, {
      code: `OLD-${run}`,
      name: 'Mapel lama diubah',
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().name).toBe('Mapel lama diubah');
    const list = (await call('GET', '/v1/subjects', teacherCookie)).json() as {
      code: string;
      active: boolean;
    }[];
    expect(list.find((s) => s.code === `OLD-${run}`)?.active).toBe(true);
  });

  it('menyimpan metadata baru dan PUT tanpa field itu tidak menimpanya', async () => {
    const created = await call('POST', '/v1/subjects', operatorCookie, {
      code: `NEW-${run}`,
      name: 'Mapel baru',
      subjectGroup: 'vocational_base',
      isLocalContent: true,
      sortOrder: 7,
      active: false,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      subjectGroup: 'vocational_base',
      isLocalContent: true,
      sortOrder: 7,
      active: false,
    });
    const id = created.json().id;
    const oldStyle = await call('PUT', `/v1/subjects/${id}`, operatorCookie, {
      code: `NEW-${run}`,
      name: 'Ganti nama',
    });
    expect(oldStyle.json()).toMatchObject({
      name: 'Ganti nama',
      subjectGroup: 'vocational_base',
      isLocalContent: true,
      sortOrder: 7,
      active: false,
    });
    const changed = await call('PUT', `/v1/subjects/${id}`, operatorCookie, {
      code: `NEW-${run}`,
      name: 'Ganti nama',
      subjectGroup: null,
      active: true,
    });
    expect(changed.json()).toMatchObject({
      subjectGroup: null,
      active: true,
      sortOrder: 7,
      isLocalContent: true,
    });
  });

  it('menolak kelompok tidak dikenal dan mapel acuan yang tidak ada, serta menjaga izin', async () => {
    const badGroup = await call('POST', '/v1/subjects', operatorCookie, {
      code: `BAD-${run}`,
      name: 'X',
      subjectGroup: 'lainnya',
    });
    expect(badGroup.statusCode).toBe(400);
    const badRef = await call('POST', '/v1/subjects', operatorCookie, {
      code: `BAD-${run}`,
      name: 'X',
      refSubjectId: '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(badRef.statusCode).toBe(400);
    expect(badRef.json().error.code).toBe('invalid_reference');
    const denied = await call('POST', '/v1/subjects', teacherCookie, { code: `BAD-${run}`, name: 'X' });
    expect(denied.statusCode).toBe(403);
  });
});

describe('adopsi dan pembaruan acuan memakai ref_subject_id', () => {
  const ref = {} as Record<string, { id: string; code: string }>;
  const refCode = (k: string) => `${k}${run}`.toUpperCase();
  const updates = async () =>
    (await call('GET', '/v1/reference/curricula/updates', operatorCookie)).json().updates as {
      curriculumKey: string;
      newSubjects: { code: string }[];
    }[];
  const mineNew = async () => (await updates()).find((u) => u.curriculumKey === refKey)?.newSubjects ?? [];
  const adopt = (codes: string[]) =>
    call('POST', '/v1/curricula/adopt', operatorCookie, {
      curriculumKey: refKey,
      levelGroup: 'smp',
      subjectCodes: codes,
    });
  const mk = async (k: string, sort: number) => {
    const [r] = await db()
      .insert(refSubject)
      .values({ curriculumKey: refKey, levelGroup: 'smp', code: refCode(k), name: `Acuan ${k}`, sort })
      .returning();
    ref[k] = { id: r!.id, code: r!.code };
  };
  const find = async (code: string) =>
    (
      (await call('GET', '/v1/subjects', operatorCookie)).json() as {
        id: string;
        code: string;
        name: string;
        refSubjectId: string | null;
      }[]
    ).find((s) => s.code === code);

  it('adopsi mengisi ref_subject_id dan menautkan mapel lama sebanding kode tanpa menimpa nama', async () => {
    await mk('a', 1);
    // Mapel sekolah dengan kode yang sama sudah ada, belum tertaut.
    await call('POST', '/v1/subjects', operatorCookie, { code: ref.a!.code, name: 'Nama sekolah' });
    const res = await adopt([ref.a!.code]);
    expect(res.json()).toEqual({ created: 0, skipped: 1 });
    const a = await find(ref.a!.code);
    expect(a).toMatchObject({ name: 'Nama sekolah', refSubjectId: ref.a!.id });

    // Mapel baru hasil adopsi tertaut ke acuannya.
    await mk('b', 2);
    const adoptB = await adopt([ref.b!.code]);
    expect(adoptB.json()).toEqual({ created: 1, skipped: 0 });
    expect(await find(ref.b!.code)).toMatchObject({ name: 'Acuan b', refSubjectId: ref.b!.id });
  });

  it('adopsi ulang setelah mapel diganti kode dan nama tidak membuat salinan baru', async () => {
    const b = (await find(ref.b!.code))!;
    const renamed = await call('PUT', `/v1/subjects/${b.id}`, operatorCookie, {
      code: `GANTI-${run}`,
      name: 'Nama baru sekolah',
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().refSubjectId).toBe(ref.b!.id);
    const again = await adopt([ref.b!.code]);
    expect(again.json()).toEqual({ created: 0, skipped: 1 });
    expect(await find(ref.b!.code)).toBeUndefined();
  });

  it('pembaruan tidak menampilkan mapel yang sudah tertaut walau diganti nama, atau yang kodenya sama', async () => {
    // Semua acuan di atas dibuat sebelum diadopsi pertama kali? Tidak: adopsi pertama terjadi setelah a, b dibuat,
    // jadi tambahkan acuan baru sekarang (createdAt lebih baru dari adoptedAt).
    await mk('c', 3); // belum ada di sekolah: harus muncul sebagai baru
    await mk('d', 4); // sekolah punya mapel berkode sama (fallback data lama)
    await mk('e', 5); // sekolah punya mapel berkode lain yang ditautkan lewat PUT
    await mk('f', 6); // diadopsi lalu diganti nama
    await call('POST', '/v1/subjects', operatorCookie, { code: ref.d!.code, name: 'Kode sama' });
    const manual = await call('POST', '/v1/subjects', operatorCookie, {
      code: `LAIN-${run}`,
      name: 'Kode lain',
    });
    expect((await mineNew()).map((s) => s.code)).toEqual(
      expect.arrayContaining([ref.c!.code, ref.e!.code, ref.f!.code]),
    );
    // d dianggap ada lewat kode, jadi tidak muncul.
    expect((await mineNew()).map((s) => s.code)).not.toContain(ref.d!.code);

    await call('PUT', `/v1/subjects/${manual.json().id}`, operatorCookie, {
      code: `LAIN-${run}`,
      name: 'Kode lain',
      refSubjectId: ref.e!.id,
    });
    expect((await mineNew()).map((s) => s.code)).not.toContain(ref.e!.code);

    await adopt([ref.f!.code]);
    const f = (await find(ref.f!.code))!;
    await call('PUT', `/v1/subjects/${f.id}`, operatorCookie, { code: `FGANTI-${run}`, name: 'F diganti' });
    expect((await mineNew()).map((s) => s.code)).toEqual([ref.c!.code]);

    // Respons lama tetap utuh.
    const raw = await updates();
    expect(raw[0]).toEqual(
      expect.objectContaining({
        curriculumKey: refKey,
        curriculumName: expect.any(String),
        levelGroup: 'smp',
        adoptedAt: expect.any(String),
      }),
    );
  });
});

describe('alokasi JP', () => {
  it('upsert, memperbarui, dan menghapus saat kedua JP kosong', async () => {
    const first = await putAlloc(years.y1, [
      { levelCode: '7', subjectId: sub.mtk, weeklyPeriods: 5, yearlyPeriods: 180, note: 'inti' },
      { levelCode: '7', subjectId: sub.ipa, weeklyPeriods: 4 },
      { levelCode: '8', subjectId: sub.mtk, weeklyPeriods: 5 },
      { levelCode: '7', programId, subjectId: sub.mtk, weeklyPeriods: 6 },
    ]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ upserted: 4, deleted: 0 });

    const all = await listAlloc(years.y1);
    expect(all).toHaveLength(4);
    expect(all.find((a) => a.levelCode === '7' && a.subjectCode === 'MTK' && !a.programId)).toMatchObject({
      weeklyPeriods: 5,
      yearlyPeriods: 180,
      note: 'inti',
    });
    // Baris dengan program berbeda dari baris tanpa program.
    expect(all.find((a) => a.programId === programId)?.weeklyPeriods).toBe(6);
    expect(await listAlloc(years.y1, '?levelCode=8')).toHaveLength(1);
    expect(await listAlloc(years.y1, `?programId=${programId}`)).toHaveLength(1);

    const second = await putAlloc(years.y1, [
      { levelCode: '7', subjectId: sub.mtk, weeklyPeriods: 6, yearlyPeriods: null },
      { levelCode: '7', subjectId: sub.ipa, weeklyPeriods: null, yearlyPeriods: null },
      { levelCode: '9', subjectId: sub.bin, weeklyPeriods: null }, // belum ada dan kosong: tidak membuat apa pun
    ]);
    expect(second.json()).toEqual({ upserted: 1, deleted: 1 });
    const after = await listAlloc(years.y1);
    expect(after).toHaveLength(3);
    const mtk7 = after.find((a) => a.levelCode === '7' && a.subjectCode === 'MTK' && !a.programId)!;
    expect(mtk7).toMatchObject({ weeklyPeriods: 6, yearlyPeriods: null, note: null });
    expect(after.some((a) => a.subjectCode === 'IPA')).toBe(false);
  });

  it('baris tahun lain tidak ikut tersentuh', async () => {
    expect(await listAlloc(years.y2)).toHaveLength(0);
  });

  it('validasi tingkat, rujukan, duplikat, JP, dan jumlah baris', async () => {
    const level = await putAlloc(years.y1, [{ levelCode: 'ZZ', subjectId: sub.mtk, weeklyPeriods: 2 }]);
    expect(level.statusCode).toBe(400);
    expect(level.json().error.code).toBe('invalid_level');

    const foreignSubject = await putAlloc(years.y1, [
      { levelCode: '7', subjectId: otherSubjectId, weeklyPeriods: 2 },
    ]);
    expect(foreignSubject.statusCode).toBe(400);
    expect(foreignSubject.json().error.code).toBe('invalid_reference');

    const foreignProgram = await putAlloc(years.y1, [
      { levelCode: '7', programId: otherProgramId, subjectId: sub.mtk, weeklyPeriods: 2 },
    ]);
    expect(foreignProgram.statusCode).toBe(400);
    expect(foreignProgram.json().error.code).toBe('invalid_reference');

    const dup = await putAlloc(years.y1, [
      { levelCode: '7', subjectId: sub.bin, weeklyPeriods: 2 },
      { levelCode: '7', subjectId: sub.bin, weeklyPeriods: 3 },
    ]);
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error.code).toBe('duplicate_entry');

    for (const bad of [-1, 2.5]) {
      const res = await putAlloc(years.y1, [{ levelCode: '7', subjectId: sub.bin, weeklyPeriods: bad }]);
      expect(res.statusCode, String(bad)).toBe(400);
    }

    const tooMany = await putAlloc(
      years.y1,
      Array.from({ length: 501 }, () => ({ levelCode: '7', subjectId: sub.bin, weeklyPeriods: 1 })),
    );
    expect(tooMany.statusCode).toBe(400);

    const noYear = await putAlloc('019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', []);
    expect(noYear.statusCode).toBe(404);

    // Semua atau tidak sama sekali: satu baris buruk membatalkan baris baik.
    const mixed = await putAlloc(years.y1, [
      { levelCode: '9', subjectId: sub.bin, weeklyPeriods: 3 },
      { levelCode: 'ZZ', subjectId: sub.bin, weeklyPeriods: 3 },
    ]);
    expect(mixed.statusCode).toBe(400);
    expect((await listAlloc(years.y1)).some((a) => a.levelCode === '9')).toBe(false);
  });

  it('sekolah lain tidak melihat atau mengubah alokasi sekolah ini', async () => {
    expect((await call('GET', allocUrl(years.y1), otherCookie, undefined, otherSchoolId)).statusCode).toBe(
      404,
    );
    expect((await putAlloc(years.y1, [], otherCookie, otherSchoolId)).statusCode).toBe(404);
    const own = await call('GET', allocUrl(years.other), otherCookie, undefined, otherSchoolId);
    expect(own.statusCode).toBe(200);
    expect(own.json().allocations).toEqual([]);
    // Mapel sekolah ini tidak bisa dialokasikan oleh sekolah lain.
    const cross = await putAlloc(
      years.other,
      [{ levelCode: '7', subjectId: sub.mtk, weeklyPeriods: 1 }],
      otherCookie,
      otherSchoolId,
    );
    expect(cross.statusCode).toBe(400);
    const rows = await db()
      .select()
      .from(curriculumSubjectAllocation)
      .where(eq(curriculumSubjectAllocation.schoolId, otherSchoolId));
    expect(rows).toHaveLength(0);
  });
});

describe('versi kurikulum', () => {
  it('upsert, ubah, dan hapus dengan curriculumKey null', async () => {
    const first = await putVer(years.y1, [
      { levelCode: '7', curriculumKey: refKey, effectiveFrom: '2026-07-13', note: 'awal' },
      { levelCode: '8', curriculumKey: refKey },
    ]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ saved: 2, deleted: 0 });
    const list = (await call('GET', verUrl(years.y1), teacherCookie)).json().versions;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      levelCode: '7',
      curriculumKey: refKey,
      curriculumName: `Kurikulum Uji ${run}`,
      effectiveFrom: '2026-07-13',
      note: 'awal',
    });

    const second = await putVer(years.y1, [
      { levelCode: '7', curriculumKey: refKey, note: 'revisi' },
      { levelCode: '8', curriculumKey: null },
      { levelCode: '9', curriculumKey: null },
    ]);
    expect(second.json()).toEqual({ saved: 1, deleted: 1 });
    const after = (await call('GET', verUrl(years.y1), adminCookie)).json().versions;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ levelCode: '7', effectiveFrom: null, note: 'revisi' });
  });

  it('menolak kurikulum tidak dikenal, tingkat tidak sah, dan duplikat', async () => {
    const key = await putVer(years.y1, [{ levelCode: '7', curriculumKey: 'tidak-ada' }]);
    expect(key.statusCode).toBe(400);
    expect(key.json().error.code).toBe('invalid_curriculum');
    const level = await putVer(years.y1, [{ levelCode: 'ZZ', curriculumKey: refKey }]);
    expect(level.json().error.code).toBe('invalid_level');
    const dup = await putVer(years.y1, [
      { levelCode: '7', curriculumKey: refKey },
      { levelCode: '7', curriculumKey: refKey },
    ]);
    expect(dup.json().error.code).toBe('duplicate_entry');
    expect((await putVer('019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', [])).statusCode).toBe(404);
  });

  it('terisolasi antarsekolah', async () => {
    expect((await call('GET', verUrl(years.y1), otherCookie, undefined, otherSchoolId)).statusCode).toBe(404);
    const rows = await db()
      .select()
      .from(schoolCurriculumVersion)
      .where(eq(schoolCurriculumVersion.schoolId, otherSchoolId));
    expect(rows).toHaveLength(0);
  });
});

describe('rollover menyalin struktur kurikulum', () => {
  const rollover = (body: object) =>
    call('POST', `/v1/academic-years/${years.y1}/rollover`, adminCookie, body);

  it('menyalin alokasi dan versi secara idempoten tanpa menimpa baris yang sudah ada', async () => {
    // Keadaan sumber: 3 alokasi dan 1 versi (tingkat 7) dari tes sebelumnya; tambah versi tingkat 8.
    await putVer(years.y1, [{ levelCode: '8', curriculumKey: refKey, effectiveFrom: '2026-08-01' }]);
    const srcAlloc = await listAlloc(years.y1);
    expect(srcAlloc).toHaveLength(3);

    const dry = await rollover({ targetYearId: years.y2, dryRun: true });
    expect(dry.statusCode).toBe(200);
    expect(dry.json()).toMatchObject({ allocationsCreated: 3, versionsCreated: 2 });
    expect(await listAlloc(years.y2)).toHaveLength(0);

    const res = await rollover({ targetYearId: years.y2 });
    expect(res.json()).toMatchObject({ allocationsCreated: 3, versionsCreated: 2 });
    const copied = await listAlloc(years.y2);
    expect(copied).toHaveLength(3);
    expect(copied.find((a) => a.programId === programId)?.weeklyPeriods).toBe(6);
    const vers = (await call('GET', verUrl(years.y2), adminCookie)).json().versions;
    expect(vers).toHaveLength(2);
    expect(vers.find((v: { levelCode: string }) => v.levelCode === '8').effectiveFrom).toBeNull();
    // Sumber tidak berubah.
    expect(await listAlloc(years.y1)).toHaveLength(3);

    // Ulang: tidak ada yang baru, dan perubahan di tahun tujuan tidak ditimpa.
    await putAlloc(years.y2, [{ levelCode: '7', subjectId: sub.mtk, weeklyPeriods: 9 }]);
    const again = await rollover({ targetYearId: years.y2 });
    expect(again.json()).toMatchObject({ allocationsCreated: 0, versionsCreated: 0 });
    const afterAgain = await listAlloc(years.y2);
    expect(afterAgain).toHaveLength(3);
    expect(
      afterAgain.find((a) => a.levelCode === '7' && a.subjectCode === 'MTK' && !a.programId)?.weeklyPeriods,
    ).toBe(9);
  });

  it('copyCurriculum false tidak menyalin apa pun', async () => {
    await db()
      .delete(curriculumSubjectAllocation)
      .where(eq(curriculumSubjectAllocation.academicYearId, years.y2));
    await db().delete(schoolCurriculumVersion).where(eq(schoolCurriculumVersion.academicYearId, years.y2));
    const res = await rollover({ targetYearId: years.y2, copyCurriculum: false });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ allocationsCreated: 0, versionsCreated: 0 });
    expect(await listAlloc(years.y2)).toHaveLength(0);
    // Tanpa opsi: bawaan true.
    const dflt = await rollover({ targetYearId: years.y2 });
    expect(dflt.json()).toMatchObject({ allocationsCreated: 3, versionsCreated: 2 });
  });
});
