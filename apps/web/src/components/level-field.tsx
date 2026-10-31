'use client';

import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { useSchoolLevels } from '@/lib/school-settings';

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** Teks pilihan kosong (mis. "Semua tingkat"); tanpa ini tidak ada pilihan kosong. */
  emptyLabel?: string;
  /** Petunjuk isian bila daftar tingkat sekolah kosong dan pengguna mengetik bebas. */
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

/**
 * Isian tingkat kelas. Bila sekolah sudah mengatur daftar tingkat (Pengaturan sekolah), berupa pilihan dari daftar itu;
 * bila daftar masih kosong, tetap teks bebas supaya sekolah yang belum mengatur tidak terhambat.
 */
export function LevelField({
  id,
  value,
  onChange,
  required,
  emptyLabel,
  placeholder,
  maxLength = 20,
  disabled,
}: Props) {
  const levels = useSchoolLevels();
  const list = levels.data ?? [];

  if (list.length === 0) {
    return (
      <Input
        id={id}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const known = value === '' || list.some((l) => l.code === value);
  return (
    <SelectField
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...(disabled !== undefined ? { disabled } : {})}
    >
      {(emptyLabel !== undefined || !required) && <option value="">{emptyLabel ?? ''}</option>}
      {list.map((l) => (
        <option key={l.id} value={l.code}>
          {l.label === l.code ? l.code : `${l.label} (${l.code})`}
        </option>
      ))}
      {/* Nilai lama yang tak ada di daftar tetap tampil agar tidak hilang diam-diam. */}
      {!known && <option value={value}>{value}</option>}
    </SelectField>
  );
}
