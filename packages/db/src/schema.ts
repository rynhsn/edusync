import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`uuidv7()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Yayasan. Sekolah tunggal tetap punya satu yayasan agar hanya ada satu model. */
export const foundation = pgTable('foundation', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: createdAt(),
});

/** Unit sekolah. Kunci tenant untuk RLS. */
export const school = pgTable(
  'school',
  {
    id: id(),
    foundationId: uuid('foundation_id')
      .notNull()
      .references(() => foundation.id),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    timezone: text('timezone').notNull().default('Asia/Jakarta'),
    studentTier: text('student_tier').notNull().default('t300'),
    /** Alasan penangguhan: 'billing' dilepas otomatis saat tagihan lunas, 'staff' hanya oleh staf platform. */
    suspendedReason: text('suspended_reason', { enum: ['billing', 'staff'] }),
    createdAt: createdAt(),
  },
  (t) => [index('school_foundation_idx').on(t.foundationId)],
);

export const academicYear = pgTable(
  'academic_year',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique('academic_year_school_name_uq').on(t.schoolId, t.name)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    schoolId: uuid('school_id').references(() => school.id),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_school_created_idx').on(t.schoolId, t.createdAt)],
);

/* ---------- Identitas (tabel Better Auth, global, tanpa RLS) ---------- */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Keanggotaan dan peran (per sekolah, tunduk pada RLS) ---------- */

/** Satu orang di satu unit. Satu orang boleh punya banyak peran lewat member_role. */
export const member = pgTable(
  'member',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    status: text('status', { enum: ['active', 'disabled'] })
      .notNull()
      .default('active'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('member_user_school_uq').on(t.userId, t.schoolId),
    index('member_school_idx').on(t.schoolId),
  ],
);

export const role = pgTable(
  'role',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    key: text('key').notNull(),
    name: text('name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique('role_school_key_uq').on(t.schoolId, t.key)],
);

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    permission: text('permission').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const memberRole = pgTable(
  'member_role',
  {
    memberId: uuid('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.roleId] })],
);

/* ---------- Outbox: pekerjaan latar belakang yang ditulis dalam transaksi bisnis ---------- */

/**
 * API menulis baris di sini dalam transaksi yang sama dengan perubahan datanya, sehingga pekerjaan
 * hanya ada bila datanya tersimpan. Worker memindahkannya ke antrean pg-boss.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    schoolId: uuid('school_id').references(() => school.id),
    queue: text('queue').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: ['pending', 'enqueued'] })
      .notNull()
      .default('pending'),
    createdAt: createdAt(),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }),
  },
  (t) => [index('outbox_pending_idx').on(t.status, t.createdAt)],
);

/* ---------- Penagihan dan langganan (ditulis lewat peran platform; tenant hanya membaca entitlement) ---------- */

/** Harga yang dapat diubah tanpa deploy. Salinan awal ada di packages/contracts (DEFAULT_CATALOG). */
export const catalogItem = pgTable(
  'catalog_item',
  {
    kind: text('kind', { enum: ['base', 'module', 'tier'] }).notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    priceMonthly: integer('price_monthly').notNull(),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
    /** Kunci modul yang menjadi syarat (hanya untuk kind=module). */
    requires: jsonb('requires').$type<string[]>().notNull().default([]),
    /** Batas siswa aktif (hanya untuk kind=tier); kosong = tanpa batas. */
    maxStudents: integer('max_students'),
  },
  (t) => [primaryKey({ columns: [t.kind, t.key] })],
);

/** Pendaftaran yang menunggu pembayaran. Setelah dibayar, yayasan dan unit dibuat dari data ini. */
export const registration = pgTable(
  'registration',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    foundationName: text('foundation_name').notNull(),
    period: text('period', { enum: ['monthly', 'yearly'] }).notNull(),
    units: jsonb('units')
      .$type<{ name: string; slug: string; modules: string[]; tier: string }[]>()
      .notNull(),
    status: text('status', { enum: ['pending_payment', 'paid', 'expired'] })
      .notNull()
      .default('pending_payment'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    foundationId: uuid('foundation_id').references(() => foundation.id),
    createdAt: createdAt(),
  },
  (t) => [index('registration_user_idx').on(t.userId)],
);

/** Subdomain yang dipesan selama menunggu pembayaran. */
export const slugReservation = pgTable('slug_reservation', {
  slug: text('slug').primaryKey(),
  registrationId: uuid('registration_id')
    .notNull()
    .references(() => registration.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const invoice = pgTable(
  'invoice',
  {
    id: id(),
    registrationId: uuid('registration_id').references(() => registration.id),
    foundationId: uuid('foundation_id').references(() => foundation.id),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('IDR'),
    status: text('status', { enum: ['open', 'paid', 'expired', 'void'] })
      .notNull()
      .default('open'),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref').notNull().unique(),
    paymentUrl: text('payment_url'),
    lines: jsonb('lines').$type<{ key: string; name: string; amount: number }[]>().notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('invoice_registration_idx').on(t.registrationId)],
);

/** Setiap kabar dari penyedia pembayaran dicatat sekali; (provider, event_id) unik sehingga pengulangan aman. */
export const payment = pgTable(
  'payment',
  {
    id: id(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoice.id),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    status: text('status').notNull(),
    amount: integer('amount').notNull(),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('payment_provider_event_uq').on(t.provider, t.eventId)],
);

export const subscription = pgTable('subscription', {
  id: id(),
  foundationId: uuid('foundation_id')
    .notNull()
    .references(() => foundation.id),
  status: text('status', { enum: ['pending_payment', 'active', 'past_due', 'suspended', 'canceled'] })
    .notNull()
    .default('active'),
  period: text('period', { enum: ['monthly', 'yearly'] }).notNull(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** Modul yang aktif untuk satu unit. Modul inti tidak perlu baris di sini. */
export const entitlement = pgTable(
  'entitlement',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    moduleKey: text('module_key').notNull(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscription.id),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.moduleKey] })],
);

/* ---------- Staf platform (operator Edusync, bukan anggota sekolah mana pun) ---------- */

export const platformStaff = pgTable('platform_staff', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['admin', 'read_only'] }).notNull(),
  createdAt: createdAt(),
});

/** Pemilik yayasan: mengurus langganan dan tagihan di alamat utama. Bukan peran sekolah. */
export const foundationOwner = pgTable(
  'foundation_owner',
  {
    foundationId: uuid('foundation_id')
      .notNull()
      .references(() => foundation.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.foundationId, t.userId] }),
    index('foundation_owner_user_idx').on(t.userId),
  ],
);

/** Undangan menjadi anggota unit. Token hanya dikirim lewat email; yang disimpan hanya hash-nya. */
export const invitation = pgTable(
  'invitation',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    email: text('email').notNull(),
    roles: jsonb('roles').$type<string[]>().notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('invitation_school_idx').on(t.schoolId, t.email)],
);

/* ---------- Master data akademik (semua tabel tenant, dijaga RLS) ---------- */

/** Jurusan, peminatan, atau kompetensi keahlian. Opsional: sekolah tanpa jurusan tidak memakainya. */
export const program = pgTable(
  'program',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('program_school_code_uq').on(t.schoolId, t.code)],
);

/** Kelas pada satu tahun ajaran. Tingkat (`level`) ditulis bebas karena mengikuti kurikulum: "7", "X", "Kelas 1". */
export const classRoom = pgTable(
  'class_room',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    programId: uuid('program_id').references(() => program.id),
    name: text('name').notNull(),
    level: text('level').notNull(),
    /** Wali kelas (guru). Boleh kosong; rapor memakainya untuk hak akses dan tanda tangan. */
    homeroomTeacherId: uuid('homeroom_teacher_id').references(() => teacher.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('class_room_year_name_uq').on(t.schoolId, t.academicYearId, t.name),
    index('class_room_year_idx').on(t.academicYearId),
  ],
);

export const student = pgTable(
  'student',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    nis: text('nis'),
    nisn: text('nisn'),
    gender: text('gender', { enum: ['L', 'P'] }).notNull(),
    birthDate: date('birth_date'),
    /** Siklus hidup siswa; perpindahan kelas ada di enrollment, bukan di sini. */
    status: text('status', { enum: ['active', 'graduated', 'transferred', 'dropped'] })
      .notNull()
      .default('active'),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    unique('student_school_nis_uq').on(t.schoolId, t.nis),
    unique('student_school_nisn_uq').on(t.schoolId, t.nisn),
    index('student_school_name_idx').on(t.schoolId, t.name),
  ],
);

/** Siswa duduk di satu kelas per tahun ajaran. Pindah kelas = ubah baris ini; riwayat tahun lalu tetap. */
export const enrollment = pgTable(
  'enrollment',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => classRoom.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('enrollment_student_year_uq').on(t.studentId, t.academicYearId),
    index('enrollment_class_idx').on(t.classId),
  ],
);

export const subject = pgTable(
  'subject',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('subject_school_code_uq').on(t.schoolId, t.code)],
);

/** Guru atau pegawai pengajar. `memberId` menautkan ke akun login bila orangnya punya akun. */
export const teacher = pgTable(
  'teacher',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    nip: text('nip'),
    memberId: uuid('member_id').references(() => member.id),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    createdAt: createdAt(),
  },
  (t) => [unique('teacher_school_nip_uq').on(t.schoolId, t.nip)],
);

/** Guru mengampu satu mapel di satu kelas. */
export const teachingAssignment = pgTable(
  'teaching_assignment',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => classRoom.id),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subject.id),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teacher.id),
    createdAt: createdAt(),
  },
  (t) => [unique('teaching_assignment_uq').on(t.classId, t.subjectId)],
);

/** Wali murid. Satu wali bisa menaungi beberapa siswa (kakak-adik) lewat student_guardian. */
export const guardian = pgTable(
  'guardian',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    /** Nomor telepon/WhatsApp dalam bentuk digit berawalan kode negara (mis. 62812...). */
    phone: text('phone'),
    email: text('email'),
    createdAt: createdAt(),
  },
  (t) => [index('guardian_school_name_idx').on(t.schoolId, t.name)],
);

export const studentGuardian = pgTable(
  'student_guardian',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardian.id),
    relation: text('relation', { enum: ['father', 'mother', 'guardian', 'other'] }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.guardianId] }),
    index('student_guardian_guardian_idx').on(t.guardianId),
  ],
);

/* ---------- Bank data kurikulum: acuan global (hanya baca) dan adopsi oleh sekolah ---------- */

/** Acuan kurikulum. Tanpa school_id: sama untuk semua sekolah, hanya ditulis lewat migrasi/peran platform. */
export const refCurriculum = pgTable('ref_curriculum', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
});

export const refSubject = pgTable(
  'ref_subject',
  {
    id: id(),
    curriculumKey: text('curriculum_key')
      .notNull()
      .references(() => refCurriculum.key),
    /** Kelompok jenjang: sd, smp (termasuk MTs), sma (termasuk MA), smk. */
    levelGroup: text('level_group').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
    /** Kapan mapel acuan ini ditambahkan; dipakai membandingkan dengan waktu adopsi sekolah ("acuan baru"). */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('ref_subject_uq').on(t.curriculumKey, t.levelGroup, t.code)],
);

/** Catatan kurikulum yang diadopsi sekolah (mapel disalin ke tabel subject, lalu bebas diubah). */
export const schoolCurriculum = pgTable(
  'school_curriculum',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    curriculumKey: text('curriculum_key')
      .notNull()
      .references(() => refCurriculum.key),
    levelGroup: text('level_group').notNull(),
    adoptedAt: timestamp('adopted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.curriculumKey, t.levelGroup] })],
);

/** Semester dalam satu tahun ajaran. Tanggalnya di dalam tahun ajaran dan tidak saling tumpang tindih. */
export const semester = pgTable(
  'semester',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique('semester_year_name_uq').on(t.academicYearId, t.name)],
);

/** Acara kalender akademik. Libur dan jeda mengurangi hari efektif; ujian dan kegiatan hanya penanda. */
export const calendarEvent = pgTable(
  'calendar_event',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    type: text('type', { enum: ['holiday', 'break', 'exam', 'activity'] }).notNull(),
    /** Cakupan: seluruh sekolah, satu kelas, atau satu jurusan. Hanya cakupan sekolah yang mengurangi hari efektif. */
    scope: text('scope', { enum: ['school', 'class', 'program'] })
      .notNull()
      .default('school'),
    classId: uuid('class_id').references(() => classRoom.id),
    programId: uuid('program_id').references(() => program.id),
    title: text('title').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('calendar_event_year_idx').on(t.academicYearId, t.startsOn)],
);

/** Paket siap pakai (kumpulan modul + tingkat siswa) yang dipilih saat mendaftar. Dikelola staf platform. */
export const planPreset = pgTable('plan_preset', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  modules: jsonb('modules').$type<string[]>().notNull(),
  tier: text('tier').notNull().default('t300'),
  sort: integer('sort').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

/** Pengaturan platform (mis. penyedia pembayaran). Nilai rahasia disimpan terenkripsi. Hanya peran platform. */
export const platformSetting = pgTable('platform_setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Jadwal pelajaran dan absensi (modul berbayar; tabel tetap dijaga RLS) ---------- */

/** Jam pelajaran: nomor urut dan rentang waktunya. */
export const lessonPeriod = pgTable(
  'lesson_period',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    number: integer('number').notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('lesson_period_number_uq').on(t.schoolId, t.number)],
);

/**
 * Satu sel jadwal: kelas + hari + jam pelajaran berisi satu mata pelajaran dan gurunya. Dua batasan unik
 * mencegah bentrok di tingkat database: satu kelas satu isi per jam, dan satu guru satu kelas per jam.
 */
export const scheduleEntry = pgTable(
  'schedule_entry',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => classRoom.id),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subject.id),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teacher.id),
    /** 1 = Senin … 6 = Sabtu. */
    weekday: integer('weekday').notNull(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => lessonPeriod.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('schedule_class_slot_uq').on(t.classId, t.weekday, t.periodId),
    unique('schedule_teacher_slot_uq').on(t.academicYearId, t.teacherId, t.weekday, t.periodId),
  ],
);

/* ---------- Absensi gerbang (tap kartu RFID), piket, dan absensi per jam pelajaran ---------- */

/** Kebijakan absensi gerbang, satu baris per sekolah. Jam dalam zona waktu sekolah (Asia/Jakarta), format HH:MM. */
export const attendancePolicy = pgTable('attendance_policy', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  /** Tap masuk setelah jam ini dihitung terlambat. */
  lateAfter: text('late_after').notNull().default('07:15'),
  /** Tap sejak jam ini dihitung pulang; sebelumnya dihitung masuk. */
  departureFrom: text('departure_from').notNull().default('12:00'),
  /** Tap kedua dari siswa yang sama dalam rentang ini diabaikan. */
  debounceSeconds: integer('debounce_seconds').notNull().default(30),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Perangkat kiosk. Kunci API hanya tampil sekali saat dibuat; yang disimpan hanya hash-nya. */
export const attendanceDevice = pgTable(
  'attendance_device',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    active: boolean('active').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique('attendance_device_key_uq').on(t.keyHash)],
);

/** Kartu RFID siswa (UID kartu). Satu siswa boleh punya beberapa kartu. */
export const attendanceCard = pgTable(
  'attendance_card',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    kind: text('kind', { enum: ['rfid'] }).notNull(),
    code: text('code').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('attendance_card_code_uq').on(t.schoolId, t.code),
    index('attendance_card_student_idx').on(t.studentId),
  ],
);

/** Catatan tap gerbang. Tidak boleh diubah atau dihapus (dijaga trigger); koreksi lewat absensi harian. */
export const tapEvent = pgTable(
  'tap_event',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    direction: text('direction', { enum: ['in', 'out'] }).notNull(),
    source: text('source', { enum: ['rfid', 'qr', 'manual'] }).notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    deviceId: uuid('device_id').references(() => attendanceDevice.id),
    /** Pengguna yang mencatat (baris lama dari absensi manual); tap kiosk kosong. */
    recordedBy: text('recorded_by'),
    /** Id dari perangkat untuk mencegah dobel saat tap offline dikirim ulang. */
    clientId: text('client_id'),
  },
  (t) => [
    unique('tap_event_client_uq').on(t.schoolId, t.clientId),
    index('tap_event_student_at_idx').on(t.studentId, t.at),
    index('tap_event_school_at_idx').on(t.schoolId, t.at),
  ],
);

/** Hasil absensi gerbang per siswa per tanggal, dihitung dari tap atau diisi manual oleh piket. */
export const dailyAttendance = pgTable(
  'daily_attendance',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    date: date('date').notNull(),
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    status: text('status', { enum: ['present', 'late', 'excused', 'sick', 'absent'] }).notNull(),
    note: text('note'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('daily_attendance_student_date_uq').on(t.studentId, t.date),
    index('daily_attendance_school_date_idx').on(t.schoolId, t.date),
  ],
);

/** Jadwal guru piket: siapa bertugas pada tanggal berapa. */
export const dutyRoster = pgTable(
  'duty_roster',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    date: date('date').notNull(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teacher.id),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.teacherId] }),
    index('duty_roster_school_date_idx').on(t.schoolId, t.date),
  ],
);

/** Absensi per jam pelajaran (satu sel jadwal pada satu tanggal). `substitute` = diisi bukan oleh guru jadwalnya. */
export const lessonAttendance = pgTable(
  'lesson_attendance',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    scheduleEntryId: uuid('schedule_entry_id')
      .notNull()
      .references(() => scheduleEntry.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    date: date('date').notNull(),
    status: text('status', { enum: ['present', 'excused', 'sick', 'absent'] }).notNull(),
    note: text('note'),
    recordedBy: text('recorded_by').notNull(),
    substitute: boolean('substitute').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('lesson_attendance_uq').on(t.scheduleEntryId, t.studentId, t.date),
    index('lesson_attendance_school_date_idx').on(t.schoolId, t.date),
  ],
);

/* ---------- Ekstrakurikuler (modul `extracurricular`) ---------- */

/** Kategori bawaan (acuan awal; kategori sebenarnya dikelola sekolah di extracurricular_category). */
export const EXTRACURRICULAR_CATEGORIES = ['sport', 'art', 'religion', 'science', 'scout', 'other'] as const;

/** Kegiatan ekstrakurikuler. Pembina: guru sekolah (`coachTeacherId`) atau pelatih luar (`externalCoach`). */
export const extracurricular = pgTable(
  'extracurricular',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    /** Kunci kategori dari tabel extracurricular_category (dinamis per sekolah). */
    category: text('category').notNull().default('other'),
    description: text('description'),
    coachTeacherId: uuid('coach_teacher_id').references(() => teacher.id),
    externalCoach: text('external_coach'),
    /** 1 = Senin … 7 = Minggu. */
    weekday: integer('weekday'),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    location: text('location'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('extracurricular_school_name_uq').on(t.schoolId, t.name)],
);

/** Anggota ekstrakurikuler per tahun ajaran. */
export const extracurricularMember = pgTable(
  'extracurricular_member',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    extracurricularId: uuid('extracurricular_id')
      .notNull()
      .references(() => extracurricular.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    joinedOn: date('joined_on').notNull().default(sql`current_date`),
  },
  (t) => [
    unique('extracurricular_member_uq').on(t.extracurricularId, t.studentId, t.academicYearId),
    index('extracurricular_member_student_idx').on(t.studentId),
  ],
);

/** Satu pertemuan (latihan) ekstrakurikuler pada satu tanggal. */
export const extracurricularSession = pgTable(
  'extracurricular_session',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    extracurricularId: uuid('extracurricular_id')
      .notNull()
      .references(() => extracurricular.id),
    date: date('date').notNull(),
    topic: text('topic'),
    recordedBy: text('recorded_by').notNull(),
  },
  (t) => [unique('extracurricular_session_uq').on(t.extracurricularId, t.date)],
);

/** Absensi anggota pada satu pertemuan. */
export const extracurricularAttendance = pgTable(
  'extracurricular_attendance',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => extracurricularSession.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    status: text('status', { enum: ['present', 'excused', 'sick', 'absent'] }).notNull(),
    note: text('note'),
    recordedBy: text('recorded_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('extracurricular_attendance_uq').on(t.sessionId, t.studentId)],
);

/** Predikat ekstrakurikuler per siswa per semester (bahan rapor). */
export const extracurricularAssessment = pgTable(
  'extracurricular_assessment',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    extracurricularId: uuid('extracurricular_id')
      .notNull()
      .references(() => extracurricular.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semester.id),
    predicate: text('predicate', { enum: ['A', 'B', 'C', 'D'] }).notNull(),
    note: text('note'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('extracurricular_assessment_uq').on(t.extracurricularId, t.studentId, t.semesterId)],
);

/** Pengaturan penilaian sekolah: KKM dan batas predikat (nilai minimal A, B, C). Satu baris per sekolah. */
export const gradingSetting = pgTable('grading_setting', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  kkm: integer('kkm').notNull().default(75),
  predicateA: integer('predicate_a').notNull().default(90),
  predicateB: integer('predicate_b').notNull().default(80),
  predicateC: integer('predicate_c').notNull().default(70),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Komponen penilaian berbobot (Tugas, Ulangan Harian, UTS, UAS, ...). Bobot dinormalisasi saat nilai akhir dihitung. */
export const gradeComponent = pgTable(
  'grade_component',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    weight: integer('weight').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique('grade_component_school_name_uq').on(t.schoolId, t.name)],
);

/** Satu penilaian (ulangan, tugas, ...) untuk satu kelas dan mapel pada satu semester. */
export const assessment = pgTable(
  'assessment',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semester.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => classRoom.id),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subject.id),
    componentId: uuid('component_id')
      .notNull()
      .references(() => gradeComponent.id),
    teacherId: uuid('teacher_id').references(() => teacher.id),
    title: text('title').notNull(),
    date: date('date').notNull(),
    maxScore: integer('max_score').notNull().default(100),
    createdAt: createdAt(),
  },
  (t) => [index('assessment_scope_idx').on(t.classId, t.subjectId, t.semesterId)],
);

/** Skor siswa pada satu penilaian. `value` kosong berarti belum diisi. */
export const score = pgTable(
  'score',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessment.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    value: numeric('value', { precision: 6, scale: 2, mode: 'number' }),
    note: text('note'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('score_assessment_student_uq').on(t.assessmentId, t.studentId)],
);

/* ---------- Rapor (modul `grades`) ---------- */

/** Pengaturan rapor sekolah: penanda tangan, alamat, deskripsi capaian per predikat, dan tampilan peringkat. */
export const reportSetting = pgTable('report_setting', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  principalName: text('principal_name'),
  principalNip: text('principal_nip'),
  city: text('city'),
  address: text('address'),
  descA: text('desc_a')
    .notNull()
    .default('Menunjukkan penguasaan yang sangat baik pada seluruh capaian pembelajaran.'),
  descB: text('desc_b')
    .notNull()
    .default('Menunjukkan penguasaan yang baik pada sebagian besar capaian pembelajaran.'),
  descC: text('desc_c')
    .notNull()
    .default(
      'Menunjukkan penguasaan yang cukup pada capaian pembelajaran; perlu peningkatan pada beberapa bagian.',
    ),
  descD: text('desc_d')
    .notNull()
    .default('Perlu bimbingan lebih lanjut untuk mencapai capaian pembelajaran.'),
  showRank: boolean('show_rank').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Rapor satu siswa pada satu semester. `snapshot` menyimpan dokumen beku saat status `final`. */
export const reportCard = pgTable(
  'report_card',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semester.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => classRoom.id),
    homeroomNote: text('homeroom_note'),
    status: text('status', { enum: ['draft', 'final'] })
      .notNull()
      .default('draft'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    finalizedBy: text('finalized_by'),
    snapshot: jsonb('snapshot'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('report_card_semester_student_uq').on(t.semesterId, t.studentId),
    index('report_card_class_idx').on(t.classId, t.semesterId),
  ],
);

/* ---------- Keuangan sekolah (modul `finance`) ---------- */

/** Tagihan sekolah milik tenant; berbeda dari tagihan langganan platform (`invoice` di packages/billing). */
export const FIN_FEE_KINDS = ['monthly', 'one_time', 'yearly'] as const;
/** Kunci metode bawaan yang diisi malas untuk sekolah tanpa baris `fin_payment_method`. */
export const FIN_PAYMENT_METHODS = ['cash', 'transfer', 'other'] as const;

/** Jenis biaya (SPP, uang gedung, seragam, ...). */
export const finFeeType = pgTable(
  'fin_fee_type',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    kind: text('kind', { enum: FIN_FEE_KINDS }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('fin_fee_type_school_name_uq').on(t.schoolId, t.name)],
);

/** Tarif per tahun ajaran, jenis biaya, dan tingkat (`level` kosong = semua tingkat). Rupiah bulat. */
export const finFeePlan = pgTable(
  'fin_fee_plan',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    feeTypeId: uuid('fee_type_id')
      .notNull()
      .references(() => finFeeType.id),
    level: text('level'),
    amount: integer('amount').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('fin_fee_plan_uq').on(t.academicYearId, t.feeTypeId, t.level).nullsNotDistinct(),
    check('fin_fee_plan_amount_ck', sql`${t.amount} >= 0`),
  ],
);

/** Tagihan siswa. Status bayar tidak disimpan; dihitung dari `fin_payment_item` kwitansi yang tidak batal. */
export const finInvoice = pgTable(
  'fin_invoice',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    feeTypeId: uuid('fee_type_id')
      .notNull()
      .references(() => finFeeType.id),
    /** TTTT-BB untuk biaya bulanan; kosong untuk lainnya. */
    period: text('period'),
    title: text('title').notNull(),
    amount: integer('amount').notNull(),
    discount: integer('discount').notNull().default(0),
    discountReason: text('discount_reason'),
    dueDate: date('due_date').notNull(),
    status: text('status', { enum: ['open', 'void'] })
      .notNull()
      .default('open'),
    voidReason: text('void_reason'),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('fin_invoice_uq').on(t.studentId, t.academicYearId, t.feeTypeId, t.period).nullsNotDistinct(),
    index('fin_invoice_year_idx').on(t.academicYearId, t.studentId),
    check('fin_invoice_amount_ck', sql`${t.amount} >= 0`),
    check('fin_invoice_discount_ck', sql`${t.discount} >= 0 and ${t.discount} <= ${t.amount}`),
  ],
);

/** Kwitansi. Nomor unik per sekolah; kwitansi batal tetap ada (`voidedAt`) tetapi tidak dihitung. */
export const finPayment = pgTable(
  'fin_payment',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    receiptNo: text('receipt_no').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    /** Kunci metode dari `fin_payment_method` sekolah (dinamis; kunci nonaktif tetap sah untuk riwayat). */
    method: text('method').notNull(),
    total: integer('total').notNull(),
    note: text('note'),
    recordedBy: text('recorded_by').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('fin_payment_receipt_uq').on(t.schoolId, t.receiptNo),
    index('fin_payment_student_idx').on(t.studentId),
    index('fin_payment_paid_idx').on(t.schoolId, t.paidAt),
    check('fin_payment_total_ck', sql`${t.total} > 0`),
  ],
);

/** Rincian kwitansi: berapa yang dibayarkan untuk tiap tagihan. */
export const finPaymentItem = pgTable(
  'fin_payment_item',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => finPayment.id),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => finInvoice.id),
    amount: integer('amount').notNull(),
  },
  (t) => [
    index('fin_payment_item_payment_idx').on(t.paymentId),
    index('fin_payment_item_invoice_idx').on(t.invoiceId),
    check('fin_payment_item_amount_ck', sql`${t.amount} > 0`),
  ],
);

/** Pencacah nomor kwitansi per sekolah per tahun. Ditambah atomik di transaksi pembuatan kwitansi. */
export const finCounter = pgTable(
  'fin_counter',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    year: integer('year').notNull(),
    last: integer('last').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.year] })],
);

/* ---------- Pesan ke wali murid (WhatsApp) ---------- */

/** Pengaturan pesan per sekolah. Satu baris per sekolah; tanpa baris berarti nilai bawaan dan pesan mati. */
export const msgSetting = pgTable('msg_setting', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  /** Saklar utama sekolah. Mati = tak ada pesan yang dibuat. */
  enabled: boolean('enabled').notNull().default(false),
  /** Jeda acak antar pesan (detik) agar nomor tidak tampak seperti robot. */
  delayMinSeconds: integer('delay_min_seconds').notNull().default(5),
  delayMaxSeconds: integer('delay_max_seconds').notNull().default(15),
  /** Pesan hanya dikirim di dalam jendela waktu ini (Asia/Jakarta, HH:MM); di luarnya ditahan. */
  windowStart: text('window_start').notNull().default('06:00'),
  windowEnd: text('window_end').notNull().default('20:00'),
  /** Jam pengingat "belum tiba" (HH:MM); null = nonaktif. */
  absentNoticeAt: text('absent_notice_at').default('09:00'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Templat pesan per peristiwa. Tanpa baris, templat bawaan dari packages/contracts dipakai dan peristiwa mati. */
export const msgTemplate = pgTable(
  'msg_template',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    /** arrival, departure, absent, skipped_class, payment, overdue, report_card. */
    eventKey: text('event_key').notNull(),
    body: text('body').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.eventKey] })],
);

/**
 * Sambungan WhatsApp sebuah sekolah. API menulis `desiredState` (permintaan pengguna); worker menjalankan
 * kliennya dan menulis `status`, `qr`, dan `phone` (lewat peran platform).
 */
export const waAccount = pgTable('wa_account', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  desiredState: text('desired_state', { enum: ['on', 'off'] })
    .notNull()
    .default('off'),
  status: text('status', { enum: ['disconnected', 'connecting', 'qr', 'ready', 'failed'] })
    .notNull()
    .default('disconnected'),
  /** Isi QR untuk dipindai dari ponsel (hanya saat status 'qr'). */
  qr: text('qr'),
  /** Nomor yang tersambung (digit, kode negara). */
  phone: text('phone'),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Antrean dan riwayat pesan keluar. Satu baris per penerima per peristiwa. */
export const msgMessage = pgTable(
  'msg_message',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    eventKey: text('event_key').notNull(),
    studentId: uuid('student_id').references(() => student.id),
    guardianId: uuid('guardian_id').references(() => guardian.id),
    toPhone: text('to_phone').notNull(),
    body: text('body').notNull(),
    status: text('status', { enum: ['queued', 'sending', 'sent', 'failed', 'skipped'] })
      .notNull()
      .default('queued'),
    /** Alasan dilewati atau pesan galat terakhir. */
    detail: text('detail'),
    attempts: integer('attempts').notNull().default(0),
    /** Mencegah pesan ganda untuk peristiwa yang sama (mis. arrival:{student}:{tanggal}:{guardian}). */
    dedupeKey: text('dedupe_key'),
    notBefore: timestamp('not_before', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('msg_message_dedupe_uq').on(t.schoolId, t.dedupeKey),
    index('msg_message_queue_idx').on(t.status, t.notBefore),
    index('msg_message_school_created_idx').on(t.schoolId, t.createdAt),
  ],
);

/* ---------- Tahfidz dan ibadah (modul `tahfidz`) ---------- */

/** Halaqah (kelompok setoran hafalan) dengan satu musyrif/pembina. */
export const halaqah = pgTable(
  'halaqah',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    name: text('name').notNull(),
    mentorTeacherId: uuid('mentor_teacher_id').references(() => teacher.id),
    scheduleNote: text('schedule_note'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('halaqah_year_name_uq').on(t.academicYearId, t.name)],
);

/** Satu siswa berada di paling banyak satu halaqah per tahun ajaran. */
export const halaqahMember = pgTable(
  'halaqah_member',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    halaqahId: uuid('halaqah_id')
      .notNull()
      .references(() => halaqah.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('halaqah_member_student_year_uq').on(t.studentId, t.academicYearId),
    index('halaqah_member_halaqah_idx').on(t.halaqahId),
  ],
);

/** Target hafalan per siswa per semester (jumlah ayat baru/ziyadah dan ayat murajaah). */
export const hafalanTarget = pgTable(
  'hafalan_target',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semester.id),
    ziyadahAyahs: integer('ziyadah_ayahs').notNull().default(0),
    murajaahAyahs: integer('murajaah_ayahs').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('hafalan_target_uq').on(t.studentId, t.semesterId)],
);

/** Satu setoran: rentang ayat (surah:ayat sampai surah:ayat) pada satu tanggal. Nomor surah 1..114 dari packages/contracts. */
export const hafalanEntry = pgTable(
  'hafalan_entry',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    halaqahId: uuid('halaqah_id').references(() => halaqah.id),
    date: date('date').notNull(),
    kind: text('kind', { enum: ['ziyadah', 'murajaah'] }).notNull(),
    surahFrom: integer('surah_from').notNull(),
    ayahFrom: integer('ayah_from').notNull(),
    surahTo: integer('surah_to').notNull(),
    ayahTo: integer('ayah_to').notNull(),
    quality: text('quality', { enum: ['fluent', 'fair', 'repeat'] })
      .notNull()
      .default('fluent'),
    note: text('note'),
    recordedBy: text('recorded_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('hafalan_entry_student_date_idx').on(t.studentId, t.date)],
);

/** Butir ibadah yang dipantau (mis. Dhuha, puasa Senin-Kamis). */
export const ibadahItem = pgTable(
  'ibadah_item',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['daily', 'weekly'] })
      .notNull()
      .default('daily'),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('ibadah_item_name_uq').on(t.schoolId, t.name)],
);

export const ibadahLog = pgTable(
  'ibadah_log',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => ibadahItem.id),
    date: date('date').notNull(),
    done: boolean('done').notNull(),
    note: text('note'),
    recordedBy: text('recorded_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('ibadah_log_uq').on(t.studentId, t.itemId, t.date),
    index('ibadah_log_item_date_idx').on(t.itemId, t.date),
  ],
);

/* ---------- Administrasi: surat dan tanda tangan QR (modul `administration`) ---------- */

export const letterTemplate = pgTable(
  'letter_template',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['letter', 'certificate'] })
      .notNull()
      .default('letter'),
    /** Isi surat dengan pengganti {{...}} (mis. {{nama}}, {{kelas}}, {{tanggal}}). */
    body: text('body').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('letter_template_name_uq').on(t.schoolId, t.name)],
);

/** Penandatangan (mis. Kepala Sekolah): terhubung ke anggota; gambar tanda tangan (data URL PNG/JPG, maks. 150 KB) bersifat privat. */
export const signerCredential = pgTable(
  'signer_credential',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => member.id),
    name: text('name').notNull(),
    nip: text('nip'),
    title: text('title').notNull(),
    signatureData: text('signature_data'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('signer_member_uq').on(t.schoolId, t.memberId)],
);

/** Surat keluar/masuk. Nomor surat berurutan per arah per tahun. */
export const letter = pgTable(
  'letter',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    direction: text('direction', { enum: ['outgoing', 'incoming'] }).notNull(),
    number: text('number').notNull(),
    subject: text('subject').notNull(),
    /** Penerima (surat keluar) atau pengirim (surat masuk). */
    party: text('party').notNull(),
    letterDate: date('letter_date').notNull(),
    body: text('body'),
    templateId: uuid('template_id').references(() => letterTemplate.id),
    studentId: uuid('student_id').references(() => student.id),
    /** Hanya surat masuk: catatan disposisi dan tujuan. */
    dispositionNote: text('disposition_note'),
    status: text('status', { enum: ['draft', 'signed', 'revoked'] })
      .notNull()
      .default('draft'),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('letter_number_uq').on(t.schoolId, t.direction, t.number),
    index('letter_school_date_idx').on(t.schoolId, t.letterDate),
  ],
);

export const letterCounter = pgTable(
  'letter_counter',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    direction: text('direction').notNull(),
    year: integer('year').notNull(),
    last: integer('last').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.direction, t.year] })],
);

/** Penandatanganan sederhana (bukan tanda tangan elektronik tersertifikasi): token acak untuk QR dan hash PDF. */
export const signedDocument = pgTable(
  'signed_document',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    letterId: uuid('letter_id')
      .notNull()
      .references(() => letter.id),
    signerId: uuid('signer_id')
      .notNull()
      .references(() => signerCredential.id),
    token: text('token').notNull(),
    pdfSha256: text('pdf_sha256'),
    signerName: text('signer_name').notNull(),
    signerTitle: text('signer_title').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (t) => [unique('signed_document_token_uq').on(t.token), index('signed_document_letter_idx').on(t.letterId)],
);

/* ---------- PKL dan prakerin (modul `internship`) ---------- */

export const pklPartner = pgTable(
  'pkl_partner',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    field: text('field'),
    address: text('address'),
    contactName: text('contact_name'),
    phone: text('phone'),
    email: text('email'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('pkl_partner_name_uq').on(t.schoolId, t.name)],
);

export const pklPeriod = pgTable(
  'pkl_period',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('pkl_period_name_uq').on(t.schoolId, t.academicYearId, t.name)],
);

export const pklPlacement = pgTable(
  'pkl_placement',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    periodId: uuid('period_id')
      .notNull()
      .references(() => pklPeriod.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => pklPartner.id),
    /** Guru pembimbing dari sekolah. */
    supervisorTeacherId: uuid('supervisor_teacher_id').references(() => teacher.id),
    industrySupervisorName: text('industry_supervisor_name'),
    industrySupervisorPhone: text('industry_supervisor_phone'),
    status: text('status', { enum: ['planned', 'active', 'completed', 'cancelled'] })
      .notNull()
      .default('planned'),
    /** Hash SHA-256 dari token tautan terbatas pembimbing industri (token asli hanya tampil sekali). */
    accessTokenHash: text('access_token_hash'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('pkl_placement_student_period_uq').on(t.periodId, t.studentId),
    index('pkl_placement_partner_idx').on(t.partnerId),
  ],
);

export const pklJournal = pgTable(
  'pkl_journal',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    placementId: uuid('placement_id')
      .notNull()
      .references(() => pklPlacement.id),
    date: date('date').notNull(),
    activity: text('activity').notNull(),
    present: boolean('present').notNull().default(true),
    /** Siapa mencatat: 'staff' (pengguna sekolah) atau 'industry' (tautan pembimbing industri). */
    source: text('source', { enum: ['staff', 'industry'] }).notNull(),
    recordedBy: text('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [unique('pkl_journal_day_uq').on(t.placementId, t.date)],
);

export const pklVisit = pgTable('pkl_visit', {
  id: id(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => school.id),
  placementId: uuid('placement_id')
    .notNull()
    .references(() => pklPlacement.id),
  date: date('date').notNull(),
  teacherId: uuid('teacher_id').references(() => teacher.id),
  notes: text('notes').notNull(),
  createdAt: createdAt(),
});

/** Aspek penilaian PKL dengan bobot (nilai akhir = rata-rata tertimbang). */
export const pklAspect = pgTable(
  'pkl_aspect',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    weight: integer('weight').notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [unique('pkl_aspect_name_uq').on(t.schoolId, t.name)],
);

export const pklScore = pgTable(
  'pkl_score',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    placementId: uuid('placement_id')
      .notNull()
      .references(() => pklPlacement.id),
    aspectId: uuid('aspect_id')
      .notNull()
      .references(() => pklAspect.id),
    /** Penilai: guru pembimbing (school) atau pembimbing industri. Nilai 0..100. */
    assessor: text('assessor', { enum: ['school', 'industry'] }).notNull(),
    value: integer('value').notNull(),
    note: text('note'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('pkl_score_uq').on(t.placementId, t.aspectId, t.assessor)],
);

/* ---------- SPMB: penerimaan murid baru (modul `admissions`) ---------- */

export const admissionPeriod = pgTable(
  'admission_period',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    name: text('name').notNull(),
    /** Tingkat kelas yang dibuka (cocok dengan class_room.level). */
    level: text('level').notNull(),
    opensOn: date('opens_on').notNull(),
    closesOn: date('closes_on').notNull(),
    quota: integer('quota'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('admission_period_name_uq').on(t.schoolId, t.name)],
);

export const application = pgTable(
  'application',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    periodId: uuid('period_id')
      .notNull()
      .references(() => admissionPeriod.id),
    /** Nomor pendaftaran, mis. SPMB-2026-0001 (berurutan per sekolah per tahun). */
    regNumber: text('reg_number').notNull(),
    /** Hash SHA-256 dari kode pelacakan milik pendaftar (kode asli hanya tampil sekali saat mendaftar). */
    trackingCodeHash: text('tracking_code_hash').notNull(),
    fullName: text('full_name').notNull(),
    gender: text('gender', { enum: ['L', 'P'] }).notNull(),
    birthPlace: text('birth_place'),
    birthDate: date('birth_date').notNull(),
    nisn: text('nisn'),
    previousSchool: text('previous_school'),
    address: text('address'),
    programId: uuid('program_id').references(() => program.id),
    guardianName: text('guardian_name').notNull(),
    guardianPhone: text('guardian_phone').notNull(),
    guardianEmail: text('guardian_email'),
    status: text('status', {
      enum: ['submitted', 'verified', 'accepted', 'rejected', 'enrolled', 'withdrawn'],
    })
      .notNull()
      .default('submitted'),
    decisionNote: text('decision_note'),
    /** Terisi setelah status 'enrolled': siswa yang dibuat otomatis. */
    studentId: uuid('student_id').references(() => student.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('application_reg_uq').on(t.schoolId, t.regNumber),
    index('application_period_status_idx').on(t.periodId, t.status),
  ],
);

/** Dokumen pendaftar. Disimpan sebagai base64 di database (maks. 2 MB asli), privat; hanya terbaca staf berizin. */
export const applicationDocument = pgTable('application_document', {
  id: id(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => school.id),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => application.id),
  /** Kunci jenis dokumen dari admission_document_type (dinamis per sekolah). */
  kind: text('kind').notNull(),
  fileName: text('file_name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  dataBase64: text('data_base64').notNull(),
  createdAt: createdAt(),
});

export const applicationStatusLog = pgTable('application_status_log', {
  id: id(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => school.id),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => application.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  note: text('note'),
  actor: text('actor'),
  createdAt: createdAt(),
});

export const admissionCounter = pgTable(
  'admission_counter',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    year: integer('year').notNull(),
    last: integer('last').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.schoolId, t.year] })],
);

/* ---------- SPP lanjutan: beasiswa/keringanan ---------- */

/** Aturan keringanan/beasiswa yang dipasang ke siswa dan dipakai saat tagihan dibuat. */
export const finDiscountRule = pgTable(
  'fin_discount_rule',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['percent', 'amount'] }).notNull(),
    /** Persen (1..100) atau nominal rupiah. */
    value: integer('value').notNull(),
    /** Kosong = berlaku untuk semua jenis biaya. */
    feeTypeId: uuid('fee_type_id').references(() => finFeeType.id),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('fin_discount_rule_name_uq').on(t.schoolId, t.name)],
);

export const finStudentDiscount = pgTable(
  'fin_student_discount',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => student.id),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => finDiscountRule.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYear.id),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [unique('fin_student_discount_uq').on(t.studentId, t.ruleId, t.academicYearId)],
);

/* ---------- Denda SPP, portal wali/siswa, pengumuman, profil situs ---------- */

/** Pengaturan denda keterlambatan per sekolah. `none` = tidak ada denda. */
export const finLateFeeSetting = pgTable('fin_late_fee_setting', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  mode: text('mode', { enum: ['none', 'flat', 'percent'] })
    .notNull()
    .default('none'),
  /** Rupiah (flat) atau persen dari sisa tagihan (percent, 1..100). */
  value: integer('value').notNull().default(0),
  /** Hari toleransi setelah jatuh tempo sebelum denda berlaku. */
  graceDays: integer('grace_days').notNull().default(0),
  /** Batas denda per tagihan dalam rupiah; kosong = tanpa batas. */
  capAmount: integer('cap_amount'),
  /** Lama (hari) dari penerbitan sampai jatuh tempo tagihan denda. */
  dueDays: integer('due_days').notNull().default(7),
  /** Jenis biaya untuk tagihan denda yang dibuat. */
  feeTypeId: uuid('fee_type_id').references(() => finFeeType.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tautan akun masuk (member) ke wali atau siswa; menentukan data apa yang boleh dilihat di portal. */
export const portalLink = pgTable(
  'portal_link',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['guardian', 'student'] }).notNull(),
    guardianId: uuid('guardian_id').references(() => guardian.id),
    studentId: uuid('student_id').references(() => student.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('portal_link_member_uq').on(t.memberId),
    check(
      'portal_link_target_ck',
      sql`(${t.kind} = 'guardian' and ${t.guardianId} is not null and ${t.studentId} is null) or (${t.kind} = 'student' and ${t.studentId} is not null and ${t.guardianId} is null)`,
    ),
    index('portal_link_school_idx').on(t.schoolId),
  ],
);

/** Undangan portal sekali pakai (token disimpan sebagai hash). */
export const portalInvite = pgTable(
  'portal_invite',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    kind: text('kind', { enum: ['guardian', 'student'] }).notNull(),
    guardianId: uuid('guardian_id').references(() => guardian.id),
    studentId: uuid('student_id').references(() => student.id),
    tokenHash: text('token_hash').notNull().unique(),
    email: text('email'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('portal_invite_school_idx').on(t.schoolId)],
);

/** Pengumuman dan agenda. `audience`: public (situs), portal (wali/siswa), staff, all. */
export const announcement = pgTable(
  'announcement',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    category: text('category', { enum: ['news', 'agenda', 'notice'] })
      .notNull()
      .default('news'),
    audience: text('audience', { enum: ['public', 'portal', 'staff', 'all'] })
      .notNull()
      .default('all'),
    /** Tanggal acara untuk kategori agenda. */
    eventDate: date('event_date'),
    pinned: boolean('pinned').notNull().default(false),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('announcement_school_pub_idx').on(t.schoolId, t.status, t.publishedAt)],
);

/** Profil situs publik sekolah (satu baris per sekolah). */
export const schoolProfile = pgTable('school_profile', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  tagline: text('tagline'),
  about: text('about'),
  vision: text('vision'),
  mission: text('mission'),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  whatsapp: text('whatsapp'),
  mapUrl: text('map_url'),
  /** Warna aksen heksadesimal (#RRGGBB). */
  accentColor: text('accent_color'),
  published: boolean('published').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Data dinamis: pengaturan per sekolah dan acuan platform ---------- */

/** Pengaturan umum satu unit (zona waktu ada di `school.timezone`). */
export const schoolSetting = pgTable('school_setting', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  /** Hari efektif pelajaran: 1 = Senin ... 7 = Minggu. */
  workingDays: jsonb('working_days').$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6]),
  /** Nama semester dalam urutan (mis. Ganjil, Genap; atau Catur wulan 1..3). */
  semesterNames: jsonb('semester_names').$type<string[]>().notNull().default(['Ganjil', 'Genap']),
  lessonDefaultStart: text('lesson_default_start').notNull().default('07:00'),
  lessonDefaultMinutes: integer('lesson_default_minutes').notNull().default(40),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Daftar tingkat kelas milik unit (mis. 7, 8, 9 atau X, XI, XII). `code` dipakai di kelas, tarif, dan SPMB. */
export const schoolLevel = pgTable(
  'school_level',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    code: text('code').notNull(),
    label: text('label').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique('school_level_uq').on(t.schoolId, t.code)],
);

/** Metode pembayaran yang dikelola sekolah (tunai, transfer, QRIS, ...). */
export const finPaymentMethod = pgTable(
  'fin_payment_method',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    key: text('key').notNull(),
    label: text('label').notNull(),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique('fin_payment_method_uq').on(t.schoolId, t.key)],
);

/** Kategori ekskul yang dikelola sekolah, lengkap dengan ikon dan warna. */
export const extracurricularCategory = pgTable(
  'extracurricular_category',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    key: text('key').notNull(),
    label: text('label').notNull(),
    /** Nama ikon dari daftar tetap di web (mis. trophy, palette, book). */
    icon: text('icon').notNull().default('trophy'),
    /** Salah satu nada di kit tampilan (teal, sky, violet, amber, rose, emerald, slate). */
    tone: text('tone').notNull().default('teal'),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('extracurricular_category_uq').on(t.schoolId, t.key)],
);

/** Ambang predikat nilai PKL per sekolah. */
export const pklSetting = pgTable('pkl_setting', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  thresholdA: integer('threshold_a').notNull().default(90),
  thresholdB: integer('threshold_b').notNull().default(80),
  thresholdC: integer('threshold_c').notNull().default(70),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Format penomoran surat. Pola memakai variabel {seq} (urut, 3 digit), {code} (kode sekolah), {roman} (bulan
 * Romawi), {month}, {year}.
 */
export const letterSetting = pgTable('letter_setting', {
  schoolId: uuid('school_id')
    .primaryKey()
    .references(() => school.id),
  schoolCode: text('school_code'),
  numberPattern: text('number_pattern').notNull().default('{seq}/{code}/{roman}/{year}'),
  agendaPattern: text('agenda_pattern').notNull().default('{seq}/{year}'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Jenis dokumen yang diminta saat pendaftaran murid baru. */
export const admissionDocumentType = pgTable(
  'admission_document_type',
  {
    id: id(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id),
    key: text('key').notNull(),
    label: text('label').notNull(),
    required: boolean('required').notNull().default(false),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique('admission_document_type_uq').on(t.schoolId, t.key)],
);

/** Jenjang pendidikan global (sd, smp, sma, smk, ...) yang dikelola platform; dipakai bank kurikulum. */
export const refSchoolLevel = pgTable('ref_school_level', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
  active: boolean('active').notNull().default(true),
});
