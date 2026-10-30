import {
  academicYear,
  calendarEvent,
  classRoom,
  createDb,
  dailyAttendance,
  enrollment,
  eq,
  finFeeType,
  finInvoice,
  finPayment,
  finPaymentItem,
  foundation,
  guardian,
  msgMessage,
  msgSetting,
  msgTemplate,
  school,
  student,
  studentGuardian,
  waAccount,
} from '@edusync/db';

/** Fixture tes pesan: pool platform, pembuatan sekolah/siswa/wali, dan pembersihan lengkap. */
export function createFixture(prefix: string) {
  const url = process.env.DATABASE_PLATFORM_URL;
  if (!url) throw new Error('DATABASE_PLATFORM_URL wajib diisi');
  const platform = createDb(url);
  const db = platform.db;
  const run = Math.random().toString(36).slice(2, 8);
  const schoolIds: string[] = [];
  let foundationId = '';
  let counter = 0;

  async function init() {
    const [f] = await db
      .insert(foundation)
      .values({ name: `Yayasan ${prefix}`, slug: `y-${prefix}-${run}` })
      .returning();
    foundationId = f?.id ?? '';
  }

  /** Sekolah dengan pengaturan pesan menyala dan akun WhatsApp berstatus ready. Jeda kirim 0 detik. */
  async function newSchool(
    options: {
      name?: string;
      setting?: Partial<typeof msgSetting.$inferInsert> | null;
      account?: Partial<typeof waAccount.$inferInsert> | null;
    } = {},
  ) {
    counter++;
    const [s] = await db
      .insert(school)
      .values({
        foundationId,
        slug: `${prefix}-${counter}-${run}`,
        name: options.name ?? `SMP ${prefix} ${counter}`,
      })
      .returning();
    const id = s?.id ?? '';
    schoolIds.push(id);
    if (options.setting !== null) {
      await db.insert(msgSetting).values({
        schoolId: id,
        enabled: true,
        delayMinSeconds: 0,
        delayMaxSeconds: 0,
        ...options.setting,
      });
    }
    if (options.account !== null) {
      await db
        .insert(waAccount)
        .values({ schoolId: id, desiredState: 'on', status: 'ready', ...options.account });
    }
    return id;
  }

  async function addMessage(schoolId: string, values: Partial<typeof msgMessage.$inferInsert> = {}) {
    counter++;
    const [m] = await db
      .insert(msgMessage)
      .values({ schoolId, eventKey: 'test', toPhone: '6281234567890', body: `Pesan ${counter}`, ...values })
      .returning();
    return m as typeof msgMessage.$inferSelect;
  }

  async function getMessage(id: string) {
    const [m] = await db.select().from(msgMessage).where(eq(msgMessage.id, id));
    return m as typeof msgMessage.$inferSelect;
  }

  /** Tahun ajaran aktif + kelas untuk sebuah sekolah. */
  async function newYear(schoolId: string, startsOn = '2026-07-13', endsOn = '2027-06-30') {
    const [ay] = await db
      .insert(academicYear)
      .values({ schoolId, name: '2026/2027', startsOn, endsOn, isActive: true })
      .returning();
    const [cr] = await db
      .insert(classRoom)
      .values({ schoolId, academicYearId: ay?.id ?? '', name: '7A', level: '7' })
      .returning();
    return { yearId: ay?.id ?? '', classId: cr?.id ?? '' };
  }

  /** Siswa berenrolmen dengan satu wali bernomor valid. */
  async function newStudent(
    schoolId: string,
    year: { yearId: string; classId: string },
    name: string,
    phone: string | null = '081234560000',
  ) {
    const [st] = await db.insert(student).values({ schoolId, name, gender: 'L' }).returning();
    const studentId = st?.id ?? '';
    await db
      .insert(enrollment)
      .values({ schoolId, studentId, classId: year.classId, academicYearId: year.yearId });
    if (phone) {
      counter++;
      const [g] = await db
        .insert(guardian)
        .values({ schoolId, name: `Wali ${name}`, phone })
        .returning();
      await db
        .insert(studentGuardian)
        .values({ schoolId, studentId, guardianId: g?.id ?? '', relation: 'father', isPrimary: true });
    }
    return studentId;
  }

  async function enableTemplate(schoolId: string, eventKey: string, body: string) {
    await db.insert(msgTemplate).values({ schoolId, eventKey, body, enabled: true });
  }

  async function newFeeType(schoolId: string) {
    const [f] = await db.insert(finFeeType).values({ schoolId, name: 'SPP', kind: 'monthly' }).returning();
    return f?.id ?? '';
  }

  async function newInvoice(
    schoolId: string,
    values: {
      studentId: string;
      yearId: string;
      feeTypeId: string;
      amount: number;
      dueDate: string;
    } & Partial<typeof finInvoice.$inferInsert>,
  ) {
    const [i] = await db
      .insert(finInvoice)
      .values({
        schoolId,
        title: 'SPP Oktober 2026',
        createdBy: 'tes',
        academicYearId: values.yearId,
        ...values,
      })
      .returning();
    return i as typeof finInvoice.$inferSelect;
  }

  async function pay(schoolId: string, studentId: string, invoiceId: string, amount: number, voided = false) {
    counter++;
    const [p] = await db
      .insert(finPayment)
      .values({
        schoolId,
        receiptNo: `K-${run}-${counter}`,
        studentId,
        method: 'cash',
        total: amount,
        recordedBy: 'tes',
        voidedAt: voided ? new Date() : null,
      })
      .returning();
    await db.insert(finPaymentItem).values({ schoolId, paymentId: p?.id ?? '', invoiceId, amount });
  }

  async function messagesOf(schoolId: string) {
    return db.select().from(msgMessage).where(eq(msgMessage.schoolId, schoolId));
  }

  async function cleanup() {
    for (const id of schoolIds) {
      await db.delete(msgMessage).where(eq(msgMessage.schoolId, id));
      await db.delete(msgTemplate).where(eq(msgTemplate.schoolId, id));
      await db.delete(msgSetting).where(eq(msgSetting.schoolId, id));
      await db.delete(waAccount).where(eq(waAccount.schoolId, id));
      await db.delete(finPaymentItem).where(eq(finPaymentItem.schoolId, id));
      await db.delete(finPayment).where(eq(finPayment.schoolId, id));
      await db.delete(finInvoice).where(eq(finInvoice.schoolId, id));
      await db.delete(finFeeType).where(eq(finFeeType.schoolId, id));
      await db.delete(dailyAttendance).where(eq(dailyAttendance.schoolId, id));
      await db.delete(calendarEvent).where(eq(calendarEvent.schoolId, id));
      await db.delete(enrollment).where(eq(enrollment.schoolId, id));
      await db.delete(studentGuardian).where(eq(studentGuardian.schoolId, id));
      await db.delete(guardian).where(eq(guardian.schoolId, id));
      await db.delete(student).where(eq(student.schoolId, id));
      await db.delete(classRoom).where(eq(classRoom.schoolId, id));
      await db.delete(academicYear).where(eq(academicYear.schoolId, id));
      await db.delete(school).where(eq(school.id, id));
    }
    if (foundationId) await db.delete(foundation).where(eq(foundation.id, foundationId));
    await platform.pool.end();
  }

  return {
    db,
    schoolIds,
    init,
    newSchool,
    addMessage,
    getMessage,
    newYear,
    newStudent,
    enableTemplate,
    newFeeType,
    newInvoice,
    pay,
    messagesOf,
    cleanup,
  };
}
