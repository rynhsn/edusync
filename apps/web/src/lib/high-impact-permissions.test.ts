import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERMISSIONS } from '@edusync/contracts';
import { describe, expect, it } from 'vitest';
import { HIGH_IMPACT_PERMISSIONS, highImpactKey, isHighImpactPermission } from './high-impact-permissions';

describe('izin berdampak besar', () => {
  it('menandai kenaikan kelas dan kurikulum, bukan izin biasa', () => {
    expect(isHighImpactPermission('promotion:manage')).toBe(true);
    expect(isHighImpactPermission('curriculum:manage')).toBe(true);
    expect(isHighImpactPermission('class:read')).toBe(false);
    expect(isHighImpactPermission('toString')).toBe(false);
    expect(highImpactKey('promotion:manage')).toBe('promotion_manage');
    expect(highImpactKey('student:read')).toBeNull();
  });

  it('hanya berisi izin yang ada di katalog kontrak', () => {
    for (const p of Object.keys(HIGH_IMPACT_PERMISSIONS)) expect(PERMISSIONS).toContain(p);
  });

  it('tiap penanda punya keterangan di tiga bahasa', () => {
    const dir = resolve(__dirname, '../../messages');
    for (const lang of ['id', 'en', 'su']) {
      const page = JSON.parse(readFileSync(resolve(dir, `${lang}.json`), 'utf8')).rolesPage;
      expect(page.highImpact.badge.trim(), lang).not.toBe('');
      for (const key of Object.values(HIGH_IMPACT_PERMISSIONS)) {
        expect(page.highImpact[key]?.trim(), `${lang} ${key}`).toBeTruthy();
      }
    }
  });
});
