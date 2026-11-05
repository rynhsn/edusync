import type { DocArticle } from '@/lib/docs-types';
import { ACADEMIC_DOCS } from './content-academic';
import { CORE_DOCS } from './content-core';
import { EXAM_DOCS } from './content-exams';
import { ONBOARDING_DOCS } from './content-onboarding';
import { ROLE_DOCS } from './content-roles';
import { SERVICE_DOCS } from './content-services';

/** Dokumentasi panel sekolah, satu artikel per modul, berurutan seperti menu samping. */
export const SCHOOL_DOCS: DocArticle[] = [
  ...ONBOARDING_DOCS,
  ...CORE_DOCS,
  ...ACADEMIC_DOCS,
  ...EXAM_DOCS,
  ...SERVICE_DOCS,
  ...ROLE_DOCS,
];
