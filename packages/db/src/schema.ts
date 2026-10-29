import { sql } from 'drizzle-orm';
import { boolean, date, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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
