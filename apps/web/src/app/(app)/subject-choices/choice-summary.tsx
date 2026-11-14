'use client';

import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { summarizeWarnings } from '@/lib/subject-choice';
import { problemText } from './choice-text';

interface Summary {
  semesterId: string | null;
  rules: {
    ruleId: string;
    label: string;
    minOffered: number | null;
    offered: number;
    offeredOk: boolean;
  }[];
  students: {
    studentId: string;
    name: string;
    nis: string | null;
    results: {
      ruleId: string;
      groupKey: string;
      label: string;
      enforce: boolean;
      count: number;
      minChoices: number | null;
      maxChoices: number | null;
      status: 'ok' | 'below_min' | 'above_max';
    }[];
  }[];
  unchosen: { studentId: string; name: string }[];
}

/** Ringkasan peringatan aturan pilihan satu kelas pada satu semester. Hanya informasi; tidak memblokir. */
export function ChoiceSummary({
  summary,
  semesters,
  semesterId,
  onSemester,
}: {
  summary: Summary;
  semesters: { id: string; name: string }[];
  semesterId: string;
  onSemester: (id: string) => void;
}) {
  const t = useTranslations('subjectChoices');
  const warnings = summarizeWarnings(summary.students);
  const offeredBad = summary.rules.filter((r) => !r.offeredOk);
  const clean = warnings.length === 0 && offeredBad.length === 0 && summary.unchosen.length === 0;

  return (
    <section
      aria-labelledby="choice-summary-title"
      className="bg-card grid gap-3 rounded-2xl border p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="choice-summary-title" className="font-heading text-base font-semibold">
            {t('summaryTitle')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('summaryHint')}</p>
        </div>
        {semesters.length > 1 && (
          <div className="grid w-full gap-1.5 sm:w-52">
            <Label htmlFor="summary-semester">{t('summarySemester')}</Label>
            <SelectField
              id="summary-semester"
              className={TOUCH_SELECT}
              value={semesterId}
              onChange={(e) => onSemester(e.target.value)}
            >
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>
        )}
      </div>

      {summary.rules.length === 0 && <p className="text-muted-foreground text-sm">{t('summaryNoRules')}</p>}

      {clean && summary.rules.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('summaryAllGood')}
        </p>
      )}

      {offeredBad.length > 0 && (
        <ul className="grid gap-1.5">
          {offeredBad.map((r) => (
            <li key={r.ruleId} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{t('offeredFew', { label: r.label, offered: r.offered, min: r.minOffered ?? 0 })}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.unchosen.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-medium">{t('unchosenTitle')}</span>{' '}
            {summary.unchosen.map((u) => u.name).join(', ')}
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="grid gap-2">
          {warnings.map((w) => (
            <li key={w.studentId} className="rounded-xl border p-2.5 text-sm">
              <p className="font-medium">
                {w.name}
                {w.nis && <span className="text-muted-foreground font-normal"> · {w.nis}</span>}
              </p>
              <ul className="mt-1 grid gap-1">
                {w.problems.map((p) => (
                  <li
                    key={`${p.groupKey}-${p.kind}`}
                    className="flex items-start gap-2 text-amber-800 dark:text-amber-300"
                  >
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>{problemText(t, p)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
