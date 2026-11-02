import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pruneSessionDirs } from './session-prune';

const KEEP = '01a18731-0680-795b-9873-19f099515911';
const GONE = '01a190c7-e968-74fc-a5fb-72fcb349d185';
const ACTIVE = '01a190c7-e99c-7132-b165-2c0c8da0e358';
let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wa-prune-'));
  for (const id of [KEEP, GONE, ACTIVE]) {
    await mkdir(join(dir, `session-${id}`, 'Default'), { recursive: true });
    await writeFile(join(dir, `session-${id}`, 'Default', 'Cookies'), 'x');
  }
  await mkdir(join(dir, 'bukan-sesi'));
  await writeFile(join(dir, 'session-bukan-uuid'), 'berkas, bukan folder');
});

afterAll(() => rm(dir, { recursive: true, force: true }));

describe('pruneSessionDirs', () => {
  it('hanya menghapus folder sesi milik sekolah yang tidak ada dan tidak sedang aktif', async () => {
    const removed = await pruneSessionDirs(dir, new Set([KEEP]), new Set([ACTIVE]));
    expect(removed).toEqual([GONE]);
    expect((await readdir(dir)).sort()).toEqual(
      ['bukan-sesi', `session-${ACTIVE}`, `session-${KEEP}`, 'session-bukan-uuid'].sort(),
    );
  });

  it('folder yang tidak ada tidak menimbulkan galat', async () => {
    expect(await pruneSessionDirs(join(dir, 'tidak-ada'), new Set())).toEqual([]);
  });
});
