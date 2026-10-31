import { formatDateId, formatRupiah } from '@edusync/contracts';
import {
  and,
  classRoom,
  dailyAttendance,
  enqueueMessagesSafe,
  eq,
  inArray,
  lessonPeriod,
  type PlatformMessaging,
  platformMessagingIn,
  school,
  subject,
  type Tx,
} from '@edusync/db';
import type { Env } from './env';
import { jakarta } from './gate';

/** Nomor disamarkan untuk tampilan: 6281234567890 -> 6281****890. */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return `${phone.slice(0, 2)}****`;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

/** Penyedia yang berlaku: env menimpa pengaturan platform (sama seperti worker). */
export function effectiveProvider(env: Pick<Env, 'MESSAGING_PROVIDER'>, platform: PlatformMessaging) {
  return env.MESSAGING_PROVIDER ?? platform.provider;
}

/** Pesan benar-benar bisa terkirim ke WhatsApp: saklar global menyala dan penyedianya `whatsapp`. */
export function providerActive(env: Pick<Env, 'MESSAGING_PROVIDER'>, platform: PlatformMessaging) {
  return platform.enabled && effectiveProvider(env, platform) === 'whatsapp';
}

async function schoolName(tx: Tx, schoolId: string) {
  const [s] = await tx.select({ name: school.name }).from(school).where(eq(school.id, schoolId));
  return s?.name ?? '';
}

/** Peristiwa arrival/departure dari hasil tap kiosk. Hasil selain `in`/`out` diabaikan. */
export async function notifyTap(
  tx: Tx,
  schoolId: string,
  tapped: { result: string; at: string; student: { id: string; name: string; className: string | null } },
) {
  if (tapped.result !== 'in' && tapped.result !== 'out') return;
  const at = new Date(tapped.at);
  // Tap lebih tua dari batas pengaturan platform (kiriman ulang offline) tidak lagi diberitahukan ke wali.
  const { retry } = await platformMessagingIn(tx);
  if (Date.now() - at.getTime() > retry.staleTapHours * 3_600_000) return;
  const { date, time } = jakarta(at);
  const eventKey = tapped.result === 'in' ? 'arrival' : 'departure';
  await enqueueMessagesSafe(tx, {
    schoolId,
    eventKey,
    studentId: tapped.student.id,
    vars: {
      student: tapped.student.name,
      class: tapped.student.className,
      school: await schoolName(tx, schoolId),
      time,
      date: formatDateId(date),
    },
    dedupeKey: `${eventKey}:${tapped.student.id}:${date}`,
  });
}

/** Peristiwa payment dari kwitansi yang baru dibuat. */
export async function notifyPayment(
  tx: Tx,
  schoolId: string,
  paymentId: string,
  receipt: {
    receiptNo: string;
    paidAt: string;
    total: number;
    school: { name: string };
    student: { id: string; name: string; className: string | null };
    items: { title: string }[];
  },
) {
  await enqueueMessagesSafe(tx, {
    schoolId,
    eventKey: 'payment',
    studentId: receipt.student.id,
    vars: {
      student: receipt.student.name,
      school: receipt.school.name,
      receipt: receipt.receiptNo,
      amount: formatRupiah(receipt.total),
      title: [...new Set(receipt.items.map((i) => i.title))].join(', '),
      date: formatDateId(jakarta(new Date(receipt.paidAt)).date),
    },
    dedupeKey: `payment:${paymentId}`,
  });
}

/** Peristiwa report_card untuk tiap siswa kelas yang dirapor. */
export async function notifyReportCards(
  tx: Tx,
  schoolId: string,
  input: {
    semesterId: string;
    semesterName: string;
    className: string;
    schoolName: string;
    students: { id: string; name: string }[];
  },
) {
  for (const s of input.students) {
    await enqueueMessagesSafe(tx, {
      schoolId,
      eventKey: 'report_card',
      studentId: s.id,
      vars: {
        student: s.name,
        class: input.className,
        semester: input.semesterName,
        school: input.schoolName,
      },
      dedupeKey: `report_card:${input.semesterId}:${s.id}`,
    });
  }
}

/**
 * Peristiwa skipped_class: siswa ditandai `absent` di satu jam pelajaran padahal pada tanggal itu tercatat
 * hadir/terlambat di gerbang.
 */
export async function notifySkippedClass(
  tx: Tx,
  schoolId: string,
  input: {
    scheduleEntryId: string;
    classId: string;
    subjectId: string;
    periodId: string;
    date: string;
    absent: { id: string; name: string }[];
  },
) {
  if (input.absent.length === 0) return;
  const atGate = await tx
    .select({ studentId: dailyAttendance.studentId })
    .from(dailyAttendance)
    .where(
      and(
        eq(dailyAttendance.date, input.date),
        inArray(dailyAttendance.status, ['present', 'late']),
        inArray(
          dailyAttendance.studentId,
          input.absent.map((s) => s.id),
        ),
      ),
    );
  if (atGate.length === 0) return;
  const here = new Set(atGate.map((g) => g.studentId));
  const [cls] = await tx
    .select({ name: classRoom.name })
    .from(classRoom)
    .where(eq(classRoom.id, input.classId));
  const [sub] = await tx.select({ name: subject.name }).from(subject).where(eq(subject.id, input.subjectId));
  const [period] = await tx
    .select({ startsAt: lessonPeriod.startsAt, endsAt: lessonPeriod.endsAt })
    .from(lessonPeriod)
    .where(eq(lessonPeriod.id, input.periodId));
  const name = await schoolName(tx, schoolId);
  for (const s of input.absent.filter((a) => here.has(a.id))) {
    await enqueueMessagesSafe(tx, {
      schoolId,
      eventKey: 'skipped_class',
      studentId: s.id,
      vars: {
        student: s.name,
        class: cls?.name,
        subject: sub?.name,
        date: formatDateId(input.date),
        time: period ? `${period.startsAt}-${period.endsAt}` : '',
        school: name,
      },
      dedupeKey: `skipped:${input.scheduleEntryId}:${s.id}:${input.date}`,
    });
  }
}
