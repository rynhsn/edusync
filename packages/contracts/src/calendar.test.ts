import { describe, expect, it } from 'vitest';
import { effectiveDays, toIcs } from './calendar';

function byteLength(s: string) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

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

describe('toIcs', () => {
  it('membuat acara sehari penuh dengan akhir eksklusif, CRLF, dan teks di-escape', () => {
    const ics = toIcs(
      'Tahun 2026/2027',
      [
        {
          id: 'abc',
          title: 'Libur, Idul Fitri; "besar"',
          type: 'holiday',
          startsOn: '2027-03-09',
          endsOn: '2027-03-11',
        },
      ],
      new Date('2026-10-30T10:20:30Z'),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20270309\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20270312\r\n');
    expect(ics).toContain('SUMMARY:Libur\\, Idul Fitri\\; "besar"\r\n');
    expect(ics).toContain('DTSTAMP:20261030T102030Z');
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('melipat baris yang panjang tanpa memotong karakter', () => {
    const title = 'Kegiatan '.repeat(30);
    const ics = toIcs('x', [
      { id: 'a', title, type: 'activity', startsOn: '2026-08-17', endsOn: '2026-08-17' },
    ]);
    for (const line of ics.split('\r\n')) expect(byteLength(line)).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${title}`);
  });
});
