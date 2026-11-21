import { describe, expect, it } from 'vitest';
import { roomFill } from './room-fill';

describe('roomFill', () => {
  it('tanpa kapasitas selalu tanpa batas', () => {
    expect(roomFill(0, null)).toBe('unlimited');
    expect(roomFill(999, null)).toBe('unlimited');
  });
  it('membedakan sisa kursi, penuh, dan melebihi', () => {
    expect(roomFill(29, 30)).toBe('open');
    expect(roomFill(30, 30)).toBe('full');
    expect(roomFill(31, 30)).toBe('over');
  });
});
