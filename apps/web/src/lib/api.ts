import createClient from 'openapi-fetch';
import type { paths } from './api-types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Klien API bertipe. Tipenya dihasilkan dari OpenAPI (`pnpm gen:api`), jadi selalu sama dengan server. */
export const api = createClient<paths>({ baseUrl: API_URL, credentials: 'include' });

export const schoolHeader = (schoolId: string) => ({ 'x-school-id': schoolId });

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Ubah hasil openapi-fetch menjadi data atau lempar ApiError berisi pesan dari server. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data;
  const err = (result.error as { error?: { code?: string; message?: string } } | undefined)?.error;
  throw new ApiError(err?.message ?? 'Permintaan tidak dapat diproses.', result.response.status, err?.code);
}
