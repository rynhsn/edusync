import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
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
