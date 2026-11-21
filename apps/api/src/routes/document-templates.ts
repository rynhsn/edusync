import {
  DEFAULT_DOCUMENT_TEMPLATE,
  DOCUMENT_SECTIONS,
  DOCUMENT_TEMPLATE_KINDS,
  DOCUMENT_VARIABLES,
  type DocumentTemplateConfig,
  type DocumentTemplateKind,
  documentTemplateConfigSchema,
  type Permission,
  validateDocumentTemplate,
} from '@edusync/contracts';
import { and, documentTemplate, eq, type Tx, withTenant } from '@edusync/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorSchema, HttpError } from '../http-error';
import { requireModule, requirePermission, type TenantContext } from '../identity/guards';
import { audit, guarded, ok, schoolHeader } from './helpers';

/**
 * Templat dokumen yang dapat disesuaikan sekolah: SKL (izin kelulusan, modul `grades`) dan sertifikat PKL (izin PKL, modul
 * `internship`). Tanpa baris tersimpan = templat bawaan (`isDefault`), sehingga tidak perlu data awal per sekolah.
 */

const tag = ['Document templates'];

const SETUP: Record<
  DocumentTemplateKind,
  { path: string; label: string; read: Permission; manage: Permission; module: string }
> = {
  skl: {
    path: 'skl',
    label: 'SKL (surat keterangan lulus)',
    read: 'graduation:read',
    manage: 'graduation:manage',
    module: 'grades',
  },
  pkl_certificate: {
    path: 'pkl_certificate',
    label: 'sertifikat PKL',
    read: 'pkl:read',
    manage: 'pkl:manage',
    module: 'internship',
  },
};

const templateView = z.object({
  kind: z.enum(DOCUMENT_TEMPLATE_KINDS),
  config: documentTemplateConfigSchema.describe(
    'Teks `null` = bawaan. `sections`: bagian yang dimatikan bernilai false. `signatures` null = tanda tangan bawaan.',
  ),
  isDefault: z.boolean().describe('true bila sekolah belum menyimpan templat (memakai bawaan)'),
  updatedAt: z.date().nullable(),
});

type View = z.infer<typeof templateView>;

async function load(tx: Tx, kind: DocumentTemplateKind): Promise<View> {
  const [row] = await tx.select().from(documentTemplate).where(eq(documentTemplate.kind, kind));
  if (!row) return { kind, config: DEFAULT_DOCUMENT_TEMPLATE, isDefault: true, updatedAt: null };
  return { kind, config: row.config as DocumentTemplateConfig, isDefault: false, updatedAt: row.updatedAt };
}

export async function documentTemplateRoutes(instance: FastifyInstance) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tenant = <T>(request: { ctx?: TenantContext; server: FastifyInstance }, fn: (tx: Tx) => Promise<T>) =>
    withTenant(request.server.tenantDb, [(request.ctx as TenantContext).schoolId], fn);

  for (const kind of DOCUMENT_TEMPLATE_KINDS) {
    const s = SETUP[kind];
    const url = `/v1/document-templates/${s.path}`;
    const readGate = [requirePermission(s.read), requireModule(s.module)];
    const manageGate = [requirePermission(s.manage), requireModule(s.module)];
    const vars = DOCUMENT_VARIABLES[kind].map((v) => `\`{{${v}}}\``).join(', ');
    const sections = DOCUMENT_SECTIONS[kind].map((v) => `\`${v}\``).join(', ');

    app.get(
      url,
      {
        onRequest: readGate,
        schema: {
          tags: tag,
          summary: `Templat ${s.label}`,
          description:
            `Izin: \`${s.read}\`; modul \`${s.module}\`. Templat ${s.label} milik sekolah; bila belum pernah disimpan ` +
            'dikembalikan templat bawaan (`isDefault` true) yang menghasilkan dokumen seperti semula.',
          headers: schoolHeader,
          response: { 200: templateView, ...guarded },
        },
      },
      async (request) => tenant(request, (tx) => load(tx, kind)),
    );

    app.put(
      url,
      {
        onRequest: manageGate,
        schema: {
          tags: tag,
          summary: `Simpan templat ${s.label}`,
          description:
            `Izin: \`${s.manage}\`; modul \`${s.module}\`. Menimpa seluruh templat. Variabel yang dikenal: ${vars}. ` +
            `Kunci \`sections\` yang dikenal: ${sections}. Tanda tangan hanya ruang kosong untuk tanda tangan basah ` +
            '(maksimal 4 slot). 400 `unknown_variable`: variabel tak dikenal; 400 `unknown_section`: kunci bagian tak dikenal. Dicatat di log audit.',
          headers: schoolHeader,
          body: documentTemplateConfigSchema,
          response: { 200: templateView, 400: errorSchema, ...guarded },
        },
      },
      async (request) => {
        const ctx = request.ctx as TenantContext;
        const [issue] = validateDocumentTemplate(kind, request.body);
        if (issue) {
          const names = issue.names.join(', ');
          throw new HttpError(
            400,
            issue.code,
            issue.code === 'unknown_variable'
              ? `Variabel tidak dikenal: ${names}.`
              : `Bagian tidak dikenal: ${names}.`,
          );
        }
        return tenant(request, async (tx) => {
          const now = new Date();
          const [row] = await tx
            .insert(documentTemplate)
            .values({ schoolId: ctx.schoolId, kind, config: request.body, updatedAt: now })
            .onConflictDoUpdate({
              target: [documentTemplate.schoolId, documentTemplate.kind],
              set: { config: request.body, updatedAt: now },
            })
            .returning();
          await audit(tx, ctx, 'document_template.update', 'document_template', row!.id, { kind });
          return { kind, config: request.body, isDefault: false, updatedAt: row!.updatedAt };
        });
      },
    );

    app.delete(
      url,
      {
        onRequest: manageGate,
        schema: {
          tags: tag,
          summary: `Kembalikan templat ${s.label} ke bawaan`,
          description: `Izin: \`${s.manage}\`; modul \`${s.module}\`. Menghapus templat tersimpan; tanpa templat tersimpan tidak terjadi apa-apa. Dicatat di log audit.`,
          headers: schoolHeader,
          response: { 200: ok, ...guarded },
        },
      },
      async (request) => {
        const ctx = request.ctx as TenantContext;
        await tenant(request, async (tx) => {
          const gone = await tx
            .delete(documentTemplate)
            .where(and(eq(documentTemplate.schoolId, ctx.schoolId), eq(documentTemplate.kind, kind)))
            .returning({ id: documentTemplate.id });
          if (gone[0])
            await audit(tx, ctx, 'document_template.reset', 'document_template', gone[0].id, { kind });
        });
        return { ok: true as const };
      },
    );
  }
}
