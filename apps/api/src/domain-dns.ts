import dns from 'node:dns/promises';
import { DOMAIN_VERIFY_LABEL } from '@edusync/contracts';

/** Bagian DNS yang dibutuhkan; disuntik agar tes tidak memerlukan jaringan. */
export interface DomainDns {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolve4(name: string): Promise<string[]>;
}

export const systemDns: DomainDns = dns;

export interface DomainCheck {
  kind: 'txt' | 'cname';
  /** Nama catatan DNS yang diperiksa. */
  name: string;
  ok: boolean;
  expected: string;
  found: string[];
}

const trimDot = (v: string) => v.toLowerCase().replace(/\.$/, '');

/** NXDOMAIN/NODATA/timeout dianggap "tidak ditemukan", bukan galat server. */
async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

/**
 * Periksa DNS domain sendiri: (1) TXT `_edusync-verify.<hostname>` memuat token, (2) hostname menunjuk ke
 * `target` lewat CNAME, atau lewat A bila apex (alamat A sama dengan milik target).
 */
export async function checkDomainDns(
  dnsApi: DomainDns,
  hostname: string,
  token: string,
  target: string,
): Promise<{ verified: boolean; checks: DomainCheck[] }> {
  const txtName = `${DOMAIN_VERIFY_LABEL}.${hostname}`;
  const txt = (await safe(() => dnsApi.resolveTxt(txtName))).map((chunks) => chunks.join(''));
  const cname = (await safe(() => dnsApi.resolveCname(hostname))).map(trimDot);
  let pointsOk = cname.includes(trimDot(target));
  let found = cname;
  if (!pointsOk && cname.length === 0) {
    const [mine, theirs] = await Promise.all([
      safe(() => dnsApi.resolve4(hostname)),
      safe(() => dnsApi.resolve4(target)),
    ]);
    found = mine;
    pointsOk = mine.length > 0 && mine.some((ip) => theirs.includes(ip));
  }
  const checks: DomainCheck[] = [
    { kind: 'txt', name: txtName, ok: txt.includes(token), expected: token, found: txt },
    { kind: 'cname', name: hostname, ok: pointsOk, expected: target, found },
  ];
  return { verified: checks.every((c) => c.ok), checks };
}
