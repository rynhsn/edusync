import { describe, expect, it } from 'vitest';
import {
  celestial,
  compactRupiah,
  describeBuildings,
  idleFigureCount,
  idleLateCount,
  lateDelta,
  litWindowCount,
  MAX_MOVING,
  mapSummaryParts,
  mergeActivity,
  parseMinutes,
  periodStarted,
  planArrivals,
  routeTiming,
  seededRandom,
  skyPhase,
  yardSlots,
} from './logic';
import type { LiveEvent, LiveSnapshot } from './types';

const ev = (id: string, at = '2026-10-30T00:00:00Z'): LiveEvent => ({
  id,
  kind: 'arrival',
  at,
  className: '7A',
  studentName: 'X',
});

const snapshot = (over: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
  date: '2026-10-30',
  time: '08:15',
  closed: null,
  attendance: { total: 100, present: 70, late: 5, excused: 2, sick: 3, absent: 0, notYet: 20 },
  lessons: { running: [], currentPeriod: null, nextPeriodStartsAt: null, unfilled: 0 },
  finance: { openInvoices: 3, outstanding: 12_500_000, overdueOutstanding: 2_000_000, paidToday: 0 },
  messaging: { queued: 4, failed24h: 1 },
  extracurricular: { sessionsToday: 2 },
  ...over,
});

describe('skyPhase', () => {
  it('memetakan jam ke fase langit', () => {
    expect(skyPhase('03:00')).toBe('night');
    expect(skyPhase('05:30')).toBe('morning');
    expect(skyPhase('09:59')).toBe('morning');
    expect(skyPhase('10:00')).toBe('noon');
    expect(skyPhase('15:29')).toBe('noon');
    expect(skyPhase('15:30')).toBe('evening');
    expect(skyPhase('18:44')).toBe('evening');
    expect(skyPhase('18:45')).toBe('night');
    expect(skyPhase('23:59')).toBe('night');
  });

  it('membaca format HH:MM:SS dan ISO, dan jatuh ke siang bila tak terbaca', () => {
    expect(parseMinutes('07:05:33')).toBe(425);
    expect(parseMinutes('2026-10-30T19:10:00+07:00')).toBe(19 * 60 + 10);
    expect(parseMinutes('abc')).toBeNull();
    expect(parseMinutes('25:00')).toBeNull();
    expect(skyPhase('abc')).toBe('noon');
  });
});

describe('celestial', () => {
  it('matahari di siang hari dan bulan di malam hari', () => {
    expect(celestial('12:00')).toEqual({ body: 'sun', progress: 0.5 });
    expect(celestial('05:30').progress).toBe(0);
    expect(celestial('18:30').progress).toBe(1);
    expect(celestial('22:00').body).toBe('moon');
    expect(celestial('02:00').body).toBe('moon');
    const late = celestial('04:00').progress;
    expect(late).toBeGreaterThan(celestial('22:00').progress);
    expect(late).toBeLessThanOrEqual(1);
  });
});

describe('idleFigureCount', () => {
  it('sebanding dengan proporsi hadir dan dibatasi 30', () => {
    expect(idleFigureCount(0, 100)).toBe(0);
    expect(idleFigureCount(50, 100)).toBe(15);
    expect(idleFigureCount(100, 100)).toBe(30);
    expect(idleFigureCount(500, 100)).toBe(30);
  });

  it('minimal satu bila ada yang hadir, nol bila total kosong', () => {
    expect(idleFigureCount(1, 1000)).toBe(1);
    expect(idleFigureCount(5, 0)).toBe(0);
  });

  it('porsi sosok terlambat', () => {
    expect(idleLateCount(30, 75, 5)).toBe(2);
    expect(idleLateCount(30, 75, 0)).toBe(0);
    expect(idleLateCount(0, 75, 5)).toBe(0);
    expect(idleLateCount(10, 10, 10)).toBe(10);
  });

  it('selisih keterlambatan tidak pernah negatif', () => {
    expect(lateDelta(2, 5)).toBe(3);
    expect(lateDelta(5, 2)).toBe(0);
    expect(lateDelta(null, 5)).toBe(0);
  });
});

describe('yardSlots', () => {
  const rect = { x0: 240, y0: 340, x1: 650, y1: 440 };

  it('deterministik, di dalam halaman, dan sejumlah yang diminta', () => {
    const a = yardSlots(rect, 30, 7);
    const b = yardSlots(rect, 30, 7);
    expect(a).toEqual(b);
    expect(a).toHaveLength(30);
    for (const [x, y] of a) {
      expect(x).toBeGreaterThanOrEqual(rect.x0);
      expect(x).toBeLessThanOrEqual(rect.x1);
      expect(y).toBeGreaterThanOrEqual(rect.y0);
      expect(y).toBeLessThanOrEqual(rect.y1);
    }
    expect(yardSlots(rect, 10)).toHaveLength(10);
  });

  it('generator acak berbenih memberi urutan yang sama', () => {
    const r1 = seededRandom(1);
    const r2 = seededRandom(1);
    expect([r1(), r1()]).toEqual([r2(), r2()]);
  });
});

describe('planArrivals', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ev(`e${i}`));

  it('memberi jeda 300-700 ms antar sosok', () => {
    const plan = planArrivals(many(6), {
      nowMs: 1000,
      nextFreeAt: 0,
      active: 0,
      pending: 0,
      rand: () => 0.5,
    });
    expect(plan.items[0]?.startAt).toBe(1000);
    for (let i = 1; i < plan.items.length; i++) {
      const gap = (plan.items[i]?.startAt as number) - (plan.items[i - 1]?.startAt as number);
      expect(gap).toBeGreaterThanOrEqual(300);
      expect(gap).toBeLessThanOrEqual(700);
    }
    const min = planArrivals(many(2), { nowMs: 0, nextFreeAt: 0, active: 0, pending: 0, rand: () => 0 });
    const max = planArrivals(many(2), { nowMs: 0, nextFreeAt: 0, active: 0, pending: 0, rand: () => 0.9999 });
    expect(min.items[1]?.startAt).toBe(300);
    expect(max.items[1]?.startAt).toBeCloseTo(700, 0);
  });

  it('melanjutkan dari antrean yang masih berjalan', () => {
    const plan = planArrivals(many(1), {
      nowMs: 1000,
      nextFreeAt: 3000,
      active: 0,
      pending: 3,
      rand: () => 0,
    });
    expect(plan.items[0]?.startAt).toBe(3000);
    expect(plan.nextFreeAt).toBe(3300);
  });

  it('mengabaikan kelebihan kapasitas dengan halus', () => {
    const plan = planArrivals(many(50), { nowMs: 0, nextFreeAt: 0, active: 10, pending: 5, rand: () => 0 });
    expect(plan.items).toHaveLength(MAX_MOVING - 15);
    expect(plan.dropped).toBe(50 - (MAX_MOVING - 15));
  });

  it('tidak menjadwalkan apa pun bila sudah penuh, dan nextFreeAt tidak berubah', () => {
    const plan = planArrivals(many(3), { nowMs: 0, nextFreeAt: 123, active: MAX_MOVING, pending: 0 });
    expect(plan.items).toHaveLength(0);
    expect(plan.dropped).toBe(3);
    expect(plan.nextFreeAt).toBe(123);
  });

  it('membuang peristiwa yang jatuh terlalu jauh ke depan', () => {
    const plan = planArrivals(many(2), { nowMs: 0, nextFreeAt: 60_000, active: 0, pending: 0 });
    expect(plan.items).toHaveLength(0);
    expect(plan.dropped).toBe(2);
  });
});

describe('routeTiming', () => {
  it('menghitung offset menurut jarak dan lama menurut kecepatan', () => {
    const t = routeTiming(
      [
        [0, 0],
        [30, 40],
        [30, 140],
      ],
      50,
    );
    expect(t.offsets).toEqual([0, 0.333_333_333_333_333_3, 1]);
    expect(t.duration).toBe(3000);
  });

  it('rute tanpa jarak tidak membagi nol', () => {
    expect(
      routeTiming(
        [
          [1, 1],
          [1, 1],
        ],
        50,
      ),
    ).toEqual({ offsets: [0, 0], duration: 0 });
  });
});

describe('mergeActivity', () => {
  it('menaruh yang terbaru dahulu, tanpa duplikat, maks 8', () => {
    const prev = [ev('a', '2026-10-30T01:00:00Z'), ev('b', '2026-10-30T02:00:00Z')];
    const incoming = [ev('b', '2026-10-30T02:00:00Z'), ev('c', '2026-10-30T03:00:00Z')];
    expect(mergeActivity(prev, incoming).map((e) => e.id)).toEqual(['c', 'b', 'a']);
    const lots = Array.from({ length: 12 }, (_, i) => ev(`x${i}`, `2026-10-30T0${i % 10}:00:00Z`));
    expect(mergeActivity([], lots)).toHaveLength(8);
  });
});

describe('jendela dan lonceng', () => {
  it('jendela menyala sebanyak kelas berlangsung, dibatasi, dan padam saat libur', () => {
    expect(litWindowCount(3, 8, false)).toBe(3);
    expect(litWindowCount(20, 8, false)).toBe(8);
    expect(litWindowCount(3, 8, true)).toBe(0);
    expect(litWindowCount(-1, 8, false)).toBe(0);
  });

  it('lonceng hanya berbunyi saat jam berubah setelah pemuatan pertama', () => {
    expect(periodStarted(undefined, 1)).toBeNull();
    expect(periodStarted(1, 2)).toBe(2);
    expect(periodStarted(2, 2)).toBeNull();
    expect(periodStarted(null, 1)).toBe(1);
    expect(periodStarted(3, null)).toBeNull();
  });
});

describe('compactRupiah', () => {
  it('meringkas nominal', () => {
    expect(compactRupiah(0)).toBe('Rp 0');
    expect(compactRupiah(750)).toBe('Rp 750');
    expect(compactRupiah(750_000)).toBe('Rp 750 rb');
    expect(compactRupiah(12_500_000)).toBe('Rp 12,5 jt');
    expect(compactRupiah(3_200_000_000)).toBe('Rp 3,2 M');
    expect(compactRupiah(-1_500)).toBe('-Rp 1,5 rb');
  });
});

describe('describeBuildings', () => {
  it('mengisi lencana dari snapshot', () => {
    const b = describeBuildings(snapshot(), { onDuty: true });
    expect(b.gate?.primary).toBe('75/100');
    expect(b.gate?.lines.map((l) => l.key)).toEqual(['gateMain', 'gateLate', 'gateNotYet']);
    expect(b.office?.primary).toBe('Rp 12,5 jt');
    expect(b.office?.attention).toBe(true);
    expect(b.office?.lines[1]?.values.amount).toBe('Rp 2.000.000');
    expect(b.mail?.attention).toBe(true);
    expect(b.field?.primary).toBe('2');
    expect(b.teachers?.accent).toBe(true);
  });

  it('bagian null membuat bangunan tidak aktif', () => {
    const b = describeBuildings(snapshot({ finance: null, messaging: null, attendance: null }), {});
    expect(b.office).toBeNull();
    expect(b.mail).toBeNull();
    expect(b.gate).toBeNull();
    expect(b.teachers).toBeNull();
    expect(b.classes).not.toBeNull();
  });

  it('jam belum diabsen menandai gedung kelas', () => {
    const b = describeBuildings(
      snapshot({
        lessons: {
          running: [
            { className: '7A', subjectName: 'IPA', periodNumber: 2, startsAt: '08:00', endsAt: '08:40' },
          ],
          currentPeriod: 2,
          nextPeriodStartsAt: null,
          unfilled: 2,
        },
      }),
    );
    expect(b.classes?.primary).toBe('1');
    expect(b.classes?.attention).toBe(true);
    expect(b.classes?.lines.map((l) => l.key)).toEqual(['classesMain', 'classesUnfilled']);
  });

  it('tanpa snapshot semua bangunan nonaktif', () => {
    const b = describeBuildings(null);
    expect(Object.values(b).every((v) => v === null)).toBe(true);
  });
});

describe('mapSummaryParts', () => {
  it('ringkasan hadir dan kelas berlangsung', () => {
    expect(mapSummaryParts(snapshot()).map((p) => p.key)).toEqual(['summaryAttendance', 'summaryLessons']);
    expect(mapSummaryParts(snapshot())[0]?.values).toEqual({ present: 75, total: 100, late: 5 });
  });

  it('libur dan tanpa data', () => {
    const closed = mapSummaryParts(snapshot({ closed: { type: 'holiday', title: 'Maulid' } }));
    expect(closed).toEqual([{ key: 'summaryClosed', values: { title: 'Maulid' } }]);
    expect(mapSummaryParts(null)[0]?.key).toBe('summaryNone');
    expect(mapSummaryParts(snapshot({ attendance: null, lessons: null }))[0]?.key).toBe('summaryNone');
  });
});
