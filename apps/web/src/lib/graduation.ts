import {
  GRADUATION_REPORT_SCOPES,
  GRADUATION_ROUNDINGS,
  type GraduationReportScope,
  type GraduationRounding,
  renderNumberTemplate,
  SCHOOL_EXAM_FORMS,
  validateNumberTemplate,
} from '@edusync/contracts';
import type { paths } from './api-types';
import { type FieldErrors, type FieldIssue, isRealDate } from './form-validation';
import { escapeHtml } from './ledger';

/**
 * Logika murni kelulusan (tahap 3C.4, tanpa React): isian kebijakan, validasi, isi permintaan, porsi bobot, tempel nilai dari
 * spreadsheet, keputusan massal dari saran, dan HTML cetak SKL dan transkrip. Aturannya mengikuti apps/api/src/routes/graduation.ts.
 */

export type GraduationList =
  paths['/v1/academic-years/{id}/graduations']['get']['responses'][200]['content']['application/json'];
export type GraduationStudent = GraduationList['students'][number];
export type PolicyView = NonNullable<
  paths['/v1/academic-years/{id}/graduation-policy']['get']['responses'][200]['content']['application/json']['policy']
>;
export type SchoolExamItem =
  paths['/v1/academic-years/{id}/school-exams']['get']['responses'][200]['content']['application/json']['items'][number];
export type ExamScores =
  paths['/v1/school-exams/{id}/scores']['get']['responses'][200]['content']['application/json'];
export type Scoring = NonNullable<GraduationStudent['suggestion']>;
export type Transcript = NonNullable<GraduationStudent['transcript']>;
export type GraduationResult = 'graduated' | 'not_graduated' | 'deferred';

export const RESULTS: GraduationResult[] = ['graduated', 'not_graduated', 'deferred'];
export const EXAM_FORMS = SCHOOL_EXAM_FORMS;
export const REPORT_SCOPES = GRADUATION_REPORT_SCOPES;
export const ROUNDINGS = GRADUATION_ROUNDINGS;

export const LIMITS = {
  examName: 120,
  criteria: 2000,
  template: 80,
  note: 1000,
  number: 60,
  skl: 120,
  reason: 500,
  levels: 20,
} as const;

/* ---------- Kebijakan ---------- */

export interface PolicyForm {
  reportWeight: string;
  /** Bobot per id ujian ('' = tidak dipakai). */
  examWeights: Record<string, string>;
  reportScope: GraduationReportScope;
  /** Kode tingkat dipisah koma; dipakai bila cakupan = tingkat tertentu. */
  reportLevels: string;
  rounding: GraduationRounding;
  minAverage: string;
  minSubjectScore: string;
  requiredSubjectIds: string[];
  criteriaText: string;
  /** Hanya SMK (5.6): saran menandai murid yang belum kompeten UKK. Mati = kunci tidak dikirim. */
  requireUkkCompetent: boolean;
  sklNumberTemplate: string;
  announceOn: string;
}

export type PolicyField =
  | 'reportWeight'
  | 'examWeights'
  | 'reportLevels'
  | 'minAverage'
  | 'minSubjectScore'
  | 'criteriaText'
  | 'sklNumberTemplate'
  | 'announceOn';
export const POLICY_ORDER: PolicyField[] = [
  'reportWeight',
  'examWeights',
  'reportLevels',
  'minAverage',
  'minSubjectScore',
  'criteriaText',
  'sklNumberTemplate',
  'announceOn',
];

export const EMPTY_POLICY: PolicyForm = {
  reportWeight: '',
  examWeights: {},
  reportScope: 'final_level',
  reportLevels: '',
  rounding: 'two_decimals',
  minAverage: '',
  minSubjectScore: '',
  requiredSubjectIds: [],
  criteriaText: '',
  requireUkkCompetent: false,
  sklNumberTemplate: '',
  announceOn: '',
};

const numText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

export function formFromPolicy(policy: PolicyView | null): PolicyForm {
  if (!policy) return { ...EMPTY_POLICY, examWeights: {}, requiredSubjectIds: [] };
  const c = policy.config;
  return {
    reportWeight: numText(c.reportWeight),
    examWeights: Object.fromEntries(Object.entries(c.examWeights).map(([id, w]) => [id, numText(w)])),
    reportScope: c.reportScope,
    reportLevels: (c.reportLevels ?? []).join(', '),
    rounding: c.rounding,
    minAverage: numText(c.minAverage),
    minSubjectScore: numText(c.minSubjectScore),
    requiredSubjectIds: [...(c.requiredSubjectIds ?? [])],
    criteriaText: c.criteriaText ?? '',
    requireUkkCompetent: c.requireUkkCompetent === true,
    sklNumberTemplate: policy.sklNumberTemplate ?? '',
    announceOn: policy.announceOn ?? '',
  };
}

/** Angka dari isian (koma desimal diterima); null bila kosong, NaN bila bukan angka. */
export function parseNumber(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

const levelsOf = (v: string) =>
  v
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

const rangeIssue = (n: number | null, required: boolean): FieldIssue | undefined => {
  if (n === null) return required ? { code: 'required' } : undefined;
  return Number.isNaN(n) || n < 0 || n > 100 ? { code: 'range', min: 0, max: 100 } : undefined;
};

/** Bobot rapor dan bobot ujian: jumlahnya harus lebih dari 0 (porsi dinormalkan oleh server). */
export function totalWeight(f: PolicyForm): number {
  const parse = (v: string) => {
    const n = parseNumber(v);
    return n === null || Number.isNaN(n) ? 0 : n;
  };
  return parse(f.reportWeight) + Object.values(f.examWeights).reduce((a, v) => a + parse(v), 0);
}

export function validatePolicy(f: PolicyForm): FieldErrors<PolicyField> {
  const out: FieldErrors<PolicyField> = {};
  const set = (k: PolicyField, i: FieldIssue | undefined) => {
    if (i) out[k] = i;
  };
  set('reportWeight', rangeIssue(parseNumber(f.reportWeight), false));
  const examBad = Object.values(f.examWeights).some((v) => rangeIssue(parseNumber(v), false));
  if (examBad) set('examWeights', { code: 'range', min: 0, max: 100 });
  if (!out.reportWeight && !out.examWeights && totalWeight(f) <= 0) {
    set('reportWeight', { code: 'custom', key: 'graduation.errors.weightsZero' });
  }
  if (f.reportScope === 'levels') {
    const n = levelsOf(f.reportLevels).length;
    if (n === 0) set('reportLevels', { code: 'required' });
    else if (n > LIMITS.levels) set('reportLevels', { code: 'tooLong', max: LIMITS.levels });
  }
  set('minAverage', rangeIssue(parseNumber(f.minAverage), false));
  set('minSubjectScore', rangeIssue(parseNumber(f.minSubjectScore), false));
  if (f.criteriaText.trim().length > LIMITS.criteria)
    set('criteriaText', { code: 'tooLong', max: LIMITS.criteria });
  const tpl = f.sklNumberTemplate.trim();
  if (tpl !== '') {
    const issue = validateNumberTemplate(tpl);
    if (issue === 'tooLong') set('sklNumberTemplate', { code: 'tooLong', max: LIMITS.template });
    else if (issue) set('sklNumberTemplate', { code: 'custom', key: 'graduation.errors.templateInvalid' });
  }
  if (f.announceOn !== '' && !isRealDate(f.announceOn)) set('announceOn', { code: 'dateInvalid' });
  return out;
}

/** Isi permintaan PUT kebijakan; bobot kosong dihitung 0 dan ujian berbobot 0 tidak dikirim. */
export function buildPolicyBody(f: PolicyForm, examIds: readonly string[]) {
  const n = (v: string) => {
    const x = parseNumber(v);
    return x === null || Number.isNaN(x) ? 0 : x;
  };
  const orNull = (v: string) => {
    const x = parseNumber(v);
    return x === null || Number.isNaN(x) ? null : x;
  };
  return {
    config: {
      reportWeight: n(f.reportWeight),
      examWeights: Object.fromEntries(
        examIds.flatMap((id) => (n(f.examWeights[id] ?? '') > 0 ? [[id, n(f.examWeights[id] ?? '')]] : [])),
      ),
      reportScope: f.reportScope,
      reportLevels: f.reportScope === 'levels' ? levelsOf(f.reportLevels) : [],
      rounding: f.rounding,
      minAverage: orNull(f.minAverage),
      minSubjectScore: orNull(f.minSubjectScore),
      requiredSubjectIds: f.requiredSubjectIds,
      criteriaText: f.criteriaText.trim() === '' ? null : f.criteriaText.trim(),
      // Kunci opsional: hanya dikirim bila menyala, supaya konfigurasi lama tetap persis sama.
      ...(f.requireUkkCompetent ? { requireUkkCompetent: true } : {}),
    },
    sklNumberTemplate: f.sklNumberTemplate.trim() === '' ? null : f.sklNumberTemplate.trim(),
    announceOn: f.announceOn === '' ? null : f.announceOn,
  };
}

export interface WeightShare {
  key: string;
  label: string;
  percent: number;
}

/** Porsi tiap komponen terhadap jumlah bobot (dibulatkan satu desimal); kosong bila jumlah bobot 0. */
export function weightShares(
  f: PolicyForm,
  exams: readonly { id: string; name: string }[],
  reportLabel: string,
): WeightShare[] {
  const parse = (v: string) => {
    const x = parseNumber(v);
    return x === null || Number.isNaN(x) ? 0 : x;
  };
  const total = totalWeight(f);
  if (total <= 0) return [];
  const rows = [
    { key: 'report', label: reportLabel, w: parse(f.reportWeight) },
    ...exams.map((e) => ({ key: e.id, label: e.name, w: parse(f.examWeights[e.id] ?? '') })),
  ];
  return rows
    .filter((r) => r.w > 0)
    .map((r) => ({ key: r.key, label: r.label, percent: Math.round((r.w / total) * 1000) / 10 }));
}

/** Contoh nomor SKL dari templat (nomor urut 1 dan tahun tanggal kelulusan atau tahun ini); null bila templat tak sah. */
export function templatePreview(template: string, year: number): string | null {
  const t = template.trim();
  if (t === '' || validateNumberTemplate(t) !== null) return null;
  return renderNumberTemplate(t, { seq: 1, year });
}

/* ---------- Nilai ujian: grid dan tempel ---------- */

export interface ParsedPaste {
  /** Nilai yang cocok dengan murid (NIS atau nama persis), siap dimasukkan ke grid. */
  matched: { studentId: string; value: number }[];
  /** Baris yang NIS/namanya tidak cocok dengan murid mana pun. */
  unmatched: string[];
  /** Baris yang nilainya bukan angka 0-100. */
  invalid: string[];
}

/**
 * Tempel dari spreadsheet: tiap baris "NIS<tab|;|,>nilai" (atau nama murid persis sebagai pengganti NIS); koma desimal pada nilai
 * diterima ("85,5"). Baris kosong dilewati; baris pertama yang berupa judul (nilai bukan angka) dilaporkan sebagai tidak sah.
 */
export function parseScorePaste(
  text: string,
  students: readonly { studentId: string; name: string; nis: string | null }[],
): ParsedPaste {
  const byKey = new Map<string, string>();
  for (const s of students) {
    if (s.nis) byKey.set(s.nis.trim().toLowerCase(), s.studentId);
    byKey.set(s.name.trim().toLowerCase(), s.studentId);
  }
  const out: ParsedPaste = { matched: [], unmatched: [], invalid: [] };
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const parts = line.includes('\t')
      ? line.split('\t')
      : line.includes(';')
        ? line.split(';')
        : line.split(/,(?=[^,]*$)/);
    const valueText = (parts.length > 1 ? parts[parts.length - 1] : '')?.trim() ?? '';
    const keyText = parts.slice(0, -1).join(' ').trim().toLowerCase();
    const id = byKey.get(keyText);
    if (parts.length < 2 || keyText === '') {
      out.invalid.push(line);
      continue;
    }
    const value = parseNumber(valueText);
    if (value === null || Number.isNaN(value) || value > 100) {
      out.invalid.push(line);
      continue;
    }
    if (!id) {
      out.unmatched.push(line);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.matched.push({ studentId: id, value });
  }
  return out;
}

/** Isian grid per murid ('' = kosong); kunci = studentId. */
export type ScoreEdits = Record<string, string>;

export function initialEdits(scores: ExamScores['scores'], subjectId: string): ScoreEdits {
  return Object.fromEntries(
    scores
      .filter((s) => s.subjectId === subjectId && s.value !== null)
      .map((s) => [s.studentId, String(s.value)]),
  );
}

export function scoreIssue(v: string): FieldIssue | undefined {
  const n = parseNumber(v);
  if (n === null) return undefined;
  return Number.isNaN(n) || n > 100 ? { code: 'range', min: 0, max: 100 } : undefined;
}

/** Nilai yang berubah dari isian awal (termasuk dikosongkan), siap dikirim; isian tak sah tidak dikirim. */
export function changedScores(initial: ScoreEdits, current: ScoreEdits, subjectId: string) {
  const ids = new Set([...Object.keys(initial), ...Object.keys(current)]);
  const out: { studentId: string; subjectId: string; value: number | null }[] = [];
  for (const studentId of ids) {
    const before = (initial[studentId] ?? '').trim();
    const after = (current[studentId] ?? '').trim();
    if (before === after) continue;
    const n = parseNumber(after);
    if (Number.isNaN(n)) continue;
    if (n !== null && n > 100) continue;
    out.push({ studentId, subjectId, value: n });
  }
  return out;
}

export const hasInvalidScore = (edits: ScoreEdits) =>
  Object.values(edits).some((v) => scoreIssue(v) !== undefined);

/* ---------- Penetapan ---------- */

export const isFinal = (s: Pick<GraduationStudent, 'decision'>) => s.decision?.status === 'final';

/** Saran hasil: memenuhi kriteria = lulus, tidak = tidak lulus; null bila data belum lengkap (tidak menebak). */
export function suggestedResult(s: GraduationStudent): GraduationResult | null {
  const g = s.suggestion;
  if (!g || g.incomplete || g.reportNotFinal || g.average === null) return null;
  return g.meetsCriteria ? 'graduated' : 'not_graduated';
}

/** Draf massal dari saran: hanya murid yang belum punya hasil dan punya saran; tanggal kelulusan seragam. */
export function bulkFromSuggestions(students: readonly GraduationStudent[], graduatedOn: string) {
  return students.flatMap((s) => {
    if (isFinal(s) || s.decision?.result) return [];
    const result = suggestedResult(s);
    if (!result) return [];
    return [{ studentId: s.studentId, result, ...(result === 'graduated' ? { graduatedOn } : {}) }];
  });
}

/** Murid berstatus draf dengan hasil (dan tanggal bila lulus): siap ditetapkan. */
export function readyToFinalize(students: readonly GraduationStudent[]): GraduationStudent[] {
  return students.filter(
    (s) =>
      s.decision &&
      s.decision.status === 'draft' &&
      s.decision.result !== null &&
      (s.decision.result !== 'graduated' || !!s.decision.graduatedOn),
  );
}

export interface StatusCounts {
  total: number;
  graduated: number;
  notGraduated: number;
  deferred: number;
  undecided: number;
  final: number;
}

/** Murid yang butuh `force` (rapor belum final atau nilai belum lengkap) di antara yang akan ditetapkan. */
export function needsForce(students: readonly GraduationStudent[]) {
  const reportNotFinal = students.filter((s) => s.suggestion?.reportNotFinal).length;
  const incomplete = students.filter((s) => s.suggestion?.incomplete).length;
  return { reportNotFinal, incomplete, any: reportNotFinal > 0 || incomplete > 0 };
}

/** Isian draf satu murid. */
export interface DecisionForm {
  result: GraduationResult | '';
  graduatedOn: string;
  note: string;
  meetingId: string;
  sklNumber: string;
  diplomaNumber: string;
}

export function decisionFormOf(s: GraduationStudent, defaultDate: string): DecisionForm {
  const d = s.decision;
  return {
    result: d?.result ?? '',
    graduatedOn: d?.graduatedOn ?? defaultDate,
    note: d?.note ?? '',
    meetingId: d?.meetingId ?? '',
    sklNumber: d?.sklNumber ?? '',
    diplomaNumber: d?.diplomaNumber ?? '',
  };
}

export type DecisionField = 'graduatedOn' | 'note' | 'sklNumber' | 'diplomaNumber';
export const DECISION_ORDER: DecisionField[] = ['graduatedOn', 'note', 'sklNumber', 'diplomaNumber'];

export function validateDecision(f: DecisionForm): FieldErrors<DecisionField> {
  const out: FieldErrors<DecisionField> = {};
  if (f.result === 'graduated' && f.graduatedOn !== '' && !isRealDate(f.graduatedOn)) {
    out.graduatedOn = { code: 'dateInvalid' };
  }
  if (f.note.trim().length > LIMITS.note) out.note = { code: 'tooLong', max: LIMITS.note };
  if (f.sklNumber.trim().length > LIMITS.skl) out.sklNumber = { code: 'tooLong', max: LIMITS.skl };
  if (f.diplomaNumber.trim().length > LIMITS.number) {
    out.diplomaNumber = { code: 'tooLong', max: LIMITS.number };
  }
  return out;
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

export function buildDecisionItem(studentId: string, f: DecisionForm) {
  return {
    studentId,
    result: f.result === '' ? null : f.result,
    graduatedOn: f.result === 'graduated' && f.graduatedOn !== '' ? f.graduatedOn : null,
    note: orNull(f.note),
    meetingId: f.meetingId === '' ? null : f.meetingId,
    sklNumber: orNull(f.sklNumber),
    diplomaNumber: orNull(f.diplomaNumber),
  };
}

/** Kunci pesan galat khusus kelulusan (kode galat API yang artinya berbeda di tempat lain, mis. `report_not_final`). */
const GRADUATION_ERRORS = new Set([
  'report_not_final',
  'scores_incomplete',
  'reason_required',
  'result_required',
  'graduated_on_required',
  'number_taken',
  'invalid_template',
  'exam_in_use',
  'student_not_in_final_class',
  'no_graduation_policy',
  'graduation_not_final',
  'graduation_final',
]);
export const graduationErrorCode = (code: string | undefined): string | null =>
  code && GRADUATION_ERRORS.has(code) ? `graduation.errors.${code}` : null;

/* ---------- Cetak ---------- */

export interface PrintMeta {
  school: GraduationList['school'];
  yearName: string;
  locale: string;
  /** Teks tanggal yang sudah diformat (tanggal kelulusan, tanggal cetak). */
  graduatedOnText: string;
  printedOnText: string;
}

export interface SklLabels {
  title: string;
  number: string;
  intro: string;
  name: string;
  nis: string;
  nisn: string;
  className: string;
  year: string;
  statement: string;
  criteria: string;
  principal: string;
  nip: string;
  npsn: string;
  draftNote: string;
  numberMissing: string;
  signPlace: string;
}

const STYLE =
  '@page{size:A4;margin:18mm}body{font:13px/1.55 system-ui,sans-serif;color:#111;margin:0}' +
  'h1{font-size:18px;text-align:center;margin:0}h2{font-size:13px;margin:16px 0 4px}p{margin:0 0 6px}' +
  '.center{text-align:center}.sub{color:#444;font-size:12px}.note{font-size:11px;color:#555}' +
  'dl{display:grid;grid-template-columns:150px 1fr;gap:3px 10px;margin:12px 0}dt{font-weight:600}dd{margin:0}' +
  'table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #888;padding:4px 7px;text-align:left}' +
  'th{background:#eee}td.num,th.num{text-align:right;white-space:nowrap}tr{break-inside:avoid}thead{display:table-header-group}' +
  '.sign{margin:36px 0 0 auto;width:50%;text-align:center;break-inside:avoid}.sign .line{margin-top:60px;font-weight:600;text-decoration:underline}';

const dash = '-';
const fmt = (n: number | null) => (n === null ? dash : String(n));

/** Surat Keterangan Lulus satu murid (HTML mandiri, potret A4). Hanya untuk murid yang ditetapkan lulus. */
export function sklHtml(s: GraduationStudent, l: SklLabels, m: PrintMeta): string {
  const e = escapeHtml;
  const sch = m.school;
  const draft = s.decision?.status !== 'final';
  const criteria = s.transcript?.policy.criteriaText;
  return (
    `<!doctype html><html lang="${e(m.locale)}"><head><meta charset="utf-8"><title>${e(`${l.title} - ${s.name}`)}</title><style>${STYLE}</style></head><body>` +
    `<h1>${e(sch.name)}</h1>` +
    `<p class="center sub">${e([sch.address, sch.city].filter(Boolean).join(', ') || dash)}${sch.npsn ? ` | ${e(l.npsn)} ${e(sch.npsn)}` : ''}</p>` +
    `<h1 style="margin-top:18px">${e(l.title)}</h1>` +
    `<p class="center">${e(l.number)}: ${e(s.decision?.sklNumber ?? l.numberMissing)}</p>` +
    `<p style="margin-top:14px">${e(l.intro)}</p>` +
    '<dl>' +
    `<dt>${e(l.name)}</dt><dd>${e(s.name)}</dd>` +
    `<dt>${e(l.nis)}</dt><dd>${e(s.nis ?? dash)}</dd>` +
    `<dt>${e(l.nisn)}</dt><dd>${e(s.nisn ?? dash)}</dd>` +
    `<dt>${e(l.className)}</dt><dd>${e(s.className)}</dd>` +
    `<dt>${e(l.year)}</dt><dd>${e(m.yearName)}</dd></dl>` +
    `<p>${e(l.statement)}</p>` +
    (criteria ? `<h2>${e(l.criteria)}</h2><p>${e(criteria).replace(/\n/g, '<br>')}</p>` : '') +
    `<div class="sign"><p>${e(l.signPlace)}</p><p>${e(l.principal)}</p><div class="line">${e(sch.principal?.name ?? dash)}</div>` +
    `${sch.principal?.nip ? `<p>${e(l.nip)} ${e(sch.principal.nip)}</p>` : ''}</div>` +
    (draft ? `<p class="note">${e(l.draftNote)}</p>` : '') +
    `<p class="note">${e(m.printedOnText)}</p></body></html>`
  );
}

export interface TranscriptLabels {
  title: string;
  name: string;
  nis: string;
  nisn: string;
  className: string;
  year: string;
  colNo: string;
  colSubject: string;
  colReport: string;
  colFinal: string;
  average: string;
  weights: string;
  reportWeightLabel: string;
  criteria: string;
  forced: string;
  result: string;
  results: Record<GraduationResult, string>;
  decidedOn: string;
  skl: string;
  principal: string;
  nip: string;
  draftNote: string;
  signPlace: string;
}

/** Transkrip nilai kelulusan satu murid dari transkrip beku (dan hanya dari yang beku). */
export function transcriptHtml(s: GraduationStudent, l: TranscriptLabels, m: PrintMeta): string | null {
  const t = s.transcript;
  if (!t) return null;
  const e = escapeHtml;
  const exams = t.policy.examWeights;
  const head =
    `<th>${e(l.colNo)}</th><th>${e(l.colSubject)}</th><th class="num">${e(l.colReport)}</th>` +
    exams.map((x) => `<th class="num">${e(x.name)}</th>`).join('') +
    `<th class="num">${e(l.colFinal)}</th>`;
  const rows = t.subjects
    .map(
      (sub, i) =>
        `<tr><td class="num">${i + 1}</td><td>${e(sub.name)}</td><td class="num">${fmt(sub.report)}</td>` +
        exams
          .map(
            (x) => `<td class="num">${fmt(sub.exams.find((y) => y.examId === x.examId)?.value ?? null)}</td>`,
          )
          .join('') +
        `<td class="num">${fmt(sub.final)}</td></tr>`,
    )
    .join('');
  const total = t.policy.reportWeight + exams.reduce((a, x) => a + x.weight, 0);
  const share = (w: number) => (total > 0 ? Math.round((w / total) * 1000) / 10 : 0);
  const weights = [
    ...(t.policy.reportWeight > 0 ? [`${l.reportWeightLabel} ${share(t.policy.reportWeight)}%`] : []),
    ...exams.map((x) => `${x.name} ${share(x.weight)}%`),
  ].join(', ');
  const resultText = s.decision?.result ? l.results[s.decision.result] : dash;
  return (
    `<!doctype html><html lang="${e(m.locale)}"><head><meta charset="utf-8"><title>${e(`${l.title} - ${s.name}`)}</title><style>${STYLE}</style></head><body>` +
    `<h1>${e(l.title)}</h1><p class="center sub">${e(m.school.name)} | ${e(m.yearName)}</p>` +
    '<dl>' +
    `<dt>${e(l.name)}</dt><dd>${e(s.name)}</dd>` +
    `<dt>${e(l.nis)}</dt><dd>${e(s.nis ?? dash)}</dd>` +
    `<dt>${e(l.nisn)}</dt><dd>${e(s.nisn ?? dash)}</dd>` +
    `<dt>${e(l.className)}</dt><dd>${e(s.className)}</dd>` +
    `<dt>${e(l.result)}</dt><dd>${e(resultText)}</dd>` +
    `<dt>${e(l.decidedOn)}</dt><dd>${e(m.graduatedOnText)}</dd>` +
    `<dt>${e(l.skl)}</dt><dd>${e(s.decision?.sklNumber ?? dash)}</dd></dl>` +
    `<table><thead><tr>${head}</tr></thead><tbody>${rows}` +
    `<tr><th colspan="${3 + exams.length}">${e(l.average)}</th><th class="num">${fmt(t.average)}</th></tr></tbody></table>` +
    (weights ? `<p class="note" style="margin-top:6px">${e(l.weights)}: ${e(weights)}</p>` : '') +
    (t.policy.criteriaText
      ? `<h2>${e(l.criteria)}</h2><p>${e(t.policy.criteriaText).replace(/\n/g, '<br>')}</p>`
      : '') +
    (t.forced ? `<p class="note">${e(l.forced)}: ${e(t.forced.reason)}</p>` : '') +
    `<div class="sign"><p>${e(l.signPlace)}</p><p>${e(l.principal)}</p><div class="line">${e(m.school.principal?.name ?? dash)}</div>` +
    `${m.school.principal?.nip ? `<p>${e(l.nip)} ${e(m.school.principal.nip)}</p>` : ''}</div>` +
    `<p class="note">${e(m.printedOnText)}</p></body></html>`
  );
}

/** Nama berkas aman untuk judul cetak. */
export function documentFileName(kind: 'skl' | 'transkrip', name: string, year: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kind}-${slug || 'murid'}-${year.replace(/[^0-9a-z]+/gi, '-')}`;
}
