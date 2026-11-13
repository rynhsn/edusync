import { describe, expect, it } from 'vitest';
import {
  completeCount,
  completenessPercent,
  dropSaved,
  filterNarrativeRows,
  guardianResponseRows,
  isComplete,
  localDateOf,
  missingCount,
  narrativeItems,
  narrativesTooLong,
  narrativeValue,
  parseWindowDays,
  phaseOfLevel,
  reportModeForCreate,
  reportModeOf,
  reportModePatch,
  reportView,
  responseTextIssue,
  responseWindowState,
  suggestedReportMode,
} from './report-v2';

describe('mode rapor tingkat', () => {
  it('tidak diisi berarti angka', () => {
    expect(reportModeOf(null)).toBe('numeric');
    expect(reportModeOf(undefined)).toBe('numeric');
    expect(reportModeOf('descriptive')).toBe('descriptive');
  });
  it('hanya fase A yang disarankan deskriptif', () => {
    expect(suggestedReportMode('A')).toBe('descriptive');
    expect(suggestedReportMode('a')).toBe('descriptive');
    for (const p of ['B', 'C', 'D', 'E', 'F', '', null, undefined]) expect(suggestedReportMode(p)).toBeNull();
  });
  it('fase dibaca dari profil menurut kode tingkat', () => {
    const levels = [
      { code: '1', phase: 'A' },
      { code: '3', phase: 'B' },
    ];
    expect(phaseOfLevel(levels, '1')).toBe('A');
    expect(phaseOfLevel(levels, '9')).toBeNull();
    expect(phaseOfLevel(undefined, '1')).toBeNull();
  });
  it('perubahan hanya dikirim bila berbeda; kembali ke angka mengirim null', () => {
    expect(reportModePatch(null, 'numeric')).toEqual({});
    expect(reportModePatch(undefined, 'descriptive')).toEqual({ reportMode: 'descriptive' });
    expect(reportModePatch('descriptive', 'descriptive')).toEqual({});
    expect(reportModePatch('descriptive', 'numeric')).toEqual({ reportMode: null });
  });
  it('tingkat baru hanya mengirim mode deskriptif', () => {
    expect(reportModeForCreate('numeric')).toEqual({});
    expect(reportModeForCreate('descriptive')).toEqual({ reportMode: 'descriptive' });
  });
});

describe('kelengkapan', () => {
  it('menghitung kekurangan dan kelengkapan', () => {
    expect(missingCount({ subjectsGraded: 2, subjectsTotal: 5 })).toBe(3);
    expect(missingCount({ subjectsGraded: 6, subjectsTotal: 5 })).toBe(0);
    expect(isComplete({ subjectsGraded: 5, subjectsTotal: 5 })).toBe(true);
    // Tanpa mapel sama sekali tidak dianggap lengkap, sama dengan aturan finalisasi di server.
    expect(isComplete({ subjectsGraded: 0, subjectsTotal: 0 })).toBe(false);
    expect(
      completeCount([
        { subjectsGraded: 1, subjectsTotal: 1 },
        { subjectsGraded: 0, subjectsTotal: 1 },
      ]),
    ).toBe(1);
    expect(completenessPercent({ subjectsGraded: 1, subjectsTotal: 4 })).toBe(25);
    expect(completenessPercent({ subjectsGraded: 0, subjectsTotal: 0 })).toBe(0);
  });
});

describe('deskripsi manual per mapel', () => {
  const rows = [
    { studentId: 'a', name: 'Ani Lestari', nis: '1001', manual: 'Baik.' },
    { studentId: 'b', name: 'Budi Santoso', nis: '1002', manual: null },
    { studentId: 'c', name: 'Citra', nis: null, manual: null },
  ];
  it('suntingan menang atas teks tersimpan, dikunci menurut id', () => {
    expect(narrativeValue(rows[0]!, {})).toBe('Baik.');
    expect(narrativeValue(rows[0]!, { a: 'Baru' })).toBe('Baru');
    expect(narrativeValue(rows[1]!, {})).toBe('');
  });
  it('hanya mengirim baris yang berubah; kosong menghapus', () => {
    expect(narrativeItems(rows, {})).toEqual([]);
    expect(narrativeItems(rows, { a: 'Baik.', b: '   ' })).toEqual([]);
    expect(narrativeItems(rows, { a: '  ', b: ' Rajin ', c: 'x' })).toEqual([
      { studentId: 'a', text: null },
      { studentId: 'b', text: 'Rajin' },
      { studentId: 'c', text: 'x' },
    ]);
  });
  it('menandai suntingan yang kepanjangan', () => {
    expect(narrativesTooLong({ a: 'x'.repeat(1000), b: 'x'.repeat(1001) })).toEqual(['b']);
  });
  it('membuang suntingan yang sudah tersimpan saja', () => {
    expect(dropSaved({ a: '1', b: '2' }, [{ studentId: 'a' }])).toEqual({ b: '2' });
  });
  it('menyaring menurut nama atau NIS dan yang belum terisi', () => {
    expect(filterNarrativeRows(rows, { query: 'budi' }).map((r) => r.studentId)).toEqual(['b']);
    expect(filterNarrativeRows(rows, { query: '1001' }).map((r) => r.studentId)).toEqual(['a']);
    expect(filterNarrativeRows(rows, { onlyMissing: true }).map((r) => r.studentId)).toEqual(['b', 'c']);
    // Suntingan yang belum disimpan ikut dihitung: baris yang sedang diisi tidak hilang dari daftar kosong.
    expect(filterNarrativeRows(rows, { onlyMissing: true }, { b: 'isi' }).map((r) => r.studentId)).toEqual([
      'c',
    ]);
    expect(filterNarrativeRows(rows, { onlyMissing: true }, { a: '' }).map((r) => r.studentId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('tanggapan orang tua/wali', () => {
  const guardians = [
    { id: 'g1', name: 'Ibu', relation: 'ibu' },
    { id: 'g2', name: 'Ayah', relation: 'ayah' },
    { id: 'g3', name: 'Wali', relation: 'wali' },
  ];
  const responses = [
    { id: 'r1', guardianId: 'g1', text: 'ok', recordedByKind: 'guardian' as const, outdated: false },
    { id: 'r2', guardianId: 'g2', text: 'salin', recordedByKind: 'staff' as const, outdated: true },
  ];
  it('memetakan menurut id wali; tanggapan wali sendiri tidak boleh ditimpa staf', () => {
    const rows = guardianResponseRows(guardians, responses);
    expect(rows.map((r) => [r.guardian.id, r.response?.id ?? null, r.staffCanCopy])).toEqual([
      ['g1', 'r1', false],
      ['g2', 'r2', true],
      ['g3', null, true],
    ]);
  });
  it('jendela: belum final, terbuka, tertutup, dan batas yang sudah lewat', () => {
    const now = Date.parse('2026-11-13T00:00:00Z');
    expect(responseWindowState({ final: false, open: false, closesAt: null }, now)).toEqual({
      kind: 'not_final',
    });
    expect(responseWindowState({ final: true, open: true, closesAt: null }, now)).toEqual({
      kind: 'open',
      closesAt: null,
    });
    expect(responseWindowState({ final: true, open: true, closesAt: '2026-12-01T00:00:00Z' }, now).kind).toBe(
      'open',
    );
    expect(
      responseWindowState({ final: true, open: false, closesAt: '2026-11-01T00:00:00Z' }, now).kind,
    ).toBe('closed');
    expect(responseWindowState({ final: true, open: true, closesAt: '2026-11-01T00:00:00Z' }, now).kind).toBe(
      'closed',
    );
  });
  it('teks tanggapan 1 sampai 1.000 karakter', () => {
    expect(responseTextIssue('   ')).toBe('required');
    expect(responseTextIssue('ok')).toBeNull();
    expect(responseTextIssue('x'.repeat(1000))).toBeNull();
    expect(responseTextIssue('x'.repeat(1001))).toBe('tooLong');
  });
  it('lama jendela 1 sampai 365 hari atau kosong', () => {
    expect(parseWindowDays('')).toBeNull();
    expect(parseWindowDays(' 30 ')).toBe(30);
    expect(parseWindowDays('365')).toBe(365);
    for (const bad of ['0', '366', '-1', '3.5', 'abc']) expect(parseWindowDays(bad), bad).toBe('invalid');
  });
});

describe('tampilan bagian rapor', () => {
  const v1 = { subjects: [{ belowKkm: false }], rank: { position: 1, of: 30 } };
  it('dokumen v1 tanpa bendera: tata letak v1 persis', () => {
    const v = reportView(v1);
    expect(v.descriptive).toBe(false);
    expect(v.showNumbers).toBe(true);
    expect(v.showRank).toBe(true);
    expect(v.cocurricular.show).toBe(false);
    expect(v.development.show).toBe(false);
    expect(v.responseBox.show).toBe(false);
  });
  it('bendera menyalakan bagian walau kosong', () => {
    const v = reportView(v1, { showCocurricular: true, showGuardianResponse: true });
    expect(v.cocurricular).toEqual({ show: true, text: null });
    expect(v.responseBox.show).toBe(true);
  });
  it('catatan yang berisi tampil walau bendera mati; kotak tanggapan mengikuti bendera', () => {
    const doc = {
      ...v1,
      cocurricularNote: ' Pramuka aktif ',
      guardianResponses: [{ guardianName: 'Ibu', text: 'ok', outdated: false }],
    };
    expect(reportView(doc, { showCocurricular: false, showGuardianResponse: false })).toMatchObject({
      cocurricular: { show: true, text: 'Pramuka aktif' },
      responseBox: { show: false },
    });
    // Bendera tidak diketahui (portal): tampil bila ada tanggapan.
    expect(reportView(doc).responseBox.show).toBe(true);
  });
  it('mode deskriptif menyembunyikan angka dan peringkat, menampilkan catatan perkembangan', () => {
    const v = reportView({ ...v1, reportMode: 'descriptive' });
    expect(v.showNumbers).toBe(false);
    expect(v.showRank).toBe(false);
    expect(v.showBelowKkmNote).toBe(false);
    expect(v.development.show).toBe(true);
  });
  it('catatan di bawah KKM hanya pada mode angka', () => {
    expect(reportView({ subjects: [{ belowKkm: true }] }).showBelowKkmNote).toBe(true);
  });
});

describe('localDateOf', () => {
  it('memakai tanggal lokal dari waktu ISO', () => {
    expect(localDateOf(new Date(2026, 10, 13, 12, 0, 0).toISOString())).toBe('2026-11-13');
    expect(localDateOf(new Date(2026, 0, 5, 0, 30, 0).toISOString())).toBe('2026-01-05');
  });
});
