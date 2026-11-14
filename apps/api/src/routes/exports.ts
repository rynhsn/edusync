import {
  EXPORT_COLUMNS,
  EXPORT_DATASET_REQUIRES_MODULE_CODE,
  EXPORT_DATASETS,
  EXPORT_FORMAT_NAME,
  EXPORT_GRADE_DATASETS,
  exportQuerySchema,
} from '@edusync/contracts';
import { withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { buildExport, exportFileName, toCsv } from '../export-lib';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, schoolHeader } from './helpers';

/**
 * Ekspor akademik generik (tahap 3C.5). Format milik Edusync (`edusync-academic-v1`), BUKAN format impor e-Rapor, Dapodik, atau
 * EMIS. Nilai dan deskripsi hanya dari rapor final; NIK tidak pernah disertakan.
 */

const tag = ['Academic'];

export async function exportRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/v1/exports/academic',
    {
      onRequest: [requirePermission('data_export:run')],
      schema: {
        tags: tag,
        summary: 'Ekspor akademik generik (CSV atau JSON)',
        description:
          'Izin: `data_export:run`; modul Nilai dan rapor (kunci `grades`) hanya untuk dataset `final_grades` dan `descriptions` (400 ' +
          '`dataset_requires_module` bila modul belum aktif). Ekspor GENERIK format `edusync-academic-v1`: BUKAN format impor ' +
          'e-Rapor, Dapodik, atau EMIS, dan tidak ada klaim kompatibilitas dengan aplikasi tersebut; kode identitas (NPSN, NISN, NIS, ' +
          'kode mapel sekolah, kode mapel acuan) disertakan untuk memudahkan pemetaan manual. Dataset: `rombel` (anggota rombel), ' +
          '`class_subjects` (mapel per rombel dengan guru, JP, dan mode partisipasi), `subject_choices` (mapel yang diambil murid ' +
          'pada mapel pilihan; wajib `semesterId`), `final_grades` (nilai akhir, predikat, KKM) dan `descriptions` (deskripsi ' +
          'capaian), keduanya wajib `semesterId` dan HANYA dari snapshot rapor berstatus final (draf tidak pernah ikut). NIK tidak ' +
          'pernah disertakan. `format=csv` (bawaan): berkas `text/csv` UTF-8 dengan BOM, pemisah `;`, baris CRLF, header berupa ' +
          'kunci kolom tetap berbahasa Inggris, sel berawalan `=`, `+`, `-`, `@` diberi apostrof di depan; diunduh lewat ' +
          '`Content-Disposition: attachment`. `format=json`: objek `{ format, dataset, generatedAt, columns, rows }`; `columns` ' +
          'adalah kamus kolom. Mengubah kolom berarti versi format baru. Setiap ekspor dicatat di jejak audit (tanpa isi). ' +
          '400 `invalid_reference`: tahun ajaran atau semester tidak ditemukan (atau semester bukan milik tahun itu), atau ' +
          'semester wajib tetapi tidak diisi.',
        headers: schoolHeader,
        querystring: exportQuerySchema,
        response: {
          200: z
            .union([
              z.object({
                format: z.literal(EXPORT_FORMAT_NAME),
                dataset: z.enum(EXPORT_DATASETS),
                generatedAt: z.string(),
                columns: z.array(z.object({ key: z.string(), description: z.string() })),
                rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
              }),
              z.string().describe('`format=csv`: isi berkas CSV (`text/csv`)'),
            ])
            .describe('`format=json`: objek; `format=csv`: berkas `text/csv`.'),
          400: errorSchema,
          ...guarded,
        },
      },
    },
    async (request, reply) => {
      const ctx = request.ctx as TenantContext;
      const { academicYearId, semesterId, dataset, format } = request.query;

      if (EXPORT_GRADE_DATASETS.includes(dataset)) {
        try {
          await requireModule('grades')(request);
        } catch (error) {
          if (error instanceof HttpError && error.code === 'module_disabled') {
            throw new HttpError(
              400,
              EXPORT_DATASET_REQUIRES_MODULE_CODE,
              'Dataset nilai dan deskripsi memerlukan modul Nilai dan rapor yang aktif.',
            );
          }
          throw error;
        }
      }

      const result = await withTenant(request.server.tenantDb, [ctx.schoolId], async (tx) => {
        const built = await buildExport(tx, { academicYearId, semesterId, dataset });
        await audit(tx, ctx, 'export.academic', 'academic_year', academicYearId, {
          dataset,
          format,
          semesterId: semesterId ?? null,
          rows: built.rows.length,
          formatName: EXPORT_FORMAT_NAME,
        });
        return built;
      });

      reply.header('cache-control', 'no-store');
      if (format === 'json') {
        return {
          format: EXPORT_FORMAT_NAME as typeof EXPORT_FORMAT_NAME,
          dataset,
          generatedAt: new Date().toISOString(),
          columns: EXPORT_COLUMNS[dataset].map((c) => ({ key: c.key, description: c.description })),
          rows: result.rows,
        };
      }
      reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="${exportFileName(dataset, result.yearName, 'csv')}"`,
        );
      return reply.send(toCsv(dataset, result.rows));
    },
  );
}
