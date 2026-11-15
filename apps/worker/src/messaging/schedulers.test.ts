import { calendarEvent, dailyAttendance, eq, msgAttachment, msgBatch, msgMessage } from '@edusync/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatDateId, formatRupiah, isoWeekKey, MessagingSchedulers } from './schedulers';
import { createFixture } from './test-helpers';

const DEFAULT_TEMPLATES = {
  absent: 'Yth. Bapak/Ibu, {{student}} ({{class}}) belum tercatat hadir di {{school}} pada {{date}}.',
  overdue: 'Tagihan {{title}} untuk {{student}} sebesar {{amount}} jatuh tempo {{due}}. {{school}}',
};
const fx = createFixture('sched');
const platformOn = async () => ({ enabled: true, provider: 'log' as const, maxQueuedPerSchool: 500 });
const WED = new Date('2026-11-04T03:00:00Z'); // Rabu 10:00 Jakarta
const DATE = '2026-11-04';

let base = 0;
beforeAll(fx.init);
afterAll(fx.cleanup);
beforeEach(() => {
  base = fx.schoolIds.length;
});

const make = (now: Date) =>
  new MessagingSchedulers(fx.db, {
    getPlatform: platformOn,
    now: () => now,
    schoolIds: fx.schoolIds.slice(base),
  });

async function absentSchool() {
  const sid = await fx.newSchool({ account: null, setting: { absentNoticeAt: '09:00' } });
  await fx.enableTemplate(sid, 'absent', DEFAULT_TEMPLATES.absent);
  const year = await fx.newYear(sid);
  return { sid, year };
}

describe('pemformat', () => {
  it('rupiah, tanggal Indonesia, minggu ISO', () => {
    expect(formatRupiah(250000)).toBe('Rp 250.000');
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
    expect(formatRupiah(500)).toBe('Rp 500');
    expect(formatDateId('2026-10-05')).toBe('5 Oktober 2026');
    expect(isoWeekKey('2026-11-04')).toBe('2026-W45');
    expect(isoWeekKey('2026-11-08')).toBe('2026-W45'); // Minggu masih minggu yang sama
    expect(isoWeekKey('2026-11-09')).toBe('2026-W46');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
  });
});

describe('pengingat belum tiba', () => {
  it('hanya siswa tanpa tap/izin/sakit yang dapat pesan; idempoten', async () => {
    const { sid, year } = await absentSchool();
    const budi = await fx.newStudent(sid, year, 'Budi', '081234560001');
    const citra = await fx.newStudent(sid, year, 'Citra', '081234560002');
    const dewi = await fx.newStudent(sid, year, 'Dewi', '081234560003');
    const eka = await fx.newStudent(sid, year, 'Eka', '081234560004');
    const fani = await fx.newStudent(sid, year, 'Fani', '081234560005');
    await fx.newStudent(sid, year, 'Gita Tanpa Wali', null);
    await fx.db.insert(dailyAttendance).values([
      {
        schoolId: sid,
        studentId: citra,
        date: DATE,
        checkInAt: new Date('2026-11-03T23:30:00Z'),
        status: 'present',
      },
      { schoolId: sid, studentId: dewi, date: DATE, status: 'excused' },
      { schoolId: sid, studentId: eka, date: DATE, status: 'sick' },
      { schoolId: sid, studentId: fani, date: DATE, status: 'absent' }, // dicatat alpa tanpa tap: tetap diingatkan
    ]);

    await make(WED).runAbsent();
    const rows = await fx.messagesOf(sid);
    expect(rows.map((r) => r.studentId).sort()).toEqual([budi, fani].sort());
    const budiMsg = rows.find((r) => r.studentId === budi);
    expect(budiMsg?.eventKey).toBe('absent');
    expect(budiMsg?.toPhone).toBe('6281234560001');
    expect(budiMsg?.dedupeKey).toBe(`absent:${budi}:${DATE}:6281234560001`);
    expect(budiMsg?.body).toContain('Budi');
    expect(budiMsg?.body).toContain('7A');
    expect(budiMsg?.body).toContain('4 November 2026');

    // Dijalankan lagi (instance baru = tanpa ingatan proses): tidak ada pesan ganda.
    await make(WED).runAbsent();
    await make(new Date('2026-11-04T08:00:00Z')).runAbsent();
    expect(await fx.messagesOf(sid)).toHaveLength(2);
  });

  it('sebelum jam pengingat tidak ada pesan, sesudahnya ada', async () => {
    const { sid, year } = await absentSchool();
    await fx.newStudent(sid, year, 'Hana', '081234560006');
    await make(new Date('2026-11-04T01:30:00Z')).runAbsent(); // 08:30 Jakarta
    expect(await fx.messagesOf(sid)).toHaveLength(0);
    await make(new Date('2026-11-04T02:00:00Z')).runAbsent(); // 09:00 Jakarta
    expect(await fx.messagesOf(sid)).toHaveLength(1);
  });

  it('libur/jeda kalender sekolah dan hari Minggu tidak diingatkan', async () => {
    const { sid, year } = await absentSchool();
    await fx.newStudent(sid, year, 'Indra', '081234560007');
    await fx.db.insert(calendarEvent).values({
      schoolId: sid,
      academicYearId: year.yearId,
      type: 'holiday',
      scope: 'school',
      title: 'Libur uji',
      startsOn: '2026-11-03',
      endsOn: '2026-11-05',
    });
    await make(WED).runAbsent();
    expect(await fx.messagesOf(sid)).toHaveLength(0);

    const other = await absentSchool();
    await fx.newStudent(other.sid, other.year, 'Joko', '081234560008');
    await make(new Date('2026-11-01T03:00:00Z')).runAbsent(); // Minggu
    expect(await fx.messagesOf(other.sid)).toHaveLength(0);
  });

  it('libur cakupan kelas tidak menutup sekolah; pengaturan mati atau absentNoticeAt null dilewati', async () => {
    const { sid, year } = await absentSchool();
    await fx.newStudent(sid, year, 'Kiki', '081234560009');
    await fx.db.insert(calendarEvent).values({
      schoolId: sid,
      academicYearId: year.yearId,
      type: 'holiday',
      scope: 'class',
      classId: year.classId,
      title: 'Libur kelas',
      startsOn: DATE,
      endsOn: DATE,
    });
    const offSid = await fx.newSchool({ account: null, setting: { enabled: false } });
    await fx.enableTemplate(offSid, 'absent', DEFAULT_TEMPLATES.absent);
    const offYear = await fx.newYear(offSid);
    await fx.newStudent(offSid, offYear, 'Lala', '081234560010');
    const nullSid = await fx.newSchool({ account: null, setting: { absentNoticeAt: null } });
    await fx.enableTemplate(nullSid, 'absent', DEFAULT_TEMPLATES.absent);
    const nullYear = await fx.newYear(nullSid);
    await fx.newStudent(nullSid, nullYear, 'Mimi', '081234560011');

    await make(WED).runAbsent();
    expect(await fx.messagesOf(sid)).toHaveLength(1);
    expect(await fx.messagesOf(offSid)).toHaveLength(0);
    expect(await fx.messagesOf(nullSid)).toHaveLength(0);
  });
});

describe('pengingat tunggakan', () => {
  it('hanya tagihan lewat jatuh tempo dengan sisa > 0; nominal sisa benar', async () => {
    const sid = await fx.newSchool({ account: null });
    await fx.enableTemplate(sid, 'overdue', DEFAULT_TEMPLATES.overdue);
    const year = await fx.newYear(sid);
    const feeTypeId = await fx.newFeeType(sid);
    const budi = await fx.newStudent(sid, year, 'Budi', '081234560021');
    const inv = (period: string, dueDate: string, extra: object = {}, title = `SPP ${period}`) =>
      fx.newInvoice(sid, {
        studentId: budi,
        yearId: year.yearId,
        feeTypeId,
        amount: 250000,
        dueDate,
        period,
        title,
        ...extra,
      });
    const unpaid = await inv('2026-07', '2026-10-10');
    const partial = await inv('2026-08', '2026-10-10');
    await fx.pay(sid, budi, partial.id, 100000);
    const paid = await inv('2026-09', '2026-10-10');
    await fx.pay(sid, budi, paid.id, 250000);
    const voidedPayment = await inv('2026-10', '2026-10-10');
    await fx.pay(sid, budi, voidedPayment.id, 250000, true); // kwitansi batal tidak dihitung
    const discounted = await inv('2026-11', '2026-10-10', { discount: 50000 });
    await inv('2026-12', '2026-11-10'); // belum jatuh tempo
    await inv('2027-01', '2026-11-04'); // jatuh tempo hari ini: belum lewat
    await inv('2027-02', '2026-10-01', { status: 'void' });

    // Sebelum 08:00 Jakarta belum ada.
    await make(new Date('2026-11-03T23:30:00Z')).runOverdue();
    expect(await fx.messagesOf(sid)).toHaveLength(0);

    await make(WED).runOverdue();
    const rows = await fx.messagesOf(sid);
    const weekKey = isoWeekKey(DATE);
    const byInvoice = (id: string) =>
      rows.find((r) => r.dedupeKey === `overdue:${id}:${weekKey}:6281234560021`);
    expect(rows).toHaveLength(4);
    expect(byInvoice(unpaid.id)?.body).toContain('Rp 250.000');
    expect(byInvoice(unpaid.id)?.body).toContain('SPP 2026-07');
    expect(byInvoice(unpaid.id)?.body).toContain('10 Oktober 2026');
    expect(byInvoice(partial.id)?.body).toContain('Rp 150.000');
    expect(byInvoice(voidedPayment.id)?.body).toContain('Rp 250.000');
    expect(byInvoice(discounted.id)?.body).toContain('Rp 200.000');
    expect(byInvoice(paid.id)).toBeUndefined();

    // Maksimal sekali seminggu: menjalankan lagi di hari yang sama tidak menambah.
    await make(WED).runOverdue();
    expect(await fx.messagesOf(sid)).toHaveLength(4);
    // Esok harinya tagihan yang jatuh tempo hari ini ikut lewat tempo (tagihan lain tidak diulang di minggu yang sama).
    await make(new Date('2026-11-05T03:00:00Z')).runOverdue();
    expect(await fx.messagesOf(sid)).toHaveLength(5);

    // Minggu berikutnya semua tagihan lewat tempo (6, termasuk yang jatuh tempo 10 Nov) diingatkan lagi.
    await make(new Date('2026-11-11T03:00:00Z')).runOverdue();
    expect(await fx.messagesOf(sid)).toHaveLength(11);
  });

  it('sekolah dengan pesan mati tidak membuat pengingat', async () => {
    const sid = await fx.newSchool({ account: null, setting: { enabled: false } });
    await fx.enableTemplate(sid, 'overdue', DEFAULT_TEMPLATES.overdue);
    const year = await fx.newYear(sid);
    const feeTypeId = await fx.newFeeType(sid);
    const budi = await fx.newStudent(sid, year, 'Budi', '081234560031');
    await fx.newInvoice(sid, {
      studentId: budi,
      yearId: year.yearId,
      feeTypeId,
      amount: 100000,
      dueDate: '2026-10-01',
    });
    await make(WED).runOverdue();
    expect(await fx.messagesOf(sid)).toHaveLength(0);
  });
});

describe('pembersihan lampiran', () => {
  const DAY = 86_400_000;
  const dataOf = async (id: string) => {
    const [r] = await fx.db.select().from(msgAttachment).where(eq(msgAttachment.id, id));
    return r as typeof msgAttachment.$inferSelect;
  };

  it('tak dipakai batch: dihapus isinya setelah 24 jam, metadata tetap', async () => {
    const sid = await fx.newSchool();
    const { attachmentId } = await fx.addAttachmentBatch(sid, {}, {});
    // Lampiran yatim: batch dilepas.
    await fx.db.update(msgBatch).set({ attachmentId: null }).where(eq(msgBatch.schoolId, sid));
    expect(await make(new Date(Date.now() + DAY - 3_600_000)).runPurgeAttachments()).toBe(0);
    expect(await make(new Date(Date.now() + DAY + 3_600_000)).runPurgeAttachments()).toBe(1);
    const a = await dataOf(attachmentId);
    expect(a.data).toBeNull();
    expect(a.purgedAt).toBeInstanceOf(Date);
    expect(a.fileName).toBe('surat.pdf');
    expect(a.size).toBeGreaterThan(0);
    // Idempoten.
    expect(await make(new Date(Date.now() + 2 * DAY)).runPurgeAttachments()).toBe(0);
  });

  it('dipakai batch: dipertahankan selama batch belum selesai dan 7 hari sesudahnya', async () => {
    const sid = await fx.newSchool();
    const { attachmentId, batchId } = await fx.addAttachmentBatch(sid);
    const m = await fx.addMessage(sid, { eventKey: 'direct', priority: 1, batchId });
    const t = (days: number) => make(new Date(Date.now() + days * DAY));
    // Masih antre: tidak dihapus walau sangat lama.
    expect(await t(30).runPurgeAttachments()).toBe(0);
    const sentAt = new Date();
    await fx.db.update(msgMessage).set({ status: 'sent', sentAt }).where(eq(msgMessage.id, m.id));
    expect(await t(6.5).runPurgeAttachments()).toBe(0);
    expect((await dataOf(attachmentId)).data).not.toBeNull();
    expect(await t(8).runPurgeAttachments()).toBe(1);
    expect((await dataOf(attachmentId)).data).toBeNull();
  });

  it('tick menjalankan pembersihan paling sering sekali per jam', async () => {
    const sid = await fx.newSchool();
    const { attachmentId } = await fx.addAttachmentBatch(sid);
    await fx.db.update(msgBatch).set({ attachmentId: null }).where(eq(msgBatch.schoolId, sid));
    const clock = { now: new Date(Date.now() + 2 * DAY) };
    const s = new MessagingSchedulers(fx.db, {
      getPlatform: platformOn,
      now: () => clock.now,
      schoolIds: fx.schoolIds.slice(base),
    });
    await s.tick();
    expect((await dataOf(attachmentId)).data).toBeNull();
  });
});
