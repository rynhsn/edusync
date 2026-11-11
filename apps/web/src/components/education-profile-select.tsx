'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SelectField } from '@/components/ui/select-field';
import { api, unwrap } from '@/lib/api';

/** Nama jenjang menurut bahasa; kunci yang belum diterjemahkan memakai nama dari acuan platform. */
export function useEducationProfileName() {
  const t = useTranslations('educationProfiles');
  return (key: string, fallback: string) => (t.has(key as never) ? t(key as never) : fallback);
}

/** Daftar profil jenjang (publik) untuk memilih jenjang unit: satu unit satu jenjang. */
export function useEducationProfiles() {
  return useQuery({
    queryKey: ['education-profiles'],
    queryFn: async () => unwrap(await api.GET('/v1/education-profiles')),
    staleTime: 10 * 60_000,
  });
}

export function EducationProfileSelect({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (key: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}) {
  const t = useTranslations('educationProfiles');
  const profiles = useEducationProfiles();
  const nameOf = useEducationProfileName();
  return (
    <SelectField
      {...(id ? { id } : {})}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('placeholder')}
      disabled={disabled || profiles.isPending}
      aria-invalid={!!invalid}
      aria-describedby={describedBy}
    >
      {(profiles.data ?? []).map((p) => (
        <option key={p.key} value={p.key}>
          {nameOf(p.key, p.name)}
        </option>
      ))}
    </SelectField>
  );
}
