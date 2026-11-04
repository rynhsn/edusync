import { parseDocx } from './docx';
import { parseText } from './text';
import type { ParsedImport } from './types';
import { buildTemplate, parseXlsx } from './xlsx';

export * from './types';
export { buildTemplate, parseDocx, parseText, parseXlsx };

/** Pilih pembaca menurut ekstensi berkas; ekstensi lain ditolak. */
export async function parseImportFile(file: File): Promise<ParsedImport> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return parseXlsx(await file.arrayBuffer());
  if (name.endsWith('.docx')) return parseDocx(await file.arrayBuffer());
  if (name.endsWith('.txt')) return parseText(await file.text());
  throw new Error('unsupported');
}
