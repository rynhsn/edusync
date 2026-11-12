import {
  type FreezeOrigin,
  frozenComponentsSchema,
  frozenCriteriaListSchema,
  type KktpRow,
} from '@edusync/contracts';
import {
  and,
  asc,
  classRoom,
  count,
  eq,
  freezeSemesterGradingConfig,
  gradeComponent,
  readLiveGradingConfig,
  reportCard,
  semester,
  semesterGradingConfig,
  sql,
  type Tx,
} from '@edusync/db';
import { type GradingSettings, loadComponents, loadSettings } from './grading-lib';
import { HttpError } from './http-error';
import type { TenantContext } from './identity/guards';
import { type KktpResolver, loadKktpResolver, loadKktpRows, makeKktpResolver } from './kktp-lib';
import type { ReportDocument } from './report-card-lib';
import { REPORT_FINAL_CODE } from './report-lock-lib';
import { audit } from './routes/helpers';

/**
 * Konfigurasi nilai EFEKTIF sebuah semester (rancangan: docs/rancangan-pembekuan-konfigurasi-nilai.md).
 *
 * - Semester tanpa baris `semester_grading_config` mengikuti konfigurasi HIDUP (`grading_setting`, `grade_component`,
 *   `achievement_criteria`), persis perilaku sebelum pembekuan.
 * - Semester dengan baris beku memakai salinan itu untuk semua kelasnya: satu kueri, tanpa kueri kriteria.
 *
 * Semua penghitung nilai sebuah semester (rapor, portal, rekap, matriks) wajib memuat konfigurasi lewat `loadGradingConfig`,
 * bukan `loadSettings`/`loadComponents`/`loadKktpRows`, yang tetap ada hanya sebagai pemuat konfigurasi hidup.
 */

export interface EffectiveGradingConfig {
  semesterId: string;
  settings: GradingSettings;
  components: { id: string; name: string; weight: number; sort: number }[];
  /** null = semester mengikuti konfigurasi hidup. */
  frozen: { origin: FreezeOrigin; frozenAt: Date } | null;
  /** Pemecah KKM untuk satu kelas; dari salinan (tanpa kueri) atau dari tabel hidup (dua kueri, seperti sebelum pembekuan). */
  kkmResolver(
    tx: Tx,
    p: { levelCode: string | null; programId: string | null; subjectIds: string[] },
  ): Promise<KktpResolver>;
  /** Baris KKTP (aktif, tingkat mapel) per mapel; dari salinan (tanpa kueri) atau dari tabel hidup. Untuk pratinjau pemecah KKM. */
  kktpRows(tx: Tx, subjectIds: string[]): Promise<Map<string, KktpRow[]>>;
}

/**
 * Muat konfigurasi efektif semester. Dipanggil sekali per permintaan lalu diteruskan ke penghitung dan pemecah KKM.
 * `live: true` mengabaikan salinan beku dan memakai konfigurasi hidup (hanya untuk skrip verifikasi baca-saja yang
 * membandingkan aturan hari ini dengan rapor terbit).
 */
export async function loadGradingConfig(
  tx: Tx,
  semesterId: string,
  opts: { live?: boolean } = {},
): Promise<EffectiveGradingConfig> {
  const [row] = opts.live
    ? []
    : await tx.select().from(semesterGradingConfig).where(eq(semesterGradingConfig.semesterId, semesterId));
  if (!row) {
    const settings = await loadSettings(tx);
    const components = await loadComponents(tx);
    return {
      semesterId,
      settings,
      components,
      frozen: null,
      kkmResolver: (t, p) => loadKktpResolver(t, { ...p, fallback: settings.kkm }),
      kktpRows: (t, subjectIds) => loadKktpRows(t, subjectIds),
    };
  }
  const settings: GradingSettings = {
    kkm: row.kkm,
    predicateA: row.predicateA,
    predicateB: row.predicateB,
    predicateC: row.predicateC,
    calculationMode: row.calculationMode,
  };
  const components = frozenComponentsSchema.parse(row.components);
  const bySubject = new Map<string, KktpRow[]>();
  for (const c of frozenCriteriaListSchema.parse(row.criteria)) {
    const list = bySubject.get(c.subjectId) ?? [];
    list.push(c);
    bySubject.set(c.subjectId, list);
  }
  return {
    semesterId,
    settings,
    components,
    frozen: { origin: row.origin, frozenAt: row.frozenAt },
    kkmResolver: async (_tx, p) => makeKktpResolver(bySubject, { ...p, fallback: settings.kkm }),
    kktpRows: async (_tx, subjectIds) => new Map(subjectIds.map((id) => [id, bySubject.get(id) ?? []])),
  };
}

/** Pemecah KKM untuk satu kelas: tingkat dan program dibaca dari kelas. Kelas tak dikenal dianggap tanpa tingkat dan program. */
export async function kkmResolverForClass(
  tx: Tx,
  cfg: EffectiveGradingConfig,
  p: { classId: string; subjectIds: string[] },
): Promise<KktpResolver> {
  const [cls] = await tx
    .select({ level: classRoom.level, programId: classRoom.programId })
    .from(classRoom)
    .where(eq(classRoom.id, p.classId));
  return cfg.kkmResolver(tx, {
    levelCode: cls?.level ?? null,
    programId: cls?.programId ?? null,
    subjectIds: p.subjectIds,
  });
}

/* ---------- Pembekuan, kunci, dan guard (tahap A, L3) ---------- */

/**
 * Kunci penasihat per sekolah (berlaku sampai transaksi selesai). Finalisasi rapor dan setiap penulisan konfigurasi hidup
 * mengambil kunci yang sama, jadi keduanya tidak balapan: salah satu menunggu, lalu melihat hasil yang lain.
 */
export const lockGradingConfig = (tx: Tx, schoolId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`grading-config:${schoolId}`}))`);

/**
 * Pastikan semester punya salinan beku (dibuat dari konfigurasi hidup bila belum ada; yang sudah ada dibiarkan). Mengambil
 * kunci per sekolah lebih dulu dan menahannya sampai transaksi selesai.
 */
export async function ensureSemesterFrozen(
  tx: Tx,
  ctx: { schoolId: string; userId: string | null },
  semesterId: string,
  origin: FreezeOrigin,
): Promise<void> {
  await lockGradingConfig(tx, ctx.schoolId);
  await freezeSemesterGradingConfig(tx, {
    schoolId: ctx.schoolId,
    semesterId,
    origin,
    actorId: ctx.userId,
    overwrite: false,
  });
}

/**
 * Guard penulisan konfigurasi hidup: ambil kunci per sekolah, lalu tolak 409 `report_final` bila semester AKTIF sudah punya
 * rapor final (nilai hidup dan rapor terbit akan berbeda bila diubah; buka kembali rapornya lebih dulu). Pesan dan kode sama
 * dengan penjaga sebelum pembekuan; semester nonaktif tidak diperiksa karena yang berfinal sudah beku.
 */
export async function assertLiveGradingConfigEditable(tx: Tx, schoolId: string): Promise<void> {
  await lockGradingConfig(tx, schoolId);
  const [hit] = await tx
    .select({ id: reportCard.id })
    .from(reportCard)
    .innerJoin(semester, eq(semester.id, reportCard.semesterId))
    .where(and(eq(semester.isActive, true), eq(reportCard.status, 'final')))
    .limit(1);
  if (hit) {
    throw new HttpError(
      409,
      REPORT_FINAL_CODE,
      'Pengaturan nilai tidak bisa diubah karena sudah ada rapor final pada semester aktif. Buka kembali rapor kelas tersebut lebih dulu.',
    );
  }
}

const summarize = (r: typeof semesterGradingConfig.$inferSelect) => ({
  kkm: r.kkm,
  predicates: [r.predicateA, r.predicateB, r.predicateC],
  calculationMode: r.calculationMode,
  origin: r.origin,
  components: Array.isArray(r.components) ? r.components.length : 0,
  criteria: Array.isArray(r.criteria) ? r.criteria.length : 0,
});

/**
 * Aturan W (tulis-tembus). Dipanggil setelah konfigurasi hidup ditulis, di transaksi yang sama: bila semester AKTIF punya
 * salinan beku, tidak punya rapor final, dan salinannya bukan kunci manual, salinan ditulis ulang dari konfigurasi hidup
 * (asal `sync`) dan dicatat di audit (`grading_config.sync`, ringkasan sebelum dan sesudah). Semester nonaktif tidak pernah
 * disentuh. Mengembalikan id semester yang disinkronkan, atau null bila tidak ada yang berubah.
 */
export async function syncActiveSemesterFreeze(tx: Tx, ctx: TenantContext): Promise<string | null> {
  const [active] = await tx.select({ id: semester.id }).from(semester).where(eq(semester.isActive, true));
  if (!active) return null;
  const [before] = await tx
    .select()
    .from(semesterGradingConfig)
    .where(eq(semesterGradingConfig.semesterId, active.id));
  if (!before || before.origin === 'manual') return null;
  const [final] = await tx
    .select({ id: reportCard.id })
    .from(reportCard)
    .where(and(eq(reportCard.semesterId, active.id), eq(reportCard.status, 'final')))
    .limit(1);
  if (final) return null;
  await freezeSemesterGradingConfig(tx, {
    schoolId: ctx.schoolId,
    semesterId: active.id,
    origin: 'sync',
    actorId: ctx.userId,
    overwrite: true,
  });
  const [after] = await tx
    .select()
    .from(semesterGradingConfig)
    .where(eq(semesterGradingConfig.semesterId, active.id));
  await audit(tx, ctx, 'grading_config.sync', 'semester', active.id, {
    trigger: 'live_write',
    before: summarize(before),
    after: summarize(after!),
  });
  return active.id;
}

/**
 * Penilaian pada semester beku harus memakai komponen yang ada di salinan; skor pada komponen yang dibuat setelah pembekuan
 * akan diabaikan diam-diam oleh penghitung. Semester hidup menerima komponen apa pun milik sekolah.
 */
export async function assertComponentInSemester(
  tx: Tx,
  semesterId: string,
  componentId: string,
): Promise<void> {
  const [row] = await tx
    .select({ components: semesterGradingConfig.components })
    .from(semesterGradingConfig)
    .where(eq(semesterGradingConfig.semesterId, semesterId));
  if (!row) return;
  if (frozenComponentsSchema.parse(row.components).some((c) => c.id === componentId)) return;
  const [c] = await tx
    .select({ name: gradeComponent.name })
    .from(gradeComponent)
    .where(eq(gradeComponent.id, componentId));
  throw new HttpError(
    409,
    'component_not_in_semester',
    `Komponen "${c?.name ?? componentId}" belum berlaku pada semester ini karena konfigurasi nilainya sudah dikunci. ` +
      'Pakai komponen yang berlaku, atau terapkan pengaturan terkini ke semester ini lebih dulu.',
  );
}

/* ---------- Status, sinkron, dan tumpangan snapshot (tahap B: L5, L6) ---------- */

type SnapshotSubjects = ReportDocument['subjects'];

/**
 * Baris mapel dari snapshot rapor FINAL satu (semester, kelas), per siswa (`studentId` -> baris mapel). Satu kueri yang hanya
 * memilih `snapshot -> 'subjects'`. Siswa yang tidak punya rapor final pada kelas itu tidak ada di peta. Dipakai penumpang
 * snapshot (I3): nilai akhir, predikat, KKM, dan `belowKkm` kelas final berasal dari sini, bukan dihitung ulang.
 */
export async function finalSubjectRows(
  tx: Tx,
  semesterId: string,
  classId: string,
): Promise<Map<string, SnapshotSubjects>> {
  const rows = await tx
    .select({
      studentId: reportCard.studentId,
      subjects: sql<SnapshotSubjects | null>`${reportCard.snapshot} -> 'subjects'`,
    })
    .from(reportCard)
    .where(
      and(
        eq(reportCard.semesterId, semesterId),
        eq(reportCard.classId, classId),
        eq(reportCard.status, 'final'),
      ),
    );
  return new Map(
    rows.flatMap((r) => (Array.isArray(r.subjects) ? [[r.studentId, r.subjects] as const] : [])),
  );
}

/** Sama untuk satu siswa tanpa memandang kelas (portal): baris mapel snapshot final semester itu, atau null. */
export async function finalSubjectRowsForStudent(
  tx: Tx,
  studentId: string,
  semesterId: string,
): Promise<SnapshotSubjects | null> {
  const [row] = await tx
    .select({ subjects: sql<SnapshotSubjects | null>`${reportCard.snapshot} -> 'subjects'` })
    .from(reportCard)
    .where(
      and(
        eq(reportCard.studentId, studentId),
        eq(reportCard.semesterId, semesterId),
        eq(reportCard.status, 'final'),
      ),
    );
  return row && Array.isArray(row.subjects) ? row.subjects : null;
}

/** Urutkan kunci objek secara rekursif supaya dua bentuk jsonb yang sama isinya menghasilkan teks yang sama. */
function canonical(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object') {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, val]) => [k, norm(val)]),
      );
    }
    return x;
  };
  return JSON.stringify(norm(v));
}

/** Apakah salinan beku sama isinya dengan konfigurasi hidup sekolah saat ini (KKM, predikat, mode, komponen, dan KKTP). */
export async function matchesLive(
  tx: Tx,
  schoolId: string,
  row: typeof semesterGradingConfig.$inferSelect,
): Promise<boolean> {
  const live = await readLiveGradingConfig(tx, schoolId);
  return (
    canonical({
      kkm: row.kkm,
      predicateA: row.predicateA,
      predicateB: row.predicateB,
      predicateC: row.predicateC,
      calculationMode: row.calculationMode,
      components: row.components,
      criteria: row.criteria,
    }) === canonical(live)
  );
}

export interface SemesterGradingStatus {
  semesterId: string;
  frozen: boolean;
  origin: FreezeOrigin | null;
  frozenAt: Date | null;
  frozenBy: string | null;
  configVersion: number | null;
  /** Semester yang belum beku mengikuti konfigurasi hidup, jadi selalu true. */
  matchesLive: boolean;
  finalClassCount: number;
  finalReportCount: number;
  row: typeof semesterGradingConfig.$inferSelect | null;
}

/** Jumlah kelas dan rapor final satu semester. */
async function finalCounts(tx: Tx, semesterId: string) {
  const rows = await tx
    .select({ classId: reportCard.classId, n: count() })
    .from(reportCard)
    .where(and(eq(reportCard.semesterId, semesterId), eq(reportCard.status, 'final')))
    .groupBy(reportCard.classId);
  return { classes: rows.length, reports: rows.reduce((a, r) => a + r.n, 0) };
}

/** Status konfigurasi beku satu semester (semester sudah dipastikan milik sekolah ini oleh pemanggil). */
export async function semesterGradingStatus(
  tx: Tx,
  schoolId: string,
  semesterId: string,
): Promise<SemesterGradingStatus> {
  const [row] = await tx
    .select()
    .from(semesterGradingConfig)
    .where(eq(semesterGradingConfig.semesterId, semesterId));
  const counts = await finalCounts(tx, semesterId);
  return {
    semesterId,
    frozen: !!row,
    origin: row?.origin ?? null,
    frozenAt: row?.frozenAt ?? null,
    frozenBy: row?.frozenBy ?? null,
    configVersion: row?.configVersion ?? null,
    matchesLive: row ? await matchesLive(tx, schoolId, row) : true,
    finalClassCount: counts.classes,
    finalReportCount: counts.reports,
    row: row ?? null,
  };
}

/**
 * Status semester AKTIF untuk layar pengaturan nilai. Null bila tidak ada semester aktif atau semester aktif belum beku
 * (sekolah yang belum pernah membekukan tidak merasakan apa pun: respons `GET /v1/grading/settings` tidak berubah).
 */
export async function activeSemesterConfig(tx: Tx, schoolId: string) {
  const [active] = await tx.select({ id: semester.id }).from(semester).where(eq(semester.isActive, true));
  if (!active) return null;
  const st = await semesterGradingStatus(tx, schoolId, active.id);
  if (!st.frozen) return null;
  return {
    semesterId: st.semesterId,
    frozen: true as const,
    origin: st.origin as FreezeOrigin,
    frozenAt: st.frozenAt as Date,
    matchesLive: st.matchesLive,
    hasFinal: st.finalReportCount > 0,
  };
}

/**
 * Sinkron manual: timpa salinan beku semester dengan konfigurasi hidup (membuatnya bila belum ada). Ditolak 409 `report_final`
 * selama semester itu punya rapor final (buka kembali rapornya lebih dulu). Mengambil kunci per sekolah. Bila salinan sudah
 * sama dengan konfigurasi hidup, tidak ada yang ditulis ulang (asal dan waktu tetap) dan `changed` false. Selalu diaudit.
 */
export async function syncSemesterGradingConfig(
  tx: Tx,
  ctx: TenantContext,
  semesterId: string,
): Promise<{ changed: boolean }> {
  await lockGradingConfig(tx, ctx.schoolId);
  const finals = await tx
    .selectDistinct({ name: classRoom.name })
    .from(reportCard)
    .innerJoin(classRoom, eq(classRoom.id, reportCard.classId))
    .where(and(eq(reportCard.semesterId, semesterId), eq(reportCard.status, 'final')))
    .orderBy(asc(classRoom.name));
  if (finals.length > 0) {
    throw new HttpError(
      409,
      REPORT_FINAL_CODE,
      `Konfigurasi nilai semester ini tidak bisa diganti karena masih ada rapor final: ${finals.map((f) => f.name).join(', ')}. Buka kembali rapornya lebih dulu.`,
    );
  }
  const [before] = await tx
    .select()
    .from(semesterGradingConfig)
    .where(eq(semesterGradingConfig.semesterId, semesterId));
  const changed = !before || !(await matchesLive(tx, ctx.schoolId, before));
  if (changed) {
    await freezeSemesterGradingConfig(tx, {
      schoolId: ctx.schoolId,
      semesterId,
      origin: 'sync',
      actorId: ctx.userId,
      overwrite: true,
    });
  }
  const [after] = await tx
    .select()
    .from(semesterGradingConfig)
    .where(eq(semesterGradingConfig.semesterId, semesterId));
  await audit(tx, ctx, 'grading_config.sync', 'semester', semesterId, {
    trigger: 'manual',
    changed,
    before: before ? summarize(before) : null,
    after: summarize(after!),
  });
  return { changed };
}
