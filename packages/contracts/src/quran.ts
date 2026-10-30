/**
 * Data Al-Qur'an (riwayat Hafs, mushaf Madinah): 114 surah, 6236 ayat, 30 juz. Dipakai modul tahfidz untuk
 * memvalidasi setoran dan menghitung cakupan hafalan. Semua fungsi murni.
 */

export type Surah = {
  /** 1..114 */
  number: number;
  /** Nama latin lazim, mis. Al-Fatihah */
  name: string;
  /** Nama Arab */
  arabic: string;
  ayahCount: number;
  /** Nomor juz tempat surah dimulai (ayat pertamanya) */
  juz: number;
};

/** Rentang ayat: dari surah:ayat sampai surah:ayat (urutan mushaf, boleh lintas surah). */
export type AyahRange = { surahFrom: number; ayahFrom: number; surahTo: number; ayahTo: number };

export const TOTAL_AYAHS = 6236;
export const TOTAL_SURAHS = 114;
export const TOTAL_JUZ = 30;

/** [nama latin, nama Arab, jumlah ayat] menurut urutan mushaf. */
const RAW: ReadonlyArray<readonly [string, string, number]> = [
  ['Al-Fatihah', 'الفاتحة', 7],
  ['Al-Baqarah', 'البقرة', 286],
  ['Ali Imran', 'آل عمران', 200],
  ['An-Nisa', 'النساء', 176],
  ["Al-Ma'idah", 'المائدة', 120],
  ["Al-An'am", 'الأنعام', 165],
  ["Al-A'raf", 'الأعراف', 206],
  ['Al-Anfal', 'الأنفال', 75],
  ['At-Taubah', 'التوبة', 129],
  ['Yunus', 'يونس', 109],
  ['Hud', 'هود', 123],
  ['Yusuf', 'يوسف', 111],
  ["Ar-Ra'd", 'الرعد', 43],
  ['Ibrahim', 'إبراهيم', 52],
  ['Al-Hijr', 'الحجر', 99],
  ['An-Nahl', 'النحل', 128],
  ['Al-Isra', 'الإسراء', 111],
  ['Al-Kahf', 'الكهف', 110],
  ['Maryam', 'مريم', 98],
  ['Taha', 'طه', 135],
  ['Al-Anbiya', 'الأنبياء', 112],
  ['Al-Hajj', 'الحج', 78],
  ["Al-Mu'minun", 'المؤمنون', 118],
  ['An-Nur', 'النور', 64],
  ['Al-Furqan', 'الفرقان', 77],
  ["Asy-Syu'ara", 'الشعراء', 227],
  ['An-Naml', 'النمل', 93],
  ['Al-Qasas', 'القصص', 88],
  ['Al-Ankabut', 'العنكبوت', 69],
  ['Ar-Rum', 'الروم', 60],
  ['Luqman', 'لقمان', 34],
  ['As-Sajdah', 'السجدة', 30],
  ['Al-Ahzab', 'الأحزاب', 73],
  ['Saba', 'سبأ', 54],
  ['Fatir', 'فاطر', 45],
  ['Yasin', 'يس', 83],
  ['As-Saffat', 'الصافات', 182],
  ['Sad', 'ص', 88],
  ['Az-Zumar', 'الزمر', 75],
  ['Ghafir', 'غافر', 85],
  ['Fussilat', 'فصلت', 54],
  ['Asy-Syura', 'الشورى', 53],
  ['Az-Zukhruf', 'الزخرف', 89],
  ['Ad-Dukhan', 'الدخان', 59],
  ['Al-Jasiyah', 'الجاثية', 37],
  ['Al-Ahqaf', 'الأحقاف', 35],
  ['Muhammad', 'محمد', 38],
  ['Al-Fath', 'الفتح', 29],
  ['Al-Hujurat', 'الحجرات', 18],
  ['Qaf', 'ق', 45],
  ['Az-Zariyat', 'الذاريات', 60],
  ['At-Tur', 'الطور', 49],
  ['An-Najm', 'النجم', 62],
  ['Al-Qamar', 'القمر', 55],
  ['Ar-Rahman', 'الرحمن', 78],
  ["Al-Waqi'ah", 'الواقعة', 96],
  ['Al-Hadid', 'الحديد', 29],
  ['Al-Mujadalah', 'المجادلة', 22],
  ['Al-Hasyr', 'الحشر', 24],
  ['Al-Mumtahanah', 'الممتحنة', 13],
  ['As-Saff', 'الصف', 14],
  ["Al-Jumu'ah", 'الجمعة', 11],
  ['Al-Munafiqun', 'المنافقون', 11],
  ['At-Tagabun', 'التغابن', 18],
  ['At-Talaq', 'الطلاق', 12],
  ['At-Tahrim', 'التحريم', 12],
  ['Al-Mulk', 'الملك', 30],
  ['Al-Qalam', 'القلم', 52],
  ['Al-Haqqah', 'الحاقة', 52],
  ["Al-Ma'arij", 'المعارج', 44],
  ['Nuh', 'نوح', 28],
  ['Al-Jinn', 'الجن', 28],
  ['Al-Muzzammil', 'المزمل', 20],
  ['Al-Muddassir', 'المدثر', 56],
  ['Al-Qiyamah', 'القيامة', 40],
  ['Al-Insan', 'الإنسان', 31],
  ['Al-Mursalat', 'المرسلات', 50],
  ['An-Naba', 'النبأ', 40],
  ["An-Nazi'at", 'النازعات', 46],
  ['Abasa', 'عبس', 42],
  ['At-Takwir', 'التكوير', 29],
  ['Al-Infitar', 'الانفطار', 19],
  ['Al-Mutaffifin', 'المطففين', 36],
  ['Al-Insyiqaq', 'الانشقاق', 25],
  ['Al-Buruj', 'البروج', 22],
  ['At-Tariq', 'الطارق', 17],
  ["Al-A'la", 'الأعلى', 19],
  ['Al-Gasyiyah', 'الغاشية', 26],
  ['Al-Fajr', 'الفجر', 30],
  ['Al-Balad', 'البلد', 20],
  ['Asy-Syams', 'الشمس', 15],
  ['Al-Lail', 'الليل', 21],
  ['Ad-Duha', 'الضحى', 11],
  ['Al-Insyirah', 'الشرح', 8],
  ['At-Tin', 'التين', 8],
  ['Al-Alaq', 'العلق', 19],
  ['Al-Qadr', 'القدر', 5],
  ['Al-Bayyinah', 'البينة', 8],
  ['Az-Zalzalah', 'الزلزلة', 8],
  ['Al-Adiyat', 'العاديات', 11],
  ["Al-Qari'ah", 'القارعة', 11],
  ['At-Takasur', 'التكاثر', 8],
  ['Al-Asr', 'العصر', 3],
  ['Al-Humazah', 'الهمزة', 9],
  ['Al-Fil', 'الفيل', 5],
  ['Quraisy', 'قريش', 4],
  ["Al-Ma'un", 'الماعون', 7],
  ['Al-Kausar', 'الكوثر', 3],
  ['Al-Kafirun', 'الكافرون', 6],
  ['An-Nasr', 'النصر', 3],
  ['Al-Lahab', 'المسد', 5],
  ['Al-Ikhlas', 'الإخلاص', 4],
  ['Al-Falaq', 'الفلق', 5],
  ['An-Nas', 'الناس', 6],
];

/** Ayat pertama tiap juz (indeks 0 = juz 1), menurut mushaf Madinah. */
export const JUZ_START: ReadonlyArray<{ juz: number; surah: number; ayah: number }> = [
  [1, 1],
  [2, 142],
  [2, 253],
  [3, 93],
  [4, 24],
  [4, 148],
  [5, 82],
  [6, 111],
  [7, 88],
  [8, 41],
  [9, 93],
  [11, 6],
  [12, 53],
  [15, 1],
  [17, 1],
  [18, 75],
  [21, 1],
  [23, 1],
  [25, 21],
  [27, 56],
  [29, 46],
  [33, 31],
  [36, 28],
  [39, 32],
  [41, 47],
  [46, 1],
  [51, 31],
  [58, 1],
  [67, 1],
  [78, 1],
].map(([surah, ayah], i) => ({ juz: i + 1, surah: surah as number, ayah: ayah as number }));

/** Indeks global (1..6236) ayat pertama setiap surah; indeks array = nomor surah - 1. */
const SURAH_START_INDEX: number[] = [];
{
  let acc = 1;
  for (const [, , count] of RAW) {
    SURAH_START_INDEX.push(acc);
    acc += count;
  }
}

/** Indeks global ayat pertama tiap juz (indeks array = nomor juz - 1). */
export const JUZ_START_INDEX: readonly number[] = JUZ_START.map(
  (j) => (SURAH_START_INDEX[j.surah - 1] as number) + j.ayah - 1,
);

/** Nomor juz yang memuat indeks global ayat itu. */
function juzOfIndex(index: number): number {
  let juz = 1;
  for (let i = 0; i < JUZ_START_INDEX.length; i++) {
    if ((JUZ_START_INDEX[i] as number) <= index) juz = i + 1;
    else break;
  }
  return juz;
}

/** 114 surah berurutan. */
export const SURAHS: readonly Surah[] = RAW.map(([name, arabic, ayahCount], i) => ({
  number: i + 1,
  name,
  arabic,
  ayahCount,
  juz: juzOfIndex(SURAH_START_INDEX[i] as number),
}));

/** Apakah surah:ayat itu ada. */
export function isValidAyah(surah: number, ayah: number): boolean {
  if (!Number.isInteger(surah) || !Number.isInteger(ayah)) return false;
  const s = SURAHS[surah - 1];
  return s !== undefined && ayah >= 1 && ayah <= s.ayahCount;
}

/** Indeks global 1..6236 untuk surah:ayat. Melempar RangeError bila ayat tidak ada. */
export function ayahIndex(surah: number, ayah: number): number {
  if (!isValidAyah(surah, ayah)) throw new RangeError(`Ayat ${surah}:${ayah} tidak ada`);
  return (SURAH_START_INDEX[surah - 1] as number) + ayah - 1;
}

/** Kebalikan `ayahIndex`. Melempar RangeError bila di luar 1..6236. */
export function fromIndex(index: number): { surah: number; ayah: number } {
  if (!Number.isInteger(index) || index < 1 || index > TOTAL_AYAHS) {
    throw new RangeError(`Indeks ayat ${index} di luar 1..${TOTAL_AYAHS}`);
  }
  let lo = 0;
  let hi = SURAH_START_INDEX.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((SURAH_START_INDEX[mid] as number) <= index) lo = mid;
    else hi = mid - 1;
  }
  return { surah: lo + 1, ayah: index - (SURAH_START_INDEX[lo] as number) + 1 };
}

/** Kedua ujung ada dan awal tidak melewati akhir (urutan mushaf). */
export function validRange(surahFrom: number, ayahFrom: number, surahTo: number, ayahTo: number): boolean {
  if (!isValidAyah(surahFrom, ayahFrom) || !isValidAyah(surahTo, ayahTo)) return false;
  return ayahIndex(surahFrom, ayahFrom) <= ayahIndex(surahTo, ayahTo);
}

/** Jumlah ayat dalam rentang (inklusif). Melempar RangeError bila rentang tidak sah. */
export function rangeAyahCount(surahFrom: number, ayahFrom: number, surahTo: number, ayahTo: number): number {
  if (!validRange(surahFrom, ayahFrom, surahTo, ayahTo)) {
    throw new RangeError(`Rentang ${surahFrom}:${ayahFrom}-${surahTo}:${ayahTo} tidak sah`);
  }
  return ayahIndex(surahTo, ayahTo) - ayahIndex(surahFrom, ayahFrom) + 1;
}

/**
 * Penanda ayat tercakup (indeks 1..6236; indeks 0 tak dipakai). Rentang yang tumpang tindih tidak menggandakan,
 * rentang tak sah dilewati.
 */
export function coverageMask(entries: readonly AyahRange[]): Uint8Array {
  const diff = new Int32Array(TOTAL_AYAHS + 2);
  for (const e of entries) {
    if (!validRange(e.surahFrom, e.ayahFrom, e.surahTo, e.ayahTo)) continue;
    diff[ayahIndex(e.surahFrom, e.ayahFrom)] = (diff[ayahIndex(e.surahFrom, e.ayahFrom)] as number) + 1;
    const end = ayahIndex(e.surahTo, e.ayahTo) + 1;
    diff[end] = (diff[end] as number) - 1;
  }
  const mask = new Uint8Array(TOTAL_AYAHS + 1);
  let run = 0;
  for (let i = 1; i <= TOTAL_AYAHS; i++) {
    run += diff[i] as number;
    mask[i] = run > 0 ? 1 : 0;
  }
  return mask;
}

export type SurahCoverage = { surah: number; ayahs: number; complete: boolean };

export type Coverage = {
  /** Jumlah ayat unik yang tercakup */
  ayahs: number;
  /** Persen dari 6236, dua desimal */
  percent: number;
  /** Hanya surah yang tercakup sebagian atau seluruhnya, urut nomor surah */
  perSurah: SurahCoverage[];
};

/** Persen dua desimal. */
export function ayahPercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10_000) / 100;
}

export function coverageFromMask(mask: Uint8Array): Coverage {
  let ayahs = 0;
  const perSurah: SurahCoverage[] = [];
  for (const s of SURAHS) {
    const start = SURAH_START_INDEX[s.number - 1] as number;
    let n = 0;
    for (let i = start; i < start + s.ayahCount; i++) n += mask[i] as number;
    ayahs += n;
    if (n > 0) perSurah.push({ surah: s.number, ayahs: n, complete: n === s.ayahCount });
  }
  return { ayahs, percent: ayahPercent(ayahs, TOTAL_AYAHS), perSurah };
}

/** Cakupan hafalan dari kumpulan rentang: gabungan ayat unik. */
export function coverage(entries: readonly AyahRange[]): Coverage {
  return coverageFromMask(coverageMask(entries));
}

/** Jumlah ayat unik dari kumpulan rentang. */
export function uniqueAyahCount(entries: readonly AyahRange[]): number {
  const mask = coverageMask(entries);
  let n = 0;
  for (let i = 1; i <= TOTAL_AYAHS; i++) n += mask[i] as number;
  return n;
}

export type JuzProgress = {
  /** Nomor juz yang seluruh ayatnya tercakup */
  complete: number[];
  /** Perkiraan jumlah juz penuh */
  count: number;
};

/** Juz dianggap tuntas bila semua ayat di juz itu tercakup. */
export function juzProgress(entries: readonly AyahRange[]): JuzProgress {
  return juzProgressFromMask(coverageMask(entries));
}

export function juzProgressFromMask(mask: Uint8Array): JuzProgress {
  const complete: number[] = [];
  for (let j = 0; j < TOTAL_JUZ; j++) {
    const start = JUZ_START_INDEX[j] as number;
    const end = j + 1 < TOTAL_JUZ ? (JUZ_START_INDEX[j + 1] as number) - 1 : TOTAL_AYAHS;
    let all = true;
    for (let i = start; i <= end; i++) {
      if (!mask[i]) {
        all = false;
        break;
      }
    }
    if (all) complete.push(j + 1);
  }
  return { complete, count: complete.length };
}

/** Ayat berikutnya setelah surah:ayat (null bila sudah ayat terakhir mushaf). */
export function nextAyah(surah: number, ayah: number): { surah: number; ayah: number } | null {
  const i = ayahIndex(surah, ayah);
  return i >= TOTAL_AYAHS ? null : fromIndex(i + 1);
}
