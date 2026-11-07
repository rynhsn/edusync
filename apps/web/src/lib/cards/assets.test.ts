import { describe, expect, it } from 'vitest';
import { mapPool } from './assets';

describe('mapPool', () => {
  it('hasil berurutan seperti masukan dan kemajuan dilaporkan', async () => {
    const progress: number[] = [];
    const out = await mapPool(
      [30, 5, 20, 1],
      2,
      async (ms, i) => {
        await new Promise((r) => setTimeout(r, ms));
        return i * 10;
      },
      (done) => progress.push(done),
    );
    expect(out).toEqual([0, 10, 20, 30]);
    expect(progress).toEqual([1, 2, 3, 4]);
  });

  it('tidak melebihi batas serentak', async () => {
    let running = 0;
    let peak = 0;
    await mapPool(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 3));
        running--;
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('daftar kosong', async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });
});
