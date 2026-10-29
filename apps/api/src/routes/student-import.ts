import { academicYear, classRoom, enrollment, eq, inArray, or, student, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, schoolHeader } from './helpers';

const MAX_ROWS = 1000;

const rowSchema = z.object({
  row: z.number().int().min(1).describe('Nomor baris di lembar kerja, dipakai untuk melaporkan kesalahan'),
  name: z.string().max(200).default(''),
  nis: z.string().max(60).default(''),
  nisn: z.string().max(60).default(''),
  gender: z.string().max(30).default(''),
  birthDate: z.string().max(30).default(''),
  className: z.string().max(80).default(''),
});

const errorRow = z.object({ row: z.number().int(), field: z.string().nullable(), message: z.string() });
const idPattern = /^[A-Za-z0-9./-]+$/;

const GENDERS: Record<string, 'L' | 'P'> = {
  l: 'L',
  p: 'P',
  'laki-laki': 'L',
  'laki laki': 'L',
  pria: 'L',
  perempuan: 'P',
  wanita: 'P',
  male: 'L',
  female: 'P',
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Impor siswa dari data yang sudah dibaca di browser. Server memvalidasi ulang semuanya: dua langkah,
 * pratinjau (`dryRun`) lalu simpan. Simpan bersifat semua-atau-tidak sama sekali, sehingga satu baris
 * yang salah tidak meninggalkan data setengah masuk.
 */
export async function studentImportRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/v1/students/import',
    {
      onRequest: [requirePermission('student:manage')],
      bodyLimit: 2 * 1024 * 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['People'],
        summary: 'Impor siswa (pratinjau atau simpan)',
        description:
          `Izin: \`student:manage\`. Maksimal ${MAX_ROWS} baris. Dengan \`dryRun: true\` hanya memeriksa dan melaporkan ` +
          'kesalahan per baris. Tanpa `dryRun`, siswa baru disimpan hanya bila semua baris valid. Kelas (`className`) ' +
          'dicocokkan dengan nama kelas pada tahun ajaran aktif; NIS dan NISN harus unik di file dan di sekolah.',
        headers: schoolHeader,
        body: z.object({
          dryRun: z.boolean(),
          rows: z.array(rowSchema).min(1).max(MAX_ROWS),
        }),
        response: {
          200: z.object({
            total: z.number().int(),
            valid: z.number().int(),
            imported: z.number().int(),
            errors: z.array(errorRow),
          }),
          ...guarded,
          400: errorSchema,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { dryRun, rows } = request.body;

      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const [active] = await tx
          .select({ id: academicYear.id })
          .from(academicYear)
          .where(eq(academicYear.isActive, true));
        const classes = active
          ? await tx
              .select({ id: classRoom.id, name: classRoom.name })
              .from(classRoom)
              .where(eq(classRoom.academicYearId, active.id))
          : [];
        const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c]));

        const nisList = rows.map((r) => r.nis.trim()).filter(Boolean);
        const nisnList = rows.map((r) => r.nisn.trim()).filter(Boolean);
        const taken =
          nisList.length + nisnList.length > 0
            ? await tx
                .select({ nis: student.nis, nisn: student.nisn })
                .from(student)
                .where(
                  or(
                    nisList.length ? inArray(student.nis, nisList) : undefined,
                    nisnList.length ? inArray(student.nisn, nisnList) : undefined,
                  ),
                )
            : [];
        const takenNis = new Set(taken.map((t) => t.nis).filter(Boolean));
        const takenNisn = new Set(taken.map((t) => t.nisn).filter(Boolean));

        const errors: z.infer<typeof errorRow>[] = [];
        const seenNis = new Map<string, number>();
        const seenNisn = new Map<string, number>();
        const prepared: {
          name: string;
          nis: string | null;
          nisn: string | null;
          gender: 'L' | 'P';
          birthDate: string | null;
          classId: string | null;
        }[] = [];

        for (const r of rows) {
          const before = errors.length;
          const fail = (field: string | null, message: string) => errors.push({ row: r.row, field, message });
          const name = r.name.trim().replace(/\s+/g, ' ');
          const nis = r.nis.trim();
          const nisn = r.nisn.trim();
          const gender = GENDERS[r.gender.trim().toLowerCase()];
          const birthDate = r.birthDate.trim();
          const className = r.className.trim();

          if (!name) fail('name', 'Nama wajib diisi.');
          else if (name.length > 120) fail('name', 'Nama maksimal 120 karakter.');
          if (!gender) fail('gender', 'Jenis kelamin harus L atau P.');
          if (nis && !idPattern.test(nis))
            fail('nis', 'NIS hanya boleh huruf, angka, titik, garis miring, dan tanda hubung.');
          if (nisn && !idPattern.test(nisn))
            fail('nisn', 'NISN hanya boleh huruf, angka, titik, garis miring, dan tanda hubung.');
          if (nis) {
            if (takenNis.has(nis)) fail('nis', `NIS ${nis} sudah dipakai siswa lain.`);
            else if (seenNis.has(nis)) fail('nis', `NIS ${nis} ganda dengan baris ${seenNis.get(nis)}.`);
            else seenNis.set(nis, r.row);
          }
          if (nisn) {
            if (takenNisn.has(nisn)) fail('nisn', `NISN ${nisn} sudah dipakai siswa lain.`);
            else if (seenNisn.has(nisn))
              fail('nisn', `NISN ${nisn} ganda dengan baris ${seenNisn.get(nisn)}.`);
            else seenNisn.set(nisn, r.row);
          }
          if (birthDate && !validDate(birthDate))
            fail('birthDate', 'Tanggal lahir harus berformat TTTT-BB-HH.');
          let classId: string | null = null;
          if (className) {
            const found = classByName.get(className.toLowerCase());
            if (!active) fail('className', 'Belum ada tahun ajaran aktif untuk menempatkan kelas.');
            else if (!found) fail('className', `Kelas "${className}" tidak ada pada tahun ajaran aktif.`);
            else classId = found.id;
          }

          if (errors.length === before && gender) {
            prepared.push({
              name,
              nis: nis || null,
              nisn: nisn || null,
              gender,
              birthDate: birthDate || null,
              classId,
            });
          }
        }

        const result = { total: rows.length, valid: prepared.length, imported: 0, errors };
        if (dryRun || errors.length > 0) return result;

        const inserted = await tx
          .insert(student)
          .values(
            prepared.map((p) => ({
              schoolId: ctx.schoolId,
              name: p.name,
              nis: p.nis,
              nisn: p.nisn,
              gender: p.gender,
              birthDate: p.birthDate,
            })),
          )
          .returning({ id: student.id });
        if (active) {
          const placements = prepared
            .map((p, i) => ({ p, id: inserted[i]?.id }))
            .filter((x): x is { p: (typeof prepared)[number] & { classId: string }; id: string } =>
              Boolean(x.p.classId && x.id),
            );
          if (placements.length > 0) {
            await tx.insert(enrollment).values(
              placements.map(({ p, id }) => ({
                schoolId: ctx.schoolId,
                studentId: id,
                classId: p.classId,
                academicYearId: active.id,
              })),
            );
          }
        }
        await audit(tx, ctx, 'student.import', 'student', ctx.schoolId, { count: inserted.length });
        return { ...result, imported: inserted.length };
      });
    },
  );
}
