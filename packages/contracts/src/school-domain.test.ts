import { describe, expect, it } from 'vitest';
import { checkCustomHostname } from './school-domain';

const check = (h: string) => checkCustomHostname(h, 'edusync.id');

describe('checkCustomHostname', () => {
  it('menerima domain sah dan menormalkan huruf kecil', () => {
    expect(check(' SMPIT-Contoh.sch.id ')).toEqual({ ok: true, hostname: 'smpit-contoh.sch.id' });
    expect(check('www.sekolah.com.')).toEqual({ ok: true, hostname: 'www.sekolah.com' });
  });
  it('menolak format salah', () => {
    for (const bad of [
      'sekolah',
      'http://a.com',
      'a.com/x',
      'a.com:8080',
      'a b.com',
      '-a.com',
      'a..com',
      'a.123',
      '',
    ]) {
      expect(check(bad)).toEqual({ ok: false, problem: 'format' });
    }
  });
  it('menolak IP, localhost, dan APP_DOMAIN', () => {
    expect(check('10.0.0.1')).toEqual({ ok: false, problem: 'ip' });
    expect(check('::1')).toEqual({ ok: false, problem: 'ip' });
    expect(check('sekolah.localhost')).toEqual({ ok: false, problem: 'localhost' });
    expect(check('edusync.id')).toEqual({ ok: false, problem: 'app_domain' });
    expect(check('smp.edusync.id')).toEqual({ ok: false, problem: 'app_domain' });
    expect(check('notedusync.id').ok).toBe(true);
    expect(checkCustomHostname('x.localhost', 'localhost:3000')).toEqual({ ok: false, problem: 'localhost' });
  });
});
