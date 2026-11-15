import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  academicYear,
  announcement,
  BatchError,
  cancelAnnouncementBroadcast,
  classRoom,
  createDb,
  enqueueBatch,
  enrollment,
  foundation,
  guardian,
  loadSendLimits,
  msgBatch,
  msgMessage,
  msgOptOut,
  msgSetting,
  resolveRecipients,
  school,
  student,
  studentGuardian,
  teacher,
  withTenant,
} from './index';

const appUrl = process.env.DATABASE_URL;
const platformUrl = process.env.DATABASE_PLATFORM_URL;
if (!appUrl || !platformUrl) throw new Error('DATABASE_URL dan DATABASE_PLATFORM_URL wajib diisi');

const app = createDb(appUrl);
const platform = createDb(platformUrl);
const run = Math.random().toString(36).slice(2, 8);

let foundationId = '';
let schoolId = '';
let otherSchoolId = '';
const ids = { kelas7: '', kelas8: '', a: '', b: '', c: '', d: '', e: '', gSari: '', gBackup: '', t: '' };

const inTenant = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app.db, [schoolId], fn);
const resolve = (selection: Parameters<typeof resolveRecipients>[2]) =>
  inTenant((tx) => resolveRecipients(tx, schoolId, selection));

beforeAll(async () => {
  const db = platform.db;
  const [f] = await db
    .insert(foundation)
    .values({ name: 'Yayasan Batch', slug: `ybatch-${run}` })
    .returning();
  foundationId = f!.id;
  const [a] = await db
    .insert(school)
    .values({ foundationId, slug: `bat-a-${run}`, name: 'SMP Batch' })
    .returning();
  const [b] = await db
    .insert(school)
    .values({ foundationId, slug: `bat-b-${run}`, name: 'SMP Lain' })
    .returning();
  schoolId = a!.id;
  otherSchoolId = b!.id;
  await db.insert(msgSetting).values({ schoolId, enabled: true });

  const [y] = await db
    .insert(academicYear)
    .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2099-06-30', isActive: true })
    .returning();
  const [k7] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: y!.id, name: '7A', level: '7' })
    .returning();
  const [k8] = await db
    .insert(classRoom)
    .values({ schoolId, academicYearId: y!.id, name: '8A', level: '8' })
    .returning();
  ids.kelas7 = k7!.id;
  ids.kelas8 = k8!.id;
  const addStudent = async (name: string, classId: string) => {
    const [s] = await db.insert(student).values({ schoolId, name, gender: 'P' }).returning();
    await db.insert(enrollment).values({ schoolId, studentId: s!.id, classId, academicYearId: y!.id });
    return s!.id;
  };
  const addGuardian = async (name: string, phone: string | null) =>
    (await db.insert(guardian).values({ schoolId, name, phone }).returning())[0]!.id;
  const link = (studentId: string, guardianId: string, isPrimary: boolean) =>
    db.insert(studentGuardian).values({ schoolId, studentId, guardianId, relation: 'mother', isPrimary });
  ids.a = await addStudent('Ani', ids.kelas7);
  ids.b = await addStudent('Budi', ids.kelas7);
  ids.c = await addStudent('Cici', ids.kelas8);
  ids.d = await addStudent('Dedi', ids.kelas8);
  ids.e = await addStudent('Eko', ids.kelas8);
  ids.gSari = await addGuardian('Bu Sari', '081200000001');
  const gRusak = await addGuardian('Utama Rusak', '123');
  ids.gBackup = await addGuardian('Cadangan', '+62 812 0000 0002');
  const gKosong = await addGuardian('Utama Kosong', null);
  await link(ids.a, ids.gSari, true);
  await link(ids.b, ids.gSari, true); // kakak-adik, satu nomor
  await link(ids.c, gRusak, true); // utama tak valid -> jatuh ke cadangan
  await link(ids.c, ids.gBackup, false);
  await link(ids.d, gKosong, true); // tidak ada wali bernomor
  await link(ids.e, gRusak, true);
  const [t] = await db
    .insert(teacher)
    .values({ schoolId, name: 'Pak Guru', phone: '081200000001' })
    .returning();
  ids.t = t!.id; // nomor sama dengan Bu Sari
});

afterAll(async () => {
  const db = platform.db;
  for (const id of [schoolId, otherSchoolId]) {
    await db.delete(msgMessage).where(eq(msgMessage.schoolId, id));
    await db.delete(msgBatch).where(eq(msgBatch.schoolId, id));
    await db.delete(announcement).where(eq(announcement.schoolId, id));
    await db.delete(msgOptOut).where(eq(msgOptOut.schoolId, id));
    await db.delete(msgSetting).where(eq(msgSetting.schoolId, id));
    await db.delete(enrollment).where(eq(enrollment.schoolId, id));
    await db.delete(studentGuardian).where(eq(studentGuardian.schoolId, id));
    await db.delete(guardian).where(eq(guardian.schoolId, id));
    await db.delete(student).where(eq(student.schoolId, id));
    await db.delete(teacher).where(eq(teacher.schoolId, id));
    await db.delete(classRoom).where(eq(classRoom.schoolId, id));
    await db.delete(academicYear).where(eq(academicYear.schoolId, id));
    await db.delete(school).where(eq(school.id, id));
  }
  await db.delete(foundation).where(eq(foundation.id, foundationId));
  await app.pool.end();
  await platform.pool.end();
});

describe('resolveRecipients', () => {
  it('kakak-adik satu nomor digabung; {{student}} berisi kedua nama', async () => {
    const r = await resolve({ students: [ids.a, ids.b] });
    expect(r.recipients).toHaveLength(1);
    expect(r.recipients[0]).toMatchObject({
      phone: '6281200000001',
      kind: 'guardian',
      name: 'Bu Sari',
      studentNames: ['Ani', 'Budi'],
      classNames: ['7A'],
    });
    expect(r.excluded).toEqual({ noPhone: 0, invalid: 0, duplicate: 1, optedOut: 0 });
  });

  it('wali utama dengan nomor rusak jatuh ke wali berikutnya; tak ada wali bernomor dihitung', async () => {
    const r = await resolve({ classes: [ids.kelas8] });
    expect(r.recipients.map((x) => [x.name, x.phone])).toEqual([['Cadangan', '6281200000002']]);
    // Dedi: wali tanpa nomor (noPhone). Eko: nomor rusak (invalid).
    expect(r.excluded).toMatchObject({ noPhone: 1, invalid: 1, duplicate: 0 });
    const all = await resolve({ students: [ids.c], guardianScope: 'all' });
    expect(all.recipients.map((x) => x.name)).toEqual(['Cadangan']);
    expect(all.excluded.invalid).toBe(1);
  });

  it('wholeSchool, gradeLevels; wali yang juga staf = satu pesan sebagai wali', async () => {
    expect((await resolve({ wholeSchool: true })).recipients.map((x) => x.name)).toEqual([
      'Bu Sari',
      'Cadangan',
    ]);
    expect((await resolve({ gradeLevels: ['7'] })).recipients.map((x) => x.name)).toEqual(['Bu Sari']);
    const both = await resolve({ students: [ids.a], teachers: [ids.t] });
    expect(both.recipients).toHaveLength(1);
    expect(both.recipients[0]?.kind).toBe('guardian');
    expect(both.excluded.duplicate).toBe(1);
    const staff = await resolve({ allStaff: true });
    expect(staff.recipients[0]).toMatchObject({ kind: 'teacher', teacherId: ids.t, studentId: null });
  });

  it('murid tidak aktif dan tanpa pemilih tidak menghasilkan penerima; sekolah lain tak terbaca (RLS)', async () => {
    await platform.db.update(student).set({ status: 'transferred' }).where(eq(student.id, ids.a));
    expect((await resolve({ students: [ids.a] })).recipients).toHaveLength(0);
    await platform.db.update(student).set({ status: 'active' }).where(eq(student.id, ids.a));
    expect((await resolve({})).recipients).toHaveLength(0);
    const asOther = await withTenant(app.db, [otherSchoolId], (tx) =>
      resolveRecipients(tx, otherSchoolId, { students: [ids.a], wholeSchool: true, allStaff: true }),
    );
    expect(asOther.recipients).toHaveLength(0);
  });
});

describe('enqueueBatch dan batas', () => {
  const make = (over: Partial<Parameters<typeof enqueueBatch>[1]> = {}) =>
    inTenant((tx) =>
      enqueueBatch(tx, {
        schoolId,
        kind: 'direct',
        title: 'Uji',
        body: 'Yth. {{guardian}} / {{student}} / {{class}} / {{school}}',
        selection: { students: [ids.a, ids.b] },
        createdBy: 'uji',
        expectedTotal: 1,
        schoolName: 'SMP Batch',
        ...over,
      }),
    );
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e) => (e instanceof BatchError ? e.code : String(e)),
    );

  it('atomik: batch + satu pesan per nomor dengan prioritas; galat tidak meninggalkan baris', async () => {
    const r = await make();
    expect(r.total).toBe(1);
    const msgs = await platform.db.select().from(msgMessage).where(eq(msgMessage.batchId, r.batchId));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      body: 'Yth. Bu Sari / Ani dan Budi / 7A / SMP Batch',
      priority: 1,
      eventKey: 'direct',
    });
    expect(await code(make({ expectedTotal: 5 }))).toBe('count_changed');
    expect(await code(make({ body: '{{amount}}' }))).toBe('unknown_placeholder');
    expect(await code(make({ selection: {}, expectedTotal: 0 }))).toBe('no_recipients');
    expect(await platform.db.select().from(msgMessage).where(eq(msgMessage.schoolId, schoolId))).toHaveLength(
      1,
    );
    expect(await platform.db.select().from(msgBatch).where(eq(msgBatch.schoolId, schoolId))).toHaveLength(1);
  });

  it('batas harian: yang dibatalkan dan pesan otomatis tidak dihitung; nomor baru dibatasi 50', async () => {
    await platform.db.delete(msgMessage).where(eq(msgMessage.schoolId, schoolId));
    await platform.db.delete(msgBatch).where(eq(msgBatch.schoolId, schoolId));
    const limits = () => inTenant((tx) => loadSendLimits(tx, schoolId));
    await platform.db.update(msgSetting).set({ dailyLimit: 300 }).where(eq(msgSetting.schoolId, schoolId));
    expect(await limits()).toMatchObject({
      limit: 50,
      newNumber: true,
      used: 0,
      remaining: 50,
      enabled: true,
    });
    const base = { schoolId, toPhone: '6281200009999', body: 'x' };
    await platform.db.insert(msgMessage).values([
      { ...base, eventKey: 'arrival', priority: 0 }, // otomatis
      { ...base, eventKey: 'direct', priority: 1, dedupeKey: 'k1' },
      { ...base, eventKey: 'direct', priority: 1, status: 'skipped', detail: 'cancelled', dedupeKey: 'k2' },
      { ...base, eventKey: 'direct', priority: 1, status: 'skipped', detail: 'expired', dedupeKey: 'k3' },
      { ...base, eventKey: 'broadcast', priority: 2, status: 'failed', dedupeKey: 'k4' },
      {
        ...base,
        eventKey: 'direct',
        priority: 1,
        dedupeKey: 'k5',
        createdAt: new Date(Date.now() - 3 * 86_400_000), // hari lain
      },
    ]);
    expect(await limits()).toMatchObject({ used: 3 });
    await platform.db.insert(msgMessage).values({
      ...base,
      eventKey: 'arrival',
      status: 'sent',
      sentAt: new Date(Date.now() - 9 * 86_400_000),
      dedupeKey: 'lama',
    });
    expect(await limits()).toMatchObject({ limit: 300, newNumber: false, remaining: 297 });
    await platform.db.update(msgSetting).set({ dailyLimit: 3 }).where(eq(msgSetting.schoolId, schoolId));
    expect(await code(make({ expectedTotal: 1 }))).toBe('daily_limit');
    await platform.db.update(msgSetting).set({ dailyLimit: 200 }).where(eq(msgSetting.schoolId, schoolId));
    expect(await code(make({ expectedTotal: 1 }))).toBe('ok');
  });
});

describe('RLS dan FK komposit tabel baru', () => {
  it('msg_batch terisolasi per sekolah; batch_id sekolah lain ditolak FK komposit; sekolah lain tidak bisa menulis', async () => {
    const [other] = await platform.db
      .insert(msgBatch)
      .values({
        schoolId: otherSchoolId,
        kind: 'direct',
        title: 'lain',
        bodyTemplate: 'x',
        selection: {},
        recipientCount: 0,
        createdBy: 'uji',
      })
      .returning();
    const seen = await inTenant((tx) => tx.select().from(msgBatch));
    expect(seen.every((b) => b.schoolId === schoolId)).toBe(true);
    expect(await app.db.select().from(msgBatch)).toHaveLength(0);
    await expect(
      platform.db.insert(msgMessage).values({
        schoolId,
        eventKey: 'direct',
        toPhone: '6281200000077',
        body: 'x',
        batchId: other!.id,
      }),
    ).rejects.toThrow();
    await expect(
      inTenant((tx) =>
        tx.insert(msgBatch).values({
          schoolId: otherSchoolId,
          kind: 'direct',
          title: 'x',
          bodyTemplate: 'x',
          selection: {},
          recipientCount: 0,
          createdBy: 'uji',
        }),
      ),
    ).rejects.toThrow();
    // teacher_id sekolah lain juga ditolak.
    const [tOther] = await platform.db
      .insert(teacher)
      .values({ schoolId: otherSchoolId, name: 'Guru Lain' })
      .returning();
    await expect(
      platform.db.insert(msgMessage).values({
        schoolId,
        eventKey: 'direct',
        toPhone: '6281200000078',
        body: 'x',
        teacherId: tOther!.id,
      }),
    ).rejects.toThrow();
    expect(
      await platform.db
        .select()
        .from(msgMessage)
        .where(and(eq(msgMessage.schoolId, schoolId), eq(msgMessage.toPhone, '6281200000077'))),
    ).toHaveLength(0);
  });
});

describe('siaran pengumuman: opt-out, isi polos, satu siaran, pembatalan', () => {
  const optOut = () =>
    platform.db
      .insert(msgOptOut)
      .values({ schoolId, phone: '6281200000001', guardianId: ids.gSari, createdBy: 'uji' })
      .onConflictDoNothing();

  it('opt-out dibuang dari siaran dan hanya diperingatkan untuk pesan langsung', async () => {
    await optOut();
    const sel = { students: [ids.a, ids.b, ids.c] };
    const direct = await resolve(sel);
    expect(direct.recipients.map((r) => r.name).sort()).toEqual(['Bu Sari', 'Cadangan']);
    expect(direct).toMatchObject({ optedOutWarning: 1, excluded: { optedOut: 0 } });
    const cast = await inTenant((tx) => resolveRecipients(tx, schoolId, sel, { dropOptedOut: true }));
    expect(cast.recipients.map((r) => r.name)).toEqual(['Cadangan']);
    expect(cast).toMatchObject({ optedOutWarning: 0, excluded: { optedOut: 1 } });
  });

  it('enqueueBatch broadcast: isi apa adanya, satu siaran per pengumuman, batal membiarkan yang terkirim', async () => {
    await optOut();
    const [ann] = await platform.db
      .insert(announcement)
      .values({
        schoolId,
        title: 'T',
        body: 'x',
        createdBy: 'uji',
        status: 'published',
        publishedAt: new Date(),
      })
      .returning();
    const body = '*T*\n\nHalo {{x}}   dua spasi 12';
    const make = () =>
      inTenant((tx) =>
        enqueueBatch(tx, {
          schoolId,
          kind: 'broadcast',
          title: 'T',
          body,
          plain: true,
          announcementId: ann!.id,
          selection: { wholeSchool: true },
          createdBy: 'uji',
          expectedTotal: 1,
          schoolName: 'SMP Batch',
        }),
      );
    const r = await make();
    expect(r).toMatchObject({ total: 1, excluded: { optedOut: 1 } });
    const msgs = await platform.db.select().from(msgMessage).where(eq(msgMessage.batchId, r.batchId));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ body, priority: 2, eventKey: 'broadcast', toPhone: '6281200000002' });
    // Paling banyak satu siaran per pengumuman (indeks unik parsial).
    await expect(make()).rejects.toThrow();
    // Isi 16 digit tetap ditolak walau polos.
    await expect(
      inTenant((tx) =>
        enqueueBatch(tx, {
          schoolId,
          kind: 'broadcast',
          title: 'N',
          body: 'rek 1234567890123456',
          plain: true,
          selection: { wholeSchool: true },
          createdBy: 'uji',
          expectedTotal: 1,
          schoolName: 'SMP Batch',
        }),
      ),
    ).rejects.toMatchObject({ code: 'sensitive_content' });
    // Yang sedang dikirim tidak disentuh; yang antre dibatalkan. Dua kali = aman.
    await platform.db.update(msgMessage).set({ status: 'sending' }).where(eq(msgMessage.id, msgs[0]!.id));
    expect(await inTenant((tx) => cancelAnnouncementBroadcast(tx, ann!.id, 'uji'))).toBe(0);
    await platform.db.update(msgMessage).set({ status: 'queued' }).where(eq(msgMessage.id, msgs[0]!.id));
    expect(await inTenant((tx) => cancelAnnouncementBroadcast(tx, ann!.id, 'uji'))).toBe(1);
    expect(await inTenant((tx) => cancelAnnouncementBroadcast(tx, ann!.id, 'uji'))).toBe(0);
    const [after] = await platform.db.select().from(msgMessage).where(eq(msgMessage.id, msgs[0]!.id));
    expect(after).toMatchObject({ status: 'skipped', detail: 'cancelled' });
    const [b] = await platform.db.select().from(msgBatch).where(eq(msgBatch.id, r.batchId));
    expect(b!.cancelledAt).not.toBeNull();
    // Menghapus pengumuman: batch tetap, rujukan menjadi null, school_id utuh.
    await platform.db.delete(announcement).where(eq(announcement.id, ann!.id));
    const [kept] = await platform.db.select().from(msgBatch).where(eq(msgBatch.id, r.batchId));
    expect(kept).toMatchObject({ announcementId: null, schoolId });
  });
});
