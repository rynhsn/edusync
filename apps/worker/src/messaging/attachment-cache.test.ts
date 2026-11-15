import { describe, expect, it } from 'vitest';
import { AttachmentCache } from './attachment-cache';

describe('AttachmentCache', () => {
  it('membuang yang paling lama tak dipakai bila melewati batas byte', () => {
    const c = new AttachmentCache(10);
    c.set('a', Buffer.alloc(4));
    c.set('b', Buffer.alloc(4));
    c.get('a'); // a menjadi yang terbaru
    c.set('c', Buffer.alloc(4)); // 12 > 10: b dibuang
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBeDefined();
    expect(c.get('c')).toBeDefined();
    expect(c.size).toBe(2);
  });
  it('berkas lebih besar dari batas tidak disimpan; delete mengurangi hitungan', () => {
    const c = new AttachmentCache(10);
    c.set('x', Buffer.alloc(11));
    expect(c.size).toBe(0);
    c.set('y', Buffer.alloc(6));
    c.delete('y');
    c.set('z', Buffer.alloc(10));
    expect(c.get('z')).toBeDefined();
  });
});
