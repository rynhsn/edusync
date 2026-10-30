import { type Db, enqueueMessages, sql } from '@edusync/db';
import type { PlatformLoader } from './account-sync';
import { type Loop, startLoop } from './loop';

const JAKARTA_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** Jam dinding Asia/Jakarta (UTC+7, tanpa DST) dari sebuah instan. */
export function jakartaClock(now: Date) {
  const local = new Date(now.getTime() + JAKARTA_OFFSET_MS);
  const date = local.toISOString().slice(0, 10);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { date, minutes, weekday: local.getUTCDay() }; // 0 = Minggu
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** "2026-10-30" menjadi "30 Oktober 2026". */
export function formatDateId(date: string): string {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** 250000 menjadi "Rp 250.000". */
export function formatRupiah(n: number): string {
  return `Rp ${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** Minggu ISO 8601 dari tanggal "YYYY-MM-DD", mis. "2026-W44". */
export function isoWeekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Kamis pada minggu yang sama menentukan tahun ISO
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface SchedulersOptions {
  getPlatform: PlatformLoader;
  intervalMs?: number;
  now?: () => Date;
  /** Jam harian pengingat tunggakan (menit sejak 00:00 Jakarta). Bawaan 08:00. */
  overdueAtMinutes?: number;
  /** Batasi ke sekolah tertentu (untuk tes yang berbagi basis data). */
  schoolIds?: string[];
  log?: Pick<Console, 'log' | 'error'>;
}

type AbsentRow = {
  school_id: string;
  school_name: string;
  absent_notice_at: string;
  student_id: string;
  student_name: string;
  class_name: string;
};

type OverdueRow = {
  id: string;
  school_id: string;
  school_name: string;
  student_id: string;
  student_name: string;
  title: string;
  due_date: string;
  outstanding: number;
};

/**
 * Penjadwal pesan berbasis putaran menit-an. Aman diulang: semua pesan memakai kunci dedupe, jadi proses yang restart
 * atau dua worker tidak melahirkan pesan ganda. Berjalan di peran platform (melewati RLS) dengan school_id eksplisit.
 */
export class MessagingSchedulers {
  private loop: Loop | null = null;
  private readonly now: () => Date;
  /** Siswa yang sudah diproses hari ini (per proses) agar putaran menit-an tidak mengulang kueri wali. */
  private absentDone = new Set<string>();
  private absentDoneDate = '';
  private overdueDoneDate = '';

  constructor(
    private readonly db: Db,
    private readonly options: SchedulersOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  start() {
    this.loop = startLoop(
      'penjadwal',
      this.options.intervalMs ?? 60_000,
      () => this.tick(),
      this.options.log,
    );
  }

  async stop() {
    await this.loop?.stop();
    this.loop = null;
  }

  async tick() {
    const platform = await this.options.getPlatform();
    if (!platform.enabled) return;
    await this.runAbsent();
    await this.runOverdue();
  }

  /** (a) Pengingat "belum tiba". Mengembalikan jumlah siswa yang diproses. */
  private schoolFilter(column: string) {
    const ids = this.options.schoolIds;
    if (!ids) return sql`true`;
    if (ids.length === 0) return sql`false`;
    return sql`${sql.raw(column)} in (${sql.join(
      ids.map((i) => sql`${i}::uuid`),
      sql`, `,
    )})`;
  }

  async runAbsent(): Promise<number> {
    const { date, minutes, weekday } = jakartaClock(this.now());
    if (weekday === 0) return 0; // Minggu bukan hari sekolah
    if (this.absentDoneDate !== date) {
      this.absentDoneDate = date;
      this.absentDone = new Set();
    }

    // Sekolah aktif, pesan menyala, jam pengingat sudah lewat, tahun ajaran aktif mencakup hari ini, bukan libur/jeda.
    const rows = await this.db.execute<AbsentRow>(sql`
      select sc.id as school_id, sc.name as school_name, ms.absent_notice_at,
             st.id as student_id, st.name as student_name, cr.name as class_name
      from msg_setting ms
      join school sc on sc.id = ms.school_id and sc.status = 'active'
      join academic_year ay on ay.school_id = sc.id and ay.is_active
        and ${date}::date between ay.starts_on and ay.ends_on
      join enrollment en on en.academic_year_id = ay.id and en.school_id = sc.id
      join student st on st.id = en.student_id and st.status = 'active' and st.deleted_at is null
      join class_room cr on cr.id = en.class_id
      where ms.enabled and ms.absent_notice_at is not null and ${this.schoolFilter('sc.id')}
        and not exists (
          select 1 from calendar_event ce
          where ce.school_id = sc.id and ce.scope = 'school' and ce.type in ('holiday', 'break')
            and ${date}::date between ce.starts_on and ce.ends_on)
        and not exists (
          select 1 from daily_attendance da
          where da.student_id = st.id and da.date = ${date}::date
            and (da.check_in_at is not null or da.status in ('excused', 'sick')))
      order by sc.id, cr.name, st.name`);

    let processed = 0;
    for (const r of rows.rows) {
      const noticeAt = toMinutes(r.absent_notice_at);
      if (minutes < noticeAt) continue;
      const key = `absent:${r.student_id}:${date}`;
      if (this.absentDone.has(key)) continue;
      try {
        await this.db.transaction((tx) =>
          enqueueMessages(tx, {
            schoolId: r.school_id,
            eventKey: 'absent',
            studentId: r.student_id,
            vars: {
              student: r.student_name,
              class: r.class_name,
              school: r.school_name,
              date: formatDateId(date),
              time: r.absent_notice_at,
            },
            dedupeKey: key,
          }),
        );
        this.absentDone.add(key);
        processed++;
      } catch (error) {
        this.options.log?.error(`[pesan] pengingat belum tiba ${key} gagal`, error);
      }
    }
    return processed;
  }

  /** (b) Pengingat tunggakan, sekali sehari mulai 08:00 Jakarta, maksimal sekali seminggu per tagihan. */
  async runOverdue(): Promise<number> {
    const { date, minutes } = jakartaClock(this.now());
    if (minutes < (this.options.overdueAtMinutes ?? 8 * 60)) return 0;
    if (this.overdueDoneDate === date) return 0;

    const week = isoWeekKey(date);
    // Sisa = nilai - potongan - kwitansi tidak batal (sama dengan paidSql di apps/api/src/finance-lib.ts).
    const rows = await this.db.execute<OverdueRow>(sql`
      select * from (
        select i.id, i.school_id, sc.name as school_name, i.student_id, st.name as student_name,
               i.title, i.due_date::text as due_date,
               (i.amount - i.discount - coalesce((
                  select sum(pi.amount) from fin_payment_item pi
                  join fin_payment p on p.id = pi.payment_id
                  where pi.invoice_id = i.id and p.voided_at is null), 0))::int as outstanding
        from fin_invoice i
        join msg_setting ms on ms.school_id = i.school_id and ms.enabled
        join school sc on sc.id = i.school_id and sc.status = 'active'
        join student st on st.id = i.student_id and st.status = 'active' and st.deleted_at is null
        where i.status = 'open' and i.due_date < ${date}::date and ${this.schoolFilter('i.school_id')}
      ) t
      where t.outstanding > 0
      order by t.school_id, t.due_date, t.id`);

    let processed = 0;
    let failed = false;
    for (const r of rows.rows) {
      try {
        await this.db.transaction((tx) =>
          enqueueMessages(tx, {
            schoolId: r.school_id,
            eventKey: 'overdue',
            studentId: r.student_id,
            vars: {
              student: r.student_name,
              title: r.title,
              amount: formatRupiah(r.outstanding),
              due: formatDateId(r.due_date),
              school: r.school_name,
            },
            dedupeKey: `overdue:${r.id}:${week}`,
          }),
        );
        processed++;
      } catch (error) {
        failed = true;
        this.options.log?.error(`[pesan] pengingat tunggakan ${r.id} gagal`, error);
      }
    }
    // Bila ada yang gagal, coba lagi di putaran berikut (dedupe mencegah ganda).
    if (!failed) this.overdueDoneDate = date;
    return processed;
  }
}
