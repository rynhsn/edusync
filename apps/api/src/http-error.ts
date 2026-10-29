import { DomainError } from '@edusync/billing';
import { z } from 'zod';

export class HttpError extends DomainError {}

export const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Silakan masuk terlebih dahulu.');
export const forbidden = (message = 'Anda tidak punya izin untuk tindakan ini.') =>
  new HttpError(403, 'forbidden', message);
