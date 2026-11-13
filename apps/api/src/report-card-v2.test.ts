import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  guardian,
  member,
  portalLink,
  reportCard,
  reportCardResponse,
  reportCardSnapshot,
  reportSubjectNarrative,
  school,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentGuardian,
  subject,
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

/**
 * Tahap 3.2 (rancangan fase 3, tes T7-T10, T14-T16): snapshot v2 sparse, mode deskriptif, deskripsi manual per mapel,
 * deskripsi kokurikuler/perkembangan, tanggapan orang tua/wali, dan isolasi tenant.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let subscriptionId = '';
let subscriptionEnd = new Date();
const schoolIds: string[] = [];
const userIds: string[] = [];
const db = () => app.platformDb;

let sid = '';
let sidB = '';
let sidC = '';
let sem = '';
let year = '';
let mat = '';
let ind = '';
let classA = '';
let classB = '';
let class8 = '';
const S: Record<string, string> = {};
const G: Record<string, string> = {};
const C: Record<string, string> = {};

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
async function join(label: string, schoolId: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await db().insert(member).values({ userId: u.id, schoolId }).returning();
  await assignRoles(db(), m!.id, schoolId, roles);
  return { cookie: await login(u.email), memberId: m!.id };
}
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: object,
  schoolId = sid,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie,
      'x-school-id': schoolId,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });
const code = (res: { json: () => { error: { code: string } } }) => res.json().error.code;
const strip = (doc: Record<string, unknown>) => {
  const { generatedAt: _g, ...rest } = doc;
  return rest;
};

async function makeSchool(slug: string, modules: string[]) {
  const [s] = await db()
    .insert(school)
    .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}` })
    .returning();
  schoolIds.push(s!.id);
  await seedSchoolRoles(db(), s!.id);
  for (const moduleKey of modules) {
    await db()
      .insert(entitlement)
      .values({ schoolId: s!.id, moduleKey, subscriptionId, validUntil: subscriptionEnd });
  }
  return s!.id;
}

async function seedWorld() {
  const [y] = await db()
    .insert(academicYear)
    .values({
      schoolId: sid,
      name: '2000-2099',
      startsOn: '2000-01-01',
      endsOn: '2099-12-31',
      isActive: true,
    })
    .returning();
  year = y!.id;
  const [se] = await db()
    .insert(semester)
    .values({
      schoolId: sid,
      academicYearId: year,
      name: 'Ganjil',
      startsOn: '2026-07-01',
      endsOn: '2026-12-31',
      isActive: true,
    })
    .returning();
  sem = se!.id;
  mat = (
    await db().insert(subject).values({ schoolId: sid, code: 'MAT', name: 'Matematika' }).returning()
  )[0]!.id;
  ind = (
    await db().insert(subject).values({ schoolId: sid, code: 'IND', name: 'Bahasa Indonesia' }).returning()
  )[0]!.id;
  const [comp] = await db()
    .insert(gradeComponent)
    .values({ schoolId: sid, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  const mkClass = async (name: string, level: string, names: string[]) => {
    const [c] = await db()
      .insert(classRoom)
      .values({ schoolId: sid, academicYearId: year, name, level })
      .returning();
    const ids: string[] = [];
    for (const n of names) {
      const [st] = await db()
        .insert(student)
        .values({ schoolId: sid, name: n, gender: 'L', status: 'active', nis: `${n}-${run}` })
        .returning();
      await db()
        .insert(enrollment)
        .values({ schoolId: sid, studentId: st!.id, classId: c!.id, academicYearId: year });
      S[n.toLowerCase()] = st!.id;
      ids.push(st!.id);
    }
    for (const subj of [mat, ind]) {
      const [a] = await db()
        .insert(assessment)
        .values({
          schoolId: sid,
          semesterId: sem,
          classId: c!.id,
          subjectId: subj,
          componentId: comp!.id,
          title: 'Tugas',
          date: '2026-08-01',
        })
        .returning();
      let v = 70;
      for (const studentId of ids) {
        v += 7;
        await db()
          .insert(score)
          .values({ schoolId: sid, assessmentId: a!.id, studentId, value: v, updatedBy: 'uji' });
      }
    }
    return c!.id;
  };
  classA = await mkClass('7A', '7', ['Ani', 'Budi', 'Citra']);
  classB = await mkClass('7B', '7', ['Dedi']);
  class8 = await mkClass('8A', '8', ['Edo', 'Fani']);
}

async function guardianUser(label: string, children: string[], withAccount = true) {
  const [g] = await db()
    .insert(guardian)
    .values({ schoolId: sid, name: `Wali ${label}` })
    .returning();
  G[label] = g!.id;
  for (const child of children) {
    await db()
      .insert(studentGuardian)
      .values({ schoolId: sid, studentId: S[child]!, guardianId: g!.id, relation: 'mother' });
  }
  if (!withAccount) return '';
  const j = await join(`g-${label}`, sid, ['guardian']);
  await db()
    .insert(portalLink)
    .values({ schoolId: sid, memberId: j.memberId, kind: 'guardian', guardianId: g!.id });
  return j.cookie;
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan V2', slug: `yv2-${run}` })
    .returning();
  foundationId = f!.id;
  const [sub] = await db()
    .insert(subscription)
    .values({
      foundationId,
      period: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  subscriptionId = sub!.id;
  subscriptionEnd = sub!.currentPeriodEnd;
  sid = await makeSchool('a', ['grades', 'parent_portal']);
  sidB = await makeSchool('b', ['grades', 'parent_portal']);
  sidC = await makeSchool('c', ['parent_portal']);
  await seedWorld();
  C.admin = (await join('admin', sid, ['school_admin'])).cookie;
  C.adminB = (await join('adminb', sidB, ['school_admin'])).cookie;
  C.teacher = (await join('teacher', sid, ['teacher'])).cookie;
  C.gAni = await guardianUser('ani', ['ani']);
  C.gAni2 = await guardianUser('ani2', ['ani']);
  C.gAni3 = await guardianUser('ani3', ['ani'], false);
  C.gBudi = await guardianUser('budi', ['budi']);
  C.gDedi = await guardianUser('dedi', ['dedi']);
  C.gEdo = await guardianUser('edo', ['edo']);
  const stu = await join('stu-ani', sid, ['student']);
  await db()
    .insert(portalLink)
    .values({ schoolId: sid, memberId: stu.memberId, kind: 'student', studentId: S.ani! });
  C.stuAni = stu.cookie;
}, 180_000);

afterAll(async () => {
  const tables = await db().execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'school_id' and table_name <> 'school'`,
  );
  for (let pass = 0; pass < 5; pass++) {
    for (const sId of schoolIds) {
      for (const { table_name } of tables.rows) {
        await db()
          .execute(sql`delete from ${sql.identifier(table_name)} where school_id = ${sId}`)
          .catch(() => undefined);
      }
    }
  }
  for (const sId of schoolIds) await db().delete(school).where(eq(school.id, sId));
  await db().execute(sql`delete from subscription where foundation_id = ${foundationId}`);
  await db().delete(foundation).where(eq(foundation.id, foundationId));
  for (const uid of userIds) await db().delete(user).where(eq(user.id, uid));
  await app.close();
});

const docUrl = (studentId: string) => `/v1/report-cards/${studentId}?semesterId=${sem}`;
const portalDoc = (studentId: string) => `/v1/portal/children/${studentId}/report-cards/${sem}`;
const respUrl = (studentId: string) => `${portalDoc(studentId)}/response`;
const finalize = (classId: string, force = false) =>
  call('POST', '/v1/report-cards/finalize', C.admin!, { semesterId: sem, classId, force });
const reopen = (classId: string) =>
  call('POST', '/v1/report-cards/reopen', C.admin!, { semesterId: sem, classId });
const rows = (classId: string) => db().select().from(reportCard).where(eq(reportCard.classId, classId));

describe('T8: snapshot v2 sparse', () => {
  it('draf tanpa bagian v2 identik v1 (tanpa schemaVersion, reportMode, dll.)', async () => {
    const res = await call('GET', docUrl(S.budi!), C.admin!);
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    for (const k of [
      'schemaVersion',
      'reportMode',
      'cocurricularNote',
      'developmentNote',
      'guardianResponses',
    ]) {
      expect(doc).not.toHaveProperty(k);
    }
    expect(doc.subjects[0]).not.toHaveProperty('descriptionSource');
  });

  it('catatan kokurikuler satu murid: hanya murid itu berversi 2, murid lain di kelas sama tetap v1', async () => {
    const put = await call('PUT', '/v1/report-cards/sections', C.admin!, {
      semesterId: sem,
      studentId: S.ani,
      cocurricularNote: 'Aktif dalam kegiatan Pramuka.',
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().cocurricularNote).toBe('Aktif dalam kegiatan Pramuka.');
    const empty = await call('PUT', '/v1/report-cards/sections', C.admin!, {
      semesterId: sem,
      studentId: S.ani,
    });
    expect(empty.statusCode).toBe(400);
    const draft = (await call('GET', docUrl(S.ani!), C.admin!)).json();
    expect(draft.schemaVersion).toBe(2);
    expect(draft.cocurricularNote).toBe('Aktif dalam kegiatan Pramuka.');
    expect((await call('GET', docUrl(S.budi!), C.admin!)).json()).not.toHaveProperty('schemaVersion');

    expect((await finalize(classA)).statusCode).toBe(200);
    const byStudent = Object.fromEntries((await rows(classA)).map((r) => [r.studentId, r]));
    expect(byStudent[S.ani!]!.schemaVersion).toBe(2);
    expect(byStudent[S.budi!]!.schemaVersion).toBe(1);
    expect(byStudent[S.citra!]!.schemaVersion).toBe(1);
    const budiKeys = Object.keys(byStudent[S.budi!]!.snapshot as object).sort();
    expect(budiKeys).toEqual(
      [
        'status',
        'school',
        'semester',
        'student',
        'subjects',
        'extracurriculars',
        'attendance',
        'homeroomNote',
        'homeroomTeacher',
        'principal',
        'rank',
        'generatedAt',
      ].sort(),
    );
    const hist = await db().select().from(reportCardSnapshot).where(eq(reportCardSnapshot.studentId, S.ani!));
    expect(hist.find((h) => h.kind === 'finalized')?.schemaVersion).toBe(2);
    const ani = (await call('GET', docUrl(S.ani!), C.admin!)).json();
    expect(ani.schemaVersion).toBe(2);
    expect(ani.cocurricularNote).toBe('Aktif dalam kegiatan Pramuka.');
  });

  it('mode deskriptif: portal tanpa angka, staf dengan angka, kelengkapan memakai deskripsi', async () => {
    const lv = await call('POST', '/v1/school/levels', C.admin!, {
      code: '8',
      label: 'Kelas 8',
      reportMode: 'descriptive',
    });
    expect(lv.statusCode).toBe(201);
    expect(lv.json().reportMode).toBe('descriptive');
    const levels = (await call('GET', '/v1/school/levels', C.admin!)).json();
    expect(levels[0].reportMode).toBe('descriptive');

    const blocked = await finalize(class8);
    expect(blocked.statusCode).toBe(409);
    expect(code(blocked)).toBe('grades_incomplete');
    expect(blocked.json().error.message).toContain('deskripsi');

    for (const subj of [mat, ind]) {
      const put = await call('PUT', '/v1/report-cards/narratives', C.admin!, {
        semesterId: sem,
        classId: class8,
        subjectId: subj,
        items: [
          { studentId: S.edo, text: 'Edo menunjukkan kemajuan yang konsisten.' },
          { studentId: S.fani, text: 'Fani perlu pendampingan pada beberapa bagian.' },
        ],
      });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({ saved: 2, removed: 0 });
    }
    await call('PUT', '/v1/report-cards/sections', C.admin!, {
      semesterId: sem,
      studentId: S.edo,
      developmentNote: 'Berkembang baik dalam kemandirian.',
    });
    expect((await finalize(class8)).statusCode).toBe(200);

    const staff = (await call('GET', docUrl(S.edo!), C.admin!)).json();
    expect(staff.schemaVersion).toBe(2);
    expect(staff.reportMode).toBe('descriptive');
    expect(staff.developmentNote).toBe('Berkembang baik dalam kemandirian.');
    expect(typeof staff.subjects[0].final).toBe('number');
    expect(staff.subjects[0].descriptionSource).toBe('manual');
    expect(staff.subjects[0].description).toContain('Edo');

    const portal = (await call('GET', portalDoc(S.edo!), C.gEdo!)).json();
    expect(portal.reportMode).toBe('descriptive');
    expect(portal).not.toHaveProperty('rank');
    for (const s of portal.subjects) {
      for (const k of ['final', 'predicate', 'kkm', 'belowKkm']) expect(s).not.toHaveProperty(k);
      expect(s.description).toContain('Edo');
    }
    const list = (await call('GET', `/v1/portal/children/${S.edo}/report-cards`, C.gEdo!)).json();
    expect(list.items[0].average).toBeNull();
    const staffList = (
      await call('GET', `/v1/report-cards?semesterId=${sem}&classId=${class8}`, C.admin!)
    ).json();
    expect(typeof staffList[0].average).toBe('number');
    // Fani tanpa catatan perkembangan: tetap v2 karena mode deskriptif, tanpa developmentNote.
    const fani = (await call('GET', docUrl(S.fani!), C.admin!)).json();
    expect(fani.schemaVersion).toBe(2);
    expect(fani).not.toHaveProperty('developmentNote');
  });
});

describe('T7: rapor v1 final dibaca lewat semua pembaca tanpa perubahan', () => {
  it('staf dan portal mengembalikan snapshot v1 apa adanya', async () => {
    const [row] = (await rows(classA)).filter((r) => r.studentId === S.budi);
    const expected = { ...(row!.snapshot as object), status: 'final' };
    expect((await call('GET', docUrl(S.budi!), C.admin!)).json()).toEqual(expected);
    expect((await call('GET', portalDoc(S.budi!), C.gBudi!)).json()).toEqual(expected);
    const list = (await call('GET', `/v1/portal/children/${S.budi}/report-cards`, C.gBudi!)).json();
    expect(Object.keys(list.items[0]).sort()).toEqual(
      [
        'academicYear',
        'average',
        'className',
        'finalizedAt',
        'semesterId',
        'semesterName',
        'subjectsGraded',
        'subjectsTotal',
      ].sort(),
    );
    expect(typeof list.items[0].average).toBe('number');
  });
});

describe('T10: guard report_final dan tanggapan', () => {
  it('jalur tulis draf ditolak 409 report_final saat final', async () => {
    const sections = await call('PUT', '/v1/report-cards/sections', C.admin!, {
      semesterId: sem,
      studentId: S.ani,
      cocurricularNote: 'ubah',
    });
    expect(sections.statusCode).toBe(409);
    expect(code(sections)).toBe('report_final');
    const narr = await call('PUT', '/v1/report-cards/narratives', C.admin!, {
      semesterId: sem,
      classId: classA,
      subjectId: mat,
      items: [{ studentId: S.ani, text: 'ubah' }],
    });
    expect(narr.statusCode).toBe(409);
    expect(code(narr)).toBe('report_final');
  });

  it('tanggapan ditolak sebelum final (kelas 7B belum difinalkan)', async () => {
    const res = await call('PUT', respUrl(S.dedi!), C.gDedi!, { text: 'Terima kasih.' });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('report_not_final');
    const staff = await call('PUT', '/v1/report-cards/responses', C.admin!, {
      semesterId: sem,
      studentId: S.dedi,
      guardianId: G.dedi,
      text: 'Salinan.',
    });
    expect(code(staff)).toBe('report_not_final');
    const state = (await call('GET', respUrl(S.dedi!), C.gDedi!)).json();
    expect(state).toMatchObject({ final: false, open: false, response: null });
  });
});

describe('T15: portal tanggapan wali', () => {
  it('wali menulis tanggapan atas anaknya; wali lain tidak melihat', async () => {
    const put = await call('PUT', respUrl(S.ani!), C.gAni!, { text: '  Terima kasih, Bu Guru.  ' });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({
      text: 'Terima kasih, Bu Guru.',
      recordedByKind: 'guardian',
      snapshotVersion: 1,
      outdated: false,
    });
    const mine = (await call('GET', portalDoc(S.ani!), C.gAni!)).json();
    expect(mine.guardianResponses).toHaveLength(1);
    const other = (await call('GET', portalDoc(S.ani!), C.gAni2!)).json();
    expect(other).not.toHaveProperty('guardianResponses');
    expect((await call('GET', respUrl(S.ani!), C.gAni2!)).json().response).toBeNull();
    // Tautan siswa tidak melihat tanggapan wali.
    const stuDoc = (await call('GET', portalDoc(S.ani!), C.stuAni!)).json();
    expect(stuDoc).not.toHaveProperty('guardianResponses');
  });

  it('tautan siswa ditolak menulis; wali anak lain 404; validasi panjang dan teks kosong', async () => {
    const stu = await call('PUT', respUrl(S.ani!), C.stuAni!, { text: 'saya' });
    expect(stu.statusCode).toBe(403);
    expect(code(stu)).toBe('forbidden');
    const stuGet = await call('GET', respUrl(S.ani!), C.stuAni!);
    expect(stuGet.statusCode).toBe(403);
    expect((await call('PUT', respUrl(S.ani!), C.gDedi!, { text: 'x' })).statusCode).toBe(404);
    expect((await call('PUT', respUrl(S.ani!), C.gAni!, { text: 'x'.repeat(1001) })).statusCode).toBe(400);
    expect((await call('PUT', respUrl(S.ani!), C.gAni!, { text: '   ' })).statusCode).toBe(400);
    expect((await call('PUT', respUrl(S.ani!), C.teacher!, { text: 'x' })).statusCode).toBe(403);
  });

  it('staf melihat semua tanggapan, menyalin atas nama wali lain, tetapi tidak menimpa tanggapan wali sendiri', async () => {
    const list = (
      await call('GET', `/v1/report-cards/responses?semesterId=${sem}&studentId=${S.ani}`, C.admin!)
    ).json();
    expect(list.final).toBe(true);
    expect(list.open).toBe(true);
    expect(list.guardians).toHaveLength(3);
    expect(list.responses).toHaveLength(1);
    const overwrite = await call('PUT', '/v1/report-cards/responses', C.admin!, {
      semesterId: sem,
      studentId: S.ani,
      guardianId: G.ani,
      text: 'Ditimpa staf',
    });
    expect(overwrite.statusCode).toBe(409);
    expect(code(overwrite)).toBe('guardian_response_exists');
    const copy = await call('PUT', '/v1/report-cards/responses', C.admin!, {
      semesterId: sem,
      studentId: S.ani,
      guardianId: G.ani3,
      text: 'Disalin dari rapor kertas.',
    });
    expect(copy.statusCode).toBe(200);
    expect(copy.json().recordedByKind).toBe('staff');
    const foreign = await call('PUT', '/v1/report-cards/responses', C.admin!, {
      semesterId: sem,
      studentId: S.ani,
      guardianId: G.dedi,
      text: 'wali lain',
    });
    expect(foreign.statusCode).toBe(400);
    const staffDoc = (await call('GET', docUrl(S.ani!), C.admin!)).json();
    expect(staffDoc.guardianResponses).toHaveLength(2);
    const mine = (await call('GET', portalDoc(S.ani!), C.gAni!)).json();
    expect(mine.guardianResponses).toHaveLength(1);
    expect(mine.guardianResponses[0].guardianId).toBe(G.ani);
  });

  it('jendela tanggapan: sesudah batas 409 response_closed, tanpa batas terbuka lagi', async () => {
    const setPut = (extra: object) =>
      call('PUT', '/v1/report-cards/settings', C.admin!, {
        descA: 'A',
        descB: 'B',
        descC: 'C',
        descD: 'D',
        showRank: false,
        ...extra,
      });
    const s1 = await setPut({ responseWindowDays: 1, showCocurricular: true });
    expect(s1.statusCode).toBe(200);
    expect(s1.json()).toMatchObject({
      responseWindowDays: 1,
      showCocurricular: true,
      showGuardianResponse: false,
    });
    await db().execute(
      sql`update report_card set finalized_at = now() - interval '2 days' where school_id = ${sid} and student_id = ${S.ani}`,
    );
    const closed = await call('PUT', respUrl(S.ani!), C.gAni!, { text: 'terlambat' });
    expect(closed.statusCode).toBe(409);
    expect(code(closed)).toBe('response_closed');
    expect((await call('GET', respUrl(S.ani!), C.gAni!)).json().open).toBe(false);
    // Bagian opsional dihilangkan = tidak berubah.
    const s2 = await setPut({ responseWindowDays: null });
    expect(s2.json()).toMatchObject({ responseWindowDays: null, showCocurricular: true });
    expect((await call('PUT', respUrl(S.ani!), C.gAni!, { text: 'Masih bisa.' })).statusCode).toBe(200);
    const s3 = await setPut({});
    expect(s3.json()).toMatchObject({ responseWindowDays: null, showCocurricular: true });
    expect((await setPut({ responseWindowDays: 0 })).statusCode).toBe(400);
  });

  it('hapus wali yang punya tanggapan ditolak 409 guardian_in_use', async () => {
    const unlink = await call('DELETE', `/v1/students/${S.ani}/guardians/${G.ani3}`, C.admin!);
    expect(unlink.statusCode).toBe(200);
    const del = await call('DELETE', `/v1/guardians/${G.ani3}`, C.admin!);
    expect(del.statusCode).toBe(409);
    expect(code(del)).toBe('guardian_in_use');
    const still = await db().select().from(guardian).where(eq(guardian.id, G.ani3!));
    expect(still).toHaveLength(1);
  });
});

describe('T9: reopen dan finalisasi ulang', () => {
  it('deskripsi manual, catatan, dan tanggapan bertahan; tanggapan bertanda versi lama; ulang tanpa perubahan = sama', async () => {
    expect((await reopen(classA)).statusCode).toBe(200);
    const kept = (
      await call('GET', `/v1/report-cards/responses?semesterId=${sem}&studentId=${S.ani}`, C.admin!)
    ).json();
    expect(kept.responses).toHaveLength(2);
    const draft = (await call('GET', docUrl(S.ani!), C.admin!)).json();
    expect(draft.cocurricularNote).toBe('Aktif dalam kegiatan Pramuka.');
    // Sesudah reopen guard terbuka lagi.
    const narr = await call('PUT', '/v1/report-cards/narratives', C.admin!, {
      semesterId: sem,
      classId: classA,
      subjectId: mat,
      items: [{ studentId: S.budi, text: 'Budi menguasai materi dengan baik.' }],
    });
    expect(narr.statusCode).toBe(200);
    const gridRead = (
      await call(
        'GET',
        `/v1/report-cards/narratives?semesterId=${sem}&classId=${classA}&subjectId=${mat}`,
        C.admin!,
      )
    ).json();
    const budiRow = gridRead.students.find((s: { studentId: string }) => s.studentId === S.budi);
    expect(budiRow).toMatchObject({ manual: 'Budi menguasai materi dengan baik.', source: 'manual' });
    const aniRow = gridRead.students.find((s: { studentId: string }) => s.studentId === S.ani);
    expect(aniRow.source).toBe('predicate');
    const budiDraft = (await call('GET', docUrl(S.budi!), C.admin!)).json();
    expect(budiDraft.schemaVersion).toBe(2);
    const matRow = budiDraft.subjects.find((s: { subjectId: string }) => s.subjectId === mat);
    expect(matRow).toMatchObject({
      descriptionSource: 'manual',
      description: 'Budi menguasai materi dengan baik.',
    });

    expect((await finalize(classA)).statusCode).toBe(200);
    const snap1 = Object.fromEntries(
      (await rows(classA)).map((r) => [r.studentId, strip(r.snapshot as never)]),
    );
    expect((await rows(classA)).find((r) => r.studentId === S.budi)!.schemaVersion).toBe(2);
    expect((await rows(classA)).find((r) => r.studentId === S.citra)!.schemaVersion).toBe(1);

    const outdated = (await call('GET', respUrl(S.ani!), C.gAni!)).json();
    expect(outdated.response).toMatchObject({ snapshotVersion: 1, outdated: true });
    const refreshed = await call('PUT', respUrl(S.ani!), C.gAni!, { text: 'Tanggapan baru.' });
    expect(refreshed.json()).toMatchObject({ snapshotVersion: 3, outdated: false });

    // Reopen + finalisasi ulang tanpa perubahan data: snapshot sama kecuali generatedAt.
    expect((await reopen(classA)).statusCode).toBe(200);
    expect((await finalize(classA)).statusCode).toBe(200);
    const snap2 = Object.fromEntries(
      (await rows(classA)).map((r) => [r.studentId, strip(r.snapshot as never)]),
    );
    expect(snap2).toEqual(snap1);
    expect(
      (await db().select().from(reportCardResponse).where(eq(reportCardResponse.studentId, S.ani!))).length,
    ).toBe(2);
    expect(
      (await db().select().from(reportSubjectNarrative).where(eq(reportSubjectNarrative.studentId, S.budi!)))
        .length,
    ).toBe(1);
  });

  it('menghapus deskripsi manual (teks kosong) mengembalikan deskripsi otomatis', async () => {
    expect((await reopen(classA)).statusCode).toBe(200);
    const res = await call('PUT', '/v1/report-cards/narratives', C.admin!, {
      semesterId: sem,
      classId: classA,
      subjectId: mat,
      items: [{ studentId: S.budi, text: '' }],
    });
    expect(res.json()).toMatchObject({ saved: 0, removed: 1 });
    expect((await call('GET', docUrl(S.budi!), C.admin!)).json()).not.toHaveProperty('schemaVersion');
  });
});

describe('T14: isolasi multi-tenant', () => {
  it('sekolah B tidak membaca atau menulis data sekolah A', async () => {
    const b = C.adminB!;
    const r1 = await call(
      'GET',
      `/v1/report-cards/responses?semesterId=${sem}&studentId=${S.ani}`,
      b,
      undefined,
      sidB,
    );
    expect([400, 404]).toContain(r1.statusCode);
    const r2 = await call(
      'PUT',
      '/v1/report-cards/narratives',
      b,
      { semesterId: sem, classId: classA, subjectId: mat, items: [{ studentId: S.ani, text: 'x' }] },
      sidB,
    );
    expect(r2.statusCode).toBe(400);
    const r3 = await call(
      'PUT',
      '/v1/report-cards/sections',
      b,
      { semesterId: sem, studentId: S.ani, cocurricularNote: 'x' },
      sidB,
    );
    expect([400, 404]).toContain(r3.statusCode);
    const r4 = await call(
      'PUT',
      '/v1/report-cards/responses',
      b,
      { semesterId: sem, studentId: S.ani, guardianId: G.ani, text: 'x' },
      sidB,
    );
    expect([400, 404]).toContain(r4.statusCode);
  });

  it('FK komposit menolak rujukan lintas sekolah', async () => {
    await expect(
      db().insert(reportCardResponse).values({
        schoolId: sidB,
        semesterId: sem,
        studentId: S.ani!,
        guardianId: G.ani!,
        text: 'x',
        recordedBy: 'uji',
        recordedByKind: 'staff',
      }),
    ).rejects.toThrow();
    await expect(
      db().insert(reportSubjectNarrative).values({
        schoolId: sidB,
        semesterId: sem,
        classId: classA,
        subjectId: mat,
        studentId: S.ani!,
        text: 'x',
        updatedBy: 'uji',
      }),
    ).rejects.toThrow();
  });
});

describe('T15: modul dan izin', () => {
  it('modul grades nonaktif menolak tanggapan portal', async () => {
    const j = await join('g-c', sidC, ['guardian']);
    const [st] = await db()
      .insert(student)
      .values({ schoolId: sidC, name: 'Gita', gender: 'P', status: 'active' })
      .returning();
    const [g] = await db().insert(guardian).values({ schoolId: sidC, name: 'Wali Gita' }).returning();
    await db()
      .insert(studentGuardian)
      .values({ schoolId: sidC, studentId: st!.id, guardianId: g!.id, relation: 'mother' });
    await db()
      .insert(portalLink)
      .values({ schoolId: sidC, memberId: j.memberId, kind: 'guardian', guardianId: g!.id });
    const url = `/v1/portal/children/${st!.id}/report-cards/${sem}/response`;
    const res = await call('PUT', url, j.cookie, { text: 'x' }, sidC);
    expect(res.statusCode).toBe(403);
    expect((await call('GET', url, j.cookie, undefined, sidC)).statusCode).toBe(403);
  });

  it('wali dan guru tanpa penugasan tidak menulis rute staf', async () => {
    expect(
      (
        await call('PUT', '/v1/report-cards/sections', C.gAni!, {
          semesterId: sem,
          studentId: S.ani,
          cocurricularNote: 'x',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await call('GET', `/v1/report-cards/responses?semesterId=${sem}&studentId=${S.ani}`, C.gAni!))
        .statusCode,
    ).toBe(403);
    const narr = await call('PUT', '/v1/report-cards/narratives', C.teacher!, {
      semesterId: sem,
      classId: classA,
      subjectId: mat,
      items: [{ studentId: S.ani, text: 'x' }],
    });
    expect(narr.statusCode).toBe(403);
  });
});

describe('tabel dan pengaturan', () => {
  it('bawaan kolom baru = perilaku lama', async () => {
    const fresh = await call('GET', '/v1/report-cards/settings', C.adminB!, undefined, sidB);
    expect(fresh.json()).toMatchObject({
      showCocurricular: false,
      showGuardianResponse: false,
      responseWindowDays: 30,
    });
    const bLevels = await call('GET', '/v1/school/levels', C.adminB!, undefined, sidB);
    expect(bLevels.json()).toEqual([]);
    expect(classB).toBeTruthy();
  });
});

/** Semua angka (number) yang ditemukan di pohon respons, beserta jalurnya. */
const numbersIn = (v: unknown, path = '$'): string[] => {
  if (typeof v === 'number') return [path];
  if (Array.isArray(v)) return v.flatMap((x, i) => numbersIn(x, `${path}[${i}]`));
  if (v && typeof v === 'object') {
    return Object.entries(v).flatMap(([k, x]) => numbersIn(x, `${path}.${k}`));
  }
  return [];
};

describe('tahap 3.2b: celah mode deskriptif (portal nilai dan daftar rapor staf)', () => {
  const gradesUrl = (studentId: string, q = '') => `/v1/portal/children/${studentId}/grades${q}`;
  const listUrl = (classId: string) => `/v1/report-cards?semesterId=${sem}&classId=${classId}`;

  it('portal wali kelas deskriptif: tab nilai tanpa satu angka pun di seluruh pohon respons', async () => {
    for (const url of [gradesUrl(S.edo!), gradesUrl(S.edo!, `?semesterId=${sem}`)]) {
      const res = await call('GET', url, C.gEdo!);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.reportMode).toBe('descriptive');
      expect(body.available).toBe(true);
      expect(body.subjects).toEqual([]);
      expect(body.recentScores).toEqual([]);
      expect(body).not.toHaveProperty('formative');
      expect(body).not.toHaveProperty('source');
      expect(body.kkm).toBeNull();
      expect(body.average).toBeNull();
      expect(numbersIn(body)).toEqual([]);
    }
  });

  it('ikhtisar portal kelas deskriptif: tanpa skor terbaru, bertanda reportMode', async () => {
    const res = await call('GET', `/v1/portal/children/${S.edo}/overview`, C.gEdo!);
    expect(res.statusCode).toBe(200);
    const { grades, reportCards } = res.json();
    expect(grades.reportMode).toBe('descriptive');
    expect(grades.recentScores).toEqual([]);
    for (const item of reportCards.items) expect(item.average).toBeNull();
  });

  it('staf tetap memuat angka di kelas deskriptif', async () => {
    const doc = (await call('GET', docUrl(S.edo!), C.admin!)).json();
    expect(typeof doc.subjects[0].final).toBe('number');
    expect(typeof doc.subjects[0].kkm).toBe('number');
    const list = (await call('GET', listUrl(class8), C.admin!)).json();
    expect(typeof list[0].average).toBe('number');
  });

  it('kelas numerik tetap identik: angka tampil, tanpa field reportMode', async () => {
    const res = await call('GET', gradesUrl(S.ani!), C.gAni!);
    const body = res.json();
    expect(body).not.toHaveProperty('reportMode');
    expect(typeof body.average).toBe('number');
    expect(typeof body.subjects[0].final).toBe('number');
    expect(body.recentScores.length).toBeGreaterThan(0);
    const overview = (await call('GET', `/v1/portal/children/${S.ani}/overview`, C.gAni!)).json();
    expect(overview.grades).not.toHaveProperty('reportMode');
    expect(overview.grades.recentScores.length).toBeGreaterThan(0);
  });

  it('daftar rapor staf mode deskriptif: kelengkapan berbasis deskripsi (draf dan beku), angka rata-rata tetap', async () => {
    expect((await reopen(class8)).statusCode).toBe(200);
    // Hapus deskripsi Fani untuk Matematika: nilai akhir Fani tetap lengkap (2 dari 2), deskripsinya 1 dari 2.
    const del = await call('PUT', '/v1/report-cards/narratives', C.admin!, {
      semesterId: sem,
      classId: class8,
      subjectId: mat,
      items: [{ studentId: S.fani, text: '' }],
    });
    expect(del.json()).toMatchObject({ saved: 0, removed: 1 });
    const draft = (await call('GET', listUrl(class8), C.admin!)).json();
    const byName = (list: { name: string }[], n: string) =>
      list.find((r) => r.name === n) as unknown as Record<string, number>;
    expect(byName(draft, 'Fani')).toMatchObject({ subjectsGraded: 1, subjectsTotal: 2 });
    expect(byName(draft, 'Edo')).toMatchObject({ subjectsGraded: 2, subjectsTotal: 2 });
    expect(typeof byName(draft, 'Fani').average).toBe('number');

    expect((await finalize(class8)).statusCode).toBe(409);
    expect((await finalize(class8, true)).statusCode).toBe(200);
    const frozen = (await call('GET', listUrl(class8), C.admin!)).json();
    expect(byName(frozen, 'Fani')).toMatchObject({ subjectsGraded: 1, subjectsTotal: 2 });
    expect(byName(frozen, 'Edo')).toMatchObject({ subjectsGraded: 2, subjectsTotal: 2 });
    expect(typeof byName(frozen, 'Fani').average).toBe('number');
  });

  it('daftar rapor staf kelas numerik tetap berbasis nilai akhir', async () => {
    const list = (await call('GET', listUrl(classA), C.admin!)).json();
    for (const r of list) expect(r).toMatchObject({ subjectsGraded: 2, subjectsTotal: 2 });
  });

  it('multi-tenant: sekolah B tidak membaca daftar kelas sekolah A', async () => {
    const res = await call('GET', listUrl(class8), C.adminB!, undefined, sidB);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    const gradesB = await call('GET', gradesUrl(S.edo!), C.adminB!, undefined, sidB);
    expect([403, 404]).toContain(gradesB.statusCode);
  });
});
