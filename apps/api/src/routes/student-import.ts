import {
  academicYear,
  and,
  asc,
  classRoom,
  desc,
  enrollment,
  eq,
  guardian,
  ilike,
  inArray,
  isNull,
  or,
  student,
  studentGuardian,
  withTenant,
} from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { cleanNik, NIK_MESSAGE, nikOut, nikView } from '../person-fields';
import { normalizePhone } from './guardians';
import { audit, guarded, schoolHeader } from './helpers';
import { RELIGIONS } from './people';

const MAX_ROWS = 1000;
const MAX_EXPORT_ROWS = 5000;

const text = (max: number) => z.string().max(max).default('');

const rowSchema = z.object({
  row: z.number().int().min(1).describe('Nomor baris di lembar kerja, dipakai untuk melaporkan kesalahan'),
  name: text(200),
  nis: text(60),
  nisn: text(60),
  nik: text(40),
  gender: text(30),
  birthPlace: text(200),
  birthDate: text(30),
  religion: text(40),
  address: text(600),
  phone: text(40),
  email: text(300),
  className: text(80),
  g1Name: text(200),
  g1Relation: text(30),
  g1Phone: text(40),
  g1Email: text(300),
  g1Nik: text(40),
  g1Address: text(600),
  g1Occupation: text(200),
  g2Name: text(200),
  g2Relation: text(30),
  g2Phone: text(40),
  g2Email: text(300),
  g2Nik: text(40),
  g2Address: text(600),
  g2Occupation: text(200),
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

type Religion = (typeof RELIGIONS)[number];
const RELIGION_LABELS: Record<string, Religion> = {
  islam: 'islam',
  kristen: 'christian',
  protestan: 'christian',
  christian: 'christian',
  katolik: 'catholic',
  katholik: 'catholic',
  catholic: 'catholic',
  hindu: 'hindu',
  buddha: 'buddhist',
  budha: 'buddhist',
  buddhist: 'buddhist',
  konghucu: 'confucian',
  khonghucu: 'confucian',
  confucian: 'confucian',
  lainnya: 'other',
  other: 'other',
};

type Relation = 'father' | 'mother' | 'guardian' | 'other';
const RELATION_LABELS: Record<string, Relation> = {
  ayah: 'father',
  bapak: 'father',
  father: 'father',
  ibu: 'mother',
  mother: 'mother',
  wali: 'guardian',
  guardian: 'guardian',
  lainnya: 'other',
  other: 'other',
};

/** Dua blok wali pada satu baris; wali 1 menjadi wali utama. */
const GUARDIAN_BLOCKS = [
  {
    name: 'g1Name',
    relation: 'g1Relation',
    phone: 'g1Phone',
    email: 'g1Email',
    nik: 'g1Nik',
    address: 'g1Address',
    occupation: 'g1Occupation',
    fallback: 'father',
  },
  {
    name: 'g2Name',
    relation: 'g2Relation',
    phone: 'g2Phone',
    email: 'g2Email',
    nik: 'g2Nik',
    address: 'g2Address',
    occupation: 'g2Occupation',
    fallback: 'mother',
  },
] as const;

interface PreparedGuardian {
  name: string;
  phone: string | null;
  email: string | null;
  nik: string | null;
  address: string | null;
  occupation: string | null;
  relation: Relation;
  isPrimary: boolean;
  /** Wali yang sudah ada di sekolah (cocok menurut telepon); null bila perlu dibuat. */
  existingId: string | null;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const studentOut = z.object({
  id: z.uuid(),
  name: z.string(),
  nis: z.string().nullable(),
  nisn: z.string().nullable(),
  ...nikOut,
  gender: z.enum(['L', 'P']),
  birthPlace: z.string().nullable(),
  birthDate: z.iso.date().nullable(),
  religion: z.enum(RELIGIONS).nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  status: z.enum(['active', 'graduated', 'transferred', 'dropped']),
  className: z.string().nullable(),
  guardians: z.array(
    z.object({
      name: z.string(),
      relation: z.enum(['father', 'mother', 'guardian', 'other']),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      ...nikOut,
      address: z.string().nullable(),
      occupation: z.string().nullable(),
      isPrimary: z.boolean(),
    }),
  ),
});

/**
 * Impor siswa dari data yang sudah dibaca di browser. Server memvalidasi ulang semuanya: dua langkah,
 * pratinjau (`dryRun`) lalu simpan. Simpan bersifat semua-atau-tidak sama sekali, sehingga satu baris
 * yang salah tidak meninggalkan data setengah masuk. Ekspor Excel siswa (beserta wali) ada di sini juga.
 */
export async function studentImportRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/students/export',
    {
      onRequest: [requirePermission('student:read')],
      schema: {
        tags: ['People'],
        summary: 'Ekspor siswa beserta wali',
        description:
          `Izin: \`student:read\`. Saringan sama dengan daftar siswa (\`q\`, \`classId\`, \`status\`) tetapi tanpa ` +
          `paginasi; maksimal ${MAX_EXPORT_ROWS} siswa (\`total\` memuat jumlah sebenarnya). Setiap siswa membawa ` +
          'semua walinya, wali utama lebih dulu.',
        headers: schoolHeader,
        querystring: z.object({
          q: z.string().trim().max(80).optional(),
          classId: z.uuid().optional(),
          status: z.enum(['active', 'graduated', 'transferred', 'dropped']).optional(),
        }),
        response: {
          200: z.object({ items: z.array(studentOut), total: z.number().int() }),
          ...guarded,
        },
      },
    },
    async (request) => {
      const ctx = request.ctx as TenantContext;
      const { q, classId, status } = request.query;
      const canManage = ctx.permissions.has('student:manage');
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const rows = await tx
          .select()
          .from(student)
          .where(
            and(
              isNull(student.deletedAt),
              status ? eq(student.status, status) : undefined,
              q
                ? or(
                    ilike(student.name, `%${q}%`),
                    ilike(student.nis, `%${q}%`),
                    ilike(student.nisn, `%${q}%`),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(student.name));
        const placements = await tx
          .select({ studentId: enrollment.studentId, classId: classRoom.id, className: classRoom.name })
          .from(enrollment)
          .innerJoin(
            academicYear,
            and(eq(academicYear.id, enrollment.academicYearId), eq(academicYear.isActive, true)),
          )
          .innerJoin(classRoom, eq(classRoom.id, enrollment.classId));
        const placed = new Map(placements.map((p) => [p.studentId, p]));
        const filtered = classId ? rows.filter((s) => placed.get(s.id)?.classId === classId) : rows;
        const page = filtered.slice(0, MAX_EXPORT_ROWS);

        const links = page.length
          ? await tx
              .select({
                studentId: studentGuardian.studentId,
                name: guardian.name,
                relation: studentGuardian.relation,
                phone: guardian.phone,
                email: guardian.email,
                nik: guardian.nik,
                address: guardian.address,
                occupation: guardian.occupation,
                isPrimary: studentGuardian.isPrimary,
              })
              .from(studentGuardian)
              .innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId))
              .where(
                inArray(
                  studentGuardian.studentId,
                  page.map((s) => s.id),
                ),
              )
              .orderBy(desc(studentGuardian.isPrimary), asc(studentGuardian.createdAt))
          : [];
        const byStudent = new Map<string, typeof links>();
        for (const l of links) byStudent.set(l.studentId, [...(byStudent.get(l.studentId) ?? []), l]);

        return {
          total: filtered.length,
          items: page.map((s) => ({
            id: s.id,
            name: s.name,
            nis: s.nis,
            nisn: s.nisn,
            ...nikView(canManage, s.nik),
            gender: s.gender,
            birthPlace: s.birthPlace,
            birthDate: s.birthDate,
            religion: s.religion,
            address: s.address,
            phone: s.phone,
            email: s.email,
            status: s.status,
            className: placed.get(s.id)?.className ?? null,
            guardians: (byStudent.get(s.id) ?? []).map(({ studentId: _s, nik, ...g }) => ({
              ...g,
              ...nikView(canManage, nik),
            })),
          })),
        };
      });
    },
  );

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
          'dicocokkan dengan nama kelas pada tahun ajaran aktif; NIS dan NISN harus unik di file dan di sekolah. ' +
          'Data diri opsional: `nik` (16 digit), `birthPlace`, `religion` (Islam, Kristen, Katolik, Hindu, Buddha, ' +
          'Konghucu, Lainnya, atau padanan Inggris), `address`, `phone`, `email`. Dua wali per baris ' +
          '(`g1*` wali utama, `g2*`): hubungan Ayah/Ibu/Wali/Lainnya (kosong: wali 1 ayah, wali 2 ibu); nama wajib ' +
          'bila ada isian lain pada blok itu. Blok wali juga menerima `g1Nik`/`g2Nik` (16 digit), `g1Address`, ' +
          '`g1Occupation`. NIK siswa harus unik di file dan di sekolah. Wali dipakai ulang bila NIK, atau telepon ' +
          '(setelah dinormalkan), sama dengan wali yang sudah ada di sekolah atau yang dibuat lebih awal di file ' +
          'yang sama; selain itu wali baru dibuat.',
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

        // Wali yang sudah ada di sekolah, dicari menurut telepon ternormalisasi.
        const phones = [
          ...new Set(
            rows
              .flatMap((r) => [r.g1Phone, r.g2Phone])
              .map((p) => normalizePhone(p))
              .filter((p): p is string => Boolean(p)),
          ),
        ];
        const existing = phones.length
          ? await tx
              .select({ id: guardian.id, phone: guardian.phone })
              .from(guardian)
              .where(inArray(guardian.phone, phones))
              .orderBy(asc(guardian.createdAt))
          : [];
        const guardianByPhone = new Map<string, string>();
        for (const g of existing)
          if (g.phone && !guardianByPhone.has(g.phone)) guardianByPhone.set(g.phone, g.id);

        // NIK siswa dan wali yang sudah ada di sekolah.
        const studentNiks = [...new Set(rows.map((r) => cleanNik(r.nik)).filter((n) => /^\d{16}$/.test(n)))];
        const takenStudentNik = new Set(
          studentNiks.length
            ? (
                await tx
                  .select({ nik: student.nik })
                  .from(student)
                  .where(and(inArray(student.nik, studentNiks), isNull(student.deletedAt)))
              ).map((s) => s.nik)
            : [],
        );
        const guardianNiks = [
          ...new Set(
            rows.flatMap((r) => [cleanNik(r.g1Nik), cleanNik(r.g2Nik)]).filter((n) => /^\d{16}$/.test(n)),
          ),
        ];
        const guardianByNik = new Map<string, string>();
        if (guardianNiks.length) {
          for (const g of await tx
            .select({ id: guardian.id, nik: guardian.nik })
            .from(guardian)
            .where(inArray(guardian.nik, guardianNiks))) {
            if (g.nik) guardianByNik.set(g.nik, g.id);
          }
        }
        const seenNik = new Map<string, number>();

        const errors: z.infer<typeof errorRow>[] = [];
        const seenNis = new Map<string, number>();
        const seenNisn = new Map<string, number>();
        const prepared: {
          name: string;
          nis: string | null;
          nisn: string | null;
          nik: string | null;
          gender: 'L' | 'P';
          birthPlace: string | null;
          birthDate: string | null;
          religion: Religion | null;
          address: string | null;
          phone: string | null;
          email: string | null;
          classId: string | null;
          guardians: PreparedGuardian[];
        }[] = [];

        for (const r of rows) {
          const before = errors.length;
          const fail = (field: string | null, message: string) => errors.push({ row: r.row, field, message });
          const name = r.name.trim().replace(/\s+/g, ' ');
          const nis = r.nis.trim();
          const nisn = r.nisn.trim();
          const nik = cleanNik(r.nik);
          const gender = GENDERS[r.gender.trim().toLowerCase()];
          const birthPlace = r.birthPlace.trim();
          const birthDate = r.birthDate.trim();
          const religionText = r.religion.trim();
          const address = r.address.trim();
          const email = r.email.trim().toLowerCase();
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
          if (nik && !/^\d{16}$/.test(nik)) fail('nik', NIK_MESSAGE);
          else if (nik) {
            if (takenStudentNik.has(nik)) fail('nik', 'NIK itu sudah dipakai siswa lain.');
            else if (seenNik.has(nik)) fail('nik', `NIK ganda dengan baris ${seenNik.get(nik)}.`);
            else seenNik.set(nik, r.row);
          }
          if (birthPlace.length > 80) fail('birthPlace', 'Tempat lahir maksimal 80 karakter.');
          if (birthDate && !validDate(birthDate))
            fail('birthDate', 'Tanggal lahir harus berformat TTTT-BB-HH.');
          const religion = religionText ? RELIGION_LABELS[religionText.toLowerCase()] : undefined;
          if (religionText && !religion)
            fail('religion', 'Agama harus Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, atau Lainnya.');
          if (address.length > 300) fail('address', 'Alamat maksimal 300 karakter.');
          const phone = normalizePhone(r.phone);
          if (phone === undefined) fail('phone', 'Nomor telepon tidak valid.');
          if (email && !z.email().max(254).safeParse(email).success) fail('email', 'Email tidak valid.');
          let classId: string | null = null;
          if (className) {
            const found = classByName.get(className.toLowerCase());
            if (!active) fail('className', 'Belum ada tahun ajaran aktif untuk menempatkan kelas.');
            else if (!found) fail('className', `Kelas "${className}" tidak ada pada tahun ajaran aktif.`);
            else classId = found.id;
          }

          const guardians: PreparedGuardian[] = [];
          const label = (n: number) => `Wali ${n}`;
          for (const [i, b] of GUARDIAN_BLOCKS.entries()) {
            const gName = r[b.name].trim().replace(/\s+/g, ' ');
            const gRelationText = r[b.relation].trim();
            const gPhoneText = r[b.phone].trim();
            const gEmail = r[b.email].trim().toLowerCase();
            const gNik = cleanNik(r[b.nik]);
            const gAddress = r[b.address].trim();
            const gOccupation = r[b.occupation].trim();
            if (!gName && !gRelationText && !gPhoneText && !gEmail && !gNik && !gAddress && !gOccupation)
              continue;
            if (gNik && !/^\d{16}$/.test(gNik)) fail(b.nik, `${label(i + 1)}: ${NIK_MESSAGE}`);
            else if (gNik && guardians.some((g) => g.nik === gNik))
              fail(b.nik, `${label(i + 1)} memakai NIK yang sama dengan wali lain pada baris ini.`);
            if (gAddress.length > 300) fail(b.address, `${label(i + 1)}: alamat maksimal 300 karakter.`);
            if (gOccupation.length > 120)
              fail(b.occupation, `${label(i + 1)}: pekerjaan maksimal 120 karakter.`);
            if (!gName) fail(b.name, `${label(i + 1)}: nama wajib diisi bila ada isian wali lain.`);
            else if (gName.length > 120) fail(b.name, `${label(i + 1)}: nama maksimal 120 karakter.`);
            const relation = gRelationText ? RELATION_LABELS[gRelationText.toLowerCase()] : b.fallback;
            if (!relation) fail(b.relation, `${label(i + 1)}: hubungan harus Ayah, Ibu, Wali, atau Lainnya.`);
            const gPhone = normalizePhone(gPhoneText);
            if (gPhone === undefined) fail(b.phone, `${label(i + 1)}: nomor telepon tidak valid.`);
            if (gEmail && !z.email().max(254).safeParse(gEmail).success)
              fail(b.email, `${label(i + 1)}: email tidak valid.`);
            if (gPhone && guardians.some((g) => g.phone === gPhone))
              fail(b.phone, `${label(i + 1)} memakai telepon yang sama dengan wali lain pada baris ini.`);
            const idByNik = (gNik && guardianByNik.get(gNik)) || null;
            const idByPhone = (gPhone && guardianByPhone.get(gPhone)) || null;
            if (idByNik && idByPhone && idByNik !== idByPhone)
              fail(b.nik, `${label(i + 1)}: NIK dan telepon cocok dengan dua wali berbeda yang sudah ada.`);
            if (gName && relation && gPhone !== undefined) {
              guardians.push({
                name: gName,
                phone: gPhone,
                email: gEmail || null,
                nik: /^\d{16}$/.test(gNik) ? gNik : null,
                address: gAddress || null,
                occupation: gOccupation || null,
                relation,
                isPrimary: guardians.length === 0,
                existingId: idByNik ?? idByPhone,
              });
            }
          }

          if (errors.length === before && gender && phone !== undefined) {
            prepared.push({
              name,
              nis: nis || null,
              nisn: nisn || null,
              nik: nik || null,
              gender,
              birthPlace: birthPlace || null,
              birthDate: birthDate || null,
              religion: religion ?? null,
              address: address || null,
              phone,
              email: email || null,
              classId,
              guardians,
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
              nik: p.nik,
              gender: p.gender,
              birthPlace: p.birthPlace,
              birthDate: p.birthDate,
              religion: p.religion,
              address: p.address,
              phone: p.phone,
              email: p.email,
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

        // Wali baru dibuat sekali per telepon (kakak-adik dalam satu file berbagi wali); tanpa telepon selalu baru.
        const toCreate: PreparedGuardian[] = [];
        const createdIndex = new Map<string, number>();
        const slots = prepared.flatMap((p, i) =>
          p.guardians.map((g) => {
            if (g.existingId) return { studentId: inserted[i]?.id as string, g, index: -1, id: g.existingId };
            const key = g.nik ?? g.phone;
            const known = key ? createdIndex.get(key) : undefined;
            if (known !== undefined) return { studentId: inserted[i]?.id as string, g, index: known, id: '' };
            toCreate.push(g);
            if (key) createdIndex.set(key, toCreate.length - 1);
            return { studentId: inserted[i]?.id as string, g, index: toCreate.length - 1, id: '' };
          }),
        );
        const created = toCreate.length
          ? await tx
              .insert(guardian)
              .values(
                toCreate.map((g) => ({
                  schoolId: ctx.schoolId,
                  name: g.name,
                  phone: g.phone,
                  email: g.email,
                  nik: g.nik,
                  address: g.address,
                  occupation: g.occupation,
                })),
              )
              .returning({ id: guardian.id })
          : [];
        if (slots.length > 0) {
          await tx.insert(studentGuardian).values(
            slots.map((s) => ({
              schoolId: ctx.schoolId,
              studentId: s.studentId,
              guardianId: s.index >= 0 ? (created[s.index]?.id as string) : s.id,
              relation: s.g.relation,
              isPrimary: s.g.isPrimary,
            })),
          );
        }
        await audit(tx, ctx, 'student.import', 'student', ctx.schoolId, {
          count: inserted.length,
          guardiansCreated: created.length,
          guardianLinks: slots.length,
        });
        return { ...result, imported: inserted.length };
      });
    },
  );
}
