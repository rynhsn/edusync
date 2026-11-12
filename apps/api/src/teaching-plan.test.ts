import {
  academicYear,
  assignRoles,
  classRoom,
  eq,
  foundation,
  learningFlow,
  learningFlowItem,
  learningObjective,
  learningOutcome,
  member,
  school,
  schoolLevel,
  seedSchoolRoles,
  semester,
  sql,
  subject,
  teacher,
  teachingAssignment,
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
const FAKE = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = '';
let otherSchoolId = '';
let foundationId = '';
const userIds: string[] = [];
const cookie = {} as Record<
  'admin' | 'kurikulum' | 'operator' | 'guruMtk' | 'guruIpa' | 'guruLain' | 'other',
  string
>;
const years = {} as Record<'y1' | 'y2', string>;
const sems = {} as Record<'s1' | 's2', string>;
const sub = {} as Record<'mtk' | 'ipa' | 'other', string>;

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

async function makeMember(label: string, sid: string, roles: string[]) {
  const u = await makeUser(label);
  const [m] = await db().insert(member).values({ userId: u.id, schoolId: sid }).returning();
  await assignRoles(db(), m!.id, sid, roles);
  return { memberId: m!.id, cookie: await login(u.email) };
}

const db = () => app.platformDb;

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  who: string,
  payload?: object,
  sid = schoolId,
) =>
  app.inject({
    method,
    url,
    headers: {
      cookie: who,
      'x-school-id': sid,
      origin,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const addOutcome = (subjectId: string, body: object, who = cookie.admin) =>
  call('POST', `/v1/subjects/${subjectId}/outcomes`, who, body);
const addObjective = (outcomeId: string, body: object, who = cookie.admin) =>
  call('POST', `/v1/outcomes/${outcomeId}/objectives`, who, body);
const addFlow = (body: object, who = cookie.admin) => call('POST', '/v1/learning-flows', who, body);
const getFlow = async (id: string, who = cookie.admin) =>
  (await call('GET', `/v1/learning-flows/${id}`, who)).json();

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Perangkat Ajar', slug: `ypa-${run}` })
    .returning();
  foundationId = f!.id;
  const ids: string[] = [];
  for (const slug of [`tp-${run}`, `tp2-${run}`]) {
    const [s] = await db().insert(school).values({ foundationId, slug, name: slug }).returning();
    await seedSchoolRoles(db(), s!.id);
    ids.push(s!.id);
  }
  [schoolId, otherSchoolId] = ids as [string, string];

  await db()
    .insert(schoolLevel)
    .values(['7', '8'].map((code, i) => ({ schoolId, code, label: `Kelas ${code}`, sort: i + 1 })));

  const mkYear = async (key: 'y1' | 'y2', name: string, startsOn: string, endsOn: string) => {
    const [y] = await db()
      .insert(academicYear)
      .values({ schoolId, name, startsOn, endsOn, isActive: key === 'y1' })
      .returning();
    years[key] = y!.id;
  };
  await mkYear('y1', '2026/2027', '2026-07-13', '2027-06-30');
  await mkYear('y2', '2027/2028', '2027-07-12', '2028-06-30');
  const [s1] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: years.y1,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-20',
    })
    .returning();
  const [s2] = await db()
    .insert(semester)
    .values({
      schoolId,
      academicYearId: years.y2,
      name: 'Ganjil',
      startsOn: '2027-07-12',
      endsOn: '2027-12-20',
    })
    .returning();
  sems.s1 = s1!.id;
  sems.s2 = s2!.id;

  for (const [key, code] of [
    ['mtk', 'MTK'],
    ['ipa', 'IPA'],
  ] as const) {
    const [s] = await db().insert(subject).values({ schoolId, code, name: code }).returning();
    sub[key] = s!.id;
  }
  const [os] = await db()
    .insert(subject)
    .values({ schoolId: otherSchoolId, code: 'MTK', name: 'Matematika lain' })
    .returning();
  sub.other = os!.id;

  const admin = await makeMember('admin', schoolId, ['school_admin']);
  const kurikulum = await makeMember('kurikulum', schoolId, ['curriculum']);
  const operator = await makeMember('operator', schoolId, ['operator']);
  const guruMtk = await makeMember('gurumtk', schoolId, ['teacher']);
  const guruIpa = await makeMember('guruipa', schoolId, ['teacher']);
  const guruLain = await makeMember('gurulain', schoolId, ['teacher']);
  const other = await makeMember('admin2', otherSchoolId, ['school_admin']);
  Object.assign(cookie, {
    admin: admin.cookie,
    kurikulum: kurikulum.cookie,
    operator: operator.cookie,
    guruMtk: guruMtk.cookie,
    guruIpa: guruIpa.cookie,
    guruLain: guruLain.cookie,
    other: other.cookie,
  });

  // Guru MTK mengampu MTK, guru IPA mengampu IPA, guru lain tidak mengampu apa pun.
  const [cls] = await db()
    .insert(classRoom)
    .values({ schoolId, academicYearId: years.y1, name: '7A', level: '7' })
    .returning();
  for (const [m, name, subjectId] of [
    [guruMtk.memberId, 'Guru MTK', sub.mtk],
    [guruIpa.memberId, 'Guru IPA', sub.ipa],
  ] as const) {
    const [t] = await db().insert(teacher).values({ schoolId, name, memberId: m }).returning();
    await db().insert(teachingAssignment).values({ schoolId, classId: cls!.id, subjectId, teacherId: t!.id });
  }
  await db().insert(teacher).values({ schoolId, name: 'Guru lain', memberId: guruLain.memberId });
}, 60_000);

afterAll(async () => {
  for (const sid of [schoolId, otherSchoolId]) {
    for (const table of [
      'audit_log',
      'learning_flow_item',
      'learning_flow',
      'learning_objective',
      'learning_outcome',
      'teaching_assignment',
      'teacher',
      'class_room',
      'semester',
      'subject',
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
  await app.close();
});

/* Keadaan bersama antartes (berurutan): CP/TP mapel MTK, dan ATP-nya. */
const st = {} as {
  cp: string;
  tp1: string;
  tp2: string;
  tp3: string;
  ipaCp: string;
  ipaTp: string;
  flow: string;
  cp2: string;
  tpNew: string;
};

describe('izin', () => {
  it('menulis butuh teaching_plan:write; operator ditolak, tanpa sesi 401, membaca butuh subject:read', async () => {
    const body = { phase: 'D', description: 'x' };
    expect((await addOutcome(sub.mtk, body, cookie.operator)).statusCode).toBe(403);
    expect((await call('GET', `/v1/subjects/${sub.mtk}/outcomes`, cookie.operator)).statusCode).toBe(200);
    expect((await call('GET', '/v1/learning-flows', cookie.operator)).statusCode).toBe(200);
    const anon = await app.inject({
      method: 'GET',
      url: '/v1/learning-flows',
      headers: { 'x-school-id': schoolId },
    });
    expect(anon.statusCode).toBe(401);
  });
});

describe('CP', () => {
  it('admin membuat, mendaftar, dan mengubah di tempat selama belum dipakai ATP terbit', async () => {
    const bad = await addOutcome(sub.mtk, { phase: 'G', description: 'x' });
    expect(bad.statusCode).toBe(400);
    const res = await addOutcome(sub.mtk, {
      phase: 'D',
      code: 'CP-D-1',
      description: 'Bilangan dan aljabar',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      subjectId: sub.mtk,
      phase: 'D',
      code: 'CP-D-1',
      version: 1,
      supersedesId: null,
      active: true,
      objectiveCount: 0,
    });
    st.cp = res.json().id;

    const list = (await call('GET', `/v1/subjects/${sub.mtk}/outcomes`, cookie.operator)).json().outcomes;
    expect(list.map((o: { id: string }) => o.id)).toEqual([st.cp]);
    expect(
      (await call('GET', `/v1/subjects/${sub.mtk}/outcomes?phase=E`, cookie.admin)).json().outcomes,
    ).toEqual([]);

    const put = await call('PUT', `/v1/outcomes/${st.cp}`, cookie.admin, {
      phase: 'D',
      description: 'Bilangan, aljabar, dan geometri',
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({
      id: st.cp,
      versioned: false,
      previousId: null,
      code: 'CP-D-1',
      description: 'Bilangan, aljabar, dan geometri',
    });
    expect((await call('GET', `/v1/subjects/${FAKE}/outcomes`, cookie.admin)).statusCode).toBe(404);
  });

  it('guru pengampu boleh, guru lain 403 not_subject_teacher, curriculum:manage boleh untuk semua mapel', async () => {
    const own = await addOutcome(sub.mtk, { phase: 'D', description: 'Milik guru MTK' }, cookie.guruMtk);
    expect(own.statusCode).toBe(201);
    const wrongSubject = await addOutcome(sub.ipa, { phase: 'D', description: 'x' }, cookie.guruMtk);
    expect(wrongSubject.statusCode).toBe(403);
    expect(wrongSubject.json().error.code).toBe('not_subject_teacher');
    const noAssignment = await addOutcome(sub.mtk, { phase: 'D', description: 'x' }, cookie.guruLain);
    expect(noAssignment.statusCode).toBe(403);
    expect(noAssignment.json().error.code).toBe('not_subject_teacher');
    const editOther = await call('PUT', `/v1/outcomes/${st.cp}`, cookie.guruIpa, {
      phase: 'D',
      description: 'x',
    });
    expect(editOther.statusCode).toBe(403);
    expect(editOther.json().error.code).toBe('not_subject_teacher');
    const editOwn = await call('PUT', `/v1/outcomes/${own.json().id}`, cookie.guruMtk, {
      phase: 'D',
      description: 'Milik guru MTK (revisi)',
    });
    expect(editOwn.statusCode).toBe(200);
    const kur = await addOutcome(
      sub.ipa,
      { phase: 'D', code: 'CP-IPA', description: 'IPA kurikulum' },
      cookie.kurikulum,
    );
    expect(kur.statusCode).toBe(201);
    st.ipaCp = kur.json().id;
    // Bersihkan CP milik guru MTK agar tidak mengganggu hitungan tes berikutnya.
    expect((await call('DELETE', `/v1/outcomes/${own.json().id}`, cookie.guruMtk)).statusCode).toBe(200);
  });
});

describe('TP', () => {
  it('membuat berurutan, mendaftar, dan mengubah di tempat; penjagaan izin sama dengan CP', async () => {
    const make = async (description: string, code?: string) => {
      const r = await addObjective(st.cp, { description, ...(code ? { code } : {}) });
      expect(r.statusCode).toBe(201);
      return r.json();
    };
    const a = await make('TP satu', 'TP-1');
    const b = await make('TP dua', 'TP-2');
    const c = await make('TP tiga', 'TP-3');
    [st.tp1, st.tp2, st.tp3] = [a.id, b.id, c.id];
    expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([0, 1, 2]);
    expect(a).toMatchObject({ outcomeId: st.cp, version: 1, active: true });

    const list = (await call('GET', `/v1/outcomes/${st.cp}/objectives`, cookie.guruLain)).json().objectives;
    expect(list.map((o: { id: string }) => o.id)).toEqual([st.tp1, st.tp2, st.tp3]);
    const put = await call('PUT', `/v1/objectives/${st.tp3}`, cookie.guruMtk, {
      description: 'TP tiga (revisi)',
      sortOrder: 5,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ id: st.tp3, versioned: false, sortOrder: 5, code: 'TP-3' });

    const denied = await addObjective(st.cp, { description: 'x' }, cookie.guruIpa);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('not_subject_teacher');
    expect((await addObjective(FAKE, { description: 'x' })).statusCode).toBe(404);

    const ipa = await addObjective(st.ipaCp, { description: 'TP IPA' });
    st.ipaTp = ipa.json().id;
  });
});

describe('ATP', () => {
  it('membuat draf, memvalidasi item, dan mengganti seluruh item menurut urutan larik', async () => {
    const created = await addFlow({
      subjectId: sub.mtk,
      academicYearId: years.y1,
      levelCode: '7',
      name: 'ATP Matematika 7',
      items: [
        { objectiveId: st.tp1, weeks: 2, periods: 8, semesterId: sems.s1, note: 'awal' },
        { objectiveId: st.tp2, weeks: 3 },
      ],
    });
    expect(created.statusCode).toBe(201);
    const flow = created.json();
    st.flow = flow.id;
    expect(flow).toMatchObject({
      status: 'draft',
      version: 1,
      phase: 'D', // diturunkan dari tingkat 7
      levelCode: '7',
      itemCount: 2,
      subjectCode: 'MTK',
      academicYearName: '2026/2027',
    });
    expect(flow.items.map((i: { objectiveId: string }) => i.objectiveId)).toEqual([st.tp1, st.tp2]);
    expect(flow.items[0]).toMatchObject({
      weeks: 2,
      periods: 8,
      semesterId: sems.s1,
      note: 'awal',
      objectiveDescription: 'TP satu',
      outcomeId: st.cp,
      outcomePhase: 'D',
    });

    const ordered = await call('PUT', `/v1/learning-flows/${st.flow}`, cookie.guruMtk, {
      items: [{ objectiveId: st.tp3 }, { objectiveId: st.tp1 }, { objectiveId: st.tp2 }],
    });
    expect(ordered.statusCode).toBe(200);
    expect(ordered.json().items.map((i: { objectiveId: string }) => i.objectiveId)).toEqual([
      st.tp3,
      st.tp1,
      st.tp2,
    ]);
    // Tanpa `items`, item tidak disentuh dan metadata berubah.
    const meta = await call('PUT', `/v1/learning-flows/${st.flow}`, cookie.admin, {
      name: 'ATP Matematika Kelas 7',
    });
    expect(meta.json()).toMatchObject({ name: 'ATP Matematika Kelas 7', itemCount: 3 });

    const list = (
      await call('GET', `/v1/learning-flows?subjectId=${sub.mtk}&status=draft`, cookie.operator)
    ).json().flows;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: st.flow, itemCount: 3 });
    expect((await call('GET', `/v1/learning-flows?status=published`, cookie.admin)).json().flows).toEqual([]);
    expect(
      (await call('GET', `/v1/learning-flows?academicYearId=${years.y2}`, cookie.admin)).json().flows,
    ).toEqual([]);
  });

  it('validasi: lintas mapel, duplikat, semester tahun lain, tingkat, jumlah, dan izin', async () => {
    const base = { subjectId: sub.mtk, academicYearId: years.y1, name: 'ATP uji' };
    const cross = await addFlow({ ...base, items: [{ objectiveId: st.ipaTp }] });
    expect(cross.statusCode).toBe(400);
    expect(cross.json().error.code).toBe('invalid_reference');
    const dup = await addFlow({ ...base, items: [{ objectiveId: st.tp1 }, { objectiveId: st.tp1 }] });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error.code).toBe('duplicate_entry');
    const sem = await addFlow({ ...base, items: [{ objectiveId: st.tp1, semesterId: sems.s2 }] });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().error.code).toBe('invalid_reference');
    const ghost = await addFlow({ ...base, items: [{ objectiveId: FAKE }] });
    expect(ghost.json().error.code).toBe('invalid_reference');
    const level = await addFlow({ ...base, levelCode: 'ZZ' });
    expect(level.json().error.code).toBe('invalid_level');
    const tooMany = await addFlow({
      ...base,
      items: Array.from({ length: 301 }, () => ({ objectiveId: st.tp1 })),
    });
    expect(tooMany.statusCode).toBe(400);
    const noYear = await addFlow({ ...base, academicYearId: FAKE });
    expect(noYear.statusCode).toBe(404);
    const noSubject = await addFlow({ ...base, subjectId: FAKE });
    expect(noSubject.statusCode).toBe(404);

    const other = await addFlow(base, cookie.guruIpa);
    expect(other.statusCode).toBe(403);
    expect(other.json().error.code).toBe('not_subject_teacher');
    const putOther = await call('PUT', `/v1/learning-flows/${st.flow}`, cookie.guruIpa, { name: 'x' });
    expect(putOther.statusCode).toBe(403);
    expect(
      (
        await call('PUT', `/v1/learning-flows/${st.flow}`, cookie.admin, {
          items: [{ objectiveId: st.ipaTp }],
        })
      ).statusCode,
    ).toBe(400);
    // Tidak ada ATP tambahan yang lolos.
    expect((await call('GET', '/v1/learning-flows', cookie.admin)).json().flows).toHaveLength(1);

    // Nama, tingkat, tahun, dan versi yang sama bentrok.
    const same = await addFlow({
      subjectId: sub.mtk,
      academicYearId: years.y1,
      levelCode: '7',
      name: 'ATP Matematika Kelas 7',
    });
    expect(same.statusCode).toBe(409);
    expect(same.json().error.code).toBe('conflict');
  });

  it('publish mengunci; ATP tanpa item tidak bisa diterbitkan; draf bisa dihapus', async () => {
    const empty = await addFlow({ subjectId: sub.mtk, academicYearId: years.y1, name: 'Kosong' });
    expect(empty.statusCode).toBe(201);
    const emptyPublish = await call('POST', `/v1/learning-flows/${empty.json().id}/publish`, cookie.admin);
    expect(emptyPublish.statusCode).toBe(400);
    expect(emptyPublish.json().error.code).toBe('flow_empty');
    expect((await call('DELETE', `/v1/learning-flows/${empty.json().id}`, cookie.guruIpa)).statusCode).toBe(
      403,
    );
    expect((await call('DELETE', `/v1/learning-flows/${empty.json().id}`, cookie.guruMtk)).statusCode).toBe(
      200,
    );
    expect((await call('GET', `/v1/learning-flows/${empty.json().id}`, cookie.admin)).statusCode).toBe(404);

    const pub = await call('POST', `/v1/learning-flows/${st.flow}/publish`, cookie.guruMtk);
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).toMatchObject({ status: 'published' });
    expect(pub.json().publishedAt).toEqual(expect.any(String));

    for (const [method, url, payload] of [
      ['PUT', `/v1/learning-flows/${st.flow}`, { name: 'Ubah' }],
      ['PUT', `/v1/learning-flows/${st.flow}`, { items: [] }],
      ['POST', `/v1/learning-flows/${st.flow}/publish`, undefined],
      ['DELETE', `/v1/learning-flows/${st.flow}`, undefined],
    ] as const) {
      const res = await call(method, url, cookie.admin, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(409);
      expect(res.json().error.code).toBe('flow_published');
    }
    expect((await getFlow(st.flow)).itemCount).toBe(3);
  });
});

describe('versi CP dan TP yang dipakai ATP terbit', () => {
  it('TP terpakai tidak ditimpa: dibuat versi baru, yang lama nonaktif, ATP lama tetap menunjuk yang lama', async () => {
    const before = await getFlow(st.flow);
    const oldTp1 = before.items.find((i: { objectiveId: string }) => i.objectiveId === st.tp1);
    expect(oldTp1.objectiveDescription).toBe('TP satu');

    // Kode saja berubah: tetap di tempat.
    const codeOnly = await call('PUT', `/v1/objectives/${st.tp1}`, cookie.admin, {
      description: 'TP satu',
      code: 'TP-1a',
    });
    expect(codeOnly.json()).toMatchObject({ id: st.tp1, versioned: false, code: 'TP-1a' });

    const res = await call('PUT', `/v1/objectives/${st.tp1}`, cookie.guruMtk, {
      description: 'TP satu versi dua',
    });
    expect(res.statusCode).toBe(200);
    const next = res.json();
    expect(next).toMatchObject({
      versioned: true,
      previousId: st.tp1,
      version: 2,
      supersedesId: st.tp1,
      active: true,
      outcomeId: st.cp,
      description: 'TP satu versi dua',
      code: 'TP-1a',
    });
    expect(next.id).not.toBe(st.tp1);

    const all = (
      await call('GET', `/v1/outcomes/${st.cp}/objectives?includeInactive=true`, cookie.admin)
    ).json().objectives;
    expect(all.find((o: { id: string }) => o.id === st.tp1)).toMatchObject({
      active: false,
      description: 'TP satu',
    });
    const activeOnly = (await call('GET', `/v1/outcomes/${st.cp}/objectives`, cookie.admin)).json()
      .objectives;
    expect(activeOnly.some((o: { id: string }) => o.id === st.tp1)).toBe(false);
    expect(activeOnly.some((o: { id: string }) => o.id === next.id)).toBe(true);

    // ATP terbit tidak berubah sama sekali.
    const after = await getFlow(st.flow);
    expect(after.items.map((i: { objectiveId: string }) => i.objectiveId)).toEqual(
      before.items.map((i: { objectiveId: string }) => i.objectiveId),
    );
    const stillOld = after.items.find((i: { objectiveId: string }) => i.objectiveId === st.tp1);
    expect(stillOld).toMatchObject({ objectiveDescription: 'TP satu', objectiveActive: false });

    // Versi lama sudah punya penerus.
    const stale = await call('PUT', `/v1/objectives/${st.tp1}`, cookie.admin, { description: 'cabang' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('superseded');
    // TP versi lama tidak bisa dimasukkan ke ATP baru.
    const reuse = await addFlow({
      subjectId: sub.mtk,
      academicYearId: years.y1,
      name: 'Pakai TP lama',
      items: [{ objectiveId: st.tp1 }],
    });
    expect(reuse.json().error.code).toBe('inactive_objective');
    st.tp1 = next.id; // versi aktif
  });

  it('TP yang belum dipakai ATP terbit diubah di tempat (draf tidak dihitung)', async () => {
    const tp = (await addObjective(st.cp, { description: 'TP empat' })).json().id;
    const draft = await addFlow({
      subjectId: sub.mtk,
      academicYearId: years.y1,
      name: 'Draf pemakai TP empat',
      items: [{ objectiveId: tp }],
    });
    expect(draft.statusCode).toBe(201);
    const put = await call('PUT', `/v1/objectives/${tp}`, cookie.admin, { description: 'TP empat revisi' });
    expect(put.json()).toMatchObject({
      id: tp,
      versioned: false,
      version: 1,
      description: 'TP empat revisi',
    });
    expect((await call('DELETE', `/v1/learning-flows/${draft.json().id}`, cookie.admin)).statusCode).toBe(
      200,
    );
    expect((await call('DELETE', `/v1/objectives/${tp}`, cookie.admin)).statusCode).toBe(200);
  });

  it('CP terpakai (lewat TP-nya) dibuat versi baru; TP aktif ikut disalin ke versi baru', async () => {
    const res = await call('PUT', `/v1/outcomes/${st.cp}`, cookie.kurikulum, {
      phase: 'D',
      description: 'Bilangan, aljabar, dan geometri (revisi besar)',
    });
    expect(res.statusCode).toBe(200);
    const next = res.json();
    expect(next).toMatchObject({
      versioned: true,
      previousId: st.cp,
      version: 2,
      supersedesId: st.cp,
      active: true,
    });
    expect(next.id).not.toBe(st.cp);
    expect(next.objectiveCount).toBe(3);
    st.cp2 = next.id;

    const old = (await call('GET', `/v1/subjects/${sub.mtk}/outcomes?includeInactive=true`, cookie.admin))
      .json()
      .outcomes.find((o: { id: string }) => o.id === st.cp);
    expect(old).toMatchObject({ active: false, description: 'Bilangan, aljabar, dan geometri' });

    const cloned = (await call('GET', `/v1/outcomes/${next.id}/objectives`, cookie.admin)).json().objectives;
    expect(cloned).toHaveLength(3);
    st.tpNew = cloned[0].id;
    expect(
      cloned.every((o: { version: number; supersedesId: string | null }) => o.version >= 2 && o.supersedesId),
    ).toBe(true);
    // Semua TP lama di bawah CP lama kini nonaktif; ATP terbit tetap menunjuk TP lama.
    const oldTps = (
      await call('GET', `/v1/outcomes/${st.cp}/objectives?includeInactive=true`, cookie.admin)
    ).json().objectives;
    expect(oldTps.every((o: { active: boolean }) => !o.active)).toBe(true);
    const flow = await getFlow(st.flow);
    expect(flow.items.every((i: { outcomeId: string }) => i.outcomeId === st.cp)).toBe(true);

    const stale = await call('PUT', `/v1/outcomes/${st.cp}`, cookie.admin, {
      phase: 'D',
      description: 'cabang',
    });
    expect(stale.json().error.code).toBe('superseded');
    const inactive = await addObjective(st.cp, { description: 'ke CP lama' });
    expect(inactive.statusCode).toBe(409);
    expect(inactive.json().error.code).toBe('outcome_inactive');
  });

  it('CP yang belum dipakai ATP terbit diubah di tempat, termasuk ganti fase', async () => {
    const put = await call('PUT', `/v1/outcomes/${st.ipaCp}`, cookie.admin, {
      phase: 'E',
      description: 'IPA revisi',
    });
    expect(put.json()).toMatchObject({ id: st.ipaCp, versioned: false, phase: 'E', objectiveCount: 1 });
  });
});

describe('versi baru ATP', () => {
  let v2 = '';

  it('hanya dari ATP terbit; menyalin item sebagai draf versi berikutnya; satu draf sekaligus', async () => {
    const draft = await addFlow({
      subjectId: sub.mtk,
      academicYearId: years.y1,
      levelCode: '8',
      name: 'ATP Matematika 8',
      items: [{ objectiveId: st.tpNew }],
    });
    const notPublished = await call(
      'POST',
      `/v1/learning-flows/${draft.json().id}/new-version`,
      cookie.admin,
    );
    expect(notPublished.statusCode).toBe(409);
    expect(notPublished.json().error.code).toBe('flow_not_published');
    expect((await call('DELETE', `/v1/learning-flows/${draft.json().id}`, cookie.admin)).statusCode).toBe(
      200,
    );

    const denied = await call('POST', `/v1/learning-flows/${st.flow}/new-version`, cookie.guruIpa);
    expect(denied.statusCode).toBe(403);
    const res = await call('POST', `/v1/learning-flows/${st.flow}/new-version`, cookie.guruMtk);
    expect(res.statusCode).toBe(201);
    v2 = res.json().id;
    expect(res.json()).toMatchObject({
      status: 'draft',
      version: 2,
      supersedesId: st.flow,
      name: 'ATP Matematika Kelas 7',
      itemCount: 3,
    });
    const src = await getFlow(st.flow);
    expect(res.json().items.map((i: { objectiveId: string }) => i.objectiveId)).toEqual(
      src.items.map((i: { objectiveId: string }) => i.objectiveId),
    );
    expect(src).toMatchObject({ status: 'published', version: 1 });

    const again = await call('POST', `/v1/learning-flows/${st.flow}/new-version`, cookie.admin);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('draft_exists');
  });

  it('draf versi baru bisa menukar ke TP versi baru lalu terbit; versi 1 tetap utuh', async () => {
    const active = (
      await call('GET', `/v1/outcomes/${st.cp}/objectives?includeInactive=true`, cookie.admin)
    ).json();
    // CP lama: tp1, versi duanya, tp2, tp3.
    expect(active.objectives).toHaveLength(4);
    const cpV2 = st.cp2;
    const newTps = (await call('GET', `/v1/outcomes/${cpV2}/objectives`, cookie.admin)).json().objectives as {
      id: string;
    }[];
    const put = await call('PUT', `/v1/learning-flows/${v2}`, cookie.admin, {
      items: newTps.map((t) => ({ objectiveId: t.id })),
    });
    expect(put.statusCode).toBe(200);
    const pub = await call('POST', `/v1/learning-flows/${v2}/publish`, cookie.admin);
    expect(pub.statusCode).toBe(200);
    const v1 = await getFlow(st.flow);
    expect(v1.items.every((i: { objectiveActive: boolean }) => !i.objectiveActive)).toBe(true);
    const list = (
      await call('GET', `/v1/learning-flows?subjectId=${sub.mtk}&status=published`, cookie.admin)
    ).json().flows;
    expect(list.map((f: { version: number }) => f.version)).toEqual([2, 1]);
  });
});

describe('hapus in_use', () => {
  it('TP dirujuk ATP, CP punya TP atau penerus: 409; yang bebas boleh dihapus', async () => {
    const tpInFlow = await call('DELETE', `/v1/objectives/${st.tp2}`, cookie.admin);
    expect(tpInFlow.statusCode).toBe(409);
    expect(tpInFlow.json().error.code).toBe('in_use');
    const cpWithTp = await call('DELETE', `/v1/outcomes/${st.cp}`, cookie.admin);
    expect(cpWithTp.statusCode).toBe(409);
    expect(cpWithTp.json().error.code).toBe('in_use');
    expect((await call('DELETE', `/v1/objectives/${st.tp2}`, cookie.guruIpa)).statusCode).toBe(403);

    // Nonaktifkan lewat PUT tetap boleh.
    const off = await call('PUT', `/v1/objectives/${st.tp2}`, cookie.admin, {
      description: (await call('GET', `/v1/outcomes/${st.cp}/objectives?includeInactive=true`, cookie.admin))
        .json()
        .objectives.find((o: { id: string }) => o.id === st.tp2).description,
      active: false,
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().active).toBe(false);

    // CP IPA: hapus TP lalu CP.
    expect((await call('DELETE', `/v1/outcomes/${st.ipaCp}`, cookie.admin)).statusCode).toBe(409);
    expect((await call('DELETE', `/v1/objectives/${st.ipaTp}`, cookie.admin)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/outcomes/${st.ipaCp}`, cookie.admin)).statusCode).toBe(200);
    expect((await call('DELETE', `/v1/outcomes/${st.ipaCp}`, cookie.admin)).statusCode).toBe(404);
  });
});

describe('rollover menyalin ATP terbit', () => {
  const rollover = (body: object = {}) =>
    call('POST', `/v1/academic-years/${years.y1}/rollover`, cookie.admin, {
      targetYearId: years.y2,
      copyClasses: false,
      copyAssignments: false,
      copyCalendar: false,
      copyCurriculum: false,
      ...body,
    });
  const flowsOf = async (year: string) =>
    (await call('GET', `/v1/learning-flows?academicYearId=${year}`, cookie.admin)).json().flows as {
      id: string;
      name: string;
      version: number;
      status: string;
      itemCount: number;
    }[];

  it('dryRun menghitung tanpa menulis; salinan berupa draf versi 1 dengan versi terbit terbaru; idempoten', async () => {
    // Sumber: ATP 'ATP Matematika Kelas 7' v1 dan v2 terbit (tingkat 7). Draf tidak ikut disalin.
    await addFlow({
      subjectId: sub.mtk,
      academicYearId: years.y1,
      levelCode: '8',
      name: 'Hanya draf',
      items: [{ objectiveId: st.tpNew }],
    });
    const dry = await rollover({ dryRun: true });
    expect(dry.statusCode).toBe(200);
    expect(dry.json().flowsCreated).toBe(1);
    expect(await flowsOf(years.y2)).toHaveLength(0);

    const res = await rollover();
    expect(res.json().flowsCreated).toBe(1);
    const copied = await flowsOf(years.y2);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({
      name: 'ATP Matematika Kelas 7',
      version: 1,
      status: 'draft',
      itemCount: 3,
    });
    const detail = await getFlow(copied[0]!.id);
    expect(detail).toMatchObject({ academicYearId: years.y2, levelCode: '7', phase: 'D' });
    // Item mengikuti versi 2 (TP aktif terbaru), semester tidak ikut.
    expect(
      detail.items.every(
        (i: { objectiveActive: boolean; semesterId: string | null }) => i.objectiveActive && !i.semesterId,
      ),
    ).toBe(true);
    // Sumber tidak berubah.
    expect((await flowsOf(years.y1)).filter((f) => f.status === 'published')).toHaveLength(2);

    const again = await rollover();
    expect(again.json().flowsCreated).toBe(0);
    expect(await flowsOf(years.y2)).toHaveLength(1);
  });

  it('copyTeachingPlans false tidak menyalin; tanpa opsi bawaannya true', async () => {
    await db().delete(learningFlow).where(eq(learningFlow.academicYearId, years.y2));
    const off = await rollover({ copyTeachingPlans: false });
    expect(off.statusCode).toBe(200);
    expect(off.json().flowsCreated).toBe(0);
    expect(await flowsOf(years.y2)).toHaveLength(0);
    const dflt = await rollover();
    expect(dflt.json().flowsCreated).toBe(1);
  });
});

describe('isolasi tenant', () => {
  it('sekolah lain tidak melihat atau menulis perangkat ajar sekolah ini', async () => {
    const o = cookie.other;
    expect((await call('GET', `/v1/learning-flows/${st.flow}`, o, undefined, otherSchoolId)).statusCode).toBe(
      404,
    );
    expect((await call('GET', '/v1/learning-flows', o, undefined, otherSchoolId)).json().flows).toEqual([]);
    expect(
      (await call('GET', `/v1/subjects/${sub.mtk}/outcomes`, o, undefined, otherSchoolId)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/v1/outcomes/${st.cp}/objectives`, o, undefined, otherSchoolId)).statusCode,
    ).toBe(404);
    const body = { phase: 'D', description: 'x' };
    expect((await call('POST', `/v1/subjects/${sub.mtk}/outcomes`, o, body, otherSchoolId)).statusCode).toBe(
      404,
    );
    expect((await call('PUT', `/v1/outcomes/${st.cp}`, o, body, otherSchoolId)).statusCode).toBe(404);
    expect((await call('DELETE', `/v1/objectives/${st.tp3}`, o, undefined, otherSchoolId)).statusCode).toBe(
      404,
    );
    expect(
      (await call('POST', `/v1/learning-flows/${st.flow}/new-version`, o, undefined, otherSchoolId))
        .statusCode,
    ).toBe(404);
    const flow = await call(
      'POST',
      '/v1/learning-flows',
      o,
      { subjectId: sub.mtk, academicYearId: years.y1, name: 'Lintas sekolah' },
      otherSchoolId,
    );
    expect(flow.statusCode).toBe(404);
    // Mapel sekolah lain dengan kode sama: TP sekolah ini tidak bisa dipakai di ATP miliknya.
    const own = await call(
      'POST',
      '/v1/learning-flows',
      o,
      { subjectId: sub.other, academicYearId: FAKE, name: 'x' },
      otherSchoolId,
    );
    expect(own.statusCode).toBe(404);
    for (const table of [learningOutcome, learningObjective, learningFlow, learningFlowItem]) {
      const rows = await db().select().from(table).where(eq(table.schoolId, otherSchoolId));
      expect(rows).toHaveLength(0);
    }
  });
});
