import { describe, expect, it } from 'vitest';
import {
  buildDecisionItem,
  buildPolicyBody,
  bulkFromSuggestions,
  changedScores,
  decisionFormOf,
  documentFileName,
  EMPTY_POLICY,
  formFromPolicy,
  type GraduationStudent,
  graduationErrorCode,
  hasInvalidScore,
  initialEdits,
  needsForce,
  type PolicyForm,
  type PrintMeta,
  parseNumber,
  parseScorePaste,
  readyToFinalize,
  type SklLabels,
  sklVars,
  suggestedResult,
  type TranscriptLabels,
  templatePreview,
  totalWeight,
  transcriptHtml,
  validateDecision,
  validatePolicy,
  weightShares,
} from './graduation';

const E1 = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa1';
const E2 = '019aaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa2';
const S1 = '019bbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbb1';

const policy = (over: Partial<PolicyForm> = {}): PolicyForm => ({
  ...EMPTY_POLICY,
  reportWeight: '60',
  examWeights: { [E1]: '40' },
  ...over,
});

describe('kebijakan: isian dan validasi', () => {
  it('bobot kosong semua ditolak; di luar 0-100 dan bukan angka ditolak', () => {
    expect(validatePolicy(policy({ reportWeight: '', examWeights: {} })).reportWeight).toMatchObject({
      code: 'custom',
    });
    expect(validatePolicy(policy({ reportWeight: '101' })).reportWeight).toMatchObject({ code: 'range' });
    expect(validatePolicy(policy({ reportWeight: 'abc' })).reportWeight).toMatchObject({ code: 'range' });
    expect(validatePolicy(policy({ examWeights: { [E1]: '-3' } })).examWeights).toMatchObject({
      code: 'range',
    });
    expect(validatePolicy(policy({ reportWeight: '60,5' }))).toEqual({});
    expect(validatePolicy(policy())).toEqual({});
  });

  it('ambang, tingkat, templat nomor, dan tanggal diperiksa; tingkat wajib bila cakupan tingkat', () => {
    expect(validatePolicy(policy({ minAverage: '120' })).minAverage).toMatchObject({ code: 'range' });
    expect(validatePolicy(policy({ minSubjectScore: 'x' })).minSubjectScore).toMatchObject({ code: 'range' });
    expect(validatePolicy(policy({ reportScope: 'levels', reportLevels: ' ' })).reportLevels).toMatchObject({
      code: 'required',
    });
    expect(
      validatePolicy(policy({ reportScope: 'levels', reportLevels: 'XI, XII' })).reportLevels,
    ).toBeUndefined();
    expect(validatePolicy(policy({ sklNumberTemplate: 'SKL/{year}' })).sklNumberTemplate).toMatchObject({
      code: 'custom',
    });
    expect(
      validatePolicy(policy({ sklNumberTemplate: '{seq:3}/SKL/{year}' })).sklNumberTemplate,
    ).toBeUndefined();
    expect(validatePolicy(policy({ announceOn: '2027-02-30' })).announceOn).toMatchObject({
      code: 'dateInvalid',
    });
  });

  it('isi permintaan: bobot 0 tidak dikirim, tingkat hanya untuk cakupan tingkat, kosong menjadi null', () => {
    const body = buildPolicyBody(
      policy({
        examWeights: { [E1]: '40', [E2]: '0' },
        reportScope: 'levels',
        reportLevels: 'XI; XII',
        minAverage: '75,5',
        criteriaText: '  ',
        sklNumberTemplate: ' ',
      }),
      [E1, E2],
    );
    expect(body).toEqual({
      config: {
        reportWeight: 60,
        examWeights: { [E1]: 40 },
        reportScope: 'levels',
        reportLevels: ['XI', 'XII'],
        rounding: 'two_decimals',
        minAverage: 75.5,
        minSubjectScore: null,
        requiredSubjectIds: [],
        criteriaText: null,
      },
      sklNumberTemplate: null,
      announceOn: null,
    });
    expect(buildPolicyBody(policy(), [E1]).config.reportLevels).toEqual([]);
  });

  it('formulir dari kebijakan tersimpan dan sebaliknya (bolak-balik)', () => {
    const view = {
      id: E1,
      academicYearId: E1,
      config: {
        reportWeight: 60,
        examWeights: { [E1]: 40 },
        reportScope: 'levels' as const,
        reportLevels: ['XII'],
        rounding: 'integer' as const,
        minAverage: 75,
        minSubjectScore: null,
        requiredSubjectIds: [S1],
        criteriaText: 'Teks',
      },
      sklNumberTemplate: '{seq}/SKL',
      announceOn: '2027-06-05',
      updatedAt: '',
    };
    const f = formFromPolicy(view);
    expect(f).toMatchObject({
      reportWeight: '60',
      reportLevels: 'XII',
      minAverage: '75',
      minSubjectScore: '',
    });
    expect(buildPolicyBody(f, [E1])).toEqual({
      config: view.config,
      sklNumberTemplate: '{seq}/SKL',
      announceOn: '2027-06-05',
    });
    expect(formFromPolicy(null)).toEqual(EMPTY_POLICY);
  });

  it('porsi bobot dinormalkan dan membuang komponen berbobot 0', () => {
    const f = policy({ reportWeight: '3', examWeights: { [E1]: '1', [E2]: '0' } });
    expect(totalWeight(f)).toBe(4);
    expect(
      weightShares(
        f,
        [
          { id: E1, name: 'Ujian' },
          { id: E2, name: 'Praktik' },
        ],
        'Rapor',
      ),
    ).toEqual([
      { key: 'report', label: 'Rapor', percent: 75 },
      { key: E1, label: 'Ujian', percent: 25 },
    ]);
    expect(weightShares(policy({ reportWeight: '', examWeights: {} }), [], 'Rapor')).toEqual([]);
  });

  it('contoh nomor SKL dari templat; null bila templat tak sah', () => {
    expect(templatePreview('{seq:3}/SKL/{year}', 2027)).toBe('001/SKL/2027');
    expect(templatePreview('SKL', 2027)).toBeNull();
    expect(templatePreview('', 2027)).toBeNull();
  });
});

describe('nilai ujian: tempel dan perubahan', () => {
  const students = [
    { studentId: 'a', name: 'Ani Lestari', nis: '1001' },
    { studentId: 'b', name: 'Budi', nis: null },
  ];
  it('mengurai NIS atau nama, pemisah tab/titik koma/koma, koma desimal; melaporkan yang tak cocok dan tak sah', () => {
    const p = parseScorePaste(
      '1001\t85,5\nBudi;70\nani lestari, 90\n9999\t80\n1001\tabc\n\n1001\t101\nBudi',
      students,
    );
    expect(p.matched).toEqual([
      { studentId: 'a', value: 85.5 },
      { studentId: 'b', value: 70 },
    ]); // baris ketiga untuk Ani diabaikan (sudah ada)
    expect(p.unmatched).toEqual(['9999\t80']);
    expect(p.invalid).toEqual(['1001\tabc', '1001\t101', 'Budi']);
  });
  it('angka: koma desimal diterima, selain itu NaN', () => {
    expect(parseNumber('85,5')).toBe(85.5);
    expect(parseNumber(' ')).toBeNull();
    expect(parseNumber('8a')).toBeNaN();
    expect(parseNumber('-1')).toBeNaN();
  });
  it('hanya yang berubah dikirim (termasuk dikosongkan); isian tak sah tidak dikirim', () => {
    const initial = initialEdits(
      [
        { studentId: 'a', subjectId: 's1', value: 80, note: null },
        { studentId: 'b', subjectId: 's1', value: 70, note: null },
        { studentId: 'c', subjectId: 's2', value: 60, note: null },
      ],
      's1',
    );
    expect(initial).toEqual({ a: '80', b: '70' });
    expect(changedScores(initial, { a: '80', b: '', c: '55' }, 's1')).toEqual([
      { studentId: 'b', subjectId: 's1', value: null },
      { studentId: 'c', subjectId: 's1', value: 55 },
    ]);
    expect(changedScores(initial, { a: '120', b: '70' }, 's1')).toEqual([]);
    expect(hasInvalidScore({ a: '120' })).toBe(true);
    expect(hasInvalidScore({ a: '99,5', b: '' })).toBe(false);
  });
});

const sc = (over: Partial<NonNullable<GraduationStudent['suggestion']>> = {}) => ({
  subjects: [],
  average: 80,
  meetsCriteria: true,
  failures: [],
  incomplete: false,
  reportNotFinal: false,
  reportSemesters: [],
  ...over,
});
const stu = (id: string, over: Partial<GraduationStudent> = {}): GraduationStudent => ({
  studentId: id,
  name: `Murid ${id}`,
  nis: id,
  nisn: null,
  studentStatus: 'active',
  classId: 'c',
  className: 'XII-A',
  suggestion: sc(),
  decision: null,
  ...over,
});
const decision = (over: Record<string, unknown> = {}) =>
  ({
    result: null,
    status: 'draft',
    graduatedOn: null,
    sklNumber: null,
    diplomaNumber: null,
    note: null,
    finalizedAt: null,
    promotionApplied: false,
    ...over,
  }) as NonNullable<GraduationStudent['decision']>;

describe('penetapan: saran, massal, kesiapan', () => {
  it('saran hasil: memenuhi = lulus, tidak = tidak lulus, data kurang = tidak menebak', () => {
    expect(suggestedResult(stu('1'))).toBe('graduated');
    expect(suggestedResult(stu('2', { suggestion: sc({ meetsCriteria: false }) }))).toBe('not_graduated');
    expect(suggestedResult(stu('3', { suggestion: sc({ incomplete: true }) }))).toBeNull();
    expect(suggestedResult(stu('4', { suggestion: sc({ reportNotFinal: true }) }))).toBeNull();
    expect(suggestedResult(stu('5', { suggestion: sc({ average: null }) }))).toBeNull();
    expect(suggestedResult(stu('6', { suggestion: undefined }))).toBeNull();
  });

  it('draf massal hanya untuk yang belum punya hasil dan belum final; tanggal hanya untuk yang lulus', () => {
    const list = [
      stu('1'),
      stu('2', { suggestion: sc({ meetsCriteria: false }) }),
      stu('3', { decision: decision({ result: 'deferred' }) }),
      stu('4', { decision: decision({ status: 'final', result: 'graduated' }) }),
      stu('5', { suggestion: sc({ incomplete: true }) }),
    ];
    expect(bulkFromSuggestions(list, '2027-06-05')).toEqual([
      { studentId: '1', result: 'graduated', graduatedOn: '2027-06-05' },
      { studentId: '2', result: 'not_graduated' },
    ]);
  });

  it('siap ditetapkan: draf dengan hasil; lulus wajib bertanggal', () => {
    const list = [
      stu('1', { decision: decision({ result: 'graduated', graduatedOn: '2027-06-05' }) }),
      stu('2', { decision: decision({ result: 'graduated' }) }),
      stu('3', { decision: decision({ result: 'not_graduated' }) }),
      stu('4', { decision: decision() }),
      stu('5', { decision: decision({ status: 'final', result: 'deferred' }) }),
      stu('6'),
    ];
    expect(readyToFinalize(list).map((s) => s.studentId)).toEqual(['1', '3']);
  });

  it('perlu force: hitung rapor belum final dan nilai belum lengkap', () => {
    const r = needsForce([
      stu('1'),
      stu('2', { suggestion: sc({ reportNotFinal: true, incomplete: true }) }),
    ]);
    expect(r).toEqual({ reportNotFinal: 1, incomplete: 1, any: true });
    expect(needsForce([stu('1')]).any).toBe(false);
  });

  it('formulir keputusan: awal dari keputusan tersimpan; isi permintaan mengosongkan yang tak berlaku', () => {
    const f = decisionFormOf(stu('1'), '2027-06-05');
    expect(f).toMatchObject({ result: '', graduatedOn: '2027-06-05', meetingId: '' });
    expect(buildDecisionItem('1', { ...f, result: 'not_graduated', note: ' alasan ' })).toEqual({
      studentId: '1',
      result: 'not_graduated',
      graduatedOn: null,
      note: 'alasan',
      meetingId: null,
      sklNumber: null,
      diplomaNumber: null,
    });
    expect(buildDecisionItem('1', { ...f, result: 'graduated' }).graduatedOn).toBe('2027-06-05');
    expect(
      validateDecision({ ...f, result: 'graduated', graduatedOn: '2027-13-01' }).graduatedOn,
    ).toMatchObject({
      code: 'dateInvalid',
    });
    expect(validateDecision({ ...f, diplomaNumber: 'x'.repeat(61) }).diplomaNumber).toMatchObject({
      code: 'tooLong',
    });
  });

  it('kode galat khusus kelulusan dipetakan ke pesan sendiri (report_not_final berbeda dari portal)', () => {
    expect(graduationErrorCode('report_not_final')).toBe('graduation.errors.report_not_final');
    expect(graduationErrorCode('number_taken')).toBe('graduation.errors.number_taken');
    expect(graduationErrorCode('forbidden')).toBeNull();
    expect(graduationErrorCode(undefined)).toBeNull();
  });
});

const meta: PrintMeta = {
  school: {
    name: 'SMK <Maju> & Jaya',
    npsn: '12345678',
    address: 'Jl. Mawar 1',
    city: 'Bandung',
    principal: { name: 'Drs. Kepala', nip: '1970' },
  },
  yearName: '2026/2027',
  locale: 'id',
  graduatedOnText: '5 Juni 2027',
  printedOnText: 'Dicetak 6 Juni 2027',
};
const sklLabels: SklLabels = {
  title: 'SURAT KETERANGAN LULUS',
  number: 'Nomor',
  intro: 'Menerangkan bahwa:',
  name: 'Nama',
  nis: 'NIS',
  nisn: 'NISN',
  className: 'Kelas',
  year: 'Tahun ajaran',
  statement: 'dinyatakan LULUS.',
  criteria: 'Kriteria',
  principal: 'Kepala sekolah',
  nip: 'NIP',
  npsn: 'NPSN',
  draftNote: 'DRAF',
  numberMissing: 'belum ada nomor',
  signPlace: 'Bandung, 5 Juni 2027',
};
const trLabels: TranscriptLabels = {
  title: 'Transkrip',
  name: 'Nama',
  nis: 'NIS',
  nisn: 'NISN',
  className: 'Kelas',
  year: 'Tahun ajaran',
  colNo: 'No',
  colSubject: 'Mapel',
  colReport: 'Rapor',
  colFinal: 'Nilai kelulusan',
  average: 'Rata-rata',
  weights: 'Bobot',
  reportWeightLabel: 'Rapor',
  criteria: 'Kriteria',
  forced: 'Catatan penetapan',
  result: 'Hasil',
  results: { graduated: 'Lulus', not_graduated: 'Tidak lulus', deferred: 'Ditunda' },
  decidedOn: 'Tanggal',
  skl: 'Nomor SKL',
  principal: 'Kepala sekolah',
  nip: 'NIP',
  draftNote: 'DRAF',
  signPlace: 'Bandung, 5 Juni 2027',
};
const finalStudent = stu('1', {
  name: 'Ani <b>',
  suggestion: undefined,
  decision: decision({
    status: 'final',
    result: 'graduated',
    graduatedOn: '2027-06-05',
    sklNumber: '001/SKL/2027',
  }),
  transcript: {
    version: 1,
    capturedAt: '2027-06-05T00:00:00.000Z',
    policy: {
      reportWeight: 60,
      examWeights: [{ examId: E1, name: 'Ujian Sekolah', weight: 40 }],
      reportScope: 'final_level',
      reportLevels: [],
      rounding: 'two_decimals',
      minAverage: 75,
      minSubjectScore: null,
      requiredSubjectIds: [],
      criteriaText: 'Rata-rata minimal 75.\nBaris dua',
    },
    reportSemesters: [],
    subjects: [
      {
        subjectId: S1,
        name: 'Matematika',
        report: 85,
        exams: [{ examId: E1, value: 70 }],
        final: 79,
        missing: [],
      },
    ],
    average: 79,
    meetsCriteria: true,
    failures: [],
    incomplete: false,
    forced: { reason: 'Disetujui <rapat>' },
  },
});

describe('kebijakan: syarat UKK kompeten (5.6)', () => {
  it('kunci tidak dikirim saat mati dan dikirim true saat menyala', () => {
    expect('requireUkkCompetent' in buildPolicyBody(policy(), [E1]).config).toBe(false);
    expect(buildPolicyBody(policy({ requireUkkCompetent: true }), [E1]).config.requireUkkCompetent).toBe(
      true,
    );
  });

  it('konfigurasi tanpa kunci tetap bolak-balik tanpa kunci; dengan kunci tetap menyala', () => {
    const base = {
      reportWeight: 100,
      examWeights: {},
      reportScope: 'final_level' as const,
      reportLevels: [],
      rounding: 'two_decimals' as const,
      minAverage: null,
      minSubjectScore: null,
      requiredSubjectIds: [],
      criteriaText: null,
    };
    const view = (config: typeof base & { requireUkkCompetent?: boolean }) => ({
      id: E1,
      academicYearId: E1,
      config,
      sklNumberTemplate: null,
      announceOn: null,
      updatedAt: '',
    });
    const off = formFromPolicy(view(base));
    expect(off.requireUkkCompetent).toBe(false);
    expect(buildPolicyBody(off, []).config).toEqual(base);
    const on = formFromPolicy(view({ ...base, requireUkkCompetent: true }));
    expect(on.requireUkkCompetent).toBe(true);
    expect(buildPolicyBody(on, []).config).toEqual({ ...base, requireUkkCompetent: true });
  });
});

describe('cetak SKL dan transkrip', () => {
  it('transkrip dari transkrip beku: kolom ujian, rata-rata, bobot (porsi), catatan force; null bila belum beku', () => {
    expect(transcriptHtml(stu('2'), trLabels, meta)).toBeNull();
    const html = transcriptHtml(finalStudent, trLabels, meta) as string;
    expect(html).toContain('<th class="num">Ujian Sekolah</th>');
    expect(html).toContain(
      '<td>Matematika</td><td class="num">85</td><td class="num">70</td><td class="num">79</td>',
    );
    expect(html).toContain('Rapor 60%, Ujian Sekolah 40%');
    expect(html).toContain('Disetujui &lt;rapat&gt;');
    expect(html).toContain('Lulus');
    expect(html).not.toContain('<rapat>');
  });

  it('nama berkas aman', () => {
    expect(documentFileName('skl', 'Ánî Lestari, S.', '2026/2027')).toBe('skl-ani-lestari-s-2026-2027');
    expect(documentFileName('transkrip', '###', '2026/2027')).toBe('transkrip-murid-2026-2027');
  });
});

describe('variabel templat SKL', () => {
  it('sklVars mengisi data murid, sekolah, dan label; yang tak ada menjadi kosong', () => {
    const v = sklVars(
      finalStudent,
      { ...sklLabels, results: { graduated: 'Lulus', not_graduated: 'x', deferred: 'y' } },
      meta,
    );
    expect(v).toMatchObject({
      nama_murid: 'Ani <b>',
      nomor_skl: '001/SKL/2027',
      status_lulus: 'Lulus',
      kepala_sekolah: 'Drs. Kepala',
    });
    const none = sklVars(stu('2'), sklLabels, { ...meta, school: { ...meta.school, principal: null } });
    expect(none).toMatchObject({
      nomor_skl: '',
      status_lulus: '',
      kepala_sekolah: '',
      nip_kepala_sekolah: '',
      nilai_rata: '',
    });
  });
});
