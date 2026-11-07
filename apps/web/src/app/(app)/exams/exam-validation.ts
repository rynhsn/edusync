/**
 * Aturan isian formulir ujian di sisi klien (murni, tanpa React). Mengikuti zod di API:
 * - jenis ujian: apps/api/src/routes/exam-bank.ts (`typeBody`)
 * - ujian: apps/api/src/routes/exams.ts (`examBody`)
 * - soal: apps/api/src/routes/exam-bank.ts (`questionFields` dan `checkQuestion`)
 * - skor esai: apps/api/src/routes/exam-scores.ts (`recordsBody`)
 * Tambahan klien yang sengaja lebih ketat dari API: skor esai tidak boleh melebihi poin soal (API hanya 0..100000),
 * ujian CBT berstatus "Siap" wajib berjadwal lengkap (API tidak memeriksa), dan impor soal wajib ada berkasnya.
 */
import {
  compactErrors,
  customIssue,
  decimalInRange,
  intInRange,
  optionalText,
  parseDecimal,
  requiredChoice,
  requiredText,
  timeOfDay,
} from '../../../lib/form-issues';
import type { FieldErrors, FieldIssue } from '../../../lib/form-validation';

// ---------------------------------------------------------------------------------------------------------------------
// Jenis ujian

export interface ExamTypeValues {
  name: string;
  shortName: string;
}
export type ExamTypeField = keyof ExamTypeValues;
export const EXAM_TYPE_ORDER: ExamTypeField[] = ['name', 'shortName'];

export function validateExamType(v: ExamTypeValues): FieldErrors<ExamTypeField> {
  return compactErrors<ExamTypeField>([
    ['name', requiredText(v.name, 100)],
    ['shortName', requiredText(v.shortName, 20)],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Ujian

export interface ExamValues {
  title: string;
  semesterId: string;
  subjectId: string;
  classIds: string[];
  mode: 'cbt' | 'paper' | 'both';
  status: 'draft' | 'ready';
  examDate: string;
  startTime: string;
  durationMinutes: string;
}
export type ExamField =
  | 'subjectId'
  | 'title'
  | 'semesterId'
  | 'classIds'
  | 'examDate'
  | 'startTime'
  | 'durationMinutes';
export const EXAM_ORDER: ExamField[] = [
  'subjectId',
  'title',
  'semesterId',
  'classIds',
  'examDate',
  'startTime',
  'durationMinutes',
];

export function validateExam(v: ExamValues): FieldErrors<ExamField> {
  // CBT yang "Siap" harus berjadwal lengkap, kalau tidak siswa tidak bisa memulainya.
  const needSchedule = v.mode !== 'paper' && v.status === 'ready';
  const missing = (value: string): FieldIssue | undefined =>
    needSchedule && value === '' ? customIssue('examForm.scheduleNeeded') : undefined;
  return compactErrors<ExamField>([
    ['subjectId', requiredChoice(v.subjectId)],
    ['title', requiredText(v.title, 200)],
    ['semesterId', requiredChoice(v.semesterId)],
    [
      'classIds',
      v.classIds.length === 0
        ? customIssue('examForm.pickClasses')
        : v.classIds.length > 40
          ? { code: 'tooLong', max: 40 }
          : undefined,
    ],
    ['examDate', missing(v.examDate)],
    ['startTime', timeOfDay(v.startTime) ?? missing(v.startTime)],
    [
      'durationMinutes',
      intInRange(v.durationMinutes, 5, 600, { required: false }) ?? missing(v.durationMinutes.trim()),
    ],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Soal

export const MAX_OPTIONS = 6;

export interface QuestionValues {
  subjectId: string;
  type: 'mcq' | 'essay';
  body: string;
  options: string[];
  answer: string;
  explanation: string;
  points: string;
}
export type OptionField = `option${0 | 1 | 2 | 3 | 4 | 5}`;
export type QuestionField = 'subjectId' | 'points' | 'body' | OptionField | 'answer' | 'explanation';
export const optionField = (i: number): OptionField => `option${i}` as OptionField;
export const QUESTION_ORDER: QuestionField[] = [
  'subjectId',
  'points',
  'body',
  'option0',
  'option1',
  'option2',
  'option3',
  'option4',
  'option5',
  'answer',
  'explanation',
];

export function validateQuestion(v: QuestionValues): FieldErrors<QuestionField> {
  const entries: [QuestionField, FieldIssue | undefined][] = [
    ['subjectId', requiredChoice(v.subjectId)],
    ['points', intInRange(v.points, 1, 1000, { required: true })],
    ['body', requiredText(v.body, 10_000)],
    ['explanation', optionalText(v.explanation, 5000)],
  ];
  if (v.type === 'mcq') {
    v.options.slice(0, MAX_OPTIONS).forEach((text, i) => {
      entries.push([optionField(i), requiredText(text, 2000)]);
    });
  } else {
    entries.push(['answer', optionalText(v.answer, 5000)]);
  }
  return compactErrors<QuestionField>(entries);
}

/** Poin satu soal pada daftar soal ujian (isian di tempat). */
export function validatePoints(value: string): FieldIssue | undefined {
  return intInRange(value, 1, 1000, { required: true });
}

// ---------------------------------------------------------------------------------------------------------------------
// Tambah soal dari bank ke ujian

export type PickField = 'picked';
export function validatePicked(count: number): FieldErrors<PickField> {
  return compactErrors<PickField>([
    ['picked', count === 0 ? customIssue('examForm.pickQuestions') : undefined],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Impor soal

export interface ImportValues {
  subjectId: string;
  /** Ada berkas yang sudah dibaca. */
  hasFile: boolean;
  rows: number;
  maxRows: number;
  /** Pemeriksaan ke server masih berjalan atau belum ada laporannya. */
  checking: boolean;
  /** Jumlah baris bermasalah menurut server. */
  invalid: number;
  skipInvalid: boolean;
  /** Banyak baris yang akan dikirim. */
  toSend: number;
}
export type ImportField = 'subjectId' | 'file' | 'skipInvalid';
export const IMPORT_ORDER: ImportField[] = ['subjectId', 'file', 'skipInvalid'];

export function validateImport(v: ImportValues): FieldErrors<ImportField> {
  let file: FieldIssue | undefined;
  if (!v.hasFile) file = customIssue('examForm.importNoFile');
  else if (v.rows === 0) file = customIssue('examForm.importNoRows');
  else if (v.rows > v.maxRows) file = customIssue('examForm.importTooMany', { max: v.maxRows });
  else if (v.checking) file = customIssue('examForm.importChecking');
  else if (v.toSend === 0) file = customIssue('examForm.importNothing');
  return compactErrors<ImportField>([
    ['subjectId', requiredChoice(v.subjectId)],
    ['file', file],
    [
      'skipInvalid',
      !file && v.invalid > 0 && !v.skipInvalid
        ? customIssue('examForm.importSkipNeeded', { n: v.invalid })
        : undefined,
    ],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Input nilai: sel skor esai, dan dialog kirim ke buku nilai

/**
 * Isian satu sel skor esai. Kosong = belum dinilai (boleh). Harus angka 0..poin soal; API hanya membatasi 0..100000,
 * batas poin soal adalah aturan klien.
 */
export function validateEssayScore(value: string, points: number): FieldIssue | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  if (parseDecimal(v) === undefined) return customIssue('examForm.scoreNotNumber');
  return decimalInRange(v, 0, points) ? customIssue('examForm.scoreRange', { max: points }) : undefined;
}

export interface SendValues {
  componentId: string;
  pendingEssays: number;
  allowPending: boolean;
}
export type SendField = 'componentId' | 'allowPending';
export const SEND_ORDER: SendField[] = ['componentId', 'allowPending'];

export function validateSend(v: SendValues): FieldErrors<SendField> {
  return compactErrors<SendField>([
    ['componentId', requiredChoice(v.componentId)],
    [
      'allowPending',
      v.pendingEssays > 0 && !v.allowPending
        ? customIssue('examForm.pendingConfirm', { n: v.pendingEssays })
        : undefined,
    ],
  ]);
}
