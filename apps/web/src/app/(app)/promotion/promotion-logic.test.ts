import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allowedRolloverOptions,
  buildSavePayload,
  COLLAPSE_ABOVE,
  chunk,
  defaultSourceId,
  detailsChanged,
  effectiveDetails,
  eligibleTargets,
  filterStudents,
  graduateReportNotFinalCount,
  initialChoices,
  invalidDetailsFor,
  isBlocked,
  isClassOpen,
  isIsoDate,
  isRolloverPart,
  levelUnknownClasses,
  missingByClass,
  missingFinalStudents,
  needsGraduateConfirm,
  optionsFor,
  optionsForStudent,
  type PromotionClass,
  pendingStudents,
  permissionForOption,
  ROLLOVER_WARNING_CODES,
  rolloverWarnings,
  saveBlockers,
  sendableRolloverOptions,
  setClassDecision,
  setClassMeetingDate,
  setDetail,
  summarize,
  UNPLACED_REASON_CODES,
  unplacedReason,
} from './promotion-logic';

const stu = (id: string, over: Partial<PromotionClass['students'][number]> = {}) => ({
  studentId: id,
  name: `Siswa ${id}`,
  nis: null,
  decision: null,
  suggestedDecision: 'promote' as const,
  toClassId: null,
  note: null,
  applied: false,
  ...over,
});
/** Siswa tingkat akhir: backend tidak memberi saran bawaan (kelulusan ditetapkan sekolah). */
const finalStu = (id: string, over: Partial<PromotionClass['students'][number]> = {}) =>
  stu(id, { suggestedDecision: null, ...over });

const classes: PromotionClass[] = [
  {
    classId: 'c7',
    name: '7A',
    level: '7',
    nextLevel: '8',
    isFinalLevel: false,
    students: [
      stu('a'),
      stu('b', { decision: 'retain', note: 'sakit lama' }),
      stu('c', { applied: true, decision: 'promote' }),
    ],
  },
  {
    classId: 'c9',
    name: '9A',
    level: '9',
    nextLevel: null,
    isFinalLevel: true,
    students: [finalStu('d'), finalStu('e', { decision: 'graduate' })],
  },
];

describe('tahun tujuan', () => {
  const years = [
    { id: 'y1', name: '2025/2026', startsOn: '2025-07-01', isActive: true },
    { id: 'y2', name: '2026/2027', startsOn: '2026-07-01' },
    { id: 'y3', name: '2027/2028', startsOn: '2027-07-01' },
    { id: 'y0', name: '2024/2025', startsOn: '2024-07-01' },
  ];
  it('hanya tahun yang dimulai setelah sumber, urut dari terdekat', () => {
    expect(eligibleTargets(years, 'y1').map((y) => y.id)).toEqual(['y2', 'y3']);
    expect(eligibleTargets(years, 'y3')).toEqual([]);
    expect(eligibleTargets(years, 'nope')).toEqual([]);
  });
  it('sumber bawaan: tahun aktif, atau yang terbaru', () => {
    expect(defaultSourceId(years)).toBe('y1');
    expect(defaultSourceId(years.map((y) => ({ ...y, isActive: false })))).toBe('y3');
    expect(defaultSourceId([])).toBe('');
  });
});

describe('keputusan', () => {
  it('pilihan per tingkat', () => {
    expect(optionsFor({ isFinalLevel: false })).toEqual(['promote', 'retain']);
    expect(optionsFor({ isFinalLevel: true })).toEqual(['graduate', 'retain']);
  });

  it('pilihan awal: keputusan tersimpan atau saran; tingkat akhir tanpa keputusan tidak punya pilihan', () => {
    const init = initialChoices(classes);
    expect(init).toEqual({ a: 'promote', b: 'retain', c: 'promote', e: 'graduate' });
    expect('d' in init).toBe(false);
  });

  it('aksi massal melewati siswa yang sudah diterapkan dan menolak keputusan yang tak sah', () => {
    const base = initialChoices(classes);
    const all = setClassDecision(classes[0] as PromotionClass, base, 'promote');
    expect(all).toMatchObject({ a: 'promote', b: 'promote', c: 'promote' });
    const retain = setClassDecision(classes[0] as PromotionClass, base, 'retain');
    expect(retain).toMatchObject({ a: 'retain', b: 'retain', c: 'promote' });
    expect(setClassDecision(classes[0] as PromotionClass, base, 'graduate')).toBe(base);
    expect(setClassDecision(classes[1] as PromotionClass, base, 'promote')).toBe(base);
  });

  it('aksi massal lulus di tingkat akhir memutuskan semua siswa yang belum diterapkan', () => {
    const next = setClassDecision(classes[1] as PromotionClass, initialChoices(classes), 'graduate');
    expect(next).toMatchObject({ d: 'graduate', e: 'graduate' });
  });

  it('yang perlu disimpan: belum tersimpan atau berbeda; tanpa pilihan dan yang diterapkan tidak pernah', () => {
    const base = initialChoices(classes);
    // d belum dipilih jadi tidak ikut; e sudah tersimpan.
    expect(pendingStudents(classes, base).map((p) => p.student.studentId)).toEqual(['a']);
    const changed = { ...base, b: 'promote' as const, c: 'retain' as const, d: 'retain' as const };
    expect(pendingStudents(classes, changed).map((p) => p.student.studentId)).toEqual(['a', 'b', 'd']);
  });

  it('payload: kelas tujuan eksplisit dibawa hanya bila keputusan tidak berubah, catatan selalu dibawa', () => {
    const withTarget: PromotionClass[] = [
      {
        ...(classes[0] as PromotionClass),
        students: [
          stu('p', { decision: 'promote', toClassId: 'x' }),
          stu('q', { decision: 'promote', toClassId: 'x', note: 'ok' }),
        ],
      },
    ];
    const choices = { p: 'promote' as const, q: 'retain' as const };
    expect(buildSavePayload(withTarget, choices)).toEqual([
      { studentId: 'q', decision: 'retain', note: 'ok', reason: null, followUp: null, meetingDate: null },
    ]);
    // p tidak berubah jadi tidak dikirim; q berubah jadi kelas tujuan lama dilepas.
    const unchangedPlusNew: PromotionClass[] = [
      { ...(classes[0] as PromotionClass), students: [stu('r', { decision: 'retain', toClassId: 'x' })] },
    ];
    expect(buildSavePayload(unchangedPlusNew, { r: 'retain' })).toEqual([]);
  });

  it('payload lengkap untuk keputusan baru', () => {
    expect(buildSavePayload(classes, initialChoices(classes))).toEqual([
      { studentId: 'a', decision: 'promote', reason: null, followUp: null, meetingDate: null },
    ]);
  });

  it('ringkasan: yang diterapkan dan yang belum diputuskan dihitung terpisah', () => {
    expect(summarize(classes, initialChoices(classes))).toEqual({
      total: 5,
      promote: 1,
      retain: 1,
      graduate: 1,
      undecided: 1,
      applied: 1,
      unsaved: 1,
    });
  });
});

describe('blokir tingkat akhir (K4)', () => {
  it('siswa tingkat akhir tanpa pilihan memblokir simpan dan lanjut', () => {
    const choices = initialChoices(classes);
    expect(missingFinalStudents(classes, choices).map((m) => m.student.studentId)).toEqual(['d']);
    const b = saveBlockers(classes, choices);
    expect(b).toEqual({ missingFinal: 1, invalidDetails: 0 });
    expect(isBlocked(b)).toBe(true);
    expect(missingByClass(classes, choices).get('c9')).toBe(1);
    expect(missingByClass(classes, choices).has('c7')).toBe(false);
  });

  it('terbuka setelah semua siswa tingkat akhir dipilih (lulus atau tinggal)', () => {
    for (const d of ['graduate', 'retain'] as const) {
      const choices = { ...initialChoices(classes), d };
      expect(isBlocked(saveBlockers(classes, choices))).toBe(false);
    }
  });

  it('siswa yang sudah diterapkan tidak memblokir', () => {
    const applied: PromotionClass[] = [
      {
        ...(classes[1] as PromotionClass),
        students: [finalStu('z', { applied: true, decision: 'graduate' })],
      },
    ];
    expect(missingFinalStudents(applied, {})).toEqual([]);
  });

  it('kelas non-akhir tidak pernah memblokir walau tanpa pilihan', () => {
    expect(missingFinalStudents([classes[0] as PromotionClass], {})).toEqual([]);
  });

  it('catatan tidak sah memblokir hanya siswa yang akan disimpan', () => {
    const choices = { ...initialChoices(classes), d: 'graduate' as const };
    const bad = { a: { meetingDate: '2026-02-30' } };
    expect(saveBlockers(classes, choices, bad)).toEqual({ missingFinal: 0, invalidDetails: 1 });
    // c sudah diterapkan: catatan tak sah miliknya diabaikan.
    expect(saveBlockers(classes, choices, { c: { meetingDate: 'bukan tanggal' } }).invalidDetails).toBe(0);
  });
});

describe('catatan keputusan', () => {
  const s = stu('x', {
    decision: 'retain',
    reason: 'sering sakit',
    followUp: null,
    meetingDate: '2026-06-20',
  });

  it('nilai efektif: suntingan menang atas yang tersimpan', () => {
    expect(effectiveDetails(s, {})).toEqual({
      reason: 'sering sakit',
      followUp: '',
      meetingDate: '2026-06-20',
    });
    expect(effectiveDetails(s, { x: { followUp: 'pendampingan' } })).toEqual({
      reason: 'sering sakit',
      followUp: 'pendampingan',
      meetingDate: '2026-06-20',
    });
  });

  it('perubahan: spasi di tepi tidak dihitung, tanggal dibandingkan apa adanya', () => {
    expect(detailsChanged(s, {})).toBe(false);
    expect(detailsChanged(s, { x: { reason: ' sering sakit ' } })).toBe(false);
    expect(detailsChanged(s, { x: { reason: 'lain' } })).toBe(true);
    expect(detailsChanged(s, { x: { meetingDate: '' } })).toBe(true);
  });

  it('mengubah catatan saja menandai siswa perlu disimpan, dengan keputusan dan kelas tujuan dibawa', () => {
    const cls: PromotionClass = {
      ...(classes[0] as PromotionClass),
      students: [stu('x', { decision: 'promote', toClassId: 'kelasX', reason: 'lama' })],
    };
    const choices = { x: 'promote' as const };
    expect(pendingStudents([cls], choices)).toEqual([]);
    const details = setDetail({}, 'x', 'reason', '  alasan baru  ');
    expect(pendingStudents([cls], choices, details)).toHaveLength(1);
    expect(buildSavePayload([cls], choices, details)).toEqual([
      {
        studentId: 'x',
        decision: 'promote',
        toClassId: 'kelasX',
        reason: 'alasan baru',
        followUp: null,
        meetingDate: null,
      },
    ]);
  });

  it('payload membawa nilai tersimpan yang tak disunting (server mengosongkan yang tak dikirim)', () => {
    const cls: PromotionClass = {
      ...(classes[0] as PromotionClass),
      students: [stu('x', { decision: 'retain', reason: 'sakit', meetingDate: '2026-06-20' })],
    };
    const details = setDetail({}, 'x', 'followUp', 'pendampingan');
    expect(buildSavePayload([cls], { x: 'retain' }, details)).toEqual([
      {
        studentId: 'x',
        decision: 'retain',
        reason: 'sakit',
        followUp: 'pendampingan',
        meetingDate: '2026-06-20',
      },
    ]);
  });

  it('mengosongkan catatan mengirim null eksplisit (field yang dihilangkan dipertahankan server)', () => {
    const cls: PromotionClass = {
      ...(classes[0] as PromotionClass),
      students: [stu('x', { decision: 'retain', reason: 'sakit' })],
    };
    const details = setDetail({}, 'x', 'reason', '   ');
    expect(buildSavePayload([cls], { x: 'retain' }, details)).toEqual([
      { studentId: 'x', decision: 'retain', reason: null, followUp: null, meetingDate: null },
    ]);
    // Tidak ada field catatan yang pernah undefined: semuanya string tersunting atau null.
    for (const item of buildSavePayload([cls], { x: 'retain' }, details)) {
      expect(item.reason).not.toBeUndefined();
      expect(item.followUp).not.toBeUndefined();
      expect(item.meetingDate).not.toBeUndefined();
    }
  });

  it('tanggal musyawarah massal menyentuh hanya siswa yang belum diterapkan di kelas itu', () => {
    const next = setClassMeetingDate(classes[0] as PromotionClass, {}, '2026-06-20');
    expect(next).toEqual({ a: { meetingDate: '2026-06-20' }, b: { meetingDate: '2026-06-20' } });
    const cleared = setClassMeetingDate(classes[0] as PromotionClass, next, '');
    expect(cleared.a?.meetingDate).toBe('');
  });

  it('validasi tanggal dan panjang teks', () => {
    expect(isIsoDate('2026-06-20')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('20-06-2026')).toBe(false);
    expect(invalidDetailsFor({ reason: '', followUp: '', meetingDate: '' })).toEqual([]);
    expect(invalidDetailsFor({ reason: 'a'.repeat(1001), followUp: '', meetingDate: 'x' })).toEqual([
      'reason',
      'meetingDate',
    ]);
  });
});

describe('daftar besar', () => {
  const list = [
    { name: 'Ahmad Fauzi', nis: '1001' },
    { name: 'Siti Aisyah', nis: '2002' },
  ];
  it('pencarian menurut nama atau NIS tanpa membedakan huruf besar-kecil', () => {
    expect(filterStudents(list, '')).toHaveLength(2);
    expect(filterStudents(list, 'ahm')).toEqual([list[0]]);
    expect(filterStudents(list, '2002')).toEqual([list[1]]);
    expect(filterStudents(list, 'zzz')).toEqual([]);
  });
  it('kelas dilipat bila besar, kecuali ada yang belum diputuskan, sedang dicari, atau dipilih pengguna', () => {
    const base = { userChoice: undefined, totalStudents: COLLAPSE_ABOVE + 1, missing: 0, searching: false };
    expect(isClassOpen(base)).toBe(false);
    expect(isClassOpen({ ...base, totalStudents: COLLAPSE_ABOVE })).toBe(true);
    expect(isClassOpen({ ...base, missing: 2 })).toBe(true);
    expect(isClassOpen({ ...base, searching: true })).toBe(true);
    expect(isClassOpen({ ...base, userChoice: true })).toBe(true);
    expect(isClassOpen({ ...base, userChoice: false, missing: 2 })).toBe(false);
  });
});

describe('chunk', () => {
  it('membagi daftar menurut ukuran', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('peringatan salin tahun ajaran', () => {
  it('kode yang dikenal memakai parameter, kode asing jatuh ke teks server, kembar digabung', () => {
    const out = rolloverWarnings({
      warnings: ['teks A', 'teks B', 'teks A', 'teks C'],
      warningItems: [
        { code: 'class_level_unknown', params: { className: '7A', level: '7' } },
        { code: 'kode_baru_belum_dikenal', params: { x: 1 } },
        { code: 'class_level_unknown', params: { className: '7A', level: '7' } },
        { code: 'inactive_teacher_skipped', params: { count: 2 } },
      ],
    });
    expect(out).toEqual([
      { code: 'class_level_unknown', params: { className: '7A', level: '7' }, fallback: 'teks A' },
      { code: null, params: {}, fallback: 'teks B' },
      { code: 'inactive_teacher_skipped', params: { count: 2 }, fallback: 'teks C' },
    ]);
  });
  it('API lama tanpa warningItems memakai teks apa adanya', () => {
    expect(rolloverWarnings({ warnings: ['a', 'b', 'a'] })).toEqual([
      { code: null, params: {}, fallback: 'a' },
      { code: null, params: {}, fallback: 'b' },
    ]);
  });
});

describe('izin per bagian salinan', () => {
  const all = {
    copyClasses: true,
    copyAssignments: true,
    copyCalendar: true,
    copyCurriculum: true,
    copyTeachingPlans: true,
  };
  const only =
    (...granted: string[]) =>
    (p: string) =>
      granted.includes(p);

  it('tiap pilihan memakai izin yang sama dengan API', () => {
    expect(permissionForOption('copyClasses')).toBe('class:manage');
    expect(permissionForOption('copyAssignments')).toBe('class:manage');
    expect(permissionForOption('copyCalendar')).toBe('academic_year:manage');
    expect(permissionForOption('copyCurriculum')).toBe('curriculum:manage');
    expect(permissionForOption('copyTeachingPlans')).toBe('teaching_plan:write');
  });
  it('pemanggil dengan semua izin tidak berubah', () => {
    const can = only('class:manage', 'academic_year:manage', 'curriculum:manage', 'teaching_plan:write');
    expect(sendableRolloverOptions(all, can)).toEqual(all);
    expect(Object.values(allowedRolloverOptions(can)).every(Boolean)).toBe(true);
  });
  it('tanpa izin spesifik tidak ada pilihan yang dikirim true', () => {
    expect(Object.values(sendableRolloverOptions(all, only())).some(Boolean)).toBe(false);
    expect(Object.values(allowedRolloverOptions(only())).some(Boolean)).toBe(false);
  });
  it('hanya bagian yang diizinkan yang tetap dikirim', () => {
    expect(sendableRolloverOptions(all, only('class:manage'))).toEqual({
      copyClasses: true,
      copyAssignments: true,
      copyCalendar: false,
      copyCurriculum: false,
      copyTeachingPlans: false,
    });
    expect(
      sendableRolloverOptions({ ...all, copyCalendar: false }, only('academic_year:manage')).copyCalendar,
    ).toBe(false);
  });
  it('mengenali bagian untuk terjemahan peringatan', () => {
    expect(isRolloverPart('teachingPlans')).toBe(true);
    expect(isRolloverPart('lain')).toBe(false);
    expect(isRolloverPart(undefined)).toBe(false);
    expect(
      rolloverWarnings({
        warnings: ['dilewati'],
        warningItems: [
          { code: 'part_skipped_no_permission', params: { part: 'classes', permission: 'class:manage' } },
        ],
      })[0],
    ).toMatchObject({ code: 'part_skipped_no_permission', fallback: 'dilewati' });
  });
});

describe('alasan siswa tak tertempatkan', () => {
  it('menurut kode bila dikenal, kalau tidak teks server', () => {
    expect(
      unplacedReason({ reason: 'x', reasonCode: 'no_target_class', reasonParams: { level: '8' } }),
    ).toEqual({
      code: 'no_target_class',
      params: { level: '8' },
      fallback: 'x',
    });
    expect(unplacedReason({ reason: 'x', reasonCode: 'kode_asing' })).toEqual({
      code: null,
      params: {},
      fallback: 'x',
    });
    expect(unplacedReason({ reason: 'x' }).code).toBeNull();
  });
});

describe('terjemahan kode API', () => {
  const dir = resolve(__dirname, '../../../../messages');
  const load = (l: string) => JSON.parse(readFileSync(resolve(dir, `${l}.json`), 'utf8')).promotion;
  for (const lang of ['id', 'en', 'su']) {
    it(`semua kode peringatan dan alasan punya teks tidak kosong (${lang})`, () => {
      const p = load(lang);
      for (const code of ROLLOVER_WARNING_CODES) {
        expect(typeof p.rolloverWarning[code], `${lang} rolloverWarning.${code}`).toBe('string');
        expect(p.rolloverWarning[code].trim()).not.toBe('');
      }
      for (const code of UNPLACED_REASON_CODES) {
        expect(typeof p.unplacedReason[code], `${lang} unplacedReason.${code}`).toBe('string');
        expect(p.unplacedReason[code].trim()).not.toBe('');
      }
    });
  }
});

describe('kelas bertingkat tidak dikenal', () => {
  const unknown: PromotionClass = {
    classId: 'cx',
    name: 'X-1',
    level: 'X',
    nextLevel: null,
    isFinalLevel: false,
    levelUnknown: true,
    students: [stu('u', { suggestedDecision: null }), stu('v', { suggestedDecision: null, toClassId: 'k8' })],
  };

  it('tanpa pilihan bawaan: hanya Tinggal, dan Naik hanya bagi siswa yang sudah punya kelas tujuan', () => {
    expect(optionsFor(unknown)).toEqual(['retain']);
    expect(optionsForStudent(unknown, { toClassId: null })).toEqual(['retain']);
    expect(optionsForStudent(unknown, { toClassId: 'k8' })).toEqual(['promote', 'retain']);
    // Kelas normal tidak berubah.
    expect(optionsForStudent(classes[0] as PromotionClass, { toClassId: null })).toEqual([
      'promote',
      'retain',
    ]);
  });

  it('aksi massal Naik melewati siswa tanpa kelas tujuan; Tinggal berlaku untuk semua', () => {
    expect(setClassDecision(unknown, {}, 'promote')).toEqual({ v: 'promote' });
    expect(setClassDecision(unknown, {}, 'retain')).toEqual({ u: 'retain', v: 'retain' });
    expect(setClassDecision(unknown, {}, 'graduate')).toEqual({});
  });

  it('tidak ada saran bawaan sehingga siswa tampil belum diputuskan sampai dipilih', () => {
    expect(initialChoices([unknown])).toEqual({});
    expect(levelUnknownClasses([unknown, classes[0] as PromotionClass]).map((c) => c.classId)).toEqual([
      'cx',
    ]);
  });
});

describe('peringatan lulus tanpa rapor final', () => {
  it('jumlah dari graduateReportNotFinal, kalau tidak dari peringatan terstruktur', () => {
    expect(graduateReportNotFinalCount({ graduateReportNotFinal: 3 })).toBe(3);
    expect(graduateReportNotFinalCount({ graduateReportNotFinal: 0 })).toBe(0);
    expect(
      graduateReportNotFinalCount({
        warningItems: [{ code: 'graduate_report_not_final', params: { count: 5 } }],
      }),
    ).toBe(5);
    expect(graduateReportNotFinalCount({ warningItems: [{ code: 'lain', params: { count: 9 } }] })).toBe(0);
    expect(graduateReportNotFinalCount({})).toBe(0);
  });

  it('konfirmasi tambahan hanya bila ada siswa terdampak', () => {
    expect(needsGraduateConfirm(0)).toBe(false);
    expect(needsGraduateConfirm(1)).toBe(true);
  });

  it('kode alasan baru dikenali dan semua teks baru tersedia di tiga bahasa', () => {
    expect(
      unplacedReason({
        reason: 'x',
        reasonCode: 'not_final_level',
        reasonParams: { className: '9A', level: '9' },
      }),
    ).toMatchObject({ code: 'not_final_level', params: { className: '9A', level: '9' } });
    expect(ROLLOVER_WARNING_CODES).toContain('flow_inactive_objectives');
    const dir = resolve(__dirname, '../../../../messages');
    for (const lang of ['id', 'en', 'su']) {
      const p = JSON.parse(readFileSync(resolve(dir, `${lang}.json`), 'utf8')).promotion;
      for (const key of [
        'levelUnknownBadge',
        'levelUnknownNote',
        'levelUnknownTitle',
        'levelUnknownBody',
        'graduateWarnTitle',
        'reportCardsLink',
        'graduateConfirmTitle',
        'graduateConfirmBody',
        'graduateConfirmLabel',
      ]) {
        expect(String(p[key] ?? '').trim(), `${lang} ${key}`).not.toBe('');
      }
      expect(p.applyWarning.graduate_report_not_final).toContain('{count}');
    }
  });
});
