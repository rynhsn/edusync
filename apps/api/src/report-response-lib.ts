import type { ReportDocumentResponse } from '@edusync/contracts';
import {
  and,
  asc,
  eq,
  guardian,
  max,
  reportCard,
  reportCardResponse,
  reportCardSnapshot,
  reportSetting,
  studentGuardian,
  type Tx,
} from '@edusync/db';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';

/**
 * Tanggapan orang tua/wali atas rapor FINAL (rancangan 3.5). Bukan bagian snapshot: ditulis sesudah final, disimpan di
 * `report_card_response`, dan ditumpangkan ke respons dokumen sebagai `guardianResponses`.
 */

const DAY_MS = 86_400_000;
export const RESPONSE_TEXT_MAX = 1000;

export interface ResponseView {
  id: string;
  guardianId: string;
  guardianName: string;
  text: string;
  recordedByKind: 'guardian' | 'staff';
  snapshotVersion: number | null;
  outdated: boolean;
  updatedAt: string;
}

/** Versi riwayat finalisasi terakhir siswa pada semester itu (null bila tidak ada riwayat, mis. rapor final sebelum riwayat ada). */
export async function latestFinalizedVersion(tx: Tx, semesterId: string, studentId: string) {
  const [row] = await tx
    .select({ v: max(reportCardSnapshot.version) })
    .from(reportCardSnapshot)
    .where(
      and(
        eq(reportCardSnapshot.semesterId, semesterId),
        eq(reportCardSnapshot.studentId, studentId),
        eq(reportCardSnapshot.kind, 'finalized'),
      ),
    );
  return row?.v ?? null;
}

/** Tanggapan siswa pada semester itu; `guardianId` membatasi ke satu wali (portal: hanya milik sendiri). */
export async function loadResponses(
  tx: Tx,
  semesterId: string,
  studentId: string,
  guardianId?: string,
): Promise<ResponseView[]> {
  const rows = await tx
    .select({
      id: reportCardResponse.id,
      guardianId: reportCardResponse.guardianId,
      guardianName: guardian.name,
      text: reportCardResponse.text,
      kind: reportCardResponse.recordedByKind,
      snapshotVersion: reportCardResponse.snapshotVersion,
      updatedAt: reportCardResponse.updatedAt,
    })
    .from(reportCardResponse)
    .innerJoin(guardian, eq(guardian.id, reportCardResponse.guardianId))
    .where(
      and(
        eq(reportCardResponse.semesterId, semesterId),
        eq(reportCardResponse.studentId, studentId),
        ...(guardianId ? [eq(reportCardResponse.guardianId, guardianId)] : []),
      ),
    )
    .orderBy(asc(reportCardResponse.createdAt), asc(guardian.name));
  if (rows.length === 0) return [];
  const latest = await latestFinalizedVersion(tx, semesterId, studentId);
  return rows.map((r) => ({
    id: r.id,
    guardianId: r.guardianId,
    guardianName: r.guardianName,
    text: r.text,
    recordedByKind: r.kind,
    snapshotVersion: r.snapshotVersion,
    outdated: r.snapshotVersion !== null && latest !== null && r.snapshotVersion < latest,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Tumpangkan tanggapan ke respons dokumen. Tanpa tanggapan, dokumen dikembalikan apa adanya (kunci tidak ditambahkan). */
export async function withResponses<T extends object>(
  tx: Tx,
  doc: T,
  semesterId: string,
  studentId: string,
  guardianId?: string,
): Promise<T & Pick<ReportDocumentResponse, 'guardianResponses'>> {
  const guardianResponses = await loadResponses(tx, semesterId, studentId, guardianId);
  return guardianResponses.length > 0 ? { ...doc, guardianResponses } : doc;
}

export interface ResponseWindow {
  /** Rapor siswa itu final. */
  final: boolean;
  finalizedAt: string | null;
  /** null = tanpa batas (atau belum final). */
  closesAt: string | null;
  /** true bila final dan jendela belum lewat. */
  open: boolean;
  windowDays: number | null;
}

/** Status jendela tanggapan siswa pada semester itu. */
export async function responseWindow(tx: Tx, semesterId: string, studentId: string): Promise<ResponseWindow> {
  const [[row], [setting]] = await Promise.all([
    tx
      .select({ status: reportCard.status, finalizedAt: reportCard.finalizedAt })
      .from(reportCard)
      .where(and(eq(reportCard.semesterId, semesterId), eq(reportCard.studentId, studentId))),
    tx.select({ days: reportSetting.responseWindowDays }).from(reportSetting),
  ]);
  const windowDays = setting ? setting.days : 30;
  if (row?.status !== 'final' || !row.finalizedAt) {
    return { final: false, finalizedAt: null, closesAt: null, open: false, windowDays };
  }
  const closes = windowDays === null ? null : new Date(row.finalizedAt.getTime() + windowDays * DAY_MS);
  return {
    final: true,
    finalizedAt: row.finalizedAt.toISOString(),
    closesAt: closes ? closes.toISOString() : null,
    open: closes === null || Date.now() <= closes.getTime(),
    windowDays,
  };
}

/** 409 `report_not_final` bila belum final, 409 `response_closed` bila jendela sudah lewat. */
export function assertResponseOpen(w: ResponseWindow) {
  if (!w.final) {
    throw new HttpError(409, 'report_not_final', 'Rapor belum difinalkan, jadi belum bisa diberi tanggapan.');
  }
  if (!w.open) {
    throw new HttpError(
      409,
      'response_closed',
      'Jendela tanggapan atas rapor ini sudah ditutup. Hubungi wali kelas atau sekolah.',
    );
  }
}

/** Wali yang terhubung dengan siswa itu (untuk pilihan staf yang menyalin dari rapor kertas). */
export async function guardiansOf(tx: Tx, studentId: string) {
  return tx
    .select({ id: guardian.id, name: guardian.name, relation: studentGuardian.relation })
    .from(studentGuardian)
    .innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId))
    .where(eq(studentGuardian.studentId, studentId))
    .orderBy(asc(guardian.name));
}

/** Wali itu terhubung ke siswa itu lewat `student_guardian`? */
export async function isGuardianOf(tx: Tx, studentId: string, guardianId: string) {
  const rows = await tx
    .select({ g: studentGuardian.guardianId })
    .from(studentGuardian)
    .where(and(eq(studentGuardian.studentId, studentId), eq(studentGuardian.guardianId, guardianId)));
  return rows.length > 0;
}

/**
 * Simpan tanggapan satu wali (upsert per semester-siswa-wali). Pemanggil sudah memeriksa hak akses. `kind` = siapa yang menulis.
 * Staf tidak boleh menimpa tanggapan yang ditulis wali sendiri (409 `guardian_response_exists`); wali boleh menimpa salinan staf.
 */
export async function saveResponse(
  tx: Tx,
  ctx: TenantContext,
  input: {
    semesterId: string;
    studentId: string;
    guardianId: string;
    text: string;
    kind: 'guardian' | 'staff';
  },
): Promise<ResponseView> {
  assertResponseOpen(await responseWindow(tx, input.semesterId, input.studentId));
  const [existing] = await tx
    .select({ kind: reportCardResponse.recordedByKind })
    .from(reportCardResponse)
    .where(
      and(
        eq(reportCardResponse.semesterId, input.semesterId),
        eq(reportCardResponse.studentId, input.studentId),
        eq(reportCardResponse.guardianId, input.guardianId),
      ),
    );
  if (existing?.kind === 'guardian' && input.kind === 'staff') {
    throw new HttpError(
      409,
      'guardian_response_exists',
      'Wali ini sudah menulis tanggapannya sendiri lewat portal; staf tidak dapat menimpanya.',
    );
  }
  const version = await latestFinalizedVersion(tx, input.semesterId, input.studentId);
  await tx
    .insert(reportCardResponse)
    .values({
      schoolId: ctx.schoolId,
      semesterId: input.semesterId,
      studentId: input.studentId,
      guardianId: input.guardianId,
      text: input.text,
      snapshotVersion: version,
      recordedBy: ctx.userId,
      recordedByKind: input.kind,
    })
    .onConflictDoUpdate({
      target: [reportCardResponse.semesterId, reportCardResponse.studentId, reportCardResponse.guardianId],
      set: {
        text: input.text,
        snapshotVersion: version,
        recordedBy: ctx.userId,
        recordedByKind: input.kind,
        updatedAt: new Date(),
      },
    });
  const [view] = await loadResponses(tx, input.semesterId, input.studentId, input.guardianId);
  return view as ResponseView;
}
