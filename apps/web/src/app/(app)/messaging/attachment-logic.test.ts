import { ATTACHMENT_MAX_BYTES } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import { formatSize, inspectAttachment } from './attachment-logic';

const pdf = (n: number) => {
  const b = new Uint8Array(n);
  b.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return b;
};

describe('inspectAttachment', () => {
  it('menerima PDF, JPEG, PNG dari isinya', () => {
    expect(inspectAttachment(pdf(100))).toEqual({ mime: 'application/pdf' });
    expect(inspectAttachment(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: 'image/jpeg' });
    expect(inspectAttachment(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))).toEqual({
      mime: 'image/png',
    });
  });
  it('menolak kosong, kebesaran, dan jenis lain', () => {
    expect(inspectAttachment(new Uint8Array())).toEqual({ issue: 'empty' });
    expect(inspectAttachment(pdf(ATTACHMENT_MAX_BYTES + 1))).toEqual({ issue: 'tooLarge' });
    expect(inspectAttachment(pdf(ATTACHMENT_MAX_BYTES))).toEqual({ mime: 'application/pdf' });
    expect(inspectAttachment(new TextEncoder().encode('<html></html>'))).toEqual({ issue: 'badType' });
  });
});

describe('formatSize', () => {
  it('KB dan MB', () => {
    expect(formatSize(10)).toBe('1 KB');
    expect(formatSize(320 * 1024)).toBe('320 KB');
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1,5 MB');
  });
});
