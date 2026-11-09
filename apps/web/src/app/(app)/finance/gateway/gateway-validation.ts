/**
 * Aturan isian pengaturan Midtrans. Mengikuti zod `PUT /v1/finance/gateway` (apps/api/src/routes/finance-gateway.ts):
 * Merchant ID paling banyak 60, kunci klien dan kunci server paling banyak 200, awalan kunci server harus cocok dengan
 * mode, dan pengaktifan butuh kunci server (tersimpan atau baru). Pemeriksaan "kunci tersimpan cocok dengan mode" hanya
 * bisa dilakukan server (kunci tidak pernah dikirim ke klien). Murni, tanpa React.
 */

import type { FieldErrors } from '@/lib/form-validation';
import { compact } from '../../../../lib/area-rules';
import { customIssue, optionalText } from '../../../../lib/form-issues';
import { type GatewayForm, keyPrefixes } from '../../../../lib/online-charge';
import { financeIssue } from '../finance-rules';

export type GatewayField = 'merchantId' | 'clientKey' | 'serverKey';
export const GATEWAY_ORDER: GatewayField[] = ['merchantId', 'clientKey', 'serverKey'];

export function validateGateway(form: GatewayForm, hasServerKey: boolean): FieldErrors<GatewayField> {
  const server = form.serverKey.trim();
  const prefix = keyPrefixes(form.mode).server;
  return compact<GatewayField>([
    ['merchantId', optionalText(form.merchantId, 60)],
    ['clientKey', optionalText(form.clientKey, 200)],
    [
      'serverKey',
      server.length > 200
        ? { code: 'tooLong', max: 200 }
        : server !== '' && !server.startsWith(prefix)
          ? financeIssue('serverKeyPrefix', { prefix })
          : server === '' && form.enabled && !hasServerKey
            ? customIssue('finance.gwKeyRequired')
            : undefined,
    ],
  ]);
}
