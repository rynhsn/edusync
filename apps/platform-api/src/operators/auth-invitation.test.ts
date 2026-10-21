import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

describe('Better Auth credential compatibility for operator invitations', () => {
  it('verifies the password hash used by the invitation acceptance route', async () => {
    const password = 'a-secure-password-123';
    const hash = await hashPassword(password);
    await expect(verifyPassword({ hash, password })).resolves.toBe(true);
    await expect(verifyPassword({ hash, password: 'a-different-password-123' })).resolves.toBe(false);
  });
});
