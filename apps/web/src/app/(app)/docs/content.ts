import type { DocArticle } from '@/lib/docs-types';
import { ACADEMIC_DOCS } from './content-academic';
import { CORE_DOCS } from './content-core';
import { SERVICE_DOCS } from './content-services';

/** Dokumentasi panel sekolah, satu artikel per modul, berurutan seperti menu samping. */
export const SCHOOL_DOCS: DocArticle[] = [...CORE_DOCS, ...ACADEMIC_DOCS, ...SERVICE_DOCS];
