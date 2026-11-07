import { describe, expect, it } from 'vitest';
import {
  type ExamValues,
  type ImportValues,
  validateEssayScore,
  validateExam,
  validateExamType,
  validateImport,
  validatePicked,
  validatePoints,
  validateQuestion,
  validateSend,
} from './exam-validation';

const exam = (over: Partial<ExamValues> = {}): ExamValues => ({
  title: 'ASAS Matematika',
  semesterId: 's1',
  subjectId: 'm1',
  classIds: ['c1'],
  mode: 'paper',
  status: 'draft',
  examDate: '',
  startTime: '',
  durationMinutes: '',
  ...over,
});

describe('validateExamType', () => {
  it('nama 100 dan singkatan 20', () => {
    expect(validateExamType({ name: 'a', shortName: 'b' })).toEqual({});
    expect(validateExamType({ name: ' ', shortName: '' })).toEqual({
      name: { code: 'required' },
      shortName: { code: 'required' },
    });
    expect(validateExamType({ name: 'a'.repeat(101), shortName: 'b'.repeat(21) })).toEqual({
      name: { code: 'tooLong', max: 100 },
      shortName: { code: 'tooLong', max: 20 },
    });
  });
});

describe('validateExam', () => {
  it('ujian kertas tanpa jadwal sah', () => {
    expect(validateExam(exam())).toEqual({});
  });
  it('judul, semester, mapel, kelas wajib', () => {
    const e = validateExam(exam({ title: '', semesterId: '', subjectId: '', classIds: [] }));
    expect(Object.keys(e).sort()).toEqual(['classIds', 'semesterId', 'subjectId', 'title']);
    expect(e.classIds?.key).toBe('examForm.pickClasses');
  });
  it('durasi 5..600 bulat', () => {
    expect(validateExam(exam({ durationMinutes: '4' })).durationMinutes?.code).toBe('range');
    expect(validateExam(exam({ durationMinutes: '601' })).durationMinutes?.code).toBe('range');
    expect(validateExam(exam({ durationMinutes: '5.5' })).durationMinutes?.code).toBe('intInvalid');
    expect(validateExam(exam({ durationMinutes: '90' }))).toEqual({});
  });
  it('CBT berstatus Siap wajib jadwal lengkap', () => {
    const e = validateExam(exam({ mode: 'cbt', status: 'ready' }));
    expect(Object.keys(e).sort()).toEqual(['durationMinutes', 'examDate', 'startTime']);
    expect(validateExam(exam({ mode: 'cbt', status: 'draft' }))).toEqual({});
    expect(
      validateExam(
        exam({
          mode: 'both',
          status: 'ready',
          examDate: '2026-11-08',
          startTime: '07:30',
          durationMinutes: '90',
        }),
      ),
    ).toEqual({});
  });
  it('jam harus HH:MM', () => {
    expect(validateExam(exam({ startTime: '25:00' })).startTime?.code).toBe('custom');
  });
});

describe('validateQuestion', () => {
  const q = {
    subjectId: 'm1',
    type: 'mcq' as const,
    body: 'Soal?',
    options: ['a', 'b', 'c', 'd'],
    answer: '',
    explanation: '',
    points: '1',
  };
  it('soal pilihan ganda sah', () => {
    expect(validateQuestion(q)).toEqual({});
  });
  it('opsi kosong ditandai per opsi', () => {
    expect(validateQuestion({ ...q, options: ['a', ' ', 'c', ''] })).toEqual({
      option1: { code: 'required' },
      option3: { code: 'required' },
    });
  });
  it('esai tidak memeriksa opsi, kunci opsional maks 5000', () => {
    expect(validateQuestion({ ...q, type: 'essay', options: ['', ''] })).toEqual({});
    expect(validateQuestion({ ...q, type: 'essay', answer: 'x'.repeat(5001) }).answer?.code).toBe('tooLong');
  });
  it('poin 1..1000 bulat, badan wajib maks 10000', () => {
    expect(validateQuestion({ ...q, points: '0' }).points?.code).toBe('range');
    expect(validateQuestion({ ...q, points: '1001' }).points?.code).toBe('range');
    expect(validateQuestion({ ...q, points: '' }).points?.code).toBe('required');
    expect(validateQuestion({ ...q, body: ' ' }).body?.code).toBe('required');
    expect(validateQuestion({ ...q, body: 'x'.repeat(10_001) }).body?.code).toBe('tooLong');
  });
});

describe('poin dan pilihan soal', () => {
  it('validatePoints', () => {
    expect(validatePoints('5')).toBeUndefined();
    expect(validatePoints('0')?.code).toBe('range');
    expect(validatePoints('')?.code).toBe('required');
  });
  it('validatePicked', () => {
    expect(validatePicked(0).picked?.key).toBe('examForm.pickQuestions');
    expect(validatePicked(2)).toEqual({});
  });
});

describe('validateImport', () => {
  const base: ImportValues = {
    subjectId: 'm1',
    hasFile: true,
    rows: 10,
    maxRows: 500,
    checking: false,
    invalid: 0,
    skipInvalid: false,
    toSend: 10,
  };
  it('sah', () => expect(validateImport(base)).toEqual({}));
  it('tanpa berkas, kosong, terlalu banyak, masih diperiksa', () => {
    expect(validateImport({ ...base, hasFile: false }).file?.key).toBe('examForm.importNoFile');
    expect(validateImport({ ...base, rows: 0 }).file?.key).toBe('examForm.importNoRows');
    expect(validateImport({ ...base, rows: 501 }).file?.key).toBe('examForm.importTooMany');
    expect(validateImport({ ...base, checking: true }).file?.key).toBe('examForm.importChecking');
  });
  it('baris bermasalah wajib dicentang lewati', () => {
    expect(validateImport({ ...base, invalid: 2 }).skipInvalid?.key).toBe('examForm.importSkipNeeded');
    expect(validateImport({ ...base, invalid: 2, skipInvalid: true, toSend: 8 })).toEqual({});
    expect(validateImport({ ...base, invalid: 10, skipInvalid: true, toSend: 0 }).file?.key).toBe(
      'examForm.importNothing',
    );
  });
});

describe('validateEssayScore', () => {
  it('kosong lolos', () => expect(validateEssayScore('', 10)).toBeUndefined());
  it('0..poin, desimal dengan koma', () => {
    expect(validateEssayScore('0', 10)).toBeUndefined();
    expect(validateEssayScore('7,5', 10)).toBeUndefined();
    expect(validateEssayScore('10', 10)).toBeUndefined();
    expect(validateEssayScore('10,5', 10)?.key).toBe('examForm.scoreRange');
    expect(validateEssayScore('1.2.3', 10)?.key).toBe('examForm.scoreNotNumber');
    expect(validateEssayScore(',', 10)?.key).toBe('examForm.scoreNotNumber');
  });
});

describe('validateSend', () => {
  it('komponen wajib; esai belum dinilai wajib dicentang', () => {
    expect(validateSend({ componentId: '', pendingEssays: 0, allowPending: false }).componentId?.code).toBe(
      'choose',
    );
    expect(validateSend({ componentId: 'c', pendingEssays: 3, allowPending: false }).allowPending?.key).toBe(
      'examForm.pendingConfirm',
    );
    expect(validateSend({ componentId: 'c', pendingEssays: 3, allowPending: true })).toEqual({});
    expect(validateSend({ componentId: 'c', pendingEssays: 0, allowPending: false })).toEqual({});
  });
});
