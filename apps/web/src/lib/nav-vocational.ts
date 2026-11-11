/**
 * Menu kejuruan (PKL, UKK) mengikuti kemampuan jenjang unit, bukan nama jenjang. `vocational` null = jenjang belum
 * ditetapkan (sekolah lama), menu tetap tampil agar tidak ada yang hilang diam-diam.
 */
export const hiddenByProfile = (item: object, vocational: boolean | null): boolean =>
  'vocational' in item && vocational === false;
