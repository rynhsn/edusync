import { beforeEach, describe, expect, it } from 'vitest';
import { hasLetterHandoff, saveLetterHandoff, takeLetterHandoff } from './letter-handoff';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

const sample = {
  attachment: { id: 'a1', fileName: 'surat.pdf', mime: 'application/pdf', size: 1200 },
  student: { id: 's1', label: 'Ani' },
  body: 'Yth.',
};

describe('serah-terima surat ke pesan langsung', () => {
  it('sekali pakai: diambil lalu hilang', () => {
    saveLetterHandoff(sample);
    expect(hasLetterHandoff()).toBe(true);
    expect(takeLetterHandoff()).toEqual(sample);
    expect(hasLetterHandoff()).toBe(false);
    expect(takeLetterHandoff()).toBeNull();
  });
  it('isi rusak atau tanpa murid ditangani', () => {
    store.set('edusync.messaging.letterHandoff', '{"x":1}');
    expect(takeLetterHandoff()).toBeNull();
    saveLetterHandoff({ ...sample, student: null });
    expect(takeLetterHandoff()?.student).toBeNull();
    store.set('edusync.messaging.letterHandoff', 'bukan json');
    expect(takeLetterHandoff()).toBeNull();
  });
});
