import { and, eq, reportSetting, signerCredential, type Tx } from '@edusync/db';

export interface Principal {
  name: string;
  nip: string | null;
  /** `signer` = penandatangan aktif bertanda kepala sekolah; `report_setting` = cadangan dari pengaturan rapor. */
  source: 'signer' | 'report_setting';
}

/**
 * Satu sumber nama/NIP kepala sekolah untuk dokumen (rapor, SKL, sertifikat PKL). Utama: penandatangan aktif ber-`is_principal`
 * (paling banyak satu per sekolah, dijaga indeks unik). Cadangan: `report_setting.principal_name/nip` bila belum ada yang ditandai.
 * Tenant: `tx` sudah dibatasi RLS; saring `school_id` eksplisit sebagai pagar kedua.
 */
export async function resolvePrincipal(tx: Tx, schoolId: string): Promise<Principal | null> {
  const [s] = await tx
    .select({ name: signerCredential.name, nip: signerCredential.nip })
    .from(signerCredential)
    .where(
      and(
        eq(signerCredential.schoolId, schoolId),
        eq(signerCredential.isPrincipal, true),
        eq(signerCredential.active, true),
      ),
    );
  if (s) return { name: s.name, nip: s.nip, source: 'signer' };
  const [r] = await tx
    .select({ name: reportSetting.principalName, nip: reportSetting.principalNip })
    .from(reportSetting)
    .where(eq(reportSetting.schoolId, schoolId));
  return r?.name ? { name: r.name, nip: r.nip, source: 'report_setting' } : null;
}
