'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useSchool } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { FEE_SCOPES, type FeeScope, filterByName, MAX_STUDENT_TARGETS, toggleId } from '../fee-scope';

export interface PickedStudent {
  id: string;
  name: string;
}

export interface ScopeValue {
  scope: FeeScope;
  classIds: string[];
  students: PickedStudent[];
}

const SCOPE_LABEL = {
  all: 'feeScopeAll',
  class: 'feeScopeClass',
  student: 'feeScopeStudent',
} as const;

interface Props {
  value: ScopeValue;
  onChange: (v: ScopeValue) => void;
  /** Kelas tahun ajaran terpilih untuk pemilih kelas. */
  classes: { id: string; name: string }[];
  /** Pesan validasi (sasaran kosong, dsb.) yang ditampilkan di bawah pemilih. */
  errorText?: string | null;
  /** Galat merah gaya baru (FieldError) di bawah pemilih; menggantikan `errorText` bila diberikan. */
  error?: React.ReactNode;
  /** Atribut a11y untuk pemilih "Berlaku untuk" saat ada galat (`aria-invalid`, `aria-describedby`). */
  scopeProps?: { 'aria-invalid'?: boolean; 'aria-describedby'?: string | undefined };
}

/** Pemilih "Berlaku untuk": semua siswa, beberapa kelas (daftar centang), atau siswa tertentu (pencarian + chip). */
export function FeeScopePicker({ value, onChange, classes, errorText, error, scopeProps }: Props) {
  const t = useTranslations('finance');
  const tm = useTranslations('masterData');
  const { school } = useSchool();
  const header = { header: schoolHeader(school.schoolId) };
  const [q, setQ] = useState('');
  const [classQ, setClassQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const search = useQuery({
    queryKey: ['finance', school.schoolId, 'student-search', debounced],
    enabled: value.scope === 'student' && debounced.length >= 2,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { ...header, query: { q: debounced, limit: 8 } } })),
  });

  const shownClasses = filterByName(classes, classQ);
  const classNameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? t('feeScopeClassOtherYear');
  const atCap = value.students.length >= MAX_STUDENT_TARGETS;

  return (
    <div className="grid gap-3 sm:col-span-2">
      <div className="grid content-start gap-2">
        <Label htmlFor="fee-scope">{t('feeScopeLabel')}</Label>
        <SelectField
          id="fee-scope"
          {...scopeProps}
          value={value.scope}
          onChange={(e) => onChange({ ...value, scope: e.target.value as FeeScope })}
        >
          {FEE_SCOPES.map((s) => (
            <option key={s} value={s}>
              {t(SCOPE_LABEL[s])}
            </option>
          ))}
        </SelectField>
        <p className="text-muted-foreground text-xs">{t('feeScopeHelp')}</p>
      </div>

      {value.scope === 'class' && (
        <div className="grid content-start gap-2">
          {classes.length > 8 && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                aria-label={t('feeScopeSearchClass')}
                className="pl-8"
                autoComplete="off"
                value={classQ}
                placeholder={t('feeScopeSearchClass')}
                onChange={(e) => setClassQ(e.target.value)}
              />
            </div>
          )}
          {classes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('feeScopeNoClasses')}</p>
          ) : (
            <ul className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
              {shownClasses.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={`fee-cls-${c.id}`}
                    checked={value.classIds.includes(c.id)}
                    onCheckedChange={(v) =>
                      onChange({ ...value, classIds: toggleId(value.classIds, c.id, v === true) })
                    }
                  />
                  <Label htmlFor={`fee-cls-${c.id}`} className="font-normal">
                    {c.name}
                  </Label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm font-medium">
            {t('feeScopeClassesPicked', { count: value.classIds.length })}
          </p>
          {value.classIds.length > 0 && (
            <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
              {value.classIds.map((id) => (
                <Badge key={id} variant="secondary" className="h-7 gap-1.5 pr-1 pl-2.5 text-sm">
                  {classNameOf(id)}
                  <button
                    type="button"
                    aria-label={`${tm('delete')} ${classNameOf(id)}`}
                    className="hover:bg-muted rounded-full p-0.5"
                    onClick={() => onChange({ ...value, classIds: toggleId(value.classIds, id, false) })}
                  >
                    <X className="size-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {value.scope === 'student' && (
        <div className="grid content-start gap-2">
          <div className="relative w-full sm:max-w-md">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label={t('searchStudent')}
              className="pl-8"
              autoComplete="off"
              value={q}
              placeholder={t('searchPlaceholder')}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {search.data && search.data.items.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('noStudentFound')}</p>
          )}
          {search.data && search.data.items.length > 0 && (
            <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border sm:max-w-md">
              {search.data.items.map((s) => {
                const on = value.students.some((p) => p.id === s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox
                      id={`fee-st-${s.id}`}
                      checked={on}
                      disabled={!on && atCap}
                      onCheckedChange={(v) =>
                        onChange({
                          ...value,
                          students:
                            v === true
                              ? on
                                ? value.students
                                : [...value.students, { id: s.id, name: s.name }]
                              : value.students.filter((p) => p.id !== s.id),
                        })
                      }
                    />
                    <Label htmlFor={`fee-st-${s.id}`} className="flex flex-1 flex-col items-start gap-0">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {[s.nis, s.className].filter(Boolean).join(' · ')}
                      </span>
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-sm font-medium">{t('pickedStudents', { count: value.students.length })}</p>
          {value.students.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t('noPickedStudents')}</p>
          ) : (
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {value.students.map((p) => (
                <Badge key={p.id} variant="secondary" className="h-7 gap-1.5 pr-1 pl-2.5 text-sm">
                  {p.name}
                  <button
                    type="button"
                    aria-label={`${tm('delete')} ${p.name}`}
                    className="hover:bg-muted rounded-full p-0.5"
                    onClick={() =>
                      onChange({ ...value, students: value.students.filter((x) => x.id !== p.id) })
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {error}
      {!error && errorText && (
        <p role="alert" className="text-destructive text-sm">
          {errorText}
        </p>
      )}
    </div>
  );
}
