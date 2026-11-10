import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Versi rilis dari package.json akar (satu-satunya sumber; dinaikkan oleh `pnpm release`). */
function readVersion(): string {
  try {
    const url = new URL('../../../package.json', import.meta.url);
    return (JSON.parse(readFileSync(url, 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Kode commit yang sedang berjalan; kosong bila bukan checkout git. */
function readCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export const appVersion = { version: readVersion(), commit: readCommit() };
