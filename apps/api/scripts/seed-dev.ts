import { createHash } from 'node:crypto';
import { DEFAULT_LETTER_TEMPLATES, DEFAULT_PKL_ASPECTS } from '@edusync/contracts';
import {
  academicYear,
  admissionCounter,
  admissionPeriod,
  and,
  announcement,
  application,
  applicationStatusLog,
  assignRoles,
  classRoom,
  createDb,
  desc,
  enrollment,
  entitlement,
  eq,
  finDiscountRule,
  finFeePlan,
  finFeeType,
  finStudentDiscount,
  foundation,
  foundationOwner,
  gradeComponent,
  gradingSetting,
  guardian,
  hafalanEntry,
  halaqah,
  halaqahMember,
  ibadahItem,
  letterTemplate,
  member,
  pklAspect,
  pklPartner,
  pklPeriod,
  pklPlacement,
  platformStaff,
  portalLink,
  program,
  reportSetting,
  school,
  schoolProfile,
  seedSchoolRoles,
  semester,
  signerCredential,
  student,
  studentGuardian,
  subject,
  subscription,
  teacher,
  teachingAssignment,
  user,
} from '@edusync/db';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

/**
 * Data contoh untuk pengembangan lokal: satu yayasan, dua unit, dua akun.
 * Idempoten. Menolak berjalan di luar development.
 */
const env = loadEnv();
if (env.NODE_ENV !== 'development') throw new Error('seed-dev hanya untuk NODE_ENV=development');
const password = process.env.DEV_SEED_PASSWORD;
if (!password || password.length < 12) throw new Error('DEV_SEED_PASSWORD wajib diisi, minimal 12 karakter');

const app = await buildApp(env);
await app.ready();
const { db, pool } = createDb(env.DATABASE_PLATFORM_URL);

async function ensureFoundation(slug: string, name: string) {
  const [row] = await db.insert(foundation).values({ slug, name }).onConflictDoNothing().returning();
  return row ?? (await db.select().from(foundation).where(eq(foundation.slug, slug)))[0]!;
}

async function ensureSchool(foundationId: string, slug: string, name: string) {
  const [row] = await db
    .insert(school)
    .values({ foundationId, slug, name })
    .onConflictDoNothing()
    .returning();
  const s = row ?? (await db.select().from(school).where(eq(school.slug, slug)))[0]!;
  await seedSchoolRoles(db, s.id);
  return s;
}

async function ensureUser(email: string, name: string) {
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) return existing.id;
  const res = await app.auth.api.signUpEmail({ body: { name, email, password: password as string } });
  return res.user.id;
}

async function ensureMember(userId: string, schoolId: string, roles: string[]) {
  const [row] = await db.insert(member).values({ userId, schoolId }).onConflictDoNothing().returning();
  const m = row ?? (await db.select().from(member).where(eq(member.userId, userId)))[0]!;
  await assignRoles(db, m.id, schoolId, roles);
}

const yayasan = await ensureFoundation('miftahul-huda', 'Yayasan Miftahul Huda');
const smp = await ensureSchool(yayasan.id, 'smpit-miftahul-huda', 'SMP IT Miftahul Huda');
const smk = await ensureSchool(yayasan.id, 'smk-miftahul-huda', 'SMK Miftahul Huda');

const admin = await ensureUser('admin@edusync.dev', 'Admin Yayasan');
await ensureMember(admin, smp.id, ['school_admin']);
await ensureMember(admin, smk.id, ['school_admin']);
await db.insert(foundationOwner).values({ foundationId: yayasan.id, userId: admin }).onConflictDoNothing();
const [hasSub] = await db
  .select({ id: subscription.id })
  .from(subscription)
  .where(eq(subscription.foundationId, yayasan.id));
if (!hasSub) {
  const now = new Date();
  await db.insert(subscription).values({
    foundationId: yayasan.id,
    period: 'monthly',
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
  });
}

// Modul berbayar untuk sekolah contoh (pilot tanpa tagihan), berlaku selama langganan contoh.
const [sub] = await db.select().from(subscription).where(eq(subscription.foundationId, yayasan.id));
if (sub) {
  for (const s of [smp, smk]) {
    await db
      .insert(entitlement)
      .values(
        [
          'schedule',
          'attendance',
          'grades',
          'extracurricular',
          'finance',
          'messaging',
          'administration',
          'admissions',
          ...(s === smk ? ['internship'] : []), // PKL hanya untuk SMK
          'tahfidz',
          'parent_portal',
          'announcements',
          'website',
          'exams',
        ].map((moduleKey) => ({
          schoolId: s.id,
          moduleKey,
          subscriptionId: sub.id,
          validUntil: sub.currentPeriodEnd,
        })),
      )
      .onConflictDoNothing();
  }
}

// Data akademik contoh per sekolah: tahun ajaran, semester, kelas, mapel, guru, siswa, wali, dan penugasan mengajar.
// Hanya dibuat bila sekolah belum punya tahun ajaran, dalam satu transaksi supaya tidak setengah jadi.
interface AcademicSeed {
  school: { id: string };
  program?: { code: string; name: string };
  /** `homeroom` = indeks guru di `teachers`. */
  classes: { name: string; level: string; homeroom: number }[];
  /** [kode, nama, indeks guru pengampu] */
  subjects: [string, string, number][];
  teachers: [string, string][];
  /** Dibagi rata ke semua kelas. */
  students: [string, 'L' | 'P'][];
  /** Tahun lahir siswa per kelas (urut seperti `classes`). */
  birthYears: number[];
  nisPrefix: string;
  address: string;
}

async function seedAcademic(c: AcademicSeed) {
  const [existing] = await db
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.schoolId, c.school.id));
  if (existing) return;
  const schoolId = c.school.id;
  await db.transaction(async (tx) => {
    const [year] = await tx
      .insert(academicYear)
      .values({ schoolId, name: '2026/2027', startsOn: '2026-07-13', endsOn: '2027-06-30', isActive: true })
      .returning();
    await tx.insert(semester).values([
      {
        schoolId,
        academicYearId: year!.id,
        name: 'Ganjil',
        startsOn: '2026-07-13',
        endsOn: '2026-12-19',
        isActive: true,
      },
      {
        schoolId,
        academicYearId: year!.id,
        name: 'Genap',
        startsOn: '2027-01-04',
        endsOn: '2027-06-30',
        isActive: false,
      },
    ]);
    const [prog] = c.program
      ? await tx
          .insert(program)
          .values({ schoolId, ...c.program })
          .returning()
      : [];
    const t = await tx
      .insert(teacher)
      .values(c.teachers.map(([name, nip]) => ({ schoolId, name, nip })))
      .returning();
    const classRows = await tx
      .insert(classRoom)
      .values(
        c.classes.map((k) => ({
          schoolId,
          academicYearId: year!.id,
          programId: prog?.id,
          name: k.name,
          level: k.level,
          homeroomTeacherId: t[k.homeroom]!.id,
        })),
      )
      .returning();
    const subjectRows = await tx
      .insert(subject)
      .values(c.subjects.map(([code, name]) => ({ schoolId, code, name })))
      .returning();
    await tx.insert(teachingAssignment).values(
      classRows.flatMap((k) =>
        subjectRows.map((s, i) => ({
          schoolId,
          classId: k.id,
          subjectId: s.id,
          teacherId: t[c.subjects[i]![2]]!.id,
        })),
      ),
    );

    // Satu wali per siswa (ayah/ibu bergantian).
    const guardianNames = [
      'Bapak Hendra Gunawan',
      'Ibu Sri Wahyuni',
      'Bapak Ujang Suryana',
      'Ibu Euis Komariah',
    ];
    const perClass = Math.ceil(c.students.length / classRows.length);
    for (const [i, [name, gender]] of c.students.entries()) {
      const klass = Math.floor(i / perClass);
      const cls = classRows[klass]!;
      const [s] = await tx
        .insert(student)
        .values({
          schoolId,
          name,
          nis: `${c.nisPrefix}${1001 + i}`,
          nisn: `00${26_000_001 + i + Number(c.nisPrefix) * 1000}`,
          gender,
          birthPlace: 'Bandung',
          birthDate: `${c.birthYears[klass]}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
          religion: 'islam',
          address: `${c.address} No. ${i + 1}, Bandung`,
          phone: `62857${String(1_000_000 + i * 137).padStart(8, '0')}`,
        })
        .returning();
      await tx
        .insert(enrollment)
        .values({ schoolId, studentId: s!.id, classId: cls.id, academicYearId: year!.id });
      const [g] = await tx
        .insert(guardian)
        .values({
          schoolId,
          name: `${guardianNames[i % 4]} (wali ${name.split(' ')[0]})`,
          phone: `62812${String(3_000_000 + i * 211).padStart(8, '0')}`,
        })
        .returning();
      await tx.insert(studentGuardian).values({
        schoolId,
        studentId: s!.id,
        guardianId: g!.id,
        relation: i % 2 === 0 ? 'father' : 'mother',
        isPrimary: true,
      });
    }
  });
}

await seedAcademic({
  school: smp,
  classes: [
    { name: '7 A', level: '7', homeroom: 0 },
    { name: '8 A', level: '8', homeroom: 4 },
    { name: '9 A', level: '9', homeroom: 5 },
  ],
  subjects: [
    ['PAI', 'Pendidikan Agama Islam dan Budi Pekerti', 0],
    ['PPKN', 'Pendidikan Pancasila', 6],
    ['BIN', 'Bahasa Indonesia', 1],
    ['MTK', 'Matematika', 2],
    ['IPA', 'Ilmu Pengetahuan Alam', 4],
    ['IPS', 'Ilmu Pengetahuan Sosial', 6],
    ['BIG', 'Bahasa Inggris', 3],
    ['PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan', 7],
    ['SBK', 'Seni dan Budaya', 7],
    ['INF', 'Informatika', 5],
    ['BAR', 'Bahasa Arab', 0],
    ['TAH', 'Tahfidz Al-Qur’an', 0],
  ],
  teachers: [
    ['Ustadz Hasan Basri, S.Pd.I.', '198204122006011001'],
    ['Ratna Sari, S.Pd.', '198806152011012002'],
    ['Wawan Setiawan, S.Pd.', '199109202016011003'],
    ['Fitri Handayani, S.Pd.', '199307042018012004'],
    ['Ahmad Zaenal, S.Si.', '199002112014011005'],
    ['Maya Anggraeni, S.Kom.', '199508302021012006'],
    ['Dewi Sartika, S.Pd.', '198911232013012007'],
    ['Irfan Hakim, S.Pd.', '199404172019011008'],
  ],
  students: [
    ['Abdullah Faqih', 'L'],
    ['Zahra Nur Aini', 'P'],
    ['Rafif Alfarizi', 'L'],
    ['Kayla Azzahra', 'P'],
    ['Naufal Hakim', 'L'],
    ['Humaira Salsabila', 'P'],
    ['Ghazi Maulana', 'L'],
    ['Aqila Safitri', 'P'],
    ['Hafidz Ramadhan', 'L'],
    ['Nadia Kamila', 'P'],
    ['Rayhan Fadilah', 'L'],
    ['Alya Putri Nabila', 'P'],
    ['Faiz Al Hasan', 'L'],
    ['Zaskia Ramadhani', 'P'],
    ['Arkan Prasetyo', 'L'],
    ['Khansa Maulida', 'P'],
    ['Mikail Anshori', 'L'],
    ['Syakira Anindya', 'P'],
    ['Zidan Firmansyah', 'L'],
    ['Najwa Aulia', 'P'],
    ['Umar Abdul Aziz', 'L'],
    ['Qonita Rahmawati', 'P'],
    ['Habib Nurrahman', 'L'],
    ['Lubna Azkia', 'P'],
  ],
  birthYears: [2013, 2012, 2011],
  nisPrefix: '25',
  address: 'Jl. Pasir Impun',
});

await seedAcademic({
  school: smk,
  program: { code: 'TJKT', name: 'Teknik Jaringan Komputer dan Telekomunikasi' },
  classes: [
    { name: 'X TJKT 1', level: 'X', homeroom: 0 },
    { name: 'XI TJKT 1', level: 'XI', homeroom: 4 },
    { name: 'XII TJKT 1', level: 'XII', homeroom: 5 },
  ],
  subjects: [
    ['PAI', 'Pendidikan Agama Islam dan Budi Pekerti', 0],
    ['PPKN', 'Pendidikan Pancasila dan Kewarganegaraan', 6],
    ['BIN', 'Bahasa Indonesia', 1],
    ['MTK', 'Matematika', 2],
    ['BIG', 'Bahasa Inggris', 3],
    ['SEJ', 'Sejarah', 6],
    ['PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan', 7],
    ['DDTJKT', 'Dasar-Dasar TJKT', 4],
    ['KJD', 'Komputer dan Jaringan Dasar', 4],
    ['ASJ', 'Administrasi Sistem Jaringan', 5],
    ['TLJ', 'Teknologi Layanan Jaringan', 5],
    ['PKK', 'Produk Kreatif dan Kewirausahaan', 7],
  ],
  teachers: [
    ['Drs. Asep Saepudin, M.Pd.', '198003142005011001'],
    ['Rina Marlina, S.Pd.', '198507222010012002'],
    ['Dedi Kurniawan, S.Pd.', '199001052015011003'],
    ['Nurul Hidayah, S.Pd.', '199203182016012004'],
    ['Yoga Pratama, S.Kom.', '199305112019011005'],
    ['Ahmad Fadli, S.T.', '198809302012011006'],
    ['Lina Herlina, S.Pd.', '199108252017012007'],
    ['Budi Santoso, S.Pd.', '199412102020011008'],
  ],
  students: [
    ['Muhammad Rizki Ramadhan', 'L'],
    ['Siti Nurhaliza', 'P'],
    ['Ahmad Fauzan', 'L'],
    ['Nabila Putri Salsabila', 'P'],
    ['Raka Aditya Nugraha', 'L'],
    ['Aisyah Zahra', 'P'],
    ['Fikri Maulana', 'L'],
    ['Dinda Ayu Lestari', 'P'],
    ['Alif Rahman Hakim', 'L'],
    ['Salsa Amelia', 'P'],
    ['Zaki Abdurrahman', 'L'],
    ['Kirana Dewi Anjani', 'P'],
    ['Farhan Hidayatullah', 'L'],
    ['Nisa Khairunnisa', 'P'],
    ['Iqbal Ramdani', 'L'],
    ['Tiara Maharani', 'P'],
    ['Gilang Permana', 'L'],
    ['Syifa Fadhilah', 'P'],
    ['Daffa Al Ghifari', 'L'],
    ['Rani Oktaviani', 'P'],
    ['Yusuf Maulidin', 'L'],
    ['Intan Permatasari', 'P'],
    ['Bagas Setiawan', 'L'],
    ['Wulan Apriliani', 'P'],
  ],
  birthYears: [2010, 2009, 2008],
  nisPrefix: '26',
  address: 'Jl. Cibiru',
});

// Pengaturan penilaian dan komponen bawaan (Tugas, Ulangan Harian, UTS, UAS) untuk modul `grades`.
for (const s of [smp, smk]) {
  await db.insert(gradingSetting).values({ schoolId: s.id }).onConflictDoNothing();
  await db
    .insert(gradeComponent)
    .values(
      [
        { name: 'Tugas', weight: 20 },
        { name: 'Ulangan Harian', weight: 30 },
        { name: 'UTS', weight: 20 },
        { name: 'UAS', weight: 30 },
      ].map((c, sort) => ({ schoolId: s.id, ...c, sort })),
    )
    .onConflictDoNothing();
}

// Pengaturan rapor contoh (kepala sekolah dan kota); deskripsi capaian memakai nilai bawaan.
for (const [s, principalName, city] of [
  [smp, 'Drs. H. Ahmad Fauzi, M.Pd.', 'Bandung'],
  [smk, 'Hj. Siti Rahmawati, S.Pd.', 'Bandung'],
] as const) {
  await db
    .insert(reportSetting)
    .values({ schoolId: s.id, principalName, principalNip: '197001012000031001', city })
    .onConflictDoNothing();
}

// Jenis biaya dan tarif contoh untuk modul finance (tarif pada tahun ajaran aktif bila ada).
for (const s of [smp, smk]) {
  const types = await db
    .insert(finFeeType)
    .values([
      { schoolId: s.id, name: 'SPP', kind: 'monthly' as const },
      { schoolId: s.id, name: 'Uang Gedung', kind: 'one_time' as const },
      { schoolId: s.id, name: 'Seragam', kind: 'one_time' as const },
    ])
    .onConflictDoNothing()
    .returning();
  const [year] = await db
    .select()
    .from(academicYear)
    .where(and(eq(academicYear.schoolId, s.id), eq(academicYear.isActive, true)));
  if (types.length > 0 && year) {
    const amount: Record<string, number> = { SPP: 250_000, 'Uang Gedung': 3_000_000, Seragam: 650_000 };
    await db
      .insert(finFeePlan)
      .values(
        types.map((t) => ({
          schoolId: s.id,
          academicYearId: year.id,
          feeTypeId: t.id,
          level: null,
          amount: amount[t.name] ?? 0,
        })),
      )
      .onConflictDoNothing();
  }
}

// Aturan keringanan contoh; yang pertama dipasang pada siswa pertama di tahun ajaran aktif (bila ada).
for (const s of [smp, smk]) {
  await db
    .insert(finDiscountRule)
    .values([
      { schoolId: s.id, name: 'Beasiswa yatim 50%', kind: 'percent' as const, value: 50 },
      { schoolId: s.id, name: 'Keringanan Rp 100.000', kind: 'amount' as const, value: 100_000 },
    ])
    .onConflictDoNothing();
  const [rule] = await db
    .select()
    .from(finDiscountRule)
    .where(and(eq(finDiscountRule.schoolId, s.id), eq(finDiscountRule.name, 'Beasiswa yatim 50%')));
  const [year] = await db
    .select()
    .from(academicYear)
    .where(and(eq(academicYear.schoolId, s.id), eq(academicYear.isActive, true)));
  const [first] = await db
    .select()
    .from(student)
    .where(eq(student.schoolId, s.id))
    .orderBy(student.name)
    .limit(1);
  if (rule && year && first) {
    await db
      .insert(finStudentDiscount)
      .values({
        schoolId: s.id,
        studentId: first.id,
        ruleId: rule.id,
        academicYearId: year.id,
        reason: 'Siswa yatim',
      })
      .onConflictDoNothing();
  }
}

// Administrasi: templat surat bawaan (bila kosong) dan kredensial penandatangan untuk admin sekolah contoh.
for (const [s, signerName, signerTitle] of [
  [smp, 'Drs. H. Ahmad Fauzi, M.Pd.', 'Kepala SMP IT Miftahul Huda'],
  [smk, 'Hj. Siti Rahmawati, S.Pd.', 'Kepala SMK Miftahul Huda'],
] as const) {
  const [hasTemplate] = await db
    .select({ id: letterTemplate.id })
    .from(letterTemplate)
    .where(eq(letterTemplate.schoolId, s.id))
    .limit(1);
  if (!hasTemplate) {
    await db.insert(letterTemplate).values(DEFAULT_LETTER_TEMPLATES.map((t) => ({ schoolId: s.id, ...t })));
  }
  const [adminMember] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, admin), eq(member.schoolId, s.id)));
  if (adminMember) {
    await db
      .insert(signerCredential)
      .values({
        schoolId: s.id,
        memberId: adminMember.id,
        name: signerName,
        nip: '197001012000031001',
        title: signerTitle,
      })
      .onConflictDoNothing();
  }
}

// PKL dan prakerin (hanya SMK): aspek bawaan, dua mitra, satu periode, dan penempatan contoh (hanya bila belum ada).
for (const s of [smk]) {
  await db
    .insert(pklAspect)
    .values(DEFAULT_PKL_ASPECTS.map((a, sort) => ({ schoolId: s.id, ...a, sort })))
    .onConflictDoNothing();
  await db
    .insert(pklPartner)
    .values([
      { schoolId: s.id, name: 'PT Nusantara Digital', field: 'Teknologi informasi', address: 'Bandung' },
      { schoolId: s.id, name: 'CV Karya Mandiri', field: 'Manufaktur', address: 'Cimahi' },
    ])
    .onConflictDoNothing();
  const [year] = await db
    .select()
    .from(academicYear)
    .where(and(eq(academicYear.schoolId, s.id), eq(academicYear.isActive, true)));
  if (!year) continue;
  await db
    .insert(pklPeriod)
    .values({
      schoolId: s.id,
      academicYearId: year.id,
      name: 'PKL Semester Genap',
      startsOn: year.startsOn,
      endsOn: year.endsOn,
    })
    .onConflictDoNothing();
  const [period] = await db
    .select()
    .from(pklPeriod)
    .where(and(eq(pklPeriod.academicYearId, year.id), eq(pklPeriod.name, 'PKL Semester Genap')));
  const partners = await db
    .select()
    .from(pklPartner)
    .where(eq(pklPartner.schoolId, s.id))
    .orderBy(pklPartner.name);
  const pupils = await db
    .select({ id: student.id })
    .from(student)
    .where(and(eq(student.schoolId, s.id), eq(student.status, 'active')))
    .orderBy(student.name)
    .limit(4);
  if (period && partners.length > 0 && pupils.length > 0) {
    await db
      .insert(pklPlacement)
      .values(
        pupils.map((p, i) => ({
          schoolId: s.id,
          periodId: period.id,
          studentId: p.id,
          partnerId: partners[i % partners.length]!.id,
          industrySupervisorName: 'Pembimbing Industri',
          status: 'active' as const,
        })),
      )
      .onConflictDoNothing();
  }
}

// Modul tahfidz: butir ibadah bawaan, satu halaqah dengan anggota, dan setoran contoh (hanya bila belum ada).
for (const s of [smp, smk]) {
  await db
    .insert(ibadahItem)
    .values(
      [
        { name: 'Shalat Dhuha', kind: 'daily' as const },
        { name: 'Tilawah', kind: 'daily' as const },
        { name: 'Shalat Tahajud', kind: 'daily' as const },
        { name: 'Puasa Senin-Kamis', kind: 'weekly' as const },
      ].map((c, sort) => ({ schoolId: s.id, ...c, sort })),
    )
    .onConflictDoNothing();
}
{
  const [year] = await db
    .select()
    .from(academicYear)
    .where(and(eq(academicYear.schoolId, smp.id), eq(academicYear.isActive, true)));
  if (year) {
    await db
      .insert(halaqah)
      .values({
        schoolId: smp.id,
        academicYearId: year.id,
        name: 'Halaqah Al-Fatih',
        scheduleNote: "Ba'da Subuh",
      })
      .onConflictDoNothing();
    const [h] = await db
      .select()
      .from(halaqah)
      .where(and(eq(halaqah.academicYearId, year.id), eq(halaqah.name, 'Halaqah Al-Fatih')));
    const pupils = await db
      .select({ id: student.id })
      .from(student)
      .where(and(eq(student.schoolId, smp.id), eq(student.status, 'active')))
      .limit(5);
    if (h && pupils.length > 0) {
      await db
        .insert(halaqahMember)
        .values(
          pupils.map((p) => ({
            schoolId: smp.id,
            halaqahId: h.id,
            studentId: p.id,
            academicYearId: year.id,
          })),
        )
        .onConflictDoNothing();
      const [hasEntry] = await db
        .select({ id: hafalanEntry.id })
        .from(hafalanEntry)
        .where(eq(hafalanEntry.halaqahId, h.id))
        .limit(1);
      if (!hasEntry) {
        const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
        const rows = pupils.flatMap((p, i) =>
          [
            {
              date: day(2),
              kind: 'ziyadah' as const,
              surahFrom: 78,
              ayahFrom: 1,
              surahTo: 78,
              ayahTo: 10 + i,
            },
            {
              date: day(1),
              kind: 'ziyadah' as const,
              surahFrom: 78,
              ayahFrom: 11 + i,
              surahTo: 78,
              ayahTo: 25,
            },
            { date: day(1), kind: 'murajaah' as const, surahFrom: 1, ayahFrom: 1, surahTo: 1, ayahTo: 7 },
          ].map((e) => ({ schoolId: smp.id, studentId: p.id, halaqahId: h.id, recordedBy: admin, ...e })),
        );
        await db.insert(hafalanEntry).values(rows);
      }
    }
  }
}

// SPMB: satu periode terbuka dan beberapa pendaftar contoh dalam berbagai status (kode pelacakan: DEMO2-SPMB1 dst.).
for (const s of [smp]) {
  const [anyYear] = await db
    .select()
    .from(academicYear)
    .where(eq(academicYear.schoolId, s.id))
    .orderBy(desc(academicYear.isActive))
    .limit(1);
  if (!anyYear) continue;
  const DAY = 86_400_000;
  const dateOf = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
  const year = Number(dateOf(0).slice(0, 4));
  const periodName = `Gelombang 1 ${year}`;
  const [existing] = await db
    .select()
    .from(admissionPeriod)
    .where(and(eq(admissionPeriod.schoolId, s.id), eq(admissionPeriod.name, periodName)));
  const period =
    existing ??
    (
      await db
        .insert(admissionPeriod)
        .values({
          schoolId: s.id,
          academicYearId: anyYear.id,
          name: periodName,
          level: '7',
          opensOn: dateOf(-30),
          closesOn: dateOf(60),
          quota: 60,
        })
        .returning()
    )[0]!;
  const [hasApps] = await db
    .select({ id: application.id })
    .from(application)
    .where(eq(application.periodId, period.id))
    .limit(1);
  if (!hasApps) {
    const samples = [
      [
        'Aisyah Putri Rahma',
        'P',
        'Bandung',
        '2013-02-11',
        'SDN 1 Cimahi',
        'Bapak Hendra',
        '081211110001',
        'submitted',
        0,
      ],
      [
        'Muhammad Fikri Alfarizi',
        'L',
        'Bandung',
        '2012-11-03',
        'SDIT Al-Furqon',
        'Ibu Nurhayati',
        '081211110002',
        'submitted',
        1,
      ],
      [
        'Nadia Salsabila',
        'P',
        'Cimahi',
        '2013-06-21',
        'SDN 3 Lembang',
        'Bapak Rudi',
        '081211110003',
        'verified',
        2,
      ],
      [
        'Raihan Maulana',
        'L',
        'Bandung',
        '2013-01-30',
        'SDIT Nurul Fikri',
        'Ibu Siti',
        '081211110004',
        'verified',
        3,
      ],
      [
        'Zahra Aulia Putri',
        'P',
        'Garut',
        '2012-09-14',
        'SDN 2 Garut',
        'Bapak Dedi',
        '081211110005',
        'accepted',
        5,
      ],
      [
        'Farhan Hidayat',
        'L',
        'Bandung',
        '2013-04-05',
        'SDN 5 Bandung',
        'Ibu Lilis',
        '081211110006',
        'accepted',
        6,
      ],
      [
        'Kayla Anindya',
        'P',
        'Bandung',
        '2013-08-19',
        'SD Islam Cendekia',
        'Bapak Agus',
        '081211110007',
        'rejected',
        8,
      ],
      [
        'Bagas Pratama',
        'L',
        'Cimahi',
        '2012-12-25',
        'SDN 4 Cimahi',
        'Ibu Wati',
        '081211110008',
        'withdrawn',
        10,
      ],
    ] as const;
    const path: Record<string, string[]> = {
      submitted: ['submitted'],
      verified: ['submitted', 'verified'],
      accepted: ['submitted', 'verified', 'accepted'],
      rejected: ['submitted', 'verified', 'rejected'],
      withdrawn: ['submitted', 'withdrawn'],
    };
    for (const [
      i,
      [fullName, gender, birthPlace, birthDate, previousSchool, guardianName, phone, status, daysAgo],
    ] of samples.entries()) {
      const createdAt = new Date(Date.now() - daysAgo * DAY);
      const [a] = await db
        .insert(application)
        .values({
          schoolId: s.id,
          periodId: period.id,
          regNumber: `SPMB-${year}-${String(i + 1).padStart(4, '0')}`,
          trackingCodeHash: createHash('sha256')
            .update(`DEMO2SPMB${i + 1}`)
            .digest('hex'),
          fullName,
          gender,
          birthPlace,
          birthDate,
          previousSchool,
          address: 'Jl. Contoh No. 1',
          guardianName,
          guardianPhone: `62${phone.slice(1)}`,
          status,
          decisionNote:
            status === 'accepted'
              ? 'Selamat, Ananda diterima.'
              : status === 'rejected'
                ? 'Berkas belum lengkap.'
                : null,
          createdAt,
        })
        .onConflictDoNothing()
        .returning();
      if (!a) continue;
      const steps = path[status] ?? ['submitted'];
      await db.insert(applicationStatusLog).values(
        steps.map((to, k) => ({
          schoolId: s.id,
          applicationId: a.id,
          fromStatus: k === 0 ? null : steps[k - 1],
          toStatus: to,
          actor: k === 0 ? 'applicant' : 'seed',
          createdAt: new Date(createdAt.getTime() + k * 3_600_000),
        })),
      );
    }
    await db
      .insert(admissionCounter)
      .values({ schoolId: s.id, year, last: samples.length })
      .onConflictDoNothing();
  }
}

// Situs publik dan pengumuman contoh untuk SMP.
await db
  .insert(schoolProfile)
  .values({
    schoolId: smp.id,
    tagline: 'Cerdas, berakhlak, dan cinta Al-Quran',
    about: 'SMP IT Miftahul Huda memadukan kurikulum nasional dengan pembinaan tahfidz dan akhlak.',
    vision: 'Mencetak generasi beriman, berilmu, dan berkarakter.',
    mission: 'Pembelajaran bermutu, pembiasaan ibadah, dan kemitraan dengan orang tua.',
    address: 'Jl. Pendidikan No. 1, Bandung',
    phone: '022-1234567',
    email: 'info@miftahulhuda.example',
    accentColor: '#0f766e',
    published: true,
  })
  .onConflictDoNothing();
const hasAnn = await db
  .select({ id: announcement.id })
  .from(announcement)
  .where(eq(announcement.schoolId, smp.id))
  .limit(1);
if (hasAnn.length === 0) {
  const now = new Date();
  const in10 = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  await db.insert(announcement).values([
    {
      schoolId: smp.id,
      title: 'Penerimaan murid baru dibuka',
      body: 'Pendaftaran gelombang 1 sudah dibuka. Daftar lewat tombol di situs ini.',
      category: 'news',
      audience: 'all',
      pinned: true,
      status: 'published',
      publishedAt: now,
      createdBy: 'seed',
    },
    {
      schoolId: smp.id,
      title: 'Pekan ujian tengah semester',
      body: 'Ujian tengah semester dilaksanakan sesuai jadwal kelas.',
      category: 'agenda',
      audience: 'all',
      eventDate: in10,
      status: 'published',
      publishedAt: now,
      createdBy: 'seed',
    },
    {
      schoolId: smp.id,
      title: 'Rapat guru internal',
      body: 'Rapat evaluasi bulanan untuk guru dan staf.',
      category: 'notice',
      audience: 'staff',
      status: 'published',
      publishedAt: now,
      createdBy: 'seed',
    },
  ]);
}

const guru = await ensureUser('guru@edusync.test', 'Guru Contoh');
await ensureMember(guru, smp.id, ['teacher', 'operator']);
await ensureMember(guru, smk.id, ['teacher']);

// Akun siswa untuk mencoba ujian di layar (CBT): terhubung ke siswa contoh SMK lewat portal.
const siswa = await ensureUser('siswa@edusync.test', 'Ahmad Fauzan');
await ensureMember(siswa, smk.id, ['student']);
const [ahmad] = await db
  .select({ id: student.id })
  .from(student)
  .where(and(eq(student.schoolId, smk.id), eq(student.name, 'Ahmad Fauzan')));
const [siswaMember] = await db
  .select({ id: member.id })
  .from(member)
  .where(and(eq(member.userId, siswa), eq(member.schoolId, smk.id)));
if (ahmad && siswaMember) {
  await db
    .insert(portalLink)
    .values({ schoolId: smk.id, memberId: siswaMember.id, kind: 'student', studentId: ahmad.id })
    .onConflictDoNothing();
}

// Akun lokal yang sama juga admin platform (konsol platform), supaya cukup satu login saat pengembangan.
await db.insert(platformStaff).values({ userId: admin, role: 'admin' }).onConflictDoNothing();

console.log(
  'Seed selesai: admin@edusync.dev (admin yayasan dan admin platform), guru@edusync.test, siswa@edusync.test (Ahmad Fauzan, SMK) (kata sandi dari DEV_SEED_PASSWORD)',
);
await pool.end();
await app.close();
