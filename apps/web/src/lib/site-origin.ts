import { headers } from 'next/headers';
import { protocolOf } from './site-links';

/** Asal (protokol + host) permintaan saat ini, untuk alamat absolut di metadata. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${protocolOf(h.get('x-forwarded-proto'), host)}//${host}`;
}
