import { DEFAULT_PARTICIPANT_NO_FORMAT, hasClassToken, renderParticipantNo } from '@edusync/contracts';
import {
  academicYear,
  and,
  asc,
  classRoom,
  enrollment,
  eq,
  examParticipantNumber,
  type examType,
  inArray,
  semester,
  sql,
  student,
  type Tx,
} from '@edusync/db';

type TypeRow = typeof examType.$inferSelect;
const MAX_ROUNDS = 5;
const CHUNK = 1000;

/**
 * Pengaturan efektif satu jenis ujian. Tanpa format (belum diatur) dipakai format bawaan dengan urutan se-sekolah supaya
 * nomor unik per semester + jenis ujian; urutan per kelas hanya berlaku bila format memuat {kelas} (dijaga saat disimpan).
 */
export function numberingOf(
  t: Pick<TypeRow, 'participantNoFormat' | 'participantNoSeqScope' | 'participantNoSeqStart'>,
) {
  const format = t.participantNoFormat;
  const scope = format && hasClassToken(format) ? t.participantNoSeqScope : 'school';
  return {
    format: format ?? DEFAULT_PARTICIPANT_NO_FORMAT,
    scope: scope === 'class' ? ('class' as const) : ('school' as const),
    start: t.participantNoSeqStart,
  };
}

interface Candidate {
  studentId: string;
  classId: string;
  className: string;
}

/** Murid aktif di kelas-kelas itu, urut nama kelas, nama, id (urutan yang sama dengan perhitungan lama). */
async function rosterOf(
  tx: Tx,
  classIds: string[],
): Promise<{ list: Candidate[]; years: Map<string, string> }> {
  if (classIds.length === 0) return { list: [], years: new Map() };
  const rows = await tx
    .select({
      studentId: student.id,
      classId: classRoom.id,
      className: classRoom.name,
      yearStart: academicYear.startsOn,
    })
    .from(enrollment)
    .innerJoin(student, eq(student.id, enrollment.studentId))
    .innerJoin(classRoom, eq(classRoom.id, enrollment.classId))
    .innerJoin(academicYear, eq(academicYear.id, classRoom.academicYearId))
    .where(
      and(
        inArray(enrollment.classId, classIds),
        eq(student.status, 'active'),
        sql`${student.deletedAt} is null`,
      ),
    )
    .orderBy(asc(classRoom.name), asc(student.name), asc(student.id));
  return {
    list: rows,
    years: new Map(rows.map((r) => [r.classId, r.yearStart])),
  };
}

async function existingOf(tx: Tx, semesterId: string, examTypeId: string, studentIds: string[]) {
  const out = new Map<string, string>();
  for (let at = 0; at < studentIds.length; at += CHUNK) {
    const rows = await tx
      .select({ studentId: examParticipantNumber.studentId, number: examParticipantNumber.number })
      .from(examParticipantNumber)
      .where(
        and(
          eq(examParticipantNumber.semesterId, semesterId),
          eq(examParticipantNumber.examTypeId, examTypeId),
          inArray(examParticipantNumber.studentId, studentIds.slice(at, at + CHUNK)),
        ),
      );
    for (const r of rows) out.set(r.studentId, r.number);
  }
  return out;
}

/** Urutan terbesar yang sudah dipakai per kelas (snapshot) atau se-sekolah; kunci '' = se-sekolah. */
async function topSeq(tx: Tx, semesterId: string, examTypeId: string, scope: 'class' | 'school') {
  const rows = await tx
    .select({
      classId: examParticipantNumber.classId,
      top: sql<number>`max(${examParticipantNumber.seq})::int`,
    })
    .from(examParticipantNumber)
    .where(
      and(eq(examParticipantNumber.semesterId, semesterId), eq(examParticipantNumber.examTypeId, examTypeId)),
    )
    .groupBy(examParticipantNumber.classId);
  const tops = new Map<string, number>();
  for (const r of rows) {
    const key = scope === 'school' ? '' : (r.classId ?? '');
    tops.set(key, Math.max(tops.get(key) ?? 0, r.top));
  }
  return tops;
}

/**
 * Pastikan setiap murid aktif pada kelas yang diminta punya nomor peserta untuk (semester, jenis ujian), lalu kembalikan
 * peta murid -> nomor. Idempoten: murid yang sudah bernomor tidak berubah. Murid baru diberi urutan terbesar lingkup + 1
 * (tidak kurang dari angka mulai), mengikuti urutan nama kelas, nama, id. Lingkup se-sekolah menetapkan seluruh kelas
 * tahun ajaran semester itu supaya urutan tidak bergantung pada kelas yang dicetak lebih dulu. Konkurensi: INSERT ...
 * ON CONFLICT DO NOTHING lalu hitung ulang yang belum bernomor (maks. MAX_ROUNDS putaran); kunci unik menjaga duplikat.
 */
export async function ensureParticipantNumbers(
  tx: Tx,
  o: { schoolId: string; semesterId: string; type: TypeRow; classIds: string[] },
): Promise<Map<string, string>> {
  const cfg = numberingOf(o.type);
  let classIds = o.classIds;
  if (cfg.scope === 'school') {
    const [sem] = await tx
      .select({ yearId: semester.academicYearId })
      .from(semester)
      .where(eq(semester.id, o.semesterId));
    if (!sem) return new Map();
    const all = await tx
      .select({ id: classRoom.id })
      .from(classRoom)
      .where(eq(classRoom.academicYearId, sem.yearId));
    classIds = all.map((c) => c.id);
  }
  const { list, years } = await rosterOf(tx, classIds);
  const ids = list.map((c) => c.studentId);
  let have = await existingOf(tx, o.semesterId, o.type.id, ids);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const missing = list.filter((c) => !have.has(c.studentId));
    if (missing.length === 0) break;
    const tops = await topSeq(tx, o.semesterId, o.type.id, cfg.scope);
    const next = new Map<string, number>();
    const rows = missing.map((c) => {
      const key = cfg.scope === 'school' ? '' : c.classId;
      const seq = Math.max((next.get(key) ?? tops.get(key) ?? 0) + 1, cfg.start);
      next.set(key, seq);
      return {
        schoolId: o.schoolId,
        semesterId: o.semesterId,
        examTypeId: o.type.id,
        studentId: c.studentId,
        classId: c.classId,
        seq,
        number: renderParticipantNo(cfg.format, {
          typeShort: o.type.shortName,
          academicYearStart: years.get(c.classId) ?? '',
          className: c.className,
          seq,
        }),
      };
    });
    for (let at = 0; at < rows.length; at += CHUNK)
      await tx
        .insert(examParticipantNumber)
        .values(rows.slice(at, at + CHUNK))
        .onConflictDoNothing();
    have = await existingOf(tx, o.semesterId, o.type.id, ids);
  }
  return have;
}
