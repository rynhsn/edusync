import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mailerDeps = vi.hoisted(() => ({ createTransport: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mailerDeps.createTransport } }));

import { sendOperatorInvitation, sendPasswordResetOtp } from './mailer.js';

const originalEnv = { ...process.env };
const acceptedSendMail = vi.fn();
const transporterClose = vi.fn();

beforeEach(() => {
  process.env.NODE_ENV = 'development';
  process.env.PLATFORM_PUBLIC_URL = 'http://localhost:5174';
  process.env.PLATFORM_SMTP_HOST = 'smtp.gmail.com';
  process.env.PLATFORM_SMTP_PORT = '465';
  process.env.PLATFORM_SMTP_SECURE = 'true';
  process.env.PLATFORM_SMTP_USER = 'hi.edusync@gmail.com';
  process.env.PLATFORM_SMTP_PASSWORD = 'test-app-password';
  process.env.PLATFORM_EMAIL_FROM = 'EduSync Platform <hi.edusync@gmail.com>';
  acceptedSendMail.mockReset().mockResolvedValue({ accepted: ['operator@example.com'] });
  transporterClose.mockReset();
  mailerDeps.createTransport.mockReset().mockReturnValue({ sendMail: acceptedSendMail, close: transporterClose });
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('sendOperatorInvitation SMTP transport', () => {
  it('delivers an invitation over implicit TLS without exposing credentials', async () => {
    const sent = await sendOperatorInvitation({
      to: 'operator@example.com', name: 'Example Operator', role: 'platform_read_only',
      url: 'A'.repeat(43), expiresAt: new Date('2026-10-19T00:00:00.000Z'),
    });

    expect(sent).toBe(true);
    expect(mailerDeps.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: 'hi.edusync@gmail.com', pass: 'test-app-password' },
      tls: expect.objectContaining({ minVersion: 'TLSv1.2' }),
    }));
    expect(acceptedSendMail).toHaveBeenCalledOnce();
    const message = acceptedSendMail.mock.calls[0]?.[0];
    expect(message.from).toBe('EduSync Platform <hi.edusync@gmail.com>');
    expect(message.to).toBe('operator@example.com');
    expect(message.text).toContain(`http://localhost:5174/invite/${'A'.repeat(43)}`);
    expect(message.html).toContain('Example Operator');
    expect(message.subject).toBe('You are invited to EduSync Platform');
    expect(JSON.stringify(message)).not.toContain('test-app-password');
    expect(transporterClose).toHaveBeenCalledOnce();
  });

  it('links to the accept route the Platform app actually serves', async () => {
    await sendOperatorInvitation({
      to: 'operator@example.com', name: 'Example Operator', role: 'platform_read_only',
      url: 'A'.repeat(43), expiresAt: new Date('2026-10-19T00:00:00.000Z'),
    });

    // /invite/:token is a real route; a query-string URL matches nothing and silently
    // lands the invitee on the sign-in page instead of the accept form.
    const message = acceptedSendMail.mock.calls[0]?.[0];
    const link = String(message.text).match(/https?:\/\/\S+/)?.[0];
    expect(link).toBe(`http://localhost:5174/invite/${'A'.repeat(43)}`);
    expect(new URL(link!).search).toBe('');
    expect(String(message.html)).toContain(`/invite/${'A'.repeat(43)}`);
  });

  it('does not attempt delivery with an unapproved sender address', async () => {
    process.env.PLATFORM_EMAIL_FROM = 'Attacker <attacker@example.com>';
    const sent = await sendOperatorInvitation({
      to: 'operator@example.com', name: 'Example Operator', role: 'platform_admin',
      url: 'B'.repeat(43), expiresAt: new Date(),
    });
    expect(sent).toBe(false);
    expect(mailerDeps.createTransport).not.toHaveBeenCalled();
  });

  it('rejects malformed recipient addresses without creating a transport', async () => {
    const sent = await sendOperatorInvitation({
      to: 'operator@example.com\r\nBcc: attacker@example.com', name: 'Example Operator', role: 'platform_admin',
      url: 'C'.repeat(43), expiresAt: new Date(),
    });
    expect(sent).toBe(false);
    expect(mailerDeps.createTransport).not.toHaveBeenCalled();
  });

  it('reports SMTP failures and always closes the transport', async () => {
    acceptedSendMail.mockRejectedValueOnce(new Error('SMTP rejected credentials'));
    const sent = await sendOperatorInvitation({
      to: 'operator@example.com', name: 'Example Operator', role: 'platform_admin',
      url: 'D'.repeat(43), expiresAt: new Date(),
    });
    expect(sent).toBe(false);
    expect(transporterClose).toHaveBeenCalledOnce();
  });
});

describe('sendPasswordResetOtp SMTP transport', () => {
  it('titles the reset code as a password reset, not as an invitation', async () => {
    const sent = await sendPasswordResetOtp({ to: 'operator@example.com', otp: '123456', expiresAt: new Date('2026-10-19T00:00:00.000Z') });

    expect(sent).toBe(true);
    const message = acceptedSendMail.mock.calls[0]?.[0];
    // Both messages go through the same deliver(). A subject constant inside it made every reset
    // code arrive titled "You are invited to EduSync Platform", which reads like phishing.
    expect(message.subject).toBe('Your EduSync Platform password reset code');
    expect(message.subject).not.toContain('invited');
    expect(message.text).toContain('123456');
    expect(message.html).toContain('123456');
  });

  it('sends nothing when SMTP is not configured', async () => {
    process.env.PLATFORM_SMTP_PASSWORD = '';
    const sent = await sendPasswordResetOtp({ to: 'operator@example.com', otp: '123456', expiresAt: new Date() });
    expect(sent).toBe(false);
    expect(mailerDeps.createTransport).not.toHaveBeenCalled();
  });
});
