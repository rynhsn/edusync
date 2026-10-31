import { describe, expect, it } from 'vitest';
import { buildYearPlanner, effectiveDays } from './calendar';

describe('effectiveDays', () => {
  it('menghitung hari kerja Senin–Jumat dan Senin–Sabtu', () => {
    // 2026-07-13 (Senin) sampai 2026-07-19 (Minggu).
    const week = { startsOn: '2026-07-13', endsOn: '2026-07-19' };
    expect(effectiveDays(week, [])).toEqual({ total: 7, workdays: 5, nonEffective: 0, effective: 5 });
    expect(effectiveDays(week, [], 6).workdays).toBe(6);
  });

  it('libur dan jeda mengurangi hari efektif, yang tumpang tindih tidak dihitung ganda', () => {
    const week = { startsOn: '2026-07-13', endsOn: '2026-07-19' };
    const closures = [
      { startsOn: '2026-07-14', endsOn: '2026-07-15' },
      { startsOn: '2026-07-15', endsOn: '2026-07-16' }, // tumpang tindih di hari Rabu
      { startsOn: '2026-07-18', endsOn: '2026-07-19' }, // akhir pekan: tidak mengurangi apa pun
    ];
    expect(effectiveDays(week, closures)).toEqual({ total: 7, workdays: 5, nonEffective: 3, effective: 2 });
  });

  it('libur di luar rentang diabaikan', () => {
    const week = { startsOn: '2026-07-13', endsOn: '2026-07-17' };
    expect(effectiveDays(week, [{ startsOn: '2026-01-01', endsOn: '2026-12-31' }]).effective).toBe(0);
    expect(effectiveDays(week, [{ startsOn: '2027-01-01', endsOn: '2027-01-02' }]).effective).toBe(5);
  });

  it('tahun ajaran penuh', () => {
    const year = effectiveDays({ startsOn: '2026-07-13', endsOn: '2027-06-30' }, []);
    expect(year.total).toBe(353);
    expect(year.workdays).toBe(253); // 50 pekan penuh (250) + Senin, Selasa, Rabu terakhir
  });
});

describe('buildYearPlanner', () => {
  it('membuat grid bulan dari bulan mulai sampai bulan akhir, minggu dimulai Senin', () => {
    const months = buildYearPlanner({ startsOn: '2026-07-13', endsOn: '2026-09-30' }, []);
    expect(months.map((m) => [m.year, m.month])).toEqual([
      [2026, 6],
      [2026, 7],
      [2026, 8],
    ]);
    // 1 Juli 2026 hari Rabu: minggu pertama diisi dua sel kosong (Sen, Sel) sebelum tanggal 1.
    const july = months[0]!;
    expect(july.weeks[0]!.map((c) => c.inMonth)).toEqual([false, false, true, true, true, true, true]);
    expect(july.weeks.every((w) => w.length === 7)).toBe(true);
    expect(july.weeks.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });

  it('hari sebelum tahun ajaran dimulai tidak bertanda; akhir pekan ditandai; libur mengalahkan jeda dan ujian', () => {
    const months = buildYearPlanner({ startsOn: '2026-07-13', endsOn: '2026-07-31' }, [
      { type: 'exam', startsOn: '2026-07-20', endsOn: '2026-07-22' },
      { type: 'break', startsOn: '2026-07-21', endsOn: '2026-07-23' },
      { type: 'holiday', startsOn: '2026-07-22', endsOn: '2026-07-22' },
    ]);
    const cell = (d: string) => months[0]!.weeks.flat().find((c) => c.date === d && c.inMonth)!;
    expect(cell('2026-07-10').kind).toBeNull(); // sebelum dimulai, Jumat
    expect(cell('2026-07-11').kind).toBeNull(); // sebelum dimulai, Sabtu: tetap tanpa penanda
    expect(cell('2026-07-18').kind).toBe('weekend');
    expect(cell('2026-07-20').kind).toBe('exam');
    expect(cell('2026-07-21').kind).toBe('break'); // jeda mengalahkan ujian
    expect(cell('2026-07-22').kind).toBe('holiday'); // libur mengalahkan jeda
    expect(cell('2026-07-23').kind).toBe('break');
    expect(cell('2026-07-24').kind).toBeNull();
  });

  it('tahun ajaran penuh mencakup 12 bulan', () => {
    expect(buildYearPlanner({ startsOn: '2026-07-13', endsOn: '2027-06-30' }, [])).toHaveLength(12);
  });
});

describe('effectiveDays dengan hari efektif sekolah', () => {
  const week = { startsOn: '2026-10-26', endsOn: '2026-11-01' }; // Senin-Minggu
  it('daftar hari menggantikan 5/6', () => {
    expect(effectiveDays(week, [], [1, 2, 3, 4, 5]).workdays).toBe(5);
    expect(effectiveDays(week, [], [1, 2, 3, 4, 5, 6]).workdays).toBe(6);
    expect(effectiveDays(week, [], [6, 7]).workdays).toBe(2);
    expect(effectiveDays(week, [], [1, 2, 3, 4, 5, 6, 7]).workdays).toBe(7);
  });
});
