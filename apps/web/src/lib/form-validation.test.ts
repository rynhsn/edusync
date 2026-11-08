import { describe, expect, it } from 'vitest';
import {
  firstInvalid,
  normalizePhone,
  STUDENT_ORDER,
  type StudentValues,
  todayIso,
  validateClass,
  validateStudent,
  validateSubject,
  validateTeacher,
} from './form-validation';

const TODAY = '2026-11-07';
const ok: StudentValues = {
  name: 'Siti Aminah',
  nis: '2024/001',
  nisn: '0012345678',
  nik: '3201234567890001',
  birthPlace: 'Bandung',
  birthDate: '2012-05-20',
  phone: '081234567890',
  email: 'siti@contoh.sch.id',
  address: 'Jl. Merdeka 1',
};
const blank: StudentValues = {
  name: 'A',
  nis: '',
  nisn: '',
  nik: '',
  birthPlace: '',
  birthDate: '',
  phone: '',
  email: '',
  address: '',
};

describe('validateStudent', () => {
  it('isian lengkap yang benar tidak bergalat', () => {
    expect(validateStudent(ok, TODAY)).toEqual({});
  });

  it('hanya nama yang wajib; isian opsional boleh kosong', () => {
    expect(validateStudent(blank, TODAY)).toEqual({});
    expect(validateStudent({ ...blank, name: '' }, TODAY)).toEqual({ name: { code: 'required' } });
  });

  it('nama hanya spasi dianggap kosong, dan dipangkas sebelum dihitung', () => {
    expect(validateStudent({ ...blank, name: '   ' }, TODAY).name).toEqual({ code: 'required' });
    expect(validateStudent({ ...blank, name: ` ${'a'.repeat(120)} ` }, TODAY).name).toBeUndefined();
    expect(validateStudent({ ...blank, name: 'a'.repeat(121) }, TODAY).name).toEqual({
      code: 'tooLong',
      max: 120,
    });
  });

  it('NIS dan NISN: huruf, angka, titik, garis miring, tanda hubung; maksimal 30', () => {
    expect(validateStudent({ ...blank, nis: 'A-12/3.4' }, TODAY).nis).toBeUndefined();
    expect(validateStudent({ ...blank, nis: '12 34' }, TODAY).nis).toEqual({ code: 'idFormat' });
    expect(validateStudent({ ...blank, nisn: '12_34' }, TODAY).nisn).toEqual({ code: 'idFormat' });
    expect(validateStudent({ ...blank, nisn: '1'.repeat(31) }, TODAY).nisn).toEqual({
      code: 'tooLong',
      max: 30,
    });
    expect(validateStudent({ ...blank, nis: ' 123 ' }, TODAY).nis).toBeUndefined();
  });

  it('NIK kosong boleh, selain itu tepat 16 digit', () => {
    expect(validateStudent({ ...blank, nik: '3201234567890001' }, TODAY).nik).toBeUndefined();
    expect(validateStudent({ ...blank, nik: '320123456789000' }, TODAY).nik).toEqual({ code: 'nik' });
    expect(validateStudent({ ...blank, nik: '32012345678900011' }, TODAY).nik).toEqual({ code: 'nik' });
    expect(validateStudent({ ...blank, nik: '320123456789000a' }, TODAY).nik).toEqual({ code: 'nik' });
  });

  it('tanggal lahir: kosong boleh, harus tanggal nyata, tidak boleh di masa depan', () => {
    expect(validateStudent({ ...blank, birthDate: TODAY }, TODAY).birthDate).toBeUndefined();
    expect(validateStudent({ ...blank, birthDate: '2026-11-08' }, TODAY).birthDate).toEqual({
      code: 'dateFuture',
    });
    expect(validateStudent({ ...blank, birthDate: '2026-02-30' }, TODAY).birthDate).toEqual({
      code: 'dateInvalid',
    });
    expect(validateStudent({ ...blank, birthDate: '20/05/2012' }, TODAY).birthDate).toEqual({
      code: 'dateInvalid',
    });
  });

  it('telepon: format Indonesia diterima, huruf ditolak, terlalu pendek ditolak', () => {
    for (const phone of ['081234567890', '+62 812-3456-7890', '81234567890', '021 555-1234']) {
      expect(validateStudent({ ...blank, phone }, TODAY).phone).toBeUndefined();
    }
    expect(validateStudent({ ...blank, phone: 'abc123' }, TODAY).phone).toEqual({ code: 'phone' });
    expect(validateStudent({ ...blank, phone: '0812' }, TODAY).phone).toEqual({ code: 'phone' });
    expect(validateStudent({ ...blank, phone: `0${'8'.repeat(31)}` }, TODAY).phone).toEqual({
      code: 'tooLong',
      max: 30,
    });
  });

  it('email: kosong boleh, bentuk salah ditolak, spasi di tepi dipangkas', () => {
    expect(validateStudent({ ...blank, email: 'a@b.id' }, TODAY).email).toBeUndefined();
    expect(validateStudent({ ...blank, email: '  a@b.id ' }, TODAY).email).toBeUndefined();
    expect(validateStudent({ ...blank, email: 'a@b' }, TODAY).email).toEqual({ code: 'email' });
    expect(validateStudent({ ...blank, email: 'a b@c.id' }, TODAY).email).toEqual({ code: 'email' });
    expect(validateStudent({ ...blank, email: 'tanpa-at.id' }, TODAY).email).toEqual({ code: 'email' });
  });

  it('batas panjang tempat lahir dan alamat', () => {
    expect(validateStudent({ ...blank, birthPlace: 'x'.repeat(81) }, TODAY).birthPlace).toEqual({
      code: 'tooLong',
      max: 80,
    });
    expect(validateStudent({ ...blank, address: 'x'.repeat(301) }, TODAY).address).toEqual({
      code: 'tooLong',
      max: 300,
    });
  });

  it('beberapa galat sekaligus; isian salah pertama mengikuti urutan formulir', () => {
    const errors = validateStudent({ ...blank, name: '', nik: '1', email: 'x' }, TODAY);
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'nik']);
    expect(firstInvalid(errors, STUDENT_ORDER)).toBe('name');
    expect(firstInvalid({ nik: { code: 'nik' }, email: { code: 'email' } }, STUDENT_ORDER)).toBe('nik');
    expect(firstInvalid({}, STUDENT_ORDER)).toBeUndefined();
  });
});

describe('normalizePhone', () => {
  it('menormalkan ke digit berawalan 62', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizePhone('+6281234567890')).toBe('6281234567890');
    expect(normalizePhone('81234567890')).toBe('6281234567890');
  });
  it('kosong menjadi null, tidak masuk akal menjadi undefined', () => {
    expect(normalizePhone('  ')).toBeNull();
    expect(normalizePhone('12ab')).toBeUndefined();
    expect(normalizePhone('0812')).toBeUndefined();
  });
});

describe('todayIso', () => {
  it('memakai tanggal setempat dengan nol di depan', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('validateTeacher', () => {
  const blankTeacher = {
    name: 'Budi',
    nip: '',
    nik: '',
    birthPlace: '',
    birthDate: '',
    education: '',
    phone: '',
    email: '',
    address: '',
  };

  it('nama wajib, NIP opsional dengan format yang sama dengan API', () => {
    expect(validateTeacher(blankTeacher, TODAY)).toEqual({});
    expect(validateTeacher({ ...blankTeacher, name: ' ', nip: '19800101 1' }, TODAY)).toEqual({
      name: { code: 'required' },
      nip: { code: 'idFormat' },
    });
  });

  it('NIK, telepon, email, tanggal lahir, dan batas panjang mengikuti aturan siswa', () => {
    const full = {
      ...blankTeacher,
      nik: '3201234567890001',
      phone: '0812-3456-7890',
      email: 'budi@contoh.sch.id',
      birthDate: '1980-01-01',
      education: 'S1 Pendidikan',
    };
    expect(validateTeacher(full, TODAY)).toEqual({});
    expect(validateTeacher({ ...full, nik: '12345' }, TODAY).nik).toEqual({ code: 'nik' });
    expect(validateTeacher({ ...full, phone: 'abc' }, TODAY).phone).toEqual({ code: 'phone' });
    expect(validateTeacher({ ...full, email: 'budi@' }, TODAY).email).toEqual({ code: 'email' });
    expect(validateTeacher({ ...full, birthDate: '2030-01-01' }, TODAY).birthDate).toEqual({
      code: 'dateFuture',
    });
    expect(validateTeacher({ ...full, education: 'x'.repeat(121) }, TODAY).education).toEqual({
      code: 'tooLong',
      max: 120,
    });
    expect(validateTeacher({ ...full, address: 'x'.repeat(301) }, TODAY).address).toEqual({
      code: 'tooLong',
      max: 300,
    });
  });
});

describe('validateSubject', () => {
  it('kode wajib, maksimal 20, hanya huruf/angka/titik/garis bawah/tanda hubung', () => {
    expect(validateSubject({ code: 'MTK-1', name: 'Matematika' })).toEqual({});
    expect(validateSubject({ code: '', name: 'Matematika' }).code).toEqual({ code: 'required' });
    expect(validateSubject({ code: 'MT K', name: 'Matematika' }).code).toEqual({ code: 'codeFormat' });
    expect(validateSubject({ code: 'M'.repeat(21), name: 'x' }).code).toEqual({ code: 'tooLong', max: 20 });
    expect(validateSubject({ code: 'MTK', name: 'n'.repeat(81) }).name).toEqual({ code: 'tooLong', max: 80 });
  });
});

describe('validateClass', () => {
  it('nama (maks. 80) dan tingkat (maks. 20) wajib', () => {
    expect(validateClass({ name: 'VII A', level: '7' })).toEqual({});
    expect(validateClass({ name: '', level: '' })).toEqual({
      name: { code: 'required' },
      level: { code: 'required' },
    });
    expect(validateClass({ name: 'x', level: 'l'.repeat(21) }).level).toEqual({ code: 'tooLong', max: 20 });
  });
});
