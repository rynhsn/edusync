import { omrQrPayload } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import { scanSheet } from './scan';
import { type Capture, renderCapture, rng, type SheetSpec } from './synthetic-sheet';

const QUESTIONS = 40;
const OPTIONS = 4;
const EXAM = '01a1a41f-595c-7db5-8d30-2a4c37521170';
const STUDENT = '01a19f49-5709-7f52-8dd1-270c5654e24c';
const BLANK = 5;
const DOUBLE = 12;

/** Kunci tetap (acak berbiji): jawaban per soal, dengan satu soal kosong dan satu soal ganda. */
const key = (() => {
  const r = rng(42);
  return Array.from({ length: QUESTIONS }, () => Math.floor(r() * OPTIONS));
})();
const marks = key.map((k, q) => (q === BLANK ? [] : q === DOUBLE ? [1, 2] : [k]));
const expected = key.map((k, q) => (q === BLANK || q === DOUBLE ? null : String.fromCharCode(65 + k)));
const spec = (over: Partial<SheetSpec> = {}): SheetSpec => ({
  questions: QUESTIONS,
  options: OPTIONS,
  marks,
  qrText: omrQrPayload(EXAM, STUDENT),
  ...over,
});

function check(over: Partial<SheetSpec>, cap: Capture) {
  const img = renderCapture(spec(over), cap);
  const t0 = performance.now();
  const res = scanSheet(img, { questions: QUESTIONS, options: OPTIONS });
  return { res, ms: performance.now() - t0, img };
}

function expectKey(res: ReturnType<typeof scanSheet>) {
  expect(res.ok, `reason=${res.reason}`).toBe(true);
  expect(res.answers).toEqual(expected);
  expect(res.flags[BLANK]).toBe('blank');
  expect(res.flags[DOUBLE]).toBe('multiple');
  expect(res.flags.filter((f) => f === 'ok')).toHaveLength(QUESTIONS - 2);
  expect(res.qr).toBe(omrQrPayload(EXAM, STUDENT));
}

describe('pemindai OMR (lembar sintetis)', () => {
  it('lembar bersih: kunci, soal kosong, soal ganda, dan QR terbaca; cukup cepat', () => {
    const { res, ms } = check({}, { scale: 5.6 });
    expectKey(res);
    expect(ms).toBeLessThan(1500);
  }, 60_000);

  it('miring 3 derajat, cahaya tidak merata, derau, dan isian pensil', () => {
    const { res } = check({ fillGray: 125 }, { scale: 5.2, rotateDeg: 3, gradient: 0.25, noise: 6, seed: 7 });
    expectKey(res);
  }, 60_000);

  it('lembar terbalik 180 derajat', () => {
    expectKey(check({}, { scale: 5.2, rotateDeg: 180, noise: 4, seed: 3 }).res);
  }, 60_000);

  it('lembar diputar 90 derajat', () => {
    expectKey(check({}, { scale: 5.2, rotateDeg: 90, noise: 4, seed: 5 }).res);
  }, 60_000);

  it('tekuk perspektif ringan, miring -2 derajat, pensil tipis, dan derau', () => {
    expectKey(
      check({ fillGray: 150 }, { scale: 5.4, rotateDeg: -2, keystone: 0.07, noise: 8, seed: 11 }).res,
    );
  }, 60_000);

  it('meja gelap di sekeliling kertas', () => {
    expectKey(check({}, { scale: 5, rotateDeg: 1.5, surface: 100, seed: 2 }).res);
  }, 60_000);

  it('isian tipis (abu-abu 185) ditandai samar tetapi jawabannya tetap diambil', () => {
    const { res } = check({ fillGray: 185 }, { scale: 5.4, seed: 9 });
    const answered = res.answers.filter((a, q) => a !== null && q !== DOUBLE);
    expect(answered.length).toBeGreaterThan(QUESTIONS - 6);
    expect(res.flags.filter((f) => f === 'faint').length).toBeGreaterThan(0);
    for (let q = 0; q < QUESTIONS; q += 1)
      if (res.answers[q] !== null && q !== DOUBLE) expect(res.answers[q]).toBe(expected[q]);
  }, 60_000);

  it('tanpa penanda sudut: gagal dengan baik', () => {
    const r = rng(1);
    const data = new Uint8ClampedArray(900 * 1200).map(() => 235 + r() * 12);
    const res = scanSheet({ width: 900, height: 1200, data }, { questions: QUESTIONS, options: OPTIONS });
    expect(res).toMatchObject({ ok: false, reason: 'markers', qr: null });
    expect(res.answers).toHaveLength(QUESTIONS);
  });

  it('pembaca QR bisa disuntikkan; QR hilang hanya memberi peringatan', () => {
    const img = renderCapture(spec(), { scale: 5, seed: 4 });
    const res = scanSheet(img, { questions: QUESTIONS, options: OPTIONS, decodeQr: () => null });
    expect(res.ok).toBe(true);
    expect(res.qr).toBeNull();
    expect(res.warnings).toContain('qr');
    expect(res.answers).toEqual(expected);
  }, 60_000);
});
