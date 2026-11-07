import { describe, expect, it } from 'vitest';
import {
  classifyScan,
  DEBOUNCE_MS,
  DIRECTION_KEY,
  dequeueScan,
  enqueueScan,
  FOREIGN_COOLDOWN_MS,
  loadDirection,
  loadScanQueue,
  MAX_QUEUE_AGE_MS,
  MAX_SCAN_QUEUE,
  manualInputToPayload,
  newClientId,
  pushRecent,
  RECENT_MAX,
  replaceRecent,
  resultKind,
  type ScanEntry,
  type ScanQueueItem,
  saveDirection,
  saveScanQueue,
  scanBody,
  scanQueueKey,
  shouldHandle,
  shouldNotifyForeign,
  splitExpired,
  toneOf,
} from './scan-logic';

describe('shouldNotifyForeign', () => {
  it('memberitahu sekali, lalu diam selama masa jeda untuk kode yang sama', () => {
    const seen = new Map<string, number>();
    expect(shouldNotifyForeign(seen, 'https://contoh.id', 0)).toBe(true);
    expect(shouldNotifyForeign(seen, 'https://contoh.id', 100)).toBe(false);
    expect(shouldNotifyForeign(seen, ' https://contoh.id ', FOREIGN_COOLDOWN_MS - 1)).toBe(false);
    expect(shouldNotifyForeign(seen, 'https://contoh.id', FOREIGN_COOLDOWN_MS)).toBe(true);
  });

  it('kode asing berbeda langsung diberitahukan; teks kosong tidak', () => {
    const seen = new Map<string, number>();
    expect(shouldNotifyForeign(seen, 'A', 0)).toBe(true);
    expect(shouldNotifyForeign(seen, 'B', 10)).toBe(true);
    expect(shouldNotifyForeign(seen, '   ', 20)).toBe(false);
    expect(shouldNotifyForeign(seen, null, 20)).toBe(false);
  });

  it('tidak menyentuh debounce pindaian sah', () => {
    const scans = new Map<string, number>();
    const foreign = new Map<string, number>();
    shouldNotifyForeign(foreign, 'x', 0);
    expect(scans.size).toBe(0);
  });
});

const CODE = 'ABCDEFGHJKMNPQRSTVWX';
const PAYLOAD = `ES1.${CODE}`;

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

const item = (clientId: string, over: Partial<ScanQueueItem> = {}): ScanQueueItem => ({
  clientId,
  payload: PAYLOAD,
  direction: 'in',
  at: '2026-11-07T00:05:00.000Z',
  force: false,
  ...over,
});

describe('classifyScan', () => {
  it('QR asing diabaikan, berawalan ES1. tetapi rusak dianggap tidak sah, yang benar dinormalkan', () => {
    expect(classifyScan('https://contoh.id')).toEqual({ kind: 'ignore' });
    expect(classifyScan('WIFI:S:x;;')).toEqual({ kind: 'ignore' });
    expect(classifyScan('')).toEqual({ kind: 'ignore' });
    expect(classifyScan(null)).toEqual({ kind: 'ignore' });
    expect(classifyScan('ES1.ABC')).toEqual({ kind: 'invalid' });
    expect(classifyScan(`ES1.${CODE}Z`)).toEqual({ kind: 'invalid' });
    expect(classifyScan(PAYLOAD)).toEqual({ kind: 'ok', payload: PAYLOAD });
    expect(classifyScan(`  es1.${CODE.toLowerCase()}\n`)).toEqual({ kind: 'ok', payload: PAYLOAD });
  });
});

describe('manualInputToPayload', () => {
  it('menerima dengan atau tanpa awalan, mengabaikan spasi dan tanda hubung', () => {
    expect(manualInputToPayload(PAYLOAD)).toBe(PAYLOAD);
    expect(manualInputToPayload(CODE)).toBe(PAYLOAD);
    expect(manualInputToPayload(` es1.${CODE.slice(0, 10)} - ${CODE.slice(10)} `)).toBe(PAYLOAD);
    expect(manualInputToPayload('')).toBeNull();
    expect(manualInputToPayload('ES1.')).toBeNull();
    expect(manualInputToPayload('ABC')).toBeNull();
    expect(manualInputToPayload(`${CODE}I`)).toBeNull();
  });
});

describe('shouldHandle (debounce)', () => {
  it('mengabaikan payload sama dalam 4 detik, memproses lagi setelahnya, payload lain tidak terpengaruh', () => {
    const seen = new Map<string, number>();
    expect(DEBOUNCE_MS).toBe(4000);
    expect(shouldHandle(seen, 'A', 1000)).toBe(true);
    expect(shouldHandle(seen, 'A', 1200)).toBe(false);
    expect(shouldHandle(seen, 'A', 4999)).toBe(false);
    expect(shouldHandle(seen, 'B', 1500)).toBe(true);
    expect(shouldHandle(seen, 'A', 5000)).toBe(true);
    // entri kedaluwarsa dibersihkan
    expect(shouldHandle(seen, 'C', 5600)).toBe(true);
    expect(seen.has('B')).toBe(false);
  });

  it('pembacaan yang ditolak tidak memperpanjang jendela', () => {
    const seen = new Map<string, number>();
    shouldHandle(seen, 'A', 0);
    shouldHandle(seen, 'A', 3000);
    expect(shouldHandle(seen, 'A', 4000)).toBe(true);
  });
});

describe('antrean luring', () => {
  it('kunci per sekolah; simpan lalu muat kembali', () => {
    const s = memory();
    const key = scanQueueKey('sekolah-1');
    expect(key).toContain('sekolah-1');
    expect(saveScanQueue(s, key, [item('a'), item('b', { direction: 'out' })])).toBe(true);
    expect(loadScanQueue(s, key).map((i) => i.clientId)).toEqual(['a', 'b']);
  });

  it('isi rusak, entri tidak sah, atau penyimpanan tak tersedia menghasilkan antrean aman', () => {
    const s = memory();
    s.setItem('k', '{rusak');
    expect(loadScanQueue(s, 'k')).toEqual([]);
    s.setItem(
      'k',
      JSON.stringify([item('ok'), { clientId: 'x' }, { ...item('y'), direction: 'sideways' }, 3]),
    );
    expect(loadScanQueue(s, 'k').map((i) => i.clientId)).toEqual(['ok']);
    expect(loadScanQueue(null, 'k')).toEqual([]);
    expect(saveScanQueue(null, 'k', [])).toBe(false);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(saveScanQueue(full, 'k', [item('a')])).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    };
    expect(loadScanQueue(broken, 'k')).toEqual([]);
  });

  it('enqueue tidak menggandakan clientId dan membatasi panjang; dequeue membuang', () => {
    let q: ScanQueueItem[] = [];
    q = enqueueScan(q, item('a'));
    q = enqueueScan(q, item('a', { direction: 'out' }));
    expect(q).toHaveLength(1);
    expect(q[0]?.direction).toBe('out');
    q = enqueueScan(q, item('b'));
    expect(dequeueScan(q, ['a']).map((i) => i.clientId)).toEqual(['b']);

    let big: ScanQueueItem[] = [];
    for (let i = 0; i < MAX_SCAN_QUEUE + 5; i++) big = enqueueScan(big, item(`c${i}`));
    expect(big).toHaveLength(MAX_SCAN_QUEUE);
    expect(big[0]?.clientId).toBe('c5');
  });

  it('splitExpired memisahkan pindaian lebih dari batas umur server', () => {
    const now = Date.parse('2026-11-07T12:00:00.000Z');
    const fresh = item('f', { at: new Date(now - 3600_000).toISOString() });
    const old = item('o', { at: new Date(now - MAX_QUEUE_AGE_MS - 1000).toISOString() });
    const res = splitExpired([fresh, old], now);
    expect(res.fresh.map((i) => i.clientId)).toEqual(['f']);
    expect(res.expired.map((i) => i.clientId)).toEqual(['o']);
  });

  it('scanBody membawa jam asli dan clientId tetap', () => {
    expect(scanBody(item('abc', { force: true }))).toEqual({
      payload: PAYLOAD,
      direction: 'in',
      at: '2026-11-07T00:05:00.000Z',
      clientId: 'abc',
      force: true,
    });
  });

  it('newClientId unik, aman sebagai kunci, tidak lebih dari 64 karakter', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newClientId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(64);
      expect(id).toMatch(/^qr-[0-9a-z]+-[0-9a-z]{8}$/);
    }
  });
});

describe('arah tersimpan', () => {
  it('bawaan datang; pulang bertahan; kegagalan penyimpanan tidak melempar', () => {
    const s = memory();
    expect(loadDirection(s)).toBe('in');
    expect(saveDirection(s, 'out')).toBe(true);
    expect(s.m.get(DIRECTION_KEY)).toBe('out');
    expect(loadDirection(s)).toBe('out');
    s.setItem(DIRECTION_KEY, 'apa-saja');
    expect(loadDirection(s)).toBe('in');
    expect(loadDirection(null)).toBe('in');
    expect(saveDirection(null, 'out')).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    expect(loadDirection(broken)).toBe('in');
    expect(saveDirection(broken, 'out')).toBe(false);
  });
});

describe('hasil', () => {
  it('resultKind dan toneOf', () => {
    const base = { late: false, warning: null } as const;
    expect(resultKind({ ...base, result: 'in' })).toBe('in');
    expect(resultKind({ ...base, late: true, result: 'in' })).toBe('inLate');
    expect(resultKind({ ...base, result: 'out' })).toBe('out');
    expect(resultKind({ ...base, warning: 'no_check_in', result: 'out' })).toBe('outNoCheckIn');
    expect(resultKind({ ...base, result: 'already_in' })).toBe('already_in');
    expect(toneOf('in')).toBe('success');
    expect(toneOf('out')).toBe('success');
    expect(toneOf('inLate')).toBe('warn');
    expect(toneOf('queued')).toBe('warn');
    expect(toneOf('error')).toBe('error');
  });

  it('daftar pindaian sesi: terbaru di depan, maksimal 20, ganti berdasarkan id', () => {
    const e = (id: string, over: Partial<ScanEntry> = {}): ScanEntry => ({
      id,
      at: '2026-11-07T00:00:00.000Z',
      kind: 'in',
      name: id,
      className: '7A',
      time: '07:00',
      direction: 'in',
      ...over,
    });
    let list: ScanEntry[] = [];
    for (let i = 0; i < RECENT_MAX + 4; i++) list = pushRecent(list, e(`s${i}`));
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]?.id).toBe(`s${RECENT_MAX + 3}`);
    expect(list.at(-1)?.id).toBe('s4');
    const replaced = replaceRecent(list, 's10', e('s10', { kind: 'out' }));
    expect(replaced.find((x) => x.id === 's10')?.kind).toBe('out');
    expect(replaceRecent(list, 'tidak-ada', e('x'))).toEqual(list);
  });
});
