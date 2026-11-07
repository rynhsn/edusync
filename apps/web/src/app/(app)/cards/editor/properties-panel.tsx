'use client';

import {
  type CardElement,
  type CardField,
  type CardKind,
  type CodeField,
  cardFieldsFor,
  codeFieldsFor,
} from '@edusync/contracts';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  ImageUp,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import type { OrderMove } from '@/lib/cards/elements';
import { cn } from '@/lib/utils';
import { CheckField } from '../check-field';
import { NumberField } from './number-field';

interface Props {
  element: CardElement;
  kind: CardKind;
  /** Ubah kolom elemen; `key` menggabungkan ketikan beruntun menjadi satu langkah undo. */
  onChange: (patch: Partial<CardElement>, key?: string) => void;
  onBlurField: () => void;
  onOrder: (move: OrderMove) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPickImage: () => void;
  uploading: boolean;
  fieldLabel: (field: CardField) => string;
}

function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ColorField({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Input
      id={id}
      type="color"
      aria-label={label}
      className="h-8 cursor-pointer p-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Kolom nullable (isi/garis tepi kotak): kotak centang "ada" + pemilih warna. */
function OptionalColor({
  id,
  label,
  value,
  fallback,
  noneLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  fallback: string;
  noneLabel: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <Row label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <ColorField id={id} label={label} value={value ?? fallback} onChange={(v) => onChange(v)} />
        <CheckField
          className="shrink-0"
          checked={value === null}
          onChange={(c) => onChange(c ? null : fallback)}
        >
          {noneLabel}
        </CheckField>
      </div>
    </Row>
  );
}

/** Panel properti elemen terpilih: posisi/ukuran dalam mm dan pengaturan sesuai jenis. */
export function PropertiesPanel({
  element: el,
  kind,
  onChange,
  onBlurField,
  onOrder,
  onDuplicate,
  onDelete,
  onPickImage,
  uploading,
  fieldLabel,
}: Props) {
  const t = useTranslations('cards.props');
  const tType = useTranslations('cards.elementTypes');
  const id = (k: string) => `prop-${el.id}-${k}`;
  const flat = el.type === 'line';
  const bindable = cardFieldsFor(kind);
  const codeFields = codeFieldsFor(kind);

  const num = (key: 'x' | 'y' | 'w' | 'h') => (
    <Row label={t(key)} htmlFor={id(key)}>
      <NumberField
        id={id(key)}
        value={el[key]}
        min={flat && (key === 'w' || key === 'h') ? 0 : key === 'w' || key === 'h' ? 1 : 0}
        onChange={(v) => onChange({ [key]: v } as Partial<CardElement>, `${el.id}:${key}`)}
      />
    </Row>
  );

  const hasText = el.type === 'text' || el.type === 'field';

  return (
    <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0" onBlur={onBlurField}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold">{tType(el.type)}</h3>
        <div className="flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-label={t('toFront')} onClick={() => onOrder('front')}>
            <ArrowUpToLine className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={t('forward')} onClick={() => onOrder('forward')}>
            <ChevronUp className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('backward')}
            onClick={() => onOrder('backward')}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={t('toBack')} onClick={() => onOrder('back')}>
            <ArrowDownToLine className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {num('x')}
        {num('y')}
        {num('w')}
        {num('h')}
      </div>

      {el.type === 'text' && (
        <Row label={t('text')} htmlFor={id('text')}>
          <Input
            id={id('text')}
            maxLength={200}
            value={el.text}
            onChange={(e) => onChange({ text: e.target.value }, `${el.id}:text`)}
          />
        </Row>
      )}

      {el.type === 'field' && (
        <>
          <Row label={t('field')} htmlFor={id('field')}>
            <SelectField
              id={id('field')}
              value={el.field}
              onChange={(e) => onChange({ field: e.target.value as CardField })}
            >
              {bindable
                .filter((f) => f !== 'qrCode')
                .map((f) => (
                  <option key={f} value={f}>
                    {fieldLabel(f)}
                  </option>
                ))}
            </SelectField>
          </Row>
          <Row label={t('prefix')} htmlFor={id('prefix')}>
            <Input
              id={id('prefix')}
              maxLength={40}
              value={el.prefix ?? ''}
              placeholder={t('prefixHint')}
              onChange={(e) => onChange({ prefix: e.target.value }, `${el.id}:prefix`)}
            />
          </Row>
        </>
      )}

      {hasText && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Row label={t('fontSize')} htmlFor={id('fs')}>
              <NumberField
                id={id('fs')}
                value={el.fontSize}
                min={4}
                max={40}
                step={0.5}
                onChange={(v) => onChange({ fontSize: v }, `${el.id}:fs`)}
              />
            </Row>
            <Row label={t('color')} htmlFor={id('color')}>
              <ColorField
                id={id('color')}
                label={t('color')}
                value={el.color}
                onChange={(v) => onChange({ color: v }, `${el.id}:color`)}
              />
            </Row>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CheckField checked={el.bold} onChange={(c) => onChange({ bold: c })}>
              {t('bold')}
            </CheckField>
            <fieldset
              aria-label={t('align')}
              className="bg-muted m-0 inline-flex min-w-0 gap-0.5 rounded-lg border-0 p-0.5"
            >
              {(
                [
                  ['left', AlignLeft],
                  ['center', AlignCenter],
                  ['right', AlignRight],
                ] as const
              ).map(([value, Icon]) => (
                <Button
                  key={value}
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t(`align_${value}`)}
                  aria-pressed={el.align === value}
                  className={cn(el.align === value && 'bg-card shadow-sm')}
                  onClick={() => onChange({ align: value })}
                >
                  <Icon className="size-4" />
                </Button>
              ))}
            </fieldset>
          </div>
        </>
      )}

      {el.type === 'image' && (
        <>
          <Row label={t('fit')} htmlFor={id('fit')}>
            <SelectField
              id={id('fit')}
              value={el.fit}
              onChange={(e) => onChange({ fit: e.target.value as 'contain' | 'cover' })}
            >
              <option value="contain">{t('fit_contain')}</option>
              <option value="cover">{t('fit_cover')}</option>
            </SelectField>
          </Row>
          <Button variant="outline" size="sm" disabled={uploading} onClick={onPickImage}>
            <ImageUp className="size-4" /> {uploading ? t('uploading') : t('replaceImage')}
          </Button>
        </>
      )}

      {el.type === 'photo' && (
        <Row label={t('shape')} htmlFor={id('shape')}>
          <SelectField
            id={id('shape')}
            value={el.shape}
            onChange={(e) => onChange({ shape: e.target.value as 'rect' | 'circle' })}
          >
            <option value="rect">{t('shape_rect')}</option>
            <option value="circle">{t('shape_circle')}</option>
          </SelectField>
        </Row>
      )}

      {(el.type === 'qr' || el.type === 'barcode') && (
        <>
          <Row label={t('codeField')} {...(codeFields.length === 1 ? {} : { htmlFor: id('code') })}>
            {codeFields.length === 1 ? (
              <p className="bg-muted/50 min-w-0 truncate rounded-lg border px-2.5 py-1.5 text-sm">
                {fieldLabel(codeFields[0] as CodeField)}
              </p>
            ) : (
              <SelectField
                id={id('code')}
                value={el.field}
                onChange={(e) => onChange({ field: e.target.value as CodeField })}
              >
                {codeFields.map((f) => (
                  <option key={f} value={f}>
                    {fieldLabel(f)}
                  </option>
                ))}
              </SelectField>
            )}
          </Row>
          {el.field === 'qrCode' && el.type === 'barcode' && (
            <p className="text-muted-foreground text-xs">{t('qrCodeBarcodeHint')}</p>
          )}
          <Row label={t('color')} htmlFor={id('color')}>
            <ColorField
              id={id('color')}
              label={t('color')}
              value={el.color}
              onChange={(v) => onChange({ color: v }, `${el.id}:color`)}
            />
          </Row>
        </>
      )}

      {el.type === 'barcode' && (
        <CheckField checked={el.showText} onChange={(c) => onChange({ showText: c })}>
          {t('showText')}
        </CheckField>
      )}

      {el.type === 'rect' && (
        <>
          <OptionalColor
            id={id('fill')}
            label={t('fill')}
            value={el.fill}
            fallback="#e5e7eb"
            noneLabel={t('none')}
            onChange={(v) => onChange({ fill: v })}
          />
          <OptionalColor
            id={id('border')}
            label={t('borderColor')}
            value={el.borderColor}
            fallback="#111111"
            noneLabel={t('none')}
            onChange={(v) =>
              onChange({ borderColor: v, ...(v && el.borderWidth === 0 ? { borderWidth: 0.3 } : {}) })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Row label={t('borderWidth')} htmlFor={id('bw')}>
              <NumberField
                id={id('bw')}
                value={el.borderWidth}
                min={0}
                max={5}
                step={0.1}
                onChange={(v) => onChange({ borderWidth: v }, `${el.id}:bw`)}
              />
            </Row>
            <Row label={t('radius')} htmlFor={id('radius')}>
              <NumberField
                id={id('radius')}
                value={el.radius}
                min={0}
                max={50}
                step={0.5}
                onChange={(v) => onChange({ radius: v }, `${el.id}:radius`)}
              />
            </Row>
          </div>
        </>
      )}

      {el.type === 'line' && (
        <div className="grid grid-cols-2 gap-3">
          <Row label={t('color')} htmlFor={id('color')}>
            <ColorField
              id={id('color')}
              label={t('color')}
              value={el.color}
              onChange={(v) => onChange({ color: v }, `${el.id}:color`)}
            />
          </Row>
          <Row label={t('thickness')} htmlFor={id('thick')}>
            <NumberField
              id={id('thick')}
              value={el.thickness}
              min={0.1}
              max={5}
              step={0.1}
              onChange={(v) => onChange({ thickness: v }, `${el.id}:thick`)}
            />
          </Row>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicate}>
          <Copy className="size-4" /> {t('duplicate')}
        </Button>
        <Button variant="outline" size="sm" className="text-destructive flex-1" onClick={onDelete}>
          <Trash2 className="size-4" /> {t('delete')}
        </Button>
      </div>
    </fieldset>
  );
}
