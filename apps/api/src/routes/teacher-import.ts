import { and, inArray, type Tx, teacher, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema } from '../http-error';
import { requirePermission, type TenantContext } from '../identity/guards';
import { cleanNik, NIK_MESSAGE, NUPTK_MESSAGE } from '../person-fields';
import { normalizePhone } from './guardians';
import { audit, guarded, schoolHeader } from './helpers';
import type { RELIGIONS } from './people';

const MAX_ROWS = 1000;
const idPattern = /^[A-Za-z0-9./-]+$/;

const text = (max: number) => z.string().max(max).default('');

const rowSchema = z.object({
  row: z.number().int().min(1),
  name: z.string().max(200).default(''),
  nip: z.string().max(60).default(''),
  status: z.string().max(30).default(''),
  nik: text(40),
  nuptk: text(40),
  gender: text(30),
  phone: text(40),
  email: text(300),
  birthPlace: text(200),
  birthDate: text(30),
  address: text(600),
  religion: text(40),
  education: text(200),
});
const errorRow = z.object({ row: z.number().int(), field: z.string().nullable(), message: z.string() });

const STATUS: Record<string, 'active' | 'inactive'> = {
  '': 'active',
  aktif: 'active',
  active: 'active',
  nonaktif: 'inactive',
  'non-aktif': 'inactive',
  'tidak aktif': 'inactive',
  inactive: 'inactive',
};

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

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

interface PreparedTeacher {
  name: string;
  nip: string | null;
  status: 'active' | 'inactive';
  nik: string | null;
  nuptk: string | null;
  gender: 'L' | 'P' | null;
  phone: string | null;
  email: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  address: string | null;
  religion: Religion | null;
  education: string | null;
}

/** Impor guru dari data yang sudah dibaca di browser: pratinjau lalu simpan semua-atau-tidak sama sekali. */
export async function teacherImportRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/v1/teachers/import',
    {
      onRequest: [requirePermission('teacher:manage')],
      bodyLimit: 2 * 1024 * 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['People'],
        summary: 'Impor guru (pratinjau atau simpan)',
        description:
          `Izin: \`teacher:manage\`. Maksimal ${MAX_ROWS} baris. \`dryRun: true\` hanya memeriksa. Tanpa \`dryRun\`, ` +
          'guru disimpan hanya bila semua baris valid. NIP dan NIK harus unik di file dan di sekolah; status kosong ' +
          'berarti aktif. Data diri opsional: `nik` (16 digit), `nuptk` (16 digit, opsional dan unik bila terisi), `gender` (L/P), `phone` (dinormalkan ke 62), `email`, ' +
          '`birthPlace`, `birthDate` (TTTT-BB-HH), `address`, `religion`, `education`. NIK, telepon, dan email dipakai ' +
          'untuk masuk dan pemulihan akun.',
        headers: schoolHeader,
        body: z.object({ dryRun: z.boolean(), rows: z.array(rowSchema).min(1).max(MAX_ROWS) }),
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
      return withTenant(request.server.tenantDb, [ctx.schoolId], async (tx: Tx) => {
        const nips = rows.map((r) => r.nip.trim()).filter(Boolean);
        const taken = new Set(
          nips.length
            ? (await tx.select({ nip: teacher.nip }).from(teacher).where(inArray(teacher.nip, nips))).map(
                (t) => t.nip,
              )
            : [],
        );
        const niks = [...new Set(rows.map((r) => cleanNik(r.nik)).filter((n) => /^\d{16}$/.test(n)))];
        const takenNik = new Set(
          niks.length
            ? (
                await tx
                  .select({ nik: teacher.nik })
                  .from(teacher)
                  .where(and(inArray(teacher.nik, niks)))
              ).map((t) => t.nik)
            : [],
        );
        const nuptks = [...new Set(rows.map((r) => cleanNik(r.nuptk)).filter((n) => /^\d{16}$/.test(n)))];
        const takenNuptk = new Set(
          nuptks.length
            ? (
                await tx.select({ nuptk: teacher.nuptk }).from(teacher).where(inArray(teacher.nuptk, nuptks))
              ).map((t) => t.nuptk)
            : [],
        );
        const errors: z.infer<typeof errorRow>[] = [];
        const seen = new Map<string, number>();
        const seenNik = new Map<string, number>();
        const seenNuptk = new Map<string, number>();
        const prepared: PreparedTeacher[] = [];

        for (const r of rows) {
          const before = errors.length;
          const fail = (field: string, message: string) => errors.push({ row: r.row, field, message });
          const name = r.name.trim().replace(/\s+/g, ' ');
          const nip = r.nip.trim();
          const status = STATUS[r.status.trim().toLowerCase()];
          const nik = cleanNik(r.nik);
          const nuptk = cleanNik(r.nuptk);
          const genderText = r.gender.trim();
          const gender = genderText ? GENDERS[genderText.toLowerCase()] : null;
          const birthPlace = r.birthPlace.trim();
          const birthDate = r.birthDate.trim();
          const address = r.address.trim();
          const education = r.education.trim();
          const religionText = r.religion.trim();
          const religion = religionText ? RELIGION_LABELS[religionText.toLowerCase()] : null;
          const email = r.email.trim().toLowerCase();
          const phone = normalizePhone(r.phone);

          if (!name) fail('name', 'Nama wajib diisi.');
          else if (name.length > 120) fail('name', 'Nama maksimal 120 karakter.');
          if (nip && !idPattern.test(nip)) {
            fail('nip', 'NIP hanya boleh huruf, angka, titik, garis miring, dan tanda hubung.');
          } else if (nip) {
            if (taken.has(nip)) fail('nip', `NIP ${nip} sudah dipakai guru lain.`);
            else if (seen.has(nip)) fail('nip', `NIP ${nip} ganda dengan baris ${seen.get(nip)}.`);
            else seen.set(nip, r.row);
          }
          if (!status) fail('status', 'Status harus Aktif atau Nonaktif.');
          if (nik && !/^\d{16}$/.test(nik)) fail('nik', NIK_MESSAGE);
          else if (nik) {
            if (takenNik.has(nik)) fail('nik', 'NIK itu sudah dipakai guru lain.');
            else if (seenNik.has(nik)) fail('nik', `NIK ganda dengan baris ${seenNik.get(nik)}.`);
            else seenNik.set(nik, r.row);
          }
          // NUPTK opsional: kosong selalu lolos; hanya yang terisi diperiksa.
          if (nuptk && !/^\d{16}$/.test(nuptk)) fail('nuptk', NUPTK_MESSAGE);
          else if (nuptk) {
            if (takenNuptk.has(nuptk)) fail('nuptk', 'NUPTK itu sudah dipakai guru lain.');
            else if (seenNuptk.has(nuptk)) fail('nuptk', `NUPTK ganda dengan baris ${seenNuptk.get(nuptk)}.`);
            else seenNuptk.set(nuptk, r.row);
          }
          if (genderText && !gender) fail('gender', 'Jenis kelamin harus L atau P.');
          if (phone === undefined) fail('phone', 'Nomor telepon tidak valid.');
          if (email && !z.email().max(254).safeParse(email).success) fail('email', 'Email tidak valid.');
          if (birthPlace.length > 80) fail('birthPlace', 'Tempat lahir maksimal 80 karakter.');
          if (birthDate && !validDate(birthDate))
            fail('birthDate', 'Tanggal lahir harus berformat TTTT-BB-HH.');
          if (religionText && !religion)
            fail('religion', 'Agama harus Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, atau Lainnya.');
          if (address.length > 300) fail('address', 'Alamat maksimal 300 karakter.');
          if (education.length > 120) fail('education', 'Pendidikan maksimal 120 karakter.');

          if (errors.length === before && status && phone !== undefined) {
            prepared.push({
              name,
              nip: nip || null,
              status,
              nik: nik || null,
              nuptk: nuptk || null,
              gender: gender ?? null,
              phone,
              email: email || null,
              birthPlace: birthPlace || null,
              birthDate: birthDate || null,
              address: address || null,
              religion: religion ?? null,
              education: education || null,
            });
          }
        }

        const result = { total: rows.length, valid: prepared.length, imported: 0, errors };
        if (dryRun || errors.length > 0) return result;

        const inserted = await tx
          .insert(teacher)
          .values(prepared.map((p) => ({ schoolId: ctx.schoolId, ...p })))
          .returning({ id: teacher.id });
        await audit(tx, ctx, 'teacher.import', 'teacher', ctx.schoolId, { count: inserted.length });
        return { ...result, imported: inserted.length };
      });
    },
  );
}
