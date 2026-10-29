'use client';

import { Children, isValidElement, type ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Nilai kosong ('') dipakai untuk "tanpa pilihan" (mis. "Semua kelas"); Base UI memakai null, jadi dipetakan ke penanda. */
const NONE = '__none__';

interface Props {
  id?: string;
  value: string;
  /** Mirip <select>: nilai baru ada di `e.target.value`. */
  onChange: (e: { target: { value: string } }) => void;
  /** Elemen <option value="...">label</option>, boleh hasil .map() */
  children: ReactNode;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

/** Teks dari anak sebuah <option> (bisa berupa gabungan teks dan ekspresi). */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/**
 * Dropdown shadcn (Base UI Select) yang dipakai dengan bentuk <select> biasa: anak berupa <option>, `value`, dan
 * `onChange`. Menggantikan <select> bawaan browser agar tampilannya sama dengan komponen shadcn lainnya.
 */
export function SelectField({
  id,
  value,
  onChange,
  children,
  disabled,
  placeholder,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const items = Children.toArray(children)
    .filter(isValidElement<{ value?: string; children?: ReactNode }>)
    .map((el) => ({ value: String(el.props.value ?? ''), label: textOf(el.props.children) }))
    .map((i) => ({ value: i.value === '' ? NONE : i.value, label: i.label }));
  const current = value === '' ? NONE : value;
  const known = items.some((i) => i.value === current);

  return (
    <Select
      value={known ? current : null}
      onValueChange={(v) => onChange({ target: { value: v === NONE || v === null ? '' : String(v) } })}
      items={items}
      {...(disabled !== undefined ? { disabled } : {})}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
