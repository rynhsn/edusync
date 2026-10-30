import { createHash } from 'node:crypto';
import { DEFAULT_LETTER_TEMPLATES, DEFAULT_PKL_ASPECTS } from '@edusync/contracts';
import {
  academicYear,
  admissionCounter,
  admissionPeriod,
  and,
  application,
  applicationStatusLog,
  assignRoles,
  createDb,
  desc,
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
  reportSetting,
  school,
  seedSchoolRoles,
  signerCredential,
  student,
  subscription,
  teacher,
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

const admin = await ensureUser('admin@edusync.test', 'Admin Yayasan');
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
          'internship',
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

// PKL dan prakerin: aspek bawaan, dua mitra, satu periode, dan penempatan contoh (hanya bila belum ada).
for (const s of [smp, smk]) {
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

const guru = await ensureUser('guru@edusync.test', 'Guru Contoh');
await ensureMember(guru, smp.id, ['teacher', 'operator']);
await ensureMember(guru, smk.id, ['teacher']);

const staff = await ensureUser('staff@edusync.test', 'Staf Edusync');
await db.insert(platformStaff).values({ userId: staff, role: 'admin' }).onConflictDoNothing();

console.log(
  'Seed selesai: admin@edusync.test, guru@edusync.test, dan staff@edusync.test (staf platform) (kata sandi dari DEV_SEED_PASSWORD)',
);
await pool.end();
await app.close();
