/** Kesalahan bisnis dengan status HTTP dan kode yang stabil. API menerjemahkannya langsung menjadi respons. */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
