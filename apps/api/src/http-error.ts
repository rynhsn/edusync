import { DomainError } from '@edusync/billing';
import { z } from 'zod';

export class HttpError extends DomainError {
  /** Rincian tambahan yang ikut di badan galat (mis. daftar penghalang `twin_blocked`); kosong pada galat biasa. */
  details?: Record<string, unknown>;
}

export const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Silakan masuk terlebih dahulu.');
export const forbidden = (message = 'Anda tidak punya izin untuk tindakan ini.') =>
  new HttpError(403, 'forbidden', message);
