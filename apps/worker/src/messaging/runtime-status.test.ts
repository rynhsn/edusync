import { describe, expect, it } from 'vitest';
import { checkChrome } from './runtime-status';

describe('checkChrome', () => {
  it('jalur belum diatur', () => {
    expect(checkChrome(undefined)).toBe('not_configured');
    expect(checkChrome('')).toBe('not_configured');
    expect(checkChrome('   ')).toBe('not_configured');
  });

  it('jalur diatur tetapi berkas tidak ada', () => {
    expect(checkChrome('C:/tidak/ada/chrome.exe', () => false)).toBe('not_found');
  });

  it('berkas ada: terdeteksi, dan spasi di tepi jalur diabaikan', () => {
    const seen: string[] = [];
    const exists = (p: string) => {
      seen.push(p);
      return true;
    };
    expect(checkChrome('  C:/chrome/chrome.exe  ', exists)).toBe('detected');
    expect(seen).toEqual(['C:/chrome/chrome.exe']);
  });
});
