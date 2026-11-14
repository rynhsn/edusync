import { todayIn } from '@edusync/contracts';
import {
  academicYear,
  assessment,
  assignRoles,
  classRoom,
  createDb,
  dailyAttendance,
  enrollment,
  entitlement,
  eq,
  foundation,
  gradeComponent,
  member,
  school,
  schoolLevel,
  score,
  seedSchoolRoles,
  semester,
  sql,
  student,
  studentTransfer,
  subject,
  subscription,
  teacher,
  user,
  withTenant,
} from '@edusync/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { buildLedger } from './ledger-lib';
import { loadClassContext } from './report-card-lib';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // CI mengisi variabel langsung.
}

/**
 * Tahap 3C.2 (T14): legger kelas `GET /v1/report-cards/ledger`. Angka sama dengan rapor dan daftar rapor (bahan yang sama),
 * rapor final dari snapshot, murid pindah/lulusan ikut menurut roster semester, mapel tidak diambil (`notTaken`), mode deskriptif,
 * izin (wali kelas), multi-tenant, dan jumlah kueri yang tidak bergantung pada jumlah murid.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = todayIn('Asia/Jakarta');
const day = (n: number) => addDays(today, n);

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherSchoolId = '';
let noModuleSchoolId = '';
let foundationId = '';
let adminCookie = '';
let principalCookie = '';
let waliCookie = '';
let guruCookie = '';
let otherAdminCookie = '';
let noModuleCookie = '';
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
  method: 'GET' | 'POST' | 'PUT',
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
const ledgerUrl = (classKey = 'xiA', semKey = 'ganjil') =>
  `/v1/report-cards/ledger?semesterId=${ids[semKey]}&classId=${ids[classKey]}`;
const listUrl = () => `/v1/report-cards?semesterId=${ids.ganjil}&classId=${ids.xiA}`;
const docUrl = (key: string) => `/v1/report-cards/${ids[key]}?semesterId=${ids.ganjil}`;

type Ledger = {
  reportMode?: 'descriptive';
  showRank: boolean;
  subjects: { id: string; name: string; kkm: number }[];
  students: {
    studentId: string;
    name: string;
    status: 'draft' | 'final';
    source: 'snapshot' | 'live';
    cells: {
      subjectId: string;
      final: number | null;
      predicate: string | null;
      belowKkm?: true;
      notTaken?: true;
    }[];
    average: number | null;
    subjectsGraded: number;
    subjectsTotal: number;
    rank: { position: number; of: number } | null;
    attendance: { sick: number; excused: number; absent: number; late: number };
  }[];
};
const getLedger = async (cookie = adminCookie, url = ledgerUrl()) => {
  const res = await call('GET', url, cookie);
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as Ledger;
};
const rowOf = (l: Ledger, key: string) => l.students.find((s) => s.studentId === ids[key])!;
const cellOf = (l: Ledger, key: string, subjectKey: string) =>
  rowOf(l, key).cells.find((c) => c.subjectId === ids[subjectKey])!;

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const db = app.platformDb;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Legger', slug: `yl-${run}` })
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
  const mkSchool = async (slug: string, name: string, modules: string[]) => {
    const [s] = await db
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name })
      .returning();
    await seedSchoolRoles(db, s!.id);
    for (const moduleKey of modules) {
      await db
        .insert(entitlement)
        .values({ schoolId: s!.id, moduleKey, subscriptionId: sub!.id, validUntil: sub!.currentPeriodEnd });
    }
    return s!.id;
  };
  schoolId = await mkSchool('lgr', 'Sekolah Legger', ['grades', 'attendance']);
  otherSchoolId = await mkSchool('lgr2', 'Sekolah Lain', ['grades']);
  noModuleSchoolId = await mkSchool('lgr3', 'Sekolah Tanpa Modul', ['attendance']);

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: 'Berjalan', startsOn: day(-100), endsOn: day(200), isActive: true })
    .returning();
  ids.year = y!.id;
  const [oldYear] = await db
    .insert(academicYear)
    .values({ schoolId, name: 'Lama', startsOn: day(-400), endsOn: day(-101), isActive: false })
    .returning();
  ids.oldYear = oldYear!.id;
  const mkSem = async (name: string, startsOn: string, endsOn: string, isActive = false) => {
    const [s] = await db
      .insert(semester)
      .values({ schoolId, academicYearId: ids.year!, name, startsOn, endsOn, isActive })
      .returning();
    return s!.id;
  };
  ids.ganjil = await mkSem('Ganjil', day(-100), day(20), true);
  ids.genap = await mkSem('Genap', day(21), day(200));

  const join = async (label: string, sid: string, roles: string[]) => {
    const u = await makeUser(label);
    const [m] = await db.insert(member).values({ userId: u.id, schoolId: sid }).returning();
    await assignRoles(db, m!.id, sid, roles);
    return { cookie: await login(u.email), memberId: m!.id };
  };
  adminCookie = (await join('admin-legger', schoolId, ['school_admin'])).cookie;
  principalCookie = (await join('kepsek-legger', schoolId, ['principal'])).cookie;
  guruCookie = (await join('guru-legger', schoolId, ['teacher'])).cookie;
  const wali = await join('wali-legger', schoolId, ['teacher']);
  waliCookie = wali.cookie;
  otherAdminCookie = (await join('admin-lain-legger', otherSchoolId, ['school_admin'])).cookie;
  noModuleCookie = (await join('admin-tanpa-modul-legger', noModuleSchoolId, ['school_admin'])).cookie;

  const mkClass = async (name: string, yearId = ids.year!) => {
    const [c] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: yearId, name, level: 'XI' })
      .returning();
    return c!.id;
  };
  ids.xiA = await mkClass('XI A');
  ids.xiB = await mkClass('XI B');
  ids.lama = await mkClass('X Lama', ids.oldYear);
  const [tWali] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Bu Wali', memberId: wali.memberId })
    .returning();
  await db.update(classRoom).set({ homeroomTeacherId: tWali!.id }).where(eq(classRoom.id, ids.xiA));

  const mkSubject = async (subjectCode: string, name: string) => {
    const [s] = await db.insert(subject).values({ schoolId, code: subjectCode, name }).returning();
    return s!.id;
  };
  ids.mat = await mkSubject('MAT', 'Matematika');
  ids.fis = await mkSubject('FIS', 'Fisika');

  const mkStudent = async (
    key: string,
    name: string,
    status: 'active' | 'graduated' | 'transferred' = 'active',
    classKey = 'xiA',
  ) => {
    const [st] = await db
      .insert(student)
      .values({ schoolId, name, gender: 'L', status, nis: `${key}-${run}` })
      .returning();
    ids[key] = st!.id;
    await db
      .insert(enrollment)
      .values({ schoolId, studentId: st!.id, classId: ids[classKey]!, academicYearId: ids.year! });
  };
  await mkStudent('ani', 'Ani');
  await mkStudent('budi', 'Budi');
  await mkStudent('cici', 'Cici'); // tidak mengambil Fisika
  await mkStudent('lulus', 'Lulus', 'graduated');
  await mkStudent('pindah', 'Pindah', 'transferred'); // keluar setelah semester Ganjil berakhir: ikut
  await mkStudent('eka', 'Eka', 'active', 'xiB');
  await db.insert(studentTransfer).values({
    schoolId,
    studentId: ids.pindah!,
    direction: 'out',
    effectiveOn: day(30),
    academicYearId: ids.year!,
    classId: ids.xiA!,
    reason: 'other',
    createdBy: 'uji',
  });

  const [comp] = await db
    .insert(gradeComponent)
    .values({ schoolId, name: 'Ulangan', weight: 100, sort: 0 })
    .returning();
  const seedScores = async (
    classKey: string,
    subjectKey: string,
    title: string,
    values: Record<string, number>,
  ) => {
    const [a] = await db
      .insert(assessment)
      .values({
        schoolId,
        semesterId: ids.ganjil!,
        classId: ids[classKey]!,
        subjectId: ids[subjectKey]!,
        componentId: comp!.id,
        title,
        date: day(-10),
        maxScore: 100,
      })
      .returning();
    for (const [key, value] of Object.entries(values)) {
      const [sc] = await db
        .insert(score)
        .values({ schoolId, assessmentId: a!.id, studentId: ids[key]!, value, updatedBy: 'uji' })
        .returning();
      ids[`score-${title}-${key}`] = sc!.id;
    }
    ids[`asm-${title}`] = a!.id;
  };
  await seedScores('xiA', 'mat', 'Mat', { ani: 90, budi: 60, cici: 80, lulus: 70, pindah: 85 });
  await seedScores('xiA', 'fis', 'Fis', { ani: 85, budi: 76, lulus: 72, pindah: 78 });
  await seedScores('xiB', 'mat', 'MatB', { eka: 50 });

  // Fisika berbasis pilihan di XI A: Ani, Budi, Lulus, dan Pindah mengambil; Cici tidak.
  await db.execute(sql`
    insert into class_subject_participation (school_id, class_id, subject_id, mode, updated_by)
    values (${schoolId}, ${ids.xiA}, ${ids.fis}, 'selected', 'uji')`);
  for (const key of ['ani', 'budi', 'lulus', 'pindah']) {
    await db.execute(sql`
      insert into student_subject_enrollment (school_id, student_id, subject_id, academic_year_id, source, created_by)
      values (${schoolId}, ${ids[key]}, ${ids.fis}, ${ids.year}, 'choice', 'uji')`);
  }

  const att = (key: string, date: string, status: 'sick' | 'excused' | 'absent' | 'late' | 'present') =>
    db.insert(dailyAttendance).values({ schoolId, studentId: ids[key]!, date, status });
  await att('ani', day(-50), 'sick');
  await att('ani', day(-49), 'sick');
  await att('ani', day(-48), 'absent');
  await att('ani', day(-47), 'present');
  await att('budi', day(-30), 'excused');
  await att('budi', day(-29), 'late');
  await att('ani', day(100), 'sick'); // di luar semester Ganjil: tidak dihitung
}, 180_000);

afterAll(async () => {
  const db = app.platformDb;
  for (const sid of [schoolId, otherSchoolId, noModuleSchoolId]) {
    for (const table of [
      'audit_log',
      'outbox',
      'report_card_snapshot',
      'report_card',
      'semester_grading_config',
      'report_setting',
      'daily_attendance',
      'score',
      'assessment',
      'grade_component',
      'grading_setting',
      'student_subject_enrollment',
      'class_subject_participation',
      'student_transfer',
      'enrollment_change',
      'enrollment',
      'teaching_assignment',
      'class_room',
      'teacher',
      'subject',
      'student',
      'school_level',
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

describe('legger draf: angka sama dengan rapor dan daftar rapor', () => {
  it('roster = daftar rapor (aktif, lulusan, murid pindah setelah semester); kolom mapel dan sumber hidup', async () => {
    const l = await getLedger();
    const list = (await call('GET', listUrl(), adminCookie)).json() as { studentId: string; name: string }[];
    expect(l.students.map((s) => s.studentId)).toEqual(list.map((r) => r.studentId));
    expect(l.students.map((s) => s.name).sort()).toEqual(['Ani', 'Budi', 'Cici', 'Lulus', 'Pindah']);
    expect(l.subjects.map((s) => s.name).sort()).toEqual(['Fisika', 'Matematika']);
    expect(l.subjects.every((s) => s.kkm === 75)).toBe(true);
    expect(l.students.every((s) => s.status === 'draft' && s.source === 'live')).toBe(true);
    expect(l.showRank).toBe(false);
    expect(l.reportMode).toBeUndefined();
  });

  it('nilai akhir, predikat, rata-rata, kelengkapan sama dengan dokumen dan daftar rapor tiap murid', async () => {
    const l = await getLedger();
    const list = (await call('GET', listUrl(), adminCookie)).json() as {
      studentId: string;
      average: number | null;
      subjectsGraded: number;
      subjectsTotal: number;
    }[];
    for (const key of ['ani', 'budi', 'cici', 'lulus', 'pindah']) {
      const doc = (await call('GET', docUrl(key), adminCookie)).json() as {
        subjects: { subjectId: string; final: number | null; predicate: string | null; belowKkm: boolean }[];
        attendance: { sick: number; excused: number; absent: number; late: number };
      };
      const row = rowOf(l, key);
      const taken = row.cells.filter((c) => !c.notTaken);
      expect(taken.length, key).toBe(doc.subjects.length);
      for (const s of doc.subjects) {
        const cell = row.cells.find((c) => c.subjectId === s.subjectId)!;
        expect([cell.final, cell.predicate, Boolean(cell.belowKkm)], `${key}/${s.subjectId}`).toEqual([
          s.final,
          s.predicate,
          s.belowKkm,
        ]);
      }
      const entry = list.find((r) => r.studentId === ids[key])!;
      expect([row.average, row.subjectsGraded, row.subjectsTotal], key).toEqual([
        entry.average,
        entry.subjectsGraded,
        entry.subjectsTotal,
      ]);
      expect(row.attendance, key).toEqual(doc.attendance);
    }
    expect(cellOf(l, 'ani', 'mat')).toMatchObject({ final: 90, predicate: 'A' });
    expect(cellOf(l, 'budi', 'mat')).toMatchObject({ final: 60, belowKkm: true });
    expect(rowOf(l, 'ani').attendance).toEqual({ sick: 2, excused: 0, absent: 1, late: 0 });
    expect(rowOf(l, 'budi').attendance).toEqual({ sick: 0, excused: 1, absent: 0, late: 1 });
  });

  it('mapel tidak diambil: sel notTaken, tidak dihitung dalam rata-rata dan jumlah mapel', async () => {
    const l = await getLedger();
    expect(cellOf(l, 'cici', 'fis')).toEqual({
      subjectId: ids.fis,
      final: null,
      predicate: null,
      notTaken: true,
    });
    expect(cellOf(l, 'cici', 'mat').notTaken).toBeUndefined();
    expect(rowOf(l, 'cici')).toMatchObject({ average: 80, subjectsGraded: 1, subjectsTotal: 1 });
    expect(JSON.stringify(rowOf(l, 'ani'))).not.toContain('notTaken');
  });

  it('peringkat hanya bila pengaturan rapor menampilkannya', async () => {
    expect(rowOf(await getLedger(), 'ani').rank).toBeNull();
    const put = await call('PUT', '/v1/report-cards/settings', adminCookie, {
      descA: 'A',
      descB: 'B',
      descC: 'C',
      descD: 'D',
      showRank: true,
    });
    expect(put.statusCode, put.body).toBe(200);
    const l = await getLedger();
    expect(l.showRank).toBe(true);
    const doc = (await call('GET', docUrl('ani'), adminCookie)).json() as { rank: unknown };
    expect(rowOf(l, 'ani').rank).toEqual(doc.rank);
    expect(rowOf(l, 'ani').rank).toMatchObject({ position: 1 });
  });
});

describe('legger final: dari snapshot', () => {
  it('rapor final: legger memuat angka snapshot walau skor berubah sesudahnya; kelas lain tetap hidup', async () => {
    const fin = await call('POST', '/v1/report-cards/finalize', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
      force: true,
    });
    expect(fin.statusCode, fin.body).toBe(200);
    const frozen = await getLedger();
    expect(frozen.students.every((s) => s.status === 'final' && s.source === 'snapshot')).toBe(true);
    expect(frozen.students).toHaveLength(5);
    expect(cellOf(frozen, 'ani', 'mat').final).toBe(90);
    expect(cellOf(frozen, 'cici', 'fis').notTaken).toBe(true);
    expect(rowOf(frozen, 'pindah').status).toBe('final');
    expect(rowOf(frozen, 'lulus').status).toBe('final');

    // Skor Ani diubah langsung di DB setelah final: rapor dan legger tetap 90; hanya hitungan hidup yang berubah.
    await app.platformDb.update(score).set({ value: 10 }).where(eq(score.id, ids['score-Mat-ani']!));
    const after = await getLedger();
    expect(cellOf(after, 'ani', 'mat').final).toBe(90);
    const doc = (await call('GET', docUrl('ani'), adminCookie)).json() as {
      subjects: { subjectId: string; final: number }[];
    };
    expect(doc.subjects.find((s) => s.subjectId === ids.mat)?.final).toBe(90);
    expect(after.students).toEqual(frozen.students);

    // Perilaku peringkat dan ketidakhadiran dari snapshot: sama dengan dokumen final.
    const docFull = (await call('GET', docUrl('ani'), adminCookie)).json() as {
      rank: unknown;
      attendance: unknown;
    };
    expect(rowOf(after, 'ani').rank).toEqual(docFull.rank);
    expect(rowOf(after, 'ani').attendance).toEqual(docFull.attendance);

    // Rapor dibuka kembali: kembali hidup dan mengikuti skor terbaru (menguji bahwa snapshot memang sumbernya).
    const reopen = await call('POST', '/v1/report-cards/reopen', adminCookie, {
      semesterId: ids.ganjil,
      classId: ids.xiA,
    });
    expect(reopen.statusCode, reopen.body).toBe(200);
    const live = await getLedger();
    expect(live.students.every((s) => s.status === 'draft' && s.source === 'live')).toBe(true);
    expect(cellOf(live, 'ani', 'mat').final).toBe(10);
    await app.platformDb.update(score).set({ value: 90 }).where(eq(score.id, ids['score-Mat-ani']!));
  });

  it('kelas yang belum difinalkan seluruhnya draf dan hidup', async () => {
    const l = await getLedger(adminCookie, ledgerUrl('xiB'));
    expect(l.students.map((s) => s.name)).toEqual(['Eka']);
    expect(l.students[0]).toMatchObject({ status: 'draft', source: 'live' });
  });
});

describe('mode rapor deskriptif', () => {
  it('menandai reportMode dan tetap memuat angka untuk staf', async () => {
    await app.platformDb
      .insert(schoolLevel)
      .values({ schoolId, code: 'XI', label: 'Kelas XI', sort: 0, reportMode: 'descriptive' });
    const l = await getLedger();
    expect(l.reportMode).toBe('descriptive');
    expect(cellOf(l, 'ani', 'mat').final).toBe(90);
    // Tanpa mode deskriptif kunci itu absen (sparse).
    await app.platformDb.delete(schoolLevel).where(eq(schoolLevel.schoolId, schoolId));
    expect((await getLedger()).reportMode).toBeUndefined();
  });
});

describe('izin, validasi, dan multi-tenant', () => {
  it('admin, kepala sekolah, dan wali kelas itu boleh; guru lain 403', async () => {
    expect((await call('GET', ledgerUrl(), principalCookie)).statusCode).toBe(200);
    expect((await call('GET', ledgerUrl(), waliCookie)).statusCode).toBe(200);
    const other = await call('GET', ledgerUrl(), guruCookie);
    expect(other.statusCode).toBe(403);
    // Wali XI A tidak boleh membaca legger XI B.
    expect((await call('GET', ledgerUrl('xiB'), waliCookie)).statusCode).toBe(403);
  });

  it('tanpa modul grades 403; tanpa sesi 401', async () => {
    const res = await call('GET', ledgerUrl(), noModuleCookie, undefined, noModuleSchoolId);
    expect(res.statusCode).toBe(403);
    const anon = await app.inject({
      method: 'GET',
      url: ledgerUrl(),
      headers: { 'x-school-id': schoolId, origin },
    });
    expect(anon.statusCode).toBe(401);
  });

  it('semester dan kelas harus ada dan satu tahun ajaran (400 invalid_reference); kueri tak valid 400', async () => {
    const mismatched = await call('GET', ledgerUrl('lama'), adminCookie);
    expect([mismatched.statusCode, code(mismatched)]).toEqual([400, 'invalid_reference']);
    const random = '00000000-0000-4000-8000-000000000000';
    const unknown = await call(
      'GET',
      `/v1/report-cards/ledger?semesterId=${random}&classId=${ids.xiA}`,
      adminCookie,
    );
    expect([unknown.statusCode, code(unknown)]).toEqual([400, 'invalid_reference']);
    expect(
      (await call('GET', '/v1/report-cards/ledger?semesterId=x&classId=y', adminCookie)).statusCode,
    ).toBe(400);
  });

  it('sekolah lain tidak dapat membaca legger (id tidak dikenal, 400)', async () => {
    const res = await call('GET', ledgerUrl(), otherAdminCookie, undefined, otherSchoolId);
    expect([res.statusCode, code(res)]).toEqual([400, 'invalid_reference']);
    // Pemegang sesi sekolah lain tidak dapat berpura-pura sebagai sekolah ini.
    expect((await call('GET', ledgerUrl(), otherAdminCookie, undefined, schoolId)).statusCode).toBe(403);
  });

  it('rute dan jalur lama tidak bertabrakan: /report-cards/:studentId tetap melayani id murid', async () => {
    expect((await call('GET', docUrl('ani'), adminCookie)).statusCode).toBe(200);
  });
});

describe('jumlah kueri tidak bergantung pada jumlah murid', () => {
  it('legger 3 dan 24 murid memakai kueri sama (final dan draf campur)', async () => {
    const counting = createDb(process.env.DATABASE_URL!);
    let queries = 0;
    counting.pool.on('connect', (client) => {
      const c = client as unknown as { query: (...a: unknown[]) => unknown };
      const orig = c.query.bind(client);
      c.query = (...a: unknown[]) => {
        queries += 1;
        return orig(...a);
      };
    });
    try {
      const db = app.platformDb;
      const [comp] = await db.select().from(gradeComponent).where(eq(gradeComponent.schoolId, schoolId));
      const build = async (tag: string, n: number) => {
        const [cls] = await db
          .insert(classRoom)
          .values({ schoolId, academicYearId: ids.year!, name: `Q-${tag}`, level: 'XII' })
          .returning();
        const [a] = await db
          .insert(assessment)
          .values({
            schoolId,
            semesterId: ids.ganjil!,
            classId: cls!.id,
            subjectId: ids.mat!,
            componentId: comp!.id,
            title: `Q-${tag}`,
            date: day(-5),
            maxScore: 100,
          })
          .returning();
        for (let i = 0; i < n; i++) {
          const [st] = await db
            .insert(student)
            .values({ schoolId, name: `Q${tag}${i}`, gender: 'L', nis: `q${tag}${i}-${run}` })
            .returning();
          await db
            .insert(enrollment)
            .values({ schoolId, studentId: st!.id, classId: cls!.id, academicYearId: ids.year! });
          await db
            .insert(score)
            .values({ schoolId, assessmentId: a!.id, studentId: st!.id, value: 50 + i, updatedBy: 'uji' });
          await db
            .insert(dailyAttendance)
            .values({ schoolId, studentId: st!.id, date: day(-20), status: 'sick' });
        }
        return cls!.id;
      };
      const measure = async (classId: string) => {
        queries = 0;
        let rows = 0;
        await withTenant(counting.db, [schoolId], async (tx) => {
          const [sem] = await tx.select().from(semester).where(eq(semester.id, ids.ganjil!));
          const [cls] = await tx.select().from(classRoom).where(eq(classRoom.id, classId));
          const l = await buildLedger(tx, await loadClassContext(tx, sem!, cls!));
          rows = l.students.length;
          expect(l.students.every((s) => s.attendance.sick === 1)).toBe(true);
        });
        return { queries, rows };
      };
      const small = await measure(await build('kecil', 3));
      const big = await measure(await build('besar', 24));
      expect([small.rows, big.rows]).toEqual([3, 24]);
      expect(big.queries).toBe(small.queries);
    } finally {
      await counting.pool.end();
    }
  }, 120_000);
});
