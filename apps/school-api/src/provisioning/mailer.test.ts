import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mailerDeps = vi.hoisted(() => ({ createTransport: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mailerDeps.createTransport } }));

import { sendSchoolAdminActivation } from './mailer.js';

const originalEnv = { ...process.env };
const acceptedSendMail = vi.fn();
const transporterClose = vi.fn();

beforeEach(() => {
  process.env.NODE_ENV = 'development';
  process.env.SCHOOL_PUBLIC_URL = 'http://localhost:5173';
  process.env.PLATFORM_SMTP_HOST = 'smtp.gmail.com';
  process.env.PLATFORM_SMTP_PORT = '465';
  process.env.PLATFORM_SMTP_SECURE = 'true';
  process.env.PLATFORM_SMTP_USER = 'hi.edusync@gmail.com';
  process.env.PLATFORM_SMTP_PASSWORD = 'test-app-password';
  process.env.SCHOOL_EMAIL_FROM = 'EduSync School <hi.edusync@gmail.com>';
  acceptedSendMail.mockReset().mockResolvedValue({ accepted: ['rina@northfield.edu'] });
  transporterClose.mockReset();
  mailerDeps.createTransport.mockReset().mockReturnValue({ sendMail: acceptedSendMail, close: transporterClose });
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('sendSchoolAdminActivation SMTP transport', () => {
  it('delivers a school admin activation email linking to /activate/:token', async () => {
    const token = 'A'.repeat(43);
    const sent = await sendSchoolAdminActivation({
      to: 'rina@northfield.edu',
      name: 'Rina Kusuma',
      schoolName: 'Northfield High',
      token,
      expiresAt: new Date('2026-10-22T00:00:00.000Z'),
    });

    expect(sent).toBe(true);
    expect(acceptedSendMail).toHaveBeenCalledOnce();
    const message = acceptedSendMail.mock.calls[0]?.[0];
    expect(message.from).toBe('EduSync School <hi.edusync@gmail.com>');
    expect(message.to).toBe('rina@northfield.edu');
    expect(message.subject).toBe('Activate your EduSync School admin account for Northfield High');
    expect(message.text).toContain(`http://localhost:5173/activate/${token}`);
    expect(message.html).toContain(`/activate/${token}`);
    expect(JSON.stringify(message)).not.toContain('test-app-password');
    expect(transporterClose).toHaveBeenCalledOnce();
  });

  it('refuses delivery with an unapproved sender address', async () => {
    process.env.SCHOOL_EMAIL_FROM = 'Spoofed <spoof@example.com>';
    const sent = await sendSchoolAdminActivation({
      to: 'rina@northfield.edu',
      name: 'Rina Kusuma',
      schoolName: 'Northfield High',
      token: 'B'.repeat(43),
      expiresAt: new Date(),
    });
    expect(sent).toBe(false);
    expect(mailerDeps.createTransport).not.toHaveBeenCalled();
  });

  it('sends nothing when SMTP is not configured', async () => {
    process.env.PLATFORM_SMTP_PASSWORD = '';
    const sent = await sendSchoolAdminActivation({
      to: 'rina@northfield.edu',
      name: 'Rina Kusuma',
      schoolName: 'Northfield High',
      token: 'C'.repeat(43),
      expiresAt: new Date(),
    });
    expect(sent).toBe(false);
    expect(mailerDeps.createTransport).not.toHaveBeenCalled();
  });
});
