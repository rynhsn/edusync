import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDb,
  enqueueMessages,
  enqueueMessagesSafe,
  enqueueRaw,
  foundation,
  guardian,
  loadPlatformMessaging,
  msgMessage,
  msgSetting,
  msgTemplate,
  parsePlatformMessaging,
  school,
  student,
  studentGuardian,
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
const studentIds: string[] = [];

const vars = { student: 'Budi', class: '7A', school: 'SMP Uji', time: '07:01', date: '2026-10-30' };

async function guardianFor(studentId: string, phone: string | null, name = 'Wali') {
  const [g] = await platform.db.insert(guardian).values({ schoolId, name, phone }).returning();
  await platform.db
    .insert(studentGuardian)
    .values({ schoolId, studentId, guardianId: g!.id, relation: 'father' });
  return g!.id;
}

async function newStudent(name: string) {
  const [s] = await platform.db.insert(student).values({ schoolId, name, gender: 'L' }).returning();
  studentIds.push(s!.id);
  return s!.id;
}

const setSettings = (enabled: boolean) =>
  platform.db
    .insert(msgSetting)
    .values({ schoolId, enabled })
    .onConflictDoUpdate({ target: msgSetting.schoolId, set: { enabled } });
const setTemplate = (eventKey: string, enabled: boolean) =>
  platform.db
    .insert(msgTemplate)
    .values({ schoolId, eventKey, body: 'Halo {{student}} di {{class}}', enabled })
    .onConflictDoUpdate({ target: [msgTemplate.schoolId, msgTemplate.eventKey], set: { enabled } });

const enqueue = (studentId: string, dedupeKey: string, eventKey: 'arrival' | 'departure' = 'arrival') =>
  withTenant(app.db, [schoolId], (tx) =>
    enqueueMessages(tx, { schoolId, eventKey, studentId, vars, dedupeKey }),
  );
const messages = () => platform.db.select().from(msgMessage).where(eq(msgMessage.schoolId, schoolId));

beforeAll(async () => {
  const [f] = await platform.db
    .insert(foundation)
    .values({ name: 'Yayasan Pesan', slug: `ymsg-${run}` })
    .returning();
  foundationId = f!.id;
  const [a] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `msg-a-${run}`, name: 'SMP Uji' })
    .returning();
  const [b] = await platform.db
    .insert(school)
    .values({ foundationId, slug: `msg-b-${run}`, name: 'SMP Lain' })
    .returning();
  schoolId = a!.id;
  otherSchoolId = b!.id;
});

afterAll(async () => {
  for (const id of [schoolId, otherSchoolId]) {
    await platform.db.delete(msgMessage).where(eq(msgMessage.schoolId, id));
    await platform.db.delete(msgTemplate).where(eq(msgTemplate.schoolId, id));
    await platform.db.delete(msgSetting).where(eq(msgSetting.schoolId, id));
    await platform.db.delete(studentGuardian).where(eq(studentGuardian.schoolId, id));
    await platform.db.delete(guardian).where(eq(guardian.schoolId, id));
    await platform.db.delete(student).where(eq(student.schoolId, id));
    await platform.db.delete(school).where(eq(school.id, id));
  }
  await platform.db.delete(foundation).where(eq(foundation.id, foundationId));
  await app.pool.end();
  await platform.pool.end();
});

describe('enqueueMessages', () => {
  it('setting mati -> tidak ada pesan', async () => {
    const sid = await newStudent('Siswa Setting Mati');
    await guardianFor(sid, '081234567801');
    await setTemplate('arrival', true);
    expect(await enqueue(sid, 'arrival:a')).toEqual({ queued: 0 });
    await setSettings(false);
    expect(await enqueue(sid, 'arrival:a')).toEqual({ queued: 0 });
    expect(await messages()).toHaveLength(0);
  });

  it('templat mati atau tanpa baris -> tidak ada pesan', async () => {
    await setSettings(true);
    const sid = await newStudent('Siswa Templat Mati');
    await guardianFor(sid, '081234567802');
    await setTemplate('arrival', false);
    expect(await enqueue(sid, 'arrival:b')).toEqual({ queued: 0 });
    // departure tidak punya baris templat sama sekali.
    expect(await enqueue(sid, 'departure:b', 'departure')).toEqual({ queued: 0 });
    expect(await messages()).toHaveLength(0);
  });

  it('wali tanpa atau dengan telepon tak valid dilewati; yang valid dapat pesan ber-templat', async () => {
    await setSettings(true);
    await setTemplate('arrival', true);
    const sid = await newStudent('Budi');
    await guardianFor(sid, null);
    await guardianFor(sid, '12345');
    await guardianFor(sid, '0812-3456-7803');
    expect(await enqueue(sid, 'arrival:c')).toEqual({ queued: 1 });
    const rows = await messages();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      toPhone: '6281234567803',
      body: 'Halo Budi di 7A',
      status: 'queued',
      eventKey: 'arrival',
      studentId: sid,
      dedupeKey: 'arrival:c:6281234567803',
    });
  });

  it('dua wali satu nomor -> satu pesan; dedupe idempoten', async () => {
    await setSettings(true);
    await setTemplate('arrival', true);
    const sid = await newStudent('Siswa Kembar Nomor');
    await guardianFor(sid, '081234567804', 'Ayah');
    await guardianFor(sid, '+6281234567804', 'Ibu');
    await guardianFor(sid, '081234567805', 'Wali');
    expect(await enqueue(sid, 'arrival:d')).toEqual({ queued: 2 });
    expect(await enqueue(sid, 'arrival:d')).toEqual({ queued: 0 });
    const rows = (await messages()).filter((m) => m.studentId === sid);
    expect(rows.map((r) => r.toPhone).sort()).toEqual(['6281234567804', '6281234567805']);
  });

  it('enqueueMessagesSafe menelan galat dan tidak merusak transaksi', async () => {
    await setSettings(true);
    await setTemplate('arrival', true);
    const sid = await newStudent('Siswa Safe');
    await guardianFor(sid, '081234567806');
    const result = await withTenant(app.db, [schoolId], async (tx) => {
      // studentId bukan uuid -> galat SQL di dalam savepoint.
      const bad = await enqueueMessagesSafe(tx, {
        schoolId,
        eventKey: 'arrival',
        studentId: 'bukan-uuid',
        vars,
        dedupeKey: 'arrival:bad',
      });
      const good = await enqueueMessagesSafe(tx, {
        schoolId,
        eventKey: 'arrival',
        studentId: sid,
        vars,
        dedupeKey: 'arrival:safe',
      });
      return { bad, good };
    });
    expect(result.bad).toEqual({ queued: 0 });
    expect(result.good).toEqual({ queued: 1 });
  });

  it('tidak membuat pesan untuk sekolah lain (RLS)', async () => {
    await setSettings(true);
    await setTemplate('arrival', true);
    const sid = await newStudent('Siswa Lintas');
    await guardianFor(sid, '081234567807');
    const res = await withTenant(app.db, [otherSchoolId], (tx) =>
      enqueueMessages(tx, {
        schoolId: otherSchoolId,
        eventKey: 'arrival',
        studentId: sid,
        vars,
        dedupeKey: 'arrival:x',
      }),
    );
    expect(res).toEqual({ queued: 0 });
  });
});

describe('enqueueRaw', () => {
  it('mengantrekan pesan uji dan menghormati dedupe', async () => {
    const input = { schoolId, eventKey: 'test', toPhone: '6281234567899', body: 'Uji', dedupeKey: 'test:1' };
    expect(await withTenant(app.db, [schoolId], (tx) => enqueueRaw(tx, input))).toEqual({ queued: 1 });
    expect(await withTenant(app.db, [schoolId], (tx) => enqueueRaw(tx, input))).toEqual({ queued: 0 });
  });
});

describe('pengaturan platform', () => {
  it('nilai bawaan dan penguraian yang toleran', async () => {
    expect(parsePlatformMessaging(null).maxQueuedPerSchool).toBe(500);
    expect(parsePlatformMessaging({ enabled: false, provider: 'x', maxQueuedPerSchool: -1 })).toMatchObject({
      enabled: false,
      maxQueuedPerSchool: 500,
    });
    expect(['log', 'whatsapp']).toContain((await loadPlatformMessaging(platform.db)).provider);
  });
});
