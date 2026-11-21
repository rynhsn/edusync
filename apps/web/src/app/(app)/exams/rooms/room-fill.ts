/** Keadaan isi sebuah ruang: tanpa batas, masih ada kursi, pas penuh, atau melebihi kapasitas (kapasitas diturunkan). */
export type RoomFill = 'unlimited' | 'open' | 'full' | 'over';

export function roomFill(count: number, capacity: number | null): RoomFill {
  if (capacity === null) return 'unlimited';
  if (count > capacity) return 'over';
  return count === capacity ? 'full' : 'open';
}
