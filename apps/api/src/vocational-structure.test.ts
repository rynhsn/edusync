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
  program,
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
 * Fase 5, tahap 5.1 dan 5.2: struktur keahlian (bidang, program, konsentrasi, tautan ke `program`), sakelar rapor kejuruan, dan
 * dokumen rapor berkelompok. Sekolah non-SMK, SMK tanpa sakelar, dan SMK dengan sakelar mati menghasilkan dokumen yang sama persis.
 */

const run = Math.random().toString(36).slice(2, 8);
const password = 'kata-sandi-uji-12345';
const origin = 'http://localhost:3000';

let app: Awaited<ReturnType<typeof buildApp>>;
let foundationId = '';
let smk = ''; // SMK dengan modul internship
let smkB = ''; // SMK lain (isolasi)
let smkNoModule = '';
let smp = ''; // non-vocational
let semId = '';
let classId = '';
let ani = '';
let progId = '';
let cookieAdmin = '';
let cookiePrincipal = '';
let cookieTeacher = '';
let cookieAdminB = '';
let cookieAdminNoModule = '';
let cookieAdminSmp = '';
let cookieGuardian = '';
const userIds: string[] = [];
const schoolIds: string[] = [];
const db = () => app.platformDb;

async function join(label: string, schoolId: string, roles: string[]) {
  const email = `${label}-${run}@example.test`;
  const res = await app.auth.api.signUpEmail({ body: { name: label, email, password } });
  userIds.push(res.user.id);
  const [m] = await db().insert(member).values({ userId: res.user.id, schoolId }).returning();
  await assignRoles(db(), m!.id, schoolId, roles);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email, password },
  });
  return { cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join('; '), memberId: m!.id };
}
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  schoolId: string,
  payload?: object,
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

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...process.env, NODE_ENV: 'test', PAYMENT_PROVIDER: 'dev', MIDTRANS_SERVER_KEY: '' }),
  );
  await app.ready();
  const [f] = await db()
    .insert(foundation)
    .values({ name: 'Yayasan Kejuruan', slug: `yk-${run}` })
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
  const mk = async (slug: string, profile: string, modules: string[]) => {
    const [s] = await db()
      .insert(school)
      .values({ foundationId, slug: `${slug}-${run}`, name: `Sekolah ${slug}`, educationProfile: profile })
      .returning();
    schoolIds.push(s!.id);
    await seedSchoolRoles(db(), s!.id);
    for (const moduleKey of modules) {
      await db().insert(entitlement).values({
        schoolId: s!.id,
        moduleKey,
        subscriptionId: sub!.id,
        validUntil: sub!.currentPeriodEnd,
      });
    }
    return s!.id;
  };
  const mods = ['grades', 'parent_portal', 'internship'];
  smk = await mk('smk-a', 'smk', mods);
  smkB = await mk('smk-b', 'smk', mods);
  smkNoModule = await mk('smk-c', 'smk', ['grades']);
  smp = await mk('smp-a', 'smp', mods);

  // Dunia rapor SMK: satu rombel bertaut ke jurusan, empat mapel dengan kelompok berbeda.
  const [y] = await db()
    .insert(academicYear)
    .values({
      schoolId: smk,
      name: '2026/2027',
      startsOn: '2026-07-13',
      endsOn: '2027-06-30',
      isActive: true,
    })
    .returning();
  const [sm] = await db()
    .insert(semester)
    .values({
      schoolId: smk,
      academicYearId: y!.id,
      name: 'Ganjil',
      startsOn: '2026-07-13',
      endsOn: '2026-12-20',
      isActive: true,
    })
    .returning();
  semId = sm!.id;
  const [prog] = await db()
    .insert(program)
    .values({ schoolId: smk, code: 'RPL', name: 'Rekayasa Perangkat Lunak', durationYears: 3 })
    .returning();
  progId = prog!.id;
  const [c] = await db()
    .insert(classRoom)
    .values({ schoolId: smk, academicYearId: y!.id, name: 'X RPL 1', level: 'X', programId: progId })
    .returning();
  classId = c!.id;
  const [s] = await db().insert(student).values({ schoolId: smk, name: 'Ani', gender: 'P' }).returning();
  ani = s!.id;
  await db().insert(enrollment).values({ schoolId: smk, studentId: ani, classId, academicYearId: y!.id });
  const [comp] = await db()
    .insert(gradeComponent)
    .values({ schoolId: smk, name: 'Tugas', weight: 100, sort: 0 })
    .returning();
  // Urutan abjad: Alfa, Beta, Delta, Gama. Urutan berkelompok: Delta (religion), Beta (general), Alfa (vocational), Gama (tanpa kelompok).
  for (const [i, [name, group]] of (
    [
      ['Alfa Kejuruan', 'vocational'],
      ['Beta Umum', 'general'],
      ['Delta Agama', 'religion'],
      ['Gama Bebas', null],
    ] as const
  ).entries()) {
    const [sub1] = await db()
      .insert(subject)
      .values({ schoolId: smk, code: `S${i}`, name, subjectGroup: group })
      .returning();
    const [a] = await db()
      .insert(assessment)
      .values({
        schoolId: smk,
        semesterId: semId,
        classId,
        subjectId: sub1!.id,
        componentId: comp!.id,
        title: 'Tugas',
        date: '2026-08-01',
      })
      .returning();
    await db()
      .insert(score)
      .values({ schoolId: smk, assessmentId: a!.id, studentId: ani, value: 80 + i, updatedBy: 'uji' });
  }

  cookieAdmin = (await join('admin', smk, ['school_admin'])).cookie;
  cookiePrincipal = (await join('kepsek', smk, ['principal'])).cookie;
  cookieTeacher = (await join('guru', smk, ['teacher'])).cookie;
  cookieAdminB = (await join('adminb', smkB, ['school_admin'])).cookie;
  cookieAdminNoModule = (await join('adminc', smkNoModule, ['school_admin'])).cookie;
  cookieAdminSmp = (await join('adminsmp', smp, ['school_admin'])).cookie;
  const g = await join('wali', smk, ['guardian']);
  cookieGuardian = g.cookie;
  const [gd] = await db().insert(guardian).values({ schoolId: smk, name: 'Wali Ani' }).returning();
  await db()
    .insert(studentGuardian)
    .values({ schoolId: smk, studentId: ani, guardianId: gd!.id, relation: 'mother' });
  await db()
    .insert(portalLink)
    .values({ schoolId: smk, memberId: g.memberId, kind: 'guardian', guardianId: gd!.id });
});

afterAll(async () => {
  const tables = await db().execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'school_id' and table_name <> 'school'`,
  );
  for (let pass = 0; pass < 6; pass++) {
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

const ids = { field: '', vp: '', conc: '', conc2: '' };

describe('struktur keahlian (5.1): akses', () => {
  it('sekolah baru: kosong (tanpa seed) dan tanpa baris pengaturan', async () => {
    for (const path of ['fields', 'programs-of-expertise', 'concentrations']) {
      const r = await call('GET', `/v1/vocational/${path}`, cookieAdmin, smk);
      expect([r.statusCode, r.json()], path).toEqual([200, []]);
    }
    const rows = await db().execute(sql`select 1 from vocational_setting where school_id = ${smk}`);
    expect(rows.rows).toHaveLength(0);
  });

  it('jenjang non-kejuruan 404 not_vocational; modul internship mati 403 module_disabled', async () => {
    const a = await call('GET', '/v1/vocational/fields', cookieAdminSmp, smp);
    expect([a.statusCode, code(a)]).toEqual([404, 'not_vocational']);
    const b = await call('POST', '/v1/vocational/fields', cookieAdminSmp, smp, { code: 'TI', name: 'TI' });
    expect([b.statusCode, code(b)]).toEqual([404, 'not_vocational']);
    const c = await call('GET', '/v1/vocational/fields', cookieAdminNoModule, smkNoModule);
    expect([c.statusCode, code(c)]).toEqual([403, 'module_disabled']);
    const d = await call('GET', '/v1/vocational/settings/report', cookieAdminSmp, smp);
    expect([d.statusCode, code(d)]).toEqual([404, 'not_vocational']);
  });

  it('kepala sekolah dan guru membaca tetapi tidak menulis (403)', async () => {
    for (const cookie of [cookiePrincipal, cookieTeacher]) {
      expect((await call('GET', '/v1/vocational/fields', cookie, smk)).statusCode).toBe(200);
      expect(
        (await call('POST', '/v1/vocational/fields', cookie, smk, { code: 'TI', name: 'TI' })).statusCode,
      ).toBe(403);
      expect(
        (await call('PUT', `/v1/programs/${progId}/concentration`, cookie, smk, { concentrationId: null }))
          .statusCode,
      ).toBe(403);
    }
  });
});

describe('struktur keahlian (5.1): hierarki', () => {
  it('membuat bidang, program keahlian, dan konsentrasi; kode unik 409; induk salah 400', async () => {
    const f = await call('POST', '/v1/vocational/fields', cookieAdmin, smk, {
      code: 'TI',
      name: 'Teknologi Informasi',
      sourceRef: '244/M/2024',
    });
    expect(f.statusCode, f.body).toBe(201);
    ids.field = f.json().id;
    expect(f.json()).toMatchObject({ code: 'TI', sourceRef: '244/M/2024', dapodikCode: null, active: true });
    const dup = await call('POST', '/v1/vocational/fields', cookieAdmin, smk, { code: 'TI', name: 'Lain' });
    expect([dup.statusCode, code(dup)]).toEqual([409, 'conflict']);

    const noParent = await call('POST', '/v1/vocational/programs-of-expertise', cookieAdmin, smk, {
      code: 'RPL',
      name: 'Pengembangan Perangkat Lunak',
      fieldId: '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    });
    expect([noParent.statusCode, code(noParent)]).toEqual([400, 'invalid_reference']);
    const vp = await call('POST', '/v1/vocational/programs-of-expertise', cookieAdmin, smk, {
      code: 'PPLG',
      name: 'Pengembangan Perangkat Lunak dan Gim',
      fieldId: ids.field,
      dapodikCode: '0001',
    });
    expect(vp.statusCode, vp.body).toBe(201);
    ids.vp = vp.json().id;

    const noProg = await call('POST', '/v1/vocational/concentrations', cookieAdmin, smk, {
      code: 'RPL',
      name: 'Rekayasa Perangkat Lunak',
      vocationalProgramId: '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    });
    expect([noProg.statusCode, code(noProg)]).toEqual([400, 'invalid_reference']);
    const conc = await call('POST', '/v1/vocational/concentrations', cookieAdmin, smk, {
      code: 'RPL',
      name: 'Rekayasa Perangkat Lunak',
      vocationalProgramId: ids.vp,
    });
    expect(conc.statusCode, conc.body).toBe(201);
    ids.conc = conc.json().id;
    expect(conc.json().linkedPrograms).toEqual([]);

    const fields = (await call('GET', '/v1/vocational/fields', cookieAdmin, smk)).json();
    expect(fields).toHaveLength(1);
    expect(fields[0].programCount).toBe(1);
    const progs = (await call('GET', '/v1/vocational/programs-of-expertise', cookieAdmin, smk)).json();
    expect(progs[0]).toMatchObject({ fieldId: ids.field, concentrationCount: 1 });
  });

  it('mengubah bidang (ganti nama, nonaktif); 404 untuk id tak dikenal', async () => {
    const u = await call('PUT', `/v1/vocational/fields/${ids.field}`, cookieAdmin, smk, {
      code: 'TI',
      name: 'Teknologi Informasi dan Komunikasi',
      active: false,
    });
    expect(u.statusCode, u.body).toBe(200);
    expect(u.json()).toMatchObject({
      name: 'Teknologi Informasi dan Komunikasi',
      active: false,
      programCount: 1,
    });
    const nf = await call(
      'PUT',
      '/v1/vocational/fields/0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      cookieAdmin,
      smk,
      {
        code: 'ZZ',
        name: 'x',
      },
    );
    expect([nf.statusCode, code(nf)]).toEqual([404, 'not_found']);
    await call('PUT', `/v1/vocational/fields/${ids.field}`, cookieAdmin, smk, {
      code: 'TI',
      name: 'Teknologi Informasi',
    });
  });

  it('menautkan jurusan unit operasional ke konsentrasi; melepas dengan null; rujukan salah 400; jurusan tak ada 404', async () => {
    const l = await call('PUT', `/v1/programs/${progId}/concentration`, cookieAdmin, smk, {
      concentrationId: ids.conc,
    });
    expect(l.statusCode, l.body).toBe(200);
    expect(l.json()).toEqual({ programId: progId, concentrationId: ids.conc });
    const concs = (await call('GET', '/v1/vocational/concentrations', cookieAdmin, smk)).json();
    expect(concs[0].linkedPrograms).toEqual([
      { id: progId, code: 'RPL', name: 'Rekayasa Perangkat Lunak', durationYears: 3 },
    ]);
    // Idempoten dan boleh dipindah.
    const c2 = await call('POST', '/v1/vocational/concentrations', cookieAdmin, smk, {
      code: 'TKJ',
      name: 'Teknik Komputer dan Jaringan',
      vocationalProgramId: ids.vp,
    });
    ids.conc2 = c2.json().id;
    expect(
      (
        await call('PUT', `/v1/programs/${progId}/concentration`, cookieAdmin, smk, {
          concentrationId: ids.conc2,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await db().execute(
          sql`select count(*)::int as n from program_concentration where program_id = ${progId}`,
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    const bad = await call('PUT', `/v1/programs/${progId}/concentration`, cookieAdmin, smk, {
      concentrationId: '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    });
    expect([bad.statusCode, code(bad)]).toEqual([400, 'invalid_reference']);
    const nf = await call(
      'PUT',
      '/v1/programs/0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/concentration',
      cookieAdmin,
      smk,
      {
        concentrationId: null,
      },
    );
    expect(nf.statusCode).toBe(404);
    await call('PUT', `/v1/programs/${progId}/concentration`, cookieAdmin, smk, {
      concentrationId: ids.conc,
    });
  });

  it('hapus yang masih dipakai 409 in_use; yang bebas terhapus', async () => {
    for (const [path, id] of [
      ['fields', ids.field],
      ['programs-of-expertise', ids.vp],
      ['concentrations', ids.conc],
    ] as const) {
      const r = await call('DELETE', `/v1/vocational/${path}/${id}`, cookieAdmin, smk);
      expect([r.statusCode, code(r)], path).toEqual([409, 'in_use']);
    }
    const free = await call('DELETE', `/v1/vocational/concentrations/${ids.conc2}`, cookieAdmin, smk);
    expect(free.statusCode, free.body).toBe(200);
    // Menghapus jurusan unit operasional menyapu tautannya (CASCADE), lalu konsentrasi bebas dihapus.
    const [extra] = await db()
      .insert(program)
      .values({ schoolId: smk, code: 'TMP', name: 'Sementara' })
      .returning();
    await call('PUT', `/v1/programs/${extra!.id}/concentration`, cookieAdmin, smk, {
      concentrationId: ids.conc,
    });
    const del = await call('DELETE', `/v1/programs/${extra!.id}`, cookieAdmin, smk);
    expect(del.statusCode, del.body).toBe(200);
  });

  it('terisolasi per sekolah: sekolah lain tidak melihat dan tidak dapat menautkan ke konsentrasi sekolah ini', async () => {
    expect((await call('GET', '/v1/vocational/concentrations', cookieAdminB, smkB)).json()).toEqual([]);
    const [pB] = await db().insert(program).values({ schoolId: smkB, code: 'X', name: 'X' }).returning();
    const link = await call('PUT', `/v1/programs/${pB!.id}/concentration`, cookieAdminB, smkB, {
      concentrationId: ids.conc,
    });
    expect([link.statusCode, code(link)]).toEqual([400, 'invalid_reference']);
    const cross = await call('PUT', `/v1/vocational/fields/${ids.field}`, cookieAdminB, smkB, {
      code: 'TI',
      name: 'Dicuri',
    });
    expect(cross.statusCode).toBe(404);
    // Kode yang sama boleh dipakai di sekolah lain.
    const same = await call('POST', '/v1/vocational/fields', cookieAdminB, smkB, {
      code: 'TI',
      name: 'TI B',
    });
    expect(same.statusCode).toBe(201);
  });
});

describe('rapor kejuruan (5.2)', () => {
  const getDoc = async () =>
    (await call('GET', `/v1/report-cards/${ani}?semesterId=${semId}`, cookieAdmin, smk)).json();
  const strip = ({ generatedAt: _g, ...rest }: Record<string, unknown>) => rest;
  let baseline: Record<string, unknown>;

  it('sakelar belum disimpan: false tanpa baris; dokumen v1 berurut abjad tanpa group dan expertise', async () => {
    const s = await call('GET', '/v1/vocational/settings/report', cookieAdmin, smk);
    expect([s.statusCode, s.json()]).toEqual([200, { reportGrouped: false }]);
    const doc = await getDoc();
    expect(doc.subjects.map((x: { name: string }) => x.name)).toEqual([
      'Alfa Kejuruan',
      'Beta Umum',
      'Delta Agama',
      'Gama Bebas',
    ]);
    expect(doc).not.toHaveProperty('expertise');
    expect(doc).not.toHaveProperty('schemaVersion');
    for (const sub of doc.subjects) expect(sub).not.toHaveProperty('group');
    baseline = strip(doc);
  });

  it('struktur terisi dan tertaut tetapi sakelar mati: dokumen tetap identik (tidak berubah diam-diam)', async () => {
    expect(strip(await getDoc())).toEqual(baseline);
  });

  it('hanya guru/kepala sekolah membaca; menulis butuh report_card:manage; modul dan jenjang digerbang', async () => {
    expect((await call('GET', '/v1/vocational/settings/report', cookiePrincipal, smk)).statusCode).toBe(200);
    const put = (cookie: string, sId: string) =>
      call('PUT', '/v1/vocational/settings/report', cookie, sId, { reportGrouped: true });
    expect((await put(cookiePrincipal, smk)).statusCode).toBe(403);
    expect((await put(cookieTeacher, smk)).statusCode).toBe(403);
    const smpRes = await put(cookieAdminSmp, smp);
    expect([smpRes.statusCode, code(smpRes)]).toEqual([404, 'not_vocational']);
    const noMod = await put(cookieAdminNoModule, smkNoModule);
    expect([noMod.statusCode, code(noMod)]).toEqual([403, 'module_disabled']);
    expect((await call('PUT', '/v1/vocational/settings/report', cookieAdmin, smk, {})).statusCode).toBe(400);
  });

  it('sakelar menyala: kelompok beku per mapel, mapel berurut per kelompok, kop memuat bidang/program/konsentrasi', async () => {
    const put = await call('PUT', '/v1/vocational/settings/report', cookieAdmin, smk, {
      reportGrouped: true,
    });
    expect([put.statusCode, put.json()]).toEqual([200, { reportGrouped: true }]);
    const doc = await getDoc();
    expect(doc.schemaVersion).toBe(2);
    expect(doc.subjects.map((x: { name: string }) => x.name)).toEqual([
      'Delta Agama',
      'Beta Umum',
      'Alfa Kejuruan',
      'Gama Bebas',
    ]);
    const byName = Object.fromEntries(
      doc.subjects.map((x: { name: string; group?: object }) => [x.name, x.group]),
    );
    expect(byName['Alfa Kejuruan']).toEqual({ key: 'vocational', label: 'Kelompok Kejuruan', section: 'B' });
    expect(byName['Beta Umum']).toEqual({
      key: 'general',
      label: 'Kelompok Mata Pelajaran Umum',
      section: 'A',
    });
    expect(byName['Delta Agama']).toMatchObject({ key: 'religion', section: 'A' });
    expect(byName['Gama Bebas']).toBeUndefined();
    expect(doc.expertise).toEqual({
      field: 'Teknologi Informasi',
      program: 'Pengembangan Perangkat Lunak dan Gim',
      concentration: 'Rekayasa Perangkat Lunak',
    });
    expect((await call('GET', '/v1/vocational/settings/report', cookieAdmin, smk)).json()).toEqual({
      reportGrouped: true,
    });
  });

  it('jurusan belum ditautkan: kelompok tetap ada, tanpa expertise', async () => {
    await call('PUT', `/v1/programs/${progId}/concentration`, cookieAdmin, smk, { concentrationId: null });
    const doc = await getDoc();
    expect(doc).not.toHaveProperty('expertise');
    expect(doc.subjects[0]).toHaveProperty('group');
    await call('PUT', `/v1/programs/${progId}/concentration`, cookieAdmin, smk, {
      concentrationId: ids.conc,
    });
  });

  it('final membekukan kelompok dan identitas; sakelar dimatikan sesudah final tidak mengubahnya; buka kembali memakai pengaturan baru', async () => {
    const fin = await call('POST', '/v1/report-cards/finalize', cookieAdmin, smk, {
      semesterId: semId,
      classId,
      force: true,
    });
    expect(fin.statusCode, fin.body).toBe(200);
    expect(
      (await call('PUT', '/v1/vocational/settings/report', cookieAdmin, smk, { reportGrouped: false }))
        .statusCode,
    ).toBe(200);
    const frozen = await getDoc();
    expect(frozen.status).toBe('final');
    expect(frozen.schemaVersion).toBe(2);
    expect(frozen.expertise.concentration).toBe('Rekayasa Perangkat Lunak');
    expect(frozen.subjects.map((x: { name: string }) => x.name)).toEqual([
      'Delta Agama',
      'Beta Umum',
      'Alfa Kejuruan',
      'Gama Bebas',
    ]);
    const portal = await call('GET', `/v1/portal/children/${ani}/report-cards/${semId}`, cookieGuardian, smk);
    expect(portal.statusCode, portal.body).toBe(200);
    expect(portal.json().expertise.field).toBe('Teknologi Informasi');
    expect(portal.json().subjects[0].group.key).toBe('religion');
    const reopen = await call('POST', '/v1/report-cards/reopen', cookieAdmin, smk, {
      semesterId: semId,
      classId,
    });
    expect(reopen.statusCode, reopen.body).toBe(200);
    expect(strip(await getDoc())).toEqual(baseline);
  });

  it('sakelar menyala lalu dimatikan lagi (baris ada, false): identik dengan sebelum sakelar pernah disimpan', async () => {
    const row = await db().execute(
      sql`select report_grouped from vocational_setting where school_id = ${smk}`,
    );
    expect(row.rows).toEqual([{ report_grouped: false }]);
    expect(strip(await getDoc())).toEqual(baseline);
  });

  it('sekolah non-SMK tanpa sakelar: dokumen tidak memuat kunci baru', async () => {
    const [y] = await db()
      .insert(academicYear)
      .values({
        schoolId: smp,
        name: '2026/2027',
        startsOn: '2026-07-13',
        endsOn: '2027-06-30',
        isActive: true,
      })
      .returning();
    const [sm] = await db()
      .insert(semester)
      .values({
        schoolId: smp,
        academicYearId: y!.id,
        name: 'Ganjil',
        startsOn: '2026-07-13',
        endsOn: '2026-12-20',
      })
      .returning();
    const [c] = await db()
      .insert(classRoom)
      .values({ schoolId: smp, academicYearId: y!.id, name: '7A', level: '7' })
      .returning();
    const [s] = await db().insert(student).values({ schoolId: smp, name: 'Budi', gender: 'L' }).returning();
    await db()
      .insert(enrollment)
      .values({ schoolId: smp, studentId: s!.id, classId: c!.id, academicYearId: y!.id });
    const doc = (
      await call('GET', `/v1/report-cards/${s!.id}?semesterId=${sm!.id}`, cookieAdminSmp, smp)
    ).json();
    expect(doc).not.toHaveProperty('expertise');
    expect(doc).not.toHaveProperty('schemaVersion');
  });
});
