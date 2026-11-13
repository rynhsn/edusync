import { describe, expect, it } from 'vitest';
import {
  buildObjectiveNarrative,
  DEFAULT_NARRATIVE_HIGH_TEMPLATE,
  DEFAULT_NARRATIVE_LOW_TEMPLATE,
  isValidNarrativeTemplate,
  type NarrativeCandidate,
} from './report-card';

let seq = 0;
const tp = (over: Partial<NarrativeCandidate> & { text: string }): NarrativeCandidate => {
  seq += 1;
  return {
    id: `id-${seq}`,
    code: null,
    achieved: true,
    percent: 80,
    atpOrder: null,
    sortOrder: 0,
    ...over,
  };
};

describe('buildObjectiveNarrative (rancangan 3.4)', () => {
  it('tanpa kandidat mengembalikan null (pemanggil jatuh ke teks v1)', () => {
    expect(buildObjectiveNarrative([])).toBeNull();
  });

  it('high: tercapai urut persen menurun; low: belum tercapai urut persen menaik; batas bawaan 2 per sisi', () => {
    const r = buildObjectiveNarrative([
      tp({ text: 'A', achieved: true, percent: 70 }),
      tp({ text: 'B', achieved: true, percent: 95 }),
      tp({ text: 'C', achieved: true, percent: 85 }),
      tp({ text: 'D', achieved: false, percent: 40 }),
      tp({ text: 'E', achieved: false, percent: 20 }),
      tp({ text: 'F', achieved: false, percent: 55 }),
    ])!;
    expect(r.high.map((h) => h.text)).toEqual(['B', 'C']);
    expect(r.low.map((h) => h.text)).toEqual(['E', 'D']);
    expect(r.assessed).toBe(6);
    expect(r.achieved).toBe(3);
    expect(r.text).toBe('Menunjukkan penguasaan yang baik dalam B dan C. Perlu bimbingan dalam E dan D.');
  });

  it('seri dipecah urutan ATP, lalu urutan TP, lalu kode, lalu id; TP di luar ATP sesudah yang di ATP', () => {
    const r = buildObjectiveNarrative(
      [
        tp({ id: 'z', text: 'tanpa-atp', percent: 90, atpOrder: null, sortOrder: 0 }),
        tp({ id: 'c', text: 'atp-2', percent: 90, atpOrder: 2, sortOrder: 9 }),
        tp({ id: 'b', text: 'atp-1', percent: 90, atpOrder: 1, sortOrder: 5 }),
        tp({ id: 'a', text: 'atp-1-urut-kecil', percent: 90, atpOrder: 1, sortOrder: 1 }),
        tp({ id: 'd', text: 'kode-b', percent: 90, atpOrder: 1, sortOrder: 1, code: 'B' }),
        tp({ id: 'e', text: 'kode-a', percent: 90, atpOrder: 1, sortOrder: 1, code: 'A' }),
      ],
      { narrativeMaxItems: 5 },
    )!;
    // sortOrder 1 + atp 1: kode A, kode B, lalu tanpa kode (null terakhir); lalu atp-1 (sortOrder 5); lalu atp-2.
    expect(r.high.map((h) => h.text)).toEqual(['kode-a', 'kode-b', 'atp-1-urut-kecil', 'atp-1', 'atp-2']);
  });

  it('persen kosong (keputusan guru tanpa angka) diurutkan sesudah yang berangka di kedua sisi', () => {
    const r = buildObjectiveNarrative(
      [
        tp({ text: 'tanpa-angka-tinggi', achieved: true, percent: null }),
        tp({ text: 'rendah-angka', achieved: true, percent: 10 }),
        tp({ text: 'tanpa-angka-rendah', achieved: false, percent: null }),
        tp({ text: 'belum-angka', achieved: false, percent: 90 }),
      ],
      { narrativeMaxItems: 5 },
    )!;
    expect(r.high.map((h) => h.text)).toEqual(['rendah-angka', 'tanpa-angka-tinggi']);
    expect(r.low.map((h) => h.text)).toEqual(['belum-angka', 'tanpa-angka-rendah']);
  });

  it('batas item per sisi mengikuti pengaturan (1..5)', () => {
    const many = Array.from({ length: 8 }, (_, i) => tp({ text: `T${i}`, percent: 90 - i }));
    expect(buildObjectiveNarrative(many, { narrativeMaxItems: 1 })!.high).toHaveLength(1);
    expect(buildObjectiveNarrative(many, { narrativeMaxItems: 3 })!.high).toHaveLength(3);
    expect(buildObjectiveNarrative(many, { narrativeMaxItems: 5 })!.high).toHaveLength(5);
    // Di luar rentang dijepit.
    expect(buildObjectiveNarrative(many, { narrativeMaxItems: 99 })!.high).toHaveLength(5);
    expect(buildObjectiveNarrative(many, { narrativeMaxItems: 0 })!.high).toHaveLength(1);
  });

  it('semua tercapai: kalimat "perlu bimbingan" dihilangkan (K6); tidak ada yang tercapai: kalimat tinggi hilang', () => {
    const allDone = buildObjectiveNarrative([
      tp({ text: 'A', percent: 90 }),
      tp({ text: 'B', percent: 80 }),
    ])!;
    expect(allDone.low).toEqual([]);
    expect(allDone.text).toBe('Menunjukkan penguasaan yang baik dalam A dan B.');
    expect(allDone.text).not.toContain('Perlu bimbingan');
    const none = buildObjectiveNarrative([tp({ text: 'A', achieved: false, percent: 10 })])!;
    expect(none.high).toEqual([]);
    expect(none.text).toBe('Perlu bimbingan dalam A.');
  });

  it('templat sekolah menggantikan templat bawaan; {tp} muncul di mana saja dan boleh berulang', () => {
    const r = buildObjectiveNarrative(
      [tp({ text: 'Menghitung luas.', percent: 90 }), tp({ text: 'Menalar', achieved: false, percent: 30 })],
      { narrativeHighTemplate: 'Sangat menguasai {tp}.', narrativeLowTemplate: 'Latih lagi: {tp} ({tp})' },
    )!;
    // Titik penutup teks TP dibuang agar tidak ganda.
    expect(r.text).toBe('Sangat menguasai Menghitung luas. Latih lagi: Menalar (Menalar)');
    // Templat tidak ditafsirkan sebagai pola ganti ($&).
    const dollar = buildObjectiveNarrative([tp({ text: 'X' })], { narrativeHighTemplate: 'Bagus $& {tp}' })!;
    expect(dollar.text).toBe('Bagus $& X');
  });

  it('tiga TP digabung dengan koma dan "dan"; spasi ganda dirapikan; snapshot menyimpan teks TP apa adanya', () => {
    const r = buildObjectiveNarrative(
      [
        tp({ text: 'Satu  \n satu', percent: 90 }),
        tp({ text: 'Dua', percent: 80 }),
        tp({ text: 'Tiga', percent: 70 }),
      ],
      { narrativeMaxItems: 3 },
    )!;
    expect(r.text).toBe('Menunjukkan penguasaan yang baik dalam Satu satu, Dua, dan Tiga.');
    expect(r.high[0]!.text).toBe('Satu  \n satu');
  });

  it('templat bawaan konsisten dan hasil tidak bergantung urutan masukan', () => {
    expect(DEFAULT_NARRATIVE_HIGH_TEMPLATE).toContain('{tp}');
    expect(DEFAULT_NARRATIVE_LOW_TEMPLATE).toContain('{tp}');
    const a = tp({ text: 'A', percent: 80, atpOrder: 1 });
    const b = tp({ text: 'B', percent: 80, atpOrder: 2 });
    const c = tp({ text: 'C', achieved: false, percent: 10 });
    expect(buildObjectiveNarrative([a, b, c])).toEqual(buildObjectiveNarrative([c, b, a]));
  });

  it('isValidNarrativeTemplate: wajib memuat {tp} dan maksimal 300 karakter', () => {
    expect(isValidNarrativeTemplate('Bagus dalam {tp}.')).toBe(true);
    expect(isValidNarrativeTemplate('Bagus.')).toBe(false);
    expect(isValidNarrativeTemplate(`${'x'.repeat(295)}{tp}`)).toBe(true);
    expect(isValidNarrativeTemplate(`${'x'.repeat(300)}{tp}`)).toBe(false);
  });
});
