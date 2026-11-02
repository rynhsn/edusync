import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { emailSendHandler } from './handlers';

const job = (data: unknown) => ({ id: 'j1', name: 'email.send', data }) as never;
const mailerOf = (transport: ReturnType<typeof nodemailer.createTransport>, from = 'x@edusync.test') => ({
  get: async () => ({ transport, from }),
});

describe('emailSendHandler', () => {
  it('mengirim email sesuai payload', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(transport, 'sendMail');
    await emailSendHandler(mailerOf(transport, 'Edusync <a@edusync.test>'))([
      job({ to: 'guru@example.test', subject: 'Halo', text: 'Isi' }),
    ]);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'guru@example.test', subject: 'Halo', from: 'Edusync <a@edusync.test>' }),
    );
  });

  it('payload tidak valid dibuang tanpa melempar, agar tidak dicoba ulang selamanya', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(transport, 'sendMail');
    const log = { error: vi.fn() } as unknown as Console;
    await emailSendHandler(mailerOf(transport), log)([job({ to: 'bukan-email' })]);
    expect(spy).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  it('kegagalan SMTP dilempar ulang supaya pg-boss mencoba lagi', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    vi.spyOn(transport, 'sendMail').mockRejectedValue(new Error('SMTP mati'));
    await expect(
      emailSendHandler(mailerOf(transport))([job({ to: 'a@example.test', subject: 's', text: 't' })]),
    ).rejects.toThrow('SMTP mati');
  });
});
