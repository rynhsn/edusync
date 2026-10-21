import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import {
  academicYearInputSchema,
  academicYearSchema,
  academicYearUpdateSchema,
  classInputSchema,
  classUpdateSchema,
  schoolAuthContextSchema,
  schoolClassSchema,
  schoolDeletionResultSchema,
  schoolMutationResultSchema,
  schoolOverviewSchema,
  studentInputSchema,
  studentSchema,
  studentUpdateSchema,
  type SchoolPermission,
} from '@edusync/contracts';
import { getSchoolPrincipal, principalHasPermission, type SchoolPrincipal } from '../auth/permissions.js';
import { schoolDbPool } from '../db/pool.js';

const MAX_BODY_BYTES = 16_384;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IdParams = { id: string };

// node-postgres decodes `date` and `timestamptz` columns into JavaScript Date objects,
// but the published contract describes them as ISO strings, so each projection renders
// them in SQL instead of relying on the driver. Formatting in SQL rather than casting
// keeps the output independent of the session's DateStyle.
const isoDate = (column: string) => `to_char(${column}, 'YYYY-MM-DD')`;
const isoTimestamp = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

async function authorize(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: SchoolPermission,
): Promise<SchoolPrincipal | null> {
  const principal = await getSchoolPrincipal(request);
  if (!principal) {
    reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });
    return null;
  }
  if (!(await principalHasPermission(request, principal, permission))) {
    reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Your role does not allow this action' } });
    return null;
  }
  return principal;
}

async function recordAudit(
  client: PoolClient,
  principal: SchoolPrincipal,
  action: string,
  entityType: string,
  entityId: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO school_authz_audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [principal.tenantId, principal.userId, action, entityType, entityId],
  );
}

function invalidId(reply: FastifyReply) {
  return reply.code(400).send({ error: { code: 'INVALID_IDENTIFIER', message: 'Invalid identifier' } });
}

function duplicate(reply: FastifyReply, code: string, message: string) {
  return reply.code(409).send({ error: { code, message } });
}

const STUDENT_COLUMNS = `
  s.id,
  s.nis,
  s.nisn,
  s.full_name AS "fullName",
  s.gender,
  s.status,
  e.class_id AS "classId",
  c.name AS "className",
  e.academic_year_id AS "academicYearId",
  ay.name AS "academicYearName",
  ${isoTimestamp('s.created_at')} AS "createdAt",
  ${isoTimestamp('s.updated_at')} AS "updatedAt"`;

const STUDENT_JOINS = `
  FROM students s
  LEFT JOIN LATERAL (
    SELECT se.class_id, se.academic_year_id
    FROM student_enrollments se
    JOIN academic_years y ON y.tenant_id = se.tenant_id AND y.id = se.academic_year_id
    WHERE se.tenant_id = s.tenant_id AND se.student_id = s.id
    ORDER BY y.is_active DESC, y.starts_on DESC
    LIMIT 1
  ) e ON true
  LEFT JOIN school_classes c ON c.tenant_id = s.tenant_id AND c.id = e.class_id
  LEFT JOIN academic_years ay ON ay.tenant_id = s.tenant_id AND ay.id = e.academic_year_id`;

async function loadStudent(client: PoolClient, tenantId: string, id: string) {
  const result = await client.query(
    `SELECT ${STUDENT_COLUMNS} ${STUDENT_JOINS} WHERE s.tenant_id = $1 AND s.id = $2 AND s.deleted_at IS NULL`,
    [tenantId, id],
  );
  return result.rows[0];
}

async function referencesBelongToTenant(
  client: PoolClient,
  tenantId: string,
  classId: string,
  academicYearId: string,
): Promise<boolean> {
  const result = await client.query<{ class_ok: boolean; year_ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM school_classes WHERE tenant_id = $1 AND id = $2) AS class_ok,
            EXISTS (SELECT 1 FROM academic_years WHERE tenant_id = $1 AND id = $3) AS year_ok`,
    [tenantId, classId, academicYearId],
  );
  const row = result.rows[0];
  return Boolean(row?.class_ok && row?.year_ok);
}

export async function registerSchoolRoutes(app: FastifyInstance): Promise<void> {
  // The role that decides which controls the browser shows lives on the organization
  // member row, not on the user record the session returns, so the client asks for it
  // here rather than guessing from the session payload. Reading your own identity is
  // not a privileged action, so any signed-in member may call it.
  app.get('/api/school/me', async (request, reply) => {
    const principal = await getSchoolPrincipal(request);
    if (!principal) {
      return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });
    }
    return reply.send(schoolAuthContextSchema.parse(principal));
  });

  app.get('/api/school/overview', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const principal = await authorize(request, reply, 'student.read');
    if (!principal) return reply;

    const counts = await schoolDbPool.query<{
      student_total: number; student_active: number; class_total: number; class_seats: number;
      year_total: number; active_year_name: string | null;
    }>(
      `SELECT
         (SELECT count(*) FROM students WHERE tenant_id = $1 AND deleted_at IS NULL)::int AS student_total,
         (SELECT count(*) FROM students WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'AKTIF')::int AS student_active,
         (SELECT count(*) FROM school_classes WHERE tenant_id = $1)::int AS class_total,
         (SELECT coalesce(sum(capacity), 0) FROM school_classes WHERE tenant_id = $1)::int AS class_seats,
         (SELECT count(*) FROM academic_years WHERE tenant_id = $1)::int AS year_total,
         (SELECT name FROM academic_years WHERE tenant_id = $1 AND is_active = true LIMIT 1) AS active_year_name`,
      [principal.tenantId],
    );
    const recent = await schoolDbPool.query(
      `SELECT ${STUDENT_COLUMNS} ${STUDENT_JOINS} WHERE s.tenant_id = $1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 5`,
      [principal.tenantId],
    );
    const row = counts.rows[0];

    return reply.send(schoolOverviewSchema.parse({
      students: { total: row?.student_total ?? 0, active: row?.student_active ?? 0 },
      classes: { total: row?.class_total ?? 0, seats: row?.class_seats ?? 0 },
      academicYears: { total: row?.year_total ?? 0, activeName: row?.active_year_name ?? null },
      recentStudents: recent.rows,
    }));
  });

  app.get('/api/academic-years', async (request, reply) => {
    const principal = await authorize(request, reply, 'academic_year.read');
    if (!principal) return reply;
    const result = await schoolDbPool.query(
      `SELECT id, name, ${isoDate('starts_on')} AS "startsOn", ${isoDate('ends_on')} AS "endsOn",
              is_active AS "isActive",
              ${isoTimestamp('created_at')} AS "createdAt", ${isoTimestamp('updated_at')} AS "updatedAt"
       FROM academic_years WHERE tenant_id = $1 ORDER BY starts_on DESC`,
      [principal.tenantId],
    );
    return reply.send(result.rows.map((row) => academicYearSchema.parse(row)));
  });

  app.post('/api/academic-years', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const principal = await authorize(request, reply, 'academic_year.manage');
    if (!principal) return reply;
    const parsed = academicYearInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_ACADEMIC_YEAR', message: parsed.error.issues[0]?.message ?? 'Invalid academic year' } });
    }
    const input = parsed.data;
    const client = await schoolDbPool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      if (input.isActive) {
        await client.query('UPDATE academic_years SET is_active = false, updated_at = now() WHERE tenant_id = $1 AND is_active = true', [principal.tenantId]);
      }
      const inserted = await client.query(
        `INSERT INTO academic_years (tenant_id, name, starts_on, ends_on, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, ${isoDate('starts_on')} AS "startsOn", ${isoDate('ends_on')} AS "endsOn",
                   is_active AS "isActive",
                   ${isoTimestamp('created_at')} AS "createdAt", ${isoTimestamp('updated_at')} AS "updatedAt"`,
        [principal.tenantId, input.name, input.startsOn, input.endsOn, input.isActive],
      );
      const row = inserted.rows[0];
      // Serialize before committing: a row the contract cannot describe must not be left
      // behind in the database by a response that failed to build.
      const academicYear = academicYearSchema.parse(row);
      await recordAudit(client, principal, 'academic_year.create', 'academic_year', row.id);
      await client.query('COMMIT');
      open = false;
      return reply.code(201).send(academicYear);
    } catch (error) {
      if (open) await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') return duplicate(reply, 'DUPLICATE_ACADEMIC_YEAR', 'That academic year name already exists');
      request.log.error({ err: error }, 'Academic year creation failed');
      return reply.code(500).send({ error: { code: 'ACADEMIC_YEAR_FAILED', message: 'The academic year could not be created' } });
    } finally {
      client.release();
    }
  });

  app.patch('/api/academic-years/:id', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const principal = await authorize(request, reply, 'academic_year.manage');
    if (!principal) return reply;
    const { id } = request.params as IdParams;
    if (!ID_PATTERN.test(id)) return invalidId(reply);
    const parsed = academicYearUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_ACADEMIC_YEAR', message: parsed.error.issues[0]?.message ?? 'Invalid academic year' } });
    }
    const input = parsed.data;
    const client = await schoolDbPool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      if (input.isActive === true) {
        await client.query('UPDATE academic_years SET is_active = false, updated_at = now() WHERE tenant_id = $1 AND is_active = true AND id <> $2', [principal.tenantId, id]);
      }
      const updated = await client.query(
        `UPDATE academic_years SET
           name = coalesce($3, name),
           starts_on = coalesce($4::date, starts_on),
           ends_on = coalesce($5::date, ends_on),
           is_active = coalesce($6, is_active),
           updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING id, starts_on, ends_on`,
        [principal.tenantId, id, input.name ?? null, input.startsOn ?? null, input.endsOn ?? null, input.isActive ?? null],
      );
      if (!updated.rows[0]) {
        await client.query('ROLLBACK');
        open = false;
        return reply.code(404).send({ error: { code: 'ACADEMIC_YEAR_NOT_FOUND', message: 'Academic year not found' } });
      }
      await recordAudit(client, principal, 'academic_year.update', 'academic_year', id);
      await client.query('COMMIT');
      open = false;
      return reply.send(schoolMutationResultSchema.parse({ updated: true }));
    } catch (error) {
      if (open) await client.query('ROLLBACK');
      const code = (error as { code?: string }).code;
      if (code === '23505') return duplicate(reply, 'DUPLICATE_ACADEMIC_YEAR', 'That academic year name already exists');
      if (code === '23514') return reply.code(400).send({ error: { code: 'INVALID_DATE_RANGE', message: 'Tanggal mulai harus sebelum tanggal selesai' } });
      request.log.error({ err: error }, 'Academic year update failed');
      return reply.code(500).send({ error: { code: 'ACADEMIC_YEAR_FAILED', message: 'The academic year could not be updated' } });
    } finally {
      client.release();
    }
  });

  app.get('/api/classes', async (request, reply) => {
    const principal = await authorize(request, reply, 'class.read');
    if (!principal) return reply;
    const result = await schoolDbPool.query(
      `SELECT c.id, c.name, c.grade_level AS "gradeLevel", c.capacity,
              (SELECT count(*) FROM student_enrollments se
                 JOIN students st ON st.tenant_id = se.tenant_id AND st.id = se.student_id AND st.deleted_at IS NULL
                WHERE se.tenant_id = c.tenant_id AND se.class_id = c.id)::int AS "studentCount",
              ${isoTimestamp('c.created_at')} AS "createdAt", ${isoTimestamp('c.updated_at')} AS "updatedAt"
       FROM school_classes c WHERE c.tenant_id = $1 ORDER BY c.grade_level, c.name`,
      [principal.tenantId],
    );
    return reply.send(result.rows.map((row) => schoolClassSchema.parse(row)));
  });

  app.post('/api/classes', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const principal = await authorize(request, reply, 'class.manage');
    if (!principal) return reply;
    const parsed = classInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_CLASS', message: parsed.error.issues[0]?.message ?? 'Invalid class' } });
    }
    const input = parsed.data;
    const client = await schoolDbPool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const inserted = await client.query(
        `INSERT INTO school_classes (tenant_id, name, grade_level, capacity)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, grade_level AS "gradeLevel", capacity, 0::int AS "studentCount",
                   ${isoTimestamp('created_at')} AS "createdAt", ${isoTimestamp('updated_at')} AS "updatedAt"`,
        [principal.tenantId, input.name, input.gradeLevel, input.capacity ?? null],
      );
      const row = inserted.rows[0];
      const schoolClass = schoolClassSchema.parse(row);
      await recordAudit(client, principal, 'class.create', 'school_class', row.id);
      await client.query('COMMIT');
      open = false;
      return reply.code(201).send(schoolClass);
    } catch (error) {
      if (open) await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') return duplicate(reply, 'DUPLICATE_CLASS', 'That class name already exists');
      request.log.error({ err: error }, 'Class creation failed');
      return reply.code(500).send({ error: { code: 'CLASS_FAILED', message: 'The class could not be created' } });
    } finally {
      client.release();
    }
  });

  app.patch('/api/classes/:id', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const principal = await authorize(request, reply, 'class.manage');
    if (!principal) return reply;
    const { id } = request.params as IdParams;
    if (!ID_PATTERN.test(id)) return invalidId(reply);
    const parsed = classUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_CLASS', message: parsed.error.issues[0]?.message ?? 'Invalid class' } });
    }
    const input = parsed.data;
    const client = await schoolDbPool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const updated = await client.query(
        `UPDATE school_classes SET
           name = coalesce($3, name),
           grade_level = coalesce($4, grade_level),
           capacity = CASE WHEN $5::boolean THEN $6::int ELSE capacity END,
           updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING id`,
        [principal.tenantId, id, input.name ?? null, input.gradeLevel ?? null, 'capacity' in input, input.capacity ?? null],
      );
      if (!updated.rows[0]) {
        await client.query('ROLLBACK');
        open = false;
        return reply.code(404).send({ error: { code: 'CLASS_NOT_FOUND', message: 'Class not found' } });
      }
      await recordAudit(client, principal, 'class.update', 'school_class', id);
      await client.query('COMMIT');
      open = false;
      return reply.send(schoolMutationResultSchema.parse({ updated: true }));
    } catch (error) {
      if (open) await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') return duplicate(reply, 'DUPLICATE_CLASS', 'That class name already exists');
      request.log.error({ err: error }, 'Class update failed');
      return reply.code(500).send({ error: { code: 'CLASS_FAILED', message: 'The class could not be updated' } });
    } finally {
      client.release();
    }
  });

  app.get('/api/students', async (request, reply) => {
    const principal = await authorize(request, reply, 'student.read');
    if (!principal) return reply;
    const result = await schoolDbPool.query(
      `SELECT ${STUDENT_COLUMNS} ${STUDENT_JOINS} WHERE s.tenant_id = $1 AND s.deleted_at IS NULL ORDER BY s.full_name`,
      [principal.tenantId],
    );
    return reply.send(result.rows.map((row) => studentSchema.parse(row)));
  });

  app.post('/api/students', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const principal = await authorize(request, reply, 'student.create');
    if (!principal) return reply;
    const parsed = studentInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_STUDENT', message: parsed.error.issues[0]?.message ?? 'Invalid student' } });
    }
    const input = parsed.data;
    const client = await schoolDbPool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      if (!(await referencesBelongToTenant(client, principal.tenantId, input.classId, input.academicYearId))) {
        await client.query('ROLLBACK');
        open = false;
        return reply.code(400).send({ error: { code: 'INVALID_REFERENCE', message: 'Kelas atau tahun ajaran tidak ditemukan' } });
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO students (tenant_id, nis, nisn, full_name, gender, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [principal.tenantId, input.nis, input.nisn ?? null, input.fullName, input.gender ?? null, input.status],
      );
      const studentId = inserted.rows[0]!.id;
      await client.query(
        `INSERT INTO student_enrollments (tenant_id, student_id, academic_year_id, class_id)
         VALUES ($1, $2, $3, $4)`,
        [principal.tenantId, studentId, input.academicYearId, input.classId],
      );
      const row = await loadStudent(client, principal.tenantId, studentId);
      const student = studentSchema.parse(row);
      await recordAudit(client, principal, 'student.create', 'student', studentId);
      await client.query('COMMIT');
      open = false;
      return reply.code(201).send(student);
    } catch (error) {
      if (open) await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') return duplicate(reply, 'DUPLICATE_STUDENT', 'That NIS or NISN is already used by another student');
      request.log.error({ err: error }, 'Student creation failed');
      return reply.code(500).send({ error: { code: 'STUDENT_FAILED', message: 'The student could not be created' } });
    } finally {
      client.release();
    }
  });

  app.patch('/api/students/:id', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const principal = await authorize(request, reply, 'student.update');
    if (!principal) return reply;
    const { id } = request.params as IdParams;
    if (!ID_PATTERN.test(id)) return invalidId(reply);
    const parsed = studentUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_STUDENT', message: parsed.error.issues[0]?.message ?? 'Invalid student' } });
    }
    const input = parsed.data;
    const client = await schoolDbPool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const exists = await client.query('SELECT 1 FROM students WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL', [principal.tenantId, id]);
      if (!exists.rows[0]) {
        await client.query('ROLLBACK');
        open = false;
        return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found' } });
      }
      await client.query(
        `UPDATE students SET
           nis = coalesce($3, nis),
           nisn = CASE WHEN $4::boolean THEN $5::text ELSE nisn END,
           full_name = coalesce($6, full_name),
           gender = CASE WHEN $7::boolean THEN $8::text ELSE gender END,
           status = coalesce($9, status),
           updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [
          principal.tenantId, id,
          input.nis ?? null,
          'nisn' in input, input.nisn ?? null,
          input.fullName ?? null,
          'gender' in input, input.gender ?? null,
          input.status ?? null,
        ],
      );
      if (input.classId !== undefined && input.academicYearId !== undefined) {
        if (!(await referencesBelongToTenant(client, principal.tenantId, input.classId, input.academicYearId))) {
          await client.query('ROLLBACK');
          open = false;
          return reply.code(400).send({ error: { code: 'INVALID_REFERENCE', message: 'Kelas atau tahun ajaran tidak ditemukan' } });
        }
        await client.query(
          `INSERT INTO student_enrollments (tenant_id, student_id, academic_year_id, class_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, student_id, academic_year_id) DO UPDATE SET class_id = excluded.class_id`,
          [principal.tenantId, id, input.academicYearId, input.classId],
        );
      }
      const row = await loadStudent(client, principal.tenantId, id);
      const student = studentSchema.parse(row);
      await recordAudit(client, principal, 'student.update', 'student', id);
      await client.query('COMMIT');
      open = false;
      return reply.send(student);
    } catch (error) {
      if (open) await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') return duplicate(reply, 'DUPLICATE_STUDENT', 'That NIS or NISN is already used by another student');
      request.log.error({ err: error }, 'Student update failed');
      return reply.code(500).send({ error: { code: 'STUDENT_FAILED', message: 'The student could not be updated' } });
    } finally {
      client.release();
    }
  });

  app.delete('/api/students/:id', async (request, reply) => {
    const principal = await authorize(request, reply, 'student.delete');
    if (!principal) return reply;
    const { id } = request.params as IdParams;
    if (!ID_PATTERN.test(id)) return invalidId(reply);
    const client = await schoolDbPool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const deleted = await client.query(
        `UPDATE students SET deleted_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
        [principal.tenantId, id],
      );
      if (!deleted.rows[0]) {
        await client.query('ROLLBACK');
        open = false;
        return reply.code(404).send({ error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found' } });
      }
      await client.query('DELETE FROM student_enrollments WHERE tenant_id = $1 AND student_id = $2', [principal.tenantId, id]);
      await recordAudit(client, principal, 'student.delete', 'student', id);
      await client.query('COMMIT');
      open = false;
      return reply.send(schoolDeletionResultSchema.parse({ deleted: true }));
    } catch (error) {
      if (open) await client.query('ROLLBACK');
      request.log.error({ err: error }, 'Student deletion failed');
      return reply.code(500).send({ error: { code: 'STUDENT_FAILED', message: 'The student could not be deleted' } });
    } finally {
      client.release();
    }
  });
}
