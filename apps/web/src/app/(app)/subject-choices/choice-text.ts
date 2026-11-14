import { type ChoiceProblem, rangeKind } from '../../../lib/subject-choice';

type ChoiceTextKey =
  | 'rangeExact'
  | 'rangeBetween'
  | 'rangeAtLeast'
  | 'rangeAtMost'
  | 'problemNotChosen'
  | 'problemTooFew'
  | 'problemTooMany';
type Translate = (key: ChoiceTextKey, values?: Record<string, string | number>) => string;

/** Rentang dalam kalimat awam: "4 sampai 5", "tepat 1", "minimal 2", "paling banyak 3". */
export function rangeText(t: Translate, min: number | null, max: number | null): string {
  switch (rangeKind(min, max)) {
    case 'exact':
      return t('rangeExact', { min: min ?? 0 });
    case 'between':
      return t('rangeBetween', { min: min ?? 0, max: max ?? 0 });
    case 'atLeast':
      return t('rangeAtLeast', { min: min ?? 0 });
    case 'atMost':
      return t('rangeAtMost', { max: max ?? 0 });
    default:
      return '';
  }
}

/** Kalimat peringatan satu masalah aturan; `t` = terjemahan namespace subjectChoices. */
export function problemText(t: Translate, p: ChoiceProblem): string {
  if (p.kind === 'notChosen') return t('problemNotChosen', { label: p.label });
  const range = rangeText(t, p.min, p.max);
  return p.kind === 'tooMany'
    ? t('problemTooMany', { label: p.label, count: p.count, range })
    : t('problemTooFew', { label: p.label, count: p.count, range });
}
