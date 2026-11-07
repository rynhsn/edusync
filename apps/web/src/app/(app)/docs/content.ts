import type { DocArticle } from '@/lib/docs-types';
import { ACADEMIC_DOCS } from './content-academic';
import { CARD_DOCS } from './content-cards';
import { CORE_DOCS } from './content-core';
import { EXAM_DOCS } from './content-exams';
import { ONBOARDING_DOCS } from './content-onboarding';
import { ROLE_DOCS } from './content-roles';
import { SERVICE_DOCS } from './content-services';
import { SUPPORT_DOCS } from './content-support';

/** Dokumentasi panel sekolah, satu artikel per modul, berurutan seperti menu samping. */
export const SCHOOL_DOCS: DocArticle[] = [
  ...ONBOARDING_DOCS,
  ...CORE_DOCS,
  ...CARD_DOCS,
  ...ACADEMIC_DOCS,
  ...EXAM_DOCS,
  ...SERVICE_DOCS,
  ...ROLE_DOCS,
  ...SUPPORT_DOCS,
];
