import { describe, expect, it } from 'vitest';
import {
  classNamesFromReportFinal,
  formatFrozenAt,
  isFromReport,
  originMessageKey,
  syncAction,
  syncedSemesterIdOf,
} from './grading-config';

describe('originMessageKey', () => {
  it('memetakan setiap asal pembekuan ke kuncinya', () => {
    for (const o of ['finalize', 'semester_closed', 'sync', 'backfill', 'manual']) {
      expect(originMessageKey(o)).toBe(`freezeOrigin_${o}`);
    }
  });
  it('asal tak dikenal, kosong, atau null jatuh ke teks netral', () => {
    expect(originMessageKey('masa_depan')).toBe('freezeOrigin_unknown');
    expect(originMessageKey('')).toBe('freezeOrigin_unknown');
    expect(originMessageKey(null)).toBe('freezeOrigin_unknown');
    expect(originMessageKey(undefined)).toBe('freezeOrigin_unknown');
  });
});

describe('syncAction', () => {
  it('semester yang masih hidup tidak perlu disamakan', () => {
    expect(syncAction({ frozen: false, matchesLive: true, finalReportCount: 0 })).toBe('none');
  });
  it('salinan sama dengan aturan hari ini: tidak ada tombol, walau ada rapor final', () => {
    expect(syncAction({ frozen: true, matchesLive: true, finalReportCount: 4 })).toBe('none');
  });
  it('salinan berbeda tanpa rapor final: boleh disamakan', () => {
    expect(syncAction({ frozen: true, matchesLive: false, finalReportCount: 0 })).toBe('sync');
  });
  it('salinan berbeda dengan rapor final: diblokir', () => {
    expect(syncAction({ frozen: true, matchesLive: false, finalReportCount: 1 })).toBe('blocked');
  });
});

describe('classNamesFromReportFinal', () => {
  it('membaca nama kelas dari pesan sinkron semester', () => {
    const m =
      'Konfigurasi nilai semester ini tidak bisa diganti karena masih ada rapor final: X-A, X-B. Buka kembali rapornya lebih dulu.';
    expect(classNamesFromReportFinal(m)).toEqual(['X-A', 'X-B']);
  });
  it('membaca satu kelas', () => {
    const m =
      'Konfigurasi nilai semester ini tidak bisa diganti karena masih ada rapor final: XI RPL 1. Buka kembali rapornya lebih dulu.';
    expect(classNamesFromReportFinal(m)).toEqual(['XI RPL 1']);
  });
  it('membaca pesan penulisan data (satu dan banyak kelas)', () => {
    expect(
      classNamesFromReportFinal(
        'Rapor kelas X-A pada semester ini sudah difinalkan. Buka kembali rapornya di menu Rapor bila nilai perlu diubah.',
      ),
    ).toEqual(['X-A']);
    expect(
      classNamesFromReportFinal(
        'Rapor kelas-kelas X-A, X-B pada semester ini sudah difinalkan. Buka kembali.',
      ),
    ).toEqual(['X-A', 'X-B']);
  });
  it('pesan tak dikenal atau kosong menghasilkan daftar kosong', () => {
    expect(classNamesFromReportFinal('Rapor sudah difinalisasi.')).toEqual([]);
    expect(classNamesFromReportFinal('')).toEqual([]);
    expect(classNamesFromReportFinal(undefined)).toEqual([]);
  });
});

describe('syncedSemesterIdOf', () => {
  it('mengambil id semester dari badan respons', () => {
    expect(syncedSemesterIdOf({ id: 'x', syncedSemesterId: 'sem-1' })).toBe('sem-1');
  });
  it('null bila tidak ada, bukan teks, kosong, atau bukan objek', () => {
    expect(syncedSemesterIdOf({ id: 'x' })).toBeNull();
    expect(syncedSemesterIdOf({ syncedSemesterId: 5 })).toBeNull();
    expect(syncedSemesterIdOf({ syncedSemesterId: '' })).toBeNull();
    expect(syncedSemesterIdOf([{ syncedSemesterId: 'a' }])).toBeNull();
    expect(syncedSemesterIdOf(null)).toBeNull();
    expect(syncedSemesterIdOf(undefined)).toBeNull();
  });
});

describe('isFromReport', () => {
  it('hanya true bila source bernilai report', () => {
    expect(isFromReport({ source: 'report' })).toBe(true);
    expect(isFromReport({})).toBe(false);
    expect(isFromReport(null)).toBe(false);
    expect(isFromReport(undefined)).toBe(false);
  });
});

describe('formatFrozenAt', () => {
  const local = new Date(2026, 10, 13, 9, 5).toISOString();
  it('menulis tanggal dan jam setempat per bahasa', () => {
    expect(formatFrozenAt('id', local)).toMatch(/^13 November 2026, 09\.05$/);
    expect(formatFrozenAt('en', local)).toMatch(/^November 13, 2026, 09:05$/);
    expect(formatFrozenAt('su', local)).toBe('13 Nopémber 2026, 09.05');
  });
  it('tanda hubung untuk nilai kosong atau tak sah', () => {
    expect(formatFrozenAt('id', null)).toBe('-');
    expect(formatFrozenAt('id', 'bukan tanggal')).toBe('-');
  });
});
