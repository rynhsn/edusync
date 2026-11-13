import { describe, expect, it } from 'vitest';
import {
  attemptsLeft,
  buildAttemptBody,
  buildParticipants,
  buildSupportFields,
  candidateStats,
  countByStatus,
  filterCandidates,
  MAX_REMEDIAL_ATTEMPTS,
  parseScore,
  policyAffectsGrades,
  policyChange,
  policyOrDefault,
  REMEDIAL_EXAMPLE,
  REMEDIAL_POLICY_KEYS,
  remedialExampleResult,
  remedialMarkState,
  scoreIssue,
  suggestParticipantIds,
  supportIssues,
  todayIso,
  toggleId,
} from './remedial';

describe('kebijakan nilai remedial', () => {
  it('mencakup kelima kebijakan resmi dan bawaannya hanya dicatat', () => {
    expect([...REMEDIAL_POLICY_KEYS]).toEqual([
      'record_only',
      'replace_latest',
      'max',
      'cap_at_criteria',
      'mean_with_original',
    ]);
    expect(policyOrDefault(undefined)).toBe('record_only');
    expect(policyOrDefault(null)).toBe('record_only');
    expect(policyOrDefault('max')).toBe('max');
  });

  it('kebijakan hanya dikirim bila berubah', () => {
    expect(policyChange(undefined, 'record_only')).toEqual({});
    expect(policyChange('max', 'max')).toEqual({});
    expect(policyChange(undefined, 'max')).toEqual({ remedialPolicy: 'max' });
    expect(policyChange('max', 'record_only')).toEqual({ remedialPolicy: 'record_only' });
  });

  it('angka contoh sama dengan rumus sebenarnya (asli 60, remedial 80, KKM 75)', () => {
    expect(REMEDIAL_EXAMPLE).toEqual({ original: 60, attempt: 80, kkm: 75, max: 100 });
    expect(remedialExampleResult('record_only')).toBe(60);
    expect(remedialExampleResult('replace_latest')).toBe(80);
    expect(remedialExampleResult('max')).toBe(80);
    expect(remedialExampleResult('cap_at_criteria')).toBe(75);
    expect(remedialExampleResult('mean_with_original')).toBe(70);
  });

  it('hanya kebijakan selain hanya-dicatat yang memengaruhi nilai', () => {
    expect(policyAffectsGrades('record_only')).toBe(false);
    expect(policyAffectsGrades('cap_at_criteria')).toBe(true);
  });
});

describe('batas nilai remedial', () => {
  it('menerima koma desimal dan menolak bukan angka', () => {
    expect(parseScore('72,5')).toBe(72.5);
    expect(parseScore(' 80 ')).toBe(80);
    expect(parseScore('')).toBeNull();
    expect(parseScore('abc')).toBeNull();
  });

  it('wajib angka antara 0 dan skor maksimum', () => {
    expect(scoreIssue('', 100)).toBe('required');
    expect(scoreIssue('x', 100)).toBe('invalid');
    expect(scoreIssue('-1', 100)).toBe('range');
    expect(scoreIssue('101', 100)).toBe('range');
    expect(scoreIssue('0', 100)).toBeNull();
    expect(scoreIssue('100', 100)).toBeNull();
    expect(scoreIssue('50,5', 50)).toBe('range');
    expect(scoreIssue('50', 50)).toBeNull();
  });

  it('menghitung sisa percobaan dan tidak negatif', () => {
    expect(attemptsLeft(0)).toBe(MAX_REMEDIAL_ATTEMPTS);
    expect(attemptsLeft(19)).toBe(1);
    expect(attemptsLeft(25)).toBe(0);
  });

  it('tanggal hari ini memakai zona waktu lokal', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('menyusun isi permintaan satu catatan percobaan', () => {
    const s = 'a0a0a0a0-0000-4000-8000-000000000001';
    expect(buildAttemptBody(s, { value: '78,5', takenOn: '2026-11-01', note: '  ', supportId: '' })).toEqual({
      records: [{ studentId: s, value: 78.5, takenOn: '2026-11-01' }],
    });
    expect(
      buildAttemptBody(s, { value: '80', takenOn: '2026-11-02', note: ' membaik ', supportId: 'sup-1' }),
    ).toEqual({
      records: [{ studentId: s, value: 80, takenOn: '2026-11-02', note: 'membaik', supportId: 'sup-1' }],
    });
  });
});

const item = (assessmentId: string, stillBelow: boolean, attempts = 0) => ({
  assessmentId,
  title: assessmentId,
  stillBelow,
  attempts,
});

describe('penyaringan murid yang perlu remedial', () => {
  const students = [
    { studentId: 's1', name: 'Ayu Lestari', nis: '1001', items: [item('a', true), item('b', false, 1)] },
    { studentId: 's2', name: 'Budi Santoso', nis: '1002', items: [item('a', false, 2)] },
    { studentId: 's3', name: 'Citra', nis: null, items: [item('c', true)] },
  ];

  it('tanpa saringan semuanya tampil', () => {
    expect(filterCandidates(students, {})).toEqual(students);
  });

  it('hanya yang masih di bawah KKM: penilaian dan murid tanpa sisa dibuang', () => {
    const r = filterCandidates(students, { onlyStillBelow: true });
    expect(r.map((s) => s.studentId)).toEqual(['s1', 's3']);
    expect(r[0]?.items.map((i) => i.assessmentId)).toEqual(['a']);
  });

  it('mencari nama atau NIS tanpa peduli huruf besar', () => {
    expect(filterCandidates(students, { query: 'budi' }).map((s) => s.studentId)).toEqual(['s2']);
    expect(filterCandidates(students, { query: '1001' }).map((s) => s.studentId)).toEqual(['s1']);
    expect(filterCandidates(students, { query: 'zzz' })).toEqual([]);
  });

  it('ringkasan menghitung murid, penilaian, dan yang masih di bawah KKM', () => {
    expect(candidateStats(students)).toEqual({ students: 3, items: 4, stillBelowStudents: 2 });
    expect(candidateStats([])).toEqual({ students: 0, items: 0, stillBelowStudents: 0 });
  });
});

describe('usulan peserta', () => {
  const roster = [
    { studentId: 'a', final: 60, belowKkm: true },
    { studentId: 'b', final: 90, belowKkm: false },
    { studentId: 'c', final: null, belowKkm: false },
    { studentId: 'd', final: 85, belowKkm: false },
  ];

  it('remedial: calon remedial atau nilai akhir di bawah KKM', () => {
    expect(suggestParticipantIds('remedial', roster, new Set(['d']))).toEqual(['a', 'd']);
  });

  it('pengayaan: sudah bernilai, tuntas, dan bukan calon remedial', () => {
    expect(suggestParticipantIds('enrichment', roster, new Set(['d']))).toEqual(['b']);
    expect(suggestParticipantIds('enrichment', roster, new Set())).toEqual(['b', 'd']);
  });

  it('memilih dan melepas murid', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('susunan peserta dan pendampingan', () => {
  it('peserta lama mempertahankan status dan catatan, yang baru direncanakan, urut daftar kelas', () => {
    const body = buildParticipants(
      ['c', 'a', 'b'],
      [
        { studentId: 'a', status: 'completed', outcomeNote: ' naik ' },
        { studentId: 'z', status: 'in_progress' },
      ],
      ['a', 'b', 'c', 'd'],
    );
    expect(body).toEqual([
      { studentId: 'a', status: 'completed', outcomeNote: 'naik' },
      { studentId: 'b', status: 'planned' },
      { studentId: 'c', status: 'planned' },
    ]);
  });

  it('pilihan kosong menghasilkan larik kosong (mengosongkan peserta)', () => {
    expect(buildParticipants([], [{ studentId: 'a', status: 'planned' }], ['a'])).toEqual([]);
  });

  it('status yang diubah guru menggantikan status lama', () => {
    expect(
      buildParticipants(['a'], [{ studentId: 'a', status: 'planned' }], ['a'], { a: 'completed' }),
    ).toEqual([{ studentId: 'a', status: 'completed' }]);
  });

  it('judul wajib dan tanggal mulai tidak boleh setelah tanggal selesai', () => {
    const base = { title: 'Remedial Bab 1', description: '', startsOn: '', endsOn: '' };
    expect(supportIssues(base)).toEqual([]);
    expect(supportIssues({ ...base, title: '  ' })).toEqual(['title_required']);
    expect(supportIssues({ ...base, startsOn: '2026-11-10', endsOn: '2026-11-09' })).toEqual(['dates_order']);
    expect(supportIssues({ ...base, startsOn: '2026-11-10', endsOn: '2026-11-10' })).toEqual([]);
    expect(supportIssues({ ...base, startsOn: '2026-11-10' })).toEqual([]);
  });

  it('isian kosong dikirim null dan TP disalin', () => {
    expect(
      buildSupportFields({ title: ' Judul ', description: ' ', startsOn: '', endsOn: '2026-12-01' }, ['o1']),
    ).toEqual({
      title: 'Judul',
      description: null,
      startsOn: null,
      endsOn: '2026-12-01',
      objectiveIds: ['o1'],
    });
  });

  it('menghitung peserta per status', () => {
    expect(countByStatus([{ status: 'planned' }, { status: 'planned' }, { status: 'completed' }])).toEqual({
      planned: 2,
      in_progress: 0,
      completed: 1,
      cancelled: 0,
    });
  });
});

describe('penanda remedial di rekap dan portal', () => {
  it('tanpa percobaan tidak ada penanda', () => {
    expect(remedialMarkState(undefined)).toBeNull();
    expect(remedialMarkState(null)).toBeNull();
    expect(remedialMarkState({ attempts: 0, effectiveSource: 'original' })).toBeNull();
  });
  it('dipakai bila nilai efektif dari remedial, tercatat bila skor asli tetap dipakai', () => {
    expect(remedialMarkState({ attempts: 1, effectiveSource: 'remedial' })).toBe('used');
    expect(remedialMarkState({ attempts: 2, effectiveSource: 'original' })).toBe('recorded');
  });
});
