/**
 * Aturan isian domain sendiri sekolah (murni, mudah diuji). Memakai checkCustomHostname dari @edusync/contracts, fungsi
 * yang sama dengan API. Perbedaan: domain dasar aplikasi (APP_DOMAIN) tidak diketahui klien, jadi penolakan
 * "milik aplikasi" tetap datang dari server (galat tampil di dialog).
 */
import { checkCustomHostname } from '@edusync/contracts';
import type { FieldErrors } from '@/lib/form-validation';
import { compactErrors, requiredText } from '../../../../lib/form-issues';

export type DomainField = 'hostname';
export const DOMAIN_ORDER: DomainField[] = ['hostname'];

export function validateDomain(hostname: string): FieldErrors<DomainField> {
  const empty = requiredText(hostname, 253);
  if (empty) return compactErrors<DomainField>([['hostname', empty]]);
  const checked = checkCustomHostname(hostname, 'app.invalid');
  return compactErrors<DomainField>([['hostname', checked.ok ? undefined : { code: 'hostInvalid' }]]);
}
