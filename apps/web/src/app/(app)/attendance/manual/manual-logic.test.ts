import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../lib/api';
import {
  batchBody,
  buildCorrection,
  type CorrectionForm,
  countersOf,
  type DailyRow,
  dequeue,
  describeResult,
  enqueue,
  hmOf,
  initialCorrection,
  isMarkable,
  isNetworkError,
  itemId,
  loadQueue,
  markAllCandidates,
  parseHm,
  type QueueItem,
  queueKey,
  readTimeInput,
  type ServerResult,
  saveQueue,
  summarizeResults,
  toBatches,
  viewRow,
} from './manual-logic';

const TZ = 'Asia/Jakarta';

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: itemId('2026-11-09', 'in', 's1'),
  date: '2026-11-09',
  direction: 'in',
  studentId: 's1',
  name: 'Budi',
  at: '07:05',
  force: false,
  ...over,
});

const row = (over: Partial<DailyRow> = {}): DailyRow => ({
  studentId: 's1',
  name: 'Budi',
  nis: '001',
  className: 'X-A',
  status: null,
  checkInAt: null,
  checkOutAt: null,
  note: null,
  ...over,
});

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('parseHm', () => {
  it('menerima berbagai bentuk jam dan menormalkannya', () => {
    expect(parseHm('07:05')).toBe('07:05');
    expect(parseHm('7:05')).toBe('07:05');
    expect(parseHm('07.05')).toBe('07:05');
    expect(parseHm('0705')).toBe('07:05');
    expect(parseHm('705')).toBe('07:05');
    expect(parseHm(' 23:59 ')).toBe('23:59');
    expect(parseHm('00:00')).toBe('00:00');
  });

  it('menolak jam yang tidak sah', () => {
    for (const bad of ['', '  ', '24:00', '12:60', '7', '12:5', 'ab:cd', '12:345', '-1:00']) {
      expect(parseHm(bad), bad).toBeNull();
    }
  });

  it('readTimeInput: kosong berarti sekarang, salah ketik ditandai', () => {
    expect(readTimeInput('')).toEqual({ ok: true, at: null });
    expect(readTimeInput('7:30')).toEqual({ ok: true, at: '07:30' });
    expect(readTimeInput('99:99')).toEqual({ ok: false });
  });
});

describe('hmOf', () => {
  it('memakai zona waktu sekolah', () => {
    expect(hmOf('2026-11-09T00:05:00.000Z', 'Asia/Jakarta')).toBe('07:05');
    expect(hmOf('2026-11-09T00:05:00.000Z', 'Asia/Makassar')).toBe('08:05');
    expect(hmOf(null, TZ)).toBe('');
    expect(hmOf('bukan tanggal', TZ)).toBe('');
  });
});

describe('isNetworkError', () => {
  it('kegagalan fetch dianggap jaringan, jawaban server bukan', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('Network request failed'))).toBe(true);
    expect(isNetworkError(new ApiError('x', 403, 'forbidden_class'))).toBe(false);
    expect(isNetworkError(new ApiError('x', 500))).toBe(false);
    expect(isNetworkError(new Error('lain'))).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe('antrean luring', () => {
  it('menyimpan dan membaca kembali', () => {
    const s = memory();
    const key = queueKey('sch');
    expect(saveQueue(s, key, [item()])).toBe(true);
    expect(loadQueue(s, key)).toEqual([item()]);
  });

  it('tahan terhadap isi rusak, entri tidak sah, dan penyimpanan yang melempar', () => {
    const key = queueKey('sch');
    expect(loadQueue(memory({ [key]: '{rusak' }), key)).toEqual([]);
    expect(loadQueue(memory({ [key]: '{"a":1}' }), key)).toEqual([]);
    expect(loadQueue(memory({ [key]: JSON.stringify([item(), { id: 1 }]) }), key)).toEqual([item()]);
    expect(loadQueue(null, key)).toEqual([]);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadQueue(throwing, key)).toEqual([]);
    expect(saveQueue(throwing, key, [item()])).toBe(false);
    expect(saveQueue(undefined, key, [item()])).toBe(false);
  });

  it('antrean tiap sekolah terpisah', () => {
    expect(queueKey('a')).not.toBe(queueKey('b'));
  });

  it('enqueue mengganti entri siswa/tanggal/arah yang sama dan mempertahankan yang lain', () => {
    const a = item();
    const b = item({ id: itemId('2026-11-09', 'in', 's2'), studentId: 's2', name: 'Sari' });
    const a2 = item({ at: '07:20' });
    const q = enqueue(enqueue([], [a, b]), [a2]);
    expect(q.map((i) => [i.studentId, i.at])).toEqual([
      ['s2', '07:05'],
      ['s1', '07:20'],
    ]);
  });

  it('datang dan pulang siswa yang sama adalah entri berbeda', () => {
    const out = item({ id: itemId('2026-11-09', 'out', 's1'), direction: 'out', at: '14:00' });
    expect(enqueue([item()], [out])).toHaveLength(2);
  });

  it('dequeue membuang hanya id yang disebut', () => {
    const b = item({ id: 'lain', studentId: 's2' });
    expect(dequeue([item(), b], [item().id])).toEqual([b]);
  });

  it('toBatches mengelompokkan per tanggal, arah, dan force, serta memotong di 200 entri', () => {
    const many = Array.from({ length: 205 }, (_, i) =>
      item({ id: `i${i}`, studentId: `s${i}`, at: '07:00' }),
    );
    const other = [
      item({ id: 'o1', studentId: 'x1', direction: 'out', at: '14:00' }),
      item({ id: 'o2', studentId: 'x2', date: '2026-11-08' }),
      item({ id: 'o3', studentId: 'x3', force: true }),
    ];
    const batches = toBatches([...many, ...other]);
    expect(batches.map((b) => b.items.length)).toEqual([200, 5, 1, 1, 1]);
    expect(batches[0]?.direction).toBe('in');
    expect(batches[2]?.direction).toBe('out');
    expect(batches[4]?.force).toBe(true);
  });

  it('batchBody membawa jam asli tiap entri', () => {
    const [b] = toBatches([item(), item({ id: 'x', studentId: 's2', at: '07:40' })]);
    expect(batchBody(b!)).toEqual({
      date: '2026-11-09',
      direction: 'in',
      force: false,
      entries: [
        { studentId: 's1', at: '07:05' },
        { studentId: 's2', at: '07:40' },
      ],
    });
  });
});

describe('tampilan baris dan penghitung', () => {
  it('catatan yang belum terkirim tampil sebagai sudah tercatat', () => {
    const v = viewRow(row(), 'in', TZ, { direction: 'in', at: '07:10', queued: true });
    expect(v.inAt).toBe('07:10');
    expect(v.done).toBe(true);
    expect(isMarkable(v)).toBe(false);
  });

  it('siswa izin/sakit/alpa tidak bisa ditandai dengan satu ketukan', () => {
    for (const status of ['excused', 'sick', 'absent'] as const) {
      const v = viewRow(row({ status }), 'in', TZ, null);
      expect(v.away).toBe(true);
      expect(isMarkable(v)).toBe(false);
    }
  });

  it('mode pulang menilai selesai dari jam pulang, bukan jam datang', () => {
    const r = row({ status: 'present', checkInAt: '2026-11-09T00:00:00.000Z' });
    expect(viewRow(r, 'in', TZ, null).done).toBe(true);
    const out = viewRow(r, 'out', TZ, null);
    expect(out.done).toBe(false);
    expect(isMarkable(out)).toBe(true);
  });

  it('catatan datang dan pulang yang belum terkirim digabung pada satu baris', () => {
    const v = viewRow(row(), 'out', TZ, [
      { direction: 'in', at: '07:00', queued: true },
      { direction: 'out', at: '14:00', queued: true },
    ]);
    expect([v.inAt, v.outAt, v.done]).toEqual(['07:00', '14:00', true]);
    expect(v.pending?.direction).toBe('out');
  });

  it('markAllCandidates: datang = belum datang & bukan izin; pulang = sudah datang & belum pulang', () => {
    const base = { checkInAt: '2026-11-09T00:00:00.000Z' };
    const views = [
      viewRow(row({ studentId: 'a' }), 'in', TZ, null),
      viewRow(row({ studentId: 'b', status: 'sick' }), 'in', TZ, null),
      viewRow(row({ studentId: 'c', status: 'present', ...base }), 'in', TZ, null),
      viewRow(
        row({ studentId: 'd', status: 'present', ...base, checkOutAt: '2026-11-09T07:00:00.000Z' }),
        'in',
        TZ,
        null,
      ),
    ];
    expect(markAllCandidates(views, 'in').map((v) => v.row.studentId)).toEqual(['a']);
    expect(markAllCandidates(views, 'out').map((v) => v.row.studentId)).toEqual(['c']);
  });

  it('penghitung ringkasan', () => {
    const views = [
      viewRow(
        row({ studentId: 'a', status: 'present', checkInAt: '2026-11-09T00:00:00.000Z' }),
        'in',
        TZ,
        null,
      ),
      viewRow(
        row({
          studentId: 'b',
          status: 'late',
          checkInAt: '2026-11-09T01:00:00.000Z',
          checkOutAt: '2026-11-09T07:00:00.000Z',
        }),
        'in',
        TZ,
        null,
      ),
      viewRow(row({ studentId: 'c', status: 'sick' }), 'in', TZ, null),
      viewRow(row({ studentId: 'd' }), 'in', TZ, null),
      viewRow(row({ studentId: 'e' }), 'in', TZ, { direction: 'in', at: '07:00', queued: false }),
    ];
    expect(countersOf(views)).toEqual({
      total: 5,
      checkedIn: 3,
      checkedOut: 1,
      away: 1,
      late: 1,
      notYet: 1,
    });
  });
});

describe('hasil per entri', () => {
  const r = (over: Partial<ServerResult>): ServerResult => ({
    studentId: 's1',
    name: 'Budi',
    result: 'in',
    at: null,
    status: 'present',
    late: false,
    warning: null,
    ...over,
  });

  it('menerjemahkan satu hasil', () => {
    expect(describeResult(r({}))).toEqual({ key: 'in', warn: false });
    expect(describeResult(r({ late: true, status: 'late' }))).toEqual({ key: 'inLate', warn: false });
    expect(describeResult(r({ result: 'out' }))).toEqual({ key: 'out', warn: false });
    expect(describeResult(r({ result: 'out', warning: 'no_check_in' }))).toEqual({
      key: 'outNoCheckIn',
      warn: true,
    });
    expect(describeResult(r({ result: 'already_in' }))).toEqual({ key: 'already_in', warn: true });
    expect(describeResult(r({ result: 'skipped_status' })).warn).toBe(true);
  });

  it('merangkum massal: berhasil dulu, nama hanya untuk peringatan dan maksimal tiga', () => {
    const lines = summarizeResults([
      r({ studentId: '1', name: 'A', result: 'already_in' }),
      r({ studentId: '2', name: 'B' }),
      r({ studentId: '3', name: 'C', late: true }),
      r({ studentId: '4', name: 'D', result: 'already_in' }),
      r({ studentId: '5', name: 'E', result: 'already_in' }),
      r({ studentId: '6', name: 'F', result: 'already_in' }),
      r({ studentId: '7', name: 'G', result: 'not_found' }),
    ]);
    expect(lines.map((l) => [l.key, l.count])).toEqual([
      ['in', 1],
      ['inLate', 1],
      ['already_in', 4],
      ['not_found', 1],
    ]);
    expect(lines[0]?.names).toEqual([]);
    expect(lines[2]?.names).toEqual(['A', 'D', 'E']);
  });
});

describe('buildCorrection', () => {
  const base: CorrectionForm = { checkIn: '07:05', checkOut: '', status: '', note: '' };

  it('hanya mengirim bidang yang berubah', () => {
    const res = buildCorrection('2026-11-09', base, { ...base, checkOut: '14.30' });
    expect(res).toEqual({ ok: true, body: { date: '2026-11-09', checkOutAt: '14:30' } });
  });

  it('mengosongkan jam dengan null', () => {
    const res = buildCorrection('2026-11-09', base, { ...base, checkIn: '' });
    expect(res).toEqual({ ok: true, body: { date: '2026-11-09', checkInAt: null } });
  });

  it('mengatur status izin dengan catatan', () => {
    const res = buildCorrection(
      '2026-11-09',
      { checkIn: '', checkOut: '', status: '', note: '' },
      { checkIn: '', checkOut: '', status: 'sick', note: ' demam ' },
    );
    expect(res).toEqual({ ok: true, body: { date: '2026-11-09', status: 'sick', note: 'demam' } });
  });

  it('menghapus catatan dengan null', () => {
    const res = buildCorrection('d', { ...base, note: 'x' }, { ...base, note: '  ' });
    expect(res).toEqual({ ok: true, body: { date: 'd', note: null } });
  });

  it('menolak jam salah ketik, jam pulang sebelum datang, dan tanpa perubahan', () => {
    expect(buildCorrection('d', base, { ...base, checkIn: '25:00' })).toEqual({
      ok: false,
      error: 'invalid_time',
    });
    expect(buildCorrection('d', base, { ...base, checkOut: '06:00' })).toEqual({ ok: false, error: 'order' });
    expect(buildCorrection('d', base, { ...base })).toEqual({ ok: false, error: 'no_change' });
  });

  it('initialCorrection mengisi dari baris dan hanya meneruskan status izin/sakit/alpa', () => {
    const f = initialCorrection(
      row({ status: 'late', checkInAt: '2026-11-09T00:05:00.000Z', note: 'a' }),
      TZ,
    );
    expect(f).toEqual({ checkIn: '07:05', checkOut: '', status: '', note: 'a' });
    expect(initialCorrection(row({ status: 'excused' }), TZ).status).toBe('excused');
  });
});
