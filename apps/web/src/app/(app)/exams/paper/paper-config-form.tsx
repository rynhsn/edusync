'use client';

import { EXAM_PAPER_SIZES, EXAM_PLACEHOLDERS, type ExamPaperConfig } from '@edusync/contracts';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { cn } from '@/lib/utils';

type Cfg = ExamPaperConfig;
const STUDENT_FIELDS = ['name', 'number', 'class'] as const;
const SHOW = ['address', 'phone', 'fax', 'email', 'website'] as const;

/** Pindahkan item daftar ke atas/bawah (`dir`), tanpa mengubah daftar asli. */
function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j] as T, next[i] as T];
  return next;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card grid content-start gap-3 rounded-2xl border p-4">
      <div>
        <h2 className="font-heading font-semibold">{title}</h2>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

/** Daftar teks yang bisa ditambah, dihapus, dan diurutkan (baris kop, petunjuk umum). */
function TextList({
  idPrefix,
  items,
  max,
  disabled,
  addLabel,
  itemLabel,
  onChange,
}: {
  idPrefix: string;
  items: string[];
  max: number;
  disabled?: boolean;
  addLabel: string;
  itemLabel: (n: number) => string;
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations('examPaper');
  return (
    <div className="grid content-start gap-2">
      {items.map((text, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: baris diedit langsung, posisinya adalah identitasnya.
        <div key={i} className="flex items-center gap-1.5">
          <Input
            id={`${idPrefix}-${i}`}
            aria-label={itemLabel(i + 1)}
            disabled={disabled}
            maxLength={400}
            value={text}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || i === 0}
            aria-label={t('moveUp')}
            onClick={() => onChange(move(items, i, -1))}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || i === items.length - 1}
            aria-label={t('moveDown')}
            onClick={() => onChange(move(items, i, 1))}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={t('remove')}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || items.length >= max}
          onClick={() => onChange([...items, ''])}
        >
          <Plus /> {addLabel}
        </Button>
      </div>
    </div>
  );
}

/** Formulir seluruh pengaturan lembar ujian (dipakai untuk pengaturan sekolah dan lembar khusus ujian). */
export function PaperConfigForm({
  value,
  onChange,
  disabled,
}: {
  value: Cfg;
  onChange: (next: Cfg) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('examPaper');
  const set = (patch: Partial<Cfg>) => onChange({ ...value, ...patch });
  const kop = value.kop;
  const setKop = (patch: Partial<Cfg['kop']>) => set({ kop: { ...kop, ...patch } });
  const info = value.info;
  const ins = value.instructions;
  const num = (v: string, fallback: number) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

  return (
    <div className="grid gap-4">
      <Section title={t('secPaper')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid content-start gap-2">
            <Label htmlFor="pp-size">{t('paperSize')}</Label>
            <SelectField
              id="pp-size"
              disabled={disabled}
              value={value.paperSize}
              onChange={(e) => set({ paperSize: e.target.value as Cfg['paperSize'] })}
            >
              {EXAM_PAPER_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="pp-margin">{t('margin')}</Label>
            <Input
              id="pp-margin"
              type="number"
              min={8}
              max={30}
              disabled={disabled}
              value={value.marginMm}
              onChange={(e) => set({ marginMm: num(e.target.value, 15) })}
            />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="pp-font">{t('fontSize')}</Label>
            <Input
              id="pp-font"
              type="number"
              min={9}
              max={14}
              step={0.5}
              disabled={disabled}
              value={value.fontSizePt}
              onChange={(e) => set({ fontSizePt: num(e.target.value, 11) })}
            />
          </div>
        </div>
      </Section>

      <Section title={t('secKop')} hint={t('secKopHint')}>
        <Toggle
          id="pp-kop"
          label={t('kopEnabled')}
          checked={kop.enabled}
          disabled={disabled}
          onChange={(v) => setKop({ enabled: v })}
        />
        {kop.enabled && (
          <>
            <Toggle
              id="pp-logo"
              label={t('showLogo')}
              checked={kop.showLogo}
              disabled={disabled}
              onChange={(v) => setKop({ showLogo: v })}
            />
            <div className="grid content-start gap-2">
              <Label>{t('preLines')}</Label>
              <p className="text-muted-foreground text-xs">{t('preLinesHint')}</p>
              <TextList
                idPrefix="pp-pre"
                items={kop.preLines}
                max={3}
                disabled={disabled}
                addLabel={t('addLine')}
                itemLabel={(n) => t('preLineN', { n })}
                onChange={(preLines) => setKop({ preLines })}
              />
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: dua tombol pilihan, bukan isian formulir. */}
            <div role="group" aria-label={t('kopSource')} className="grid content-start gap-2 sm:grid-cols-2">
              {(['identity', 'custom'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={disabled}
                  aria-pressed={kop.source === k}
                  onClick={() => setKop({ source: k })}
                  className={cn(
                    'focus-visible:ring-ring/50 rounded-xl border p-3 text-left outline-none focus-visible:ring-3 disabled:opacity-60',
                    kop.source === k ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  <span className="font-heading block text-sm font-semibold">{t(`source.${k}`)}</span>
                  <span className="text-muted-foreground block text-xs">{t(`source.${k}Hint`)}</span>
                </button>
              ))}
            </div>
            {kop.source === 'identity' ? (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {SHOW.map((k) => (
                  <Toggle
                    key={k}
                    id={`pp-show-${k}`}
                    label={t(`show.${k}`)}
                    checked={kop.show[k]}
                    disabled={disabled}
                    onChange={(v) => setKop({ show: { ...kop.show, [k]: v } })}
                  />
                ))}
              </div>
            ) : (
              <div className="grid content-start gap-2">
                <Label>{t('customLines')}</Label>
                {kop.customLines.map((l, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: baris diedit langsung, posisinya adalah identitasnya.
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <Input
                      className="min-w-48 flex-1"
                      aria-label={t('customLineN', { n: i + 1 })}
                      disabled={disabled}
                      maxLength={160}
                      value={l.text}
                      onChange={(e) =>
                        setKop({
                          customLines: kop.customLines.map((x, j) =>
                            j === i ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Input
                      className="w-20"
                      type="number"
                      min={8}
                      max={20}
                      aria-label={t('lineSize')}
                      disabled={disabled}
                      value={l.sizePt}
                      onChange={(e) =>
                        setKop({
                          customLines: kop.customLines.map((x, j) =>
                            j === i ? { ...x, sizePt: num(e.target.value, 12) } : x,
                          ),
                        })
                      }
                    />
                    <Toggle
                      id={`pp-bold-${i}`}
                      label={t('bold')}
                      checked={l.bold}
                      disabled={disabled}
                      onChange={(v) =>
                        setKop({
                          customLines: kop.customLines.map((x, j) => (j === i ? { ...x, bold: v } : x)),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      aria-label={t('remove')}
                      onClick={() => setKop({ customLines: kop.customLines.filter((_, j) => j !== i) })}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || kop.customLines.length >= 6}
                    onClick={() =>
                      setKop({ customLines: [...kop.customLines, { text: '', bold: false, sizePt: 12 }] })
                    }
                  >
                    <Plus /> {t('addLine')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title={t('secTitle')} hint={t('placeholderHint')}>
        <Toggle
          id="pp-title"
          label={t('titleEnabled')}
          checked={value.title.enabled}
          disabled={disabled}
          onChange={(v) => set({ title: { ...value.title, enabled: v } })}
        />
        <div className="grid content-start gap-2">
          <Label htmlFor="pp-title-tpl">{t('titleTemplate')}</Label>
          <Input
            id="pp-title-tpl"
            disabled={disabled}
            maxLength={200}
            value={value.title.template}
            onChange={(e) => set({ title: { ...value.title, template: e.target.value } })}
          />
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label={t('placeholders')}>
          {EXAM_PLACEHOLDERS.map((p) => (
            <li key={p} title={t(`ph.${p}`)} className="bg-muted rounded-md px-1.5 py-0.5 font-mono text-xs">
              {`{${p}}`}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('secInfo')} hint={t('secInfoHint')}>
        <Toggle
          id="pp-info"
          label={t('infoEnabled')}
          checked={info.enabled}
          disabled={disabled}
          onChange={(v) => set({ info: { ...info, enabled: v } })}
        />
        {info.enabled && (
          <>
            <div className="grid max-w-48 content-start gap-2">
              <Label htmlFor="pp-info-cols">{t('infoColumns')}</Label>
              <SelectField
                id="pp-info-cols"
                disabled={disabled}
                value={String(info.columns)}
                onChange={(e) => set({ info: { ...info, columns: e.target.value === '1' ? 1 : 2 } })}
              >
                <option value="1">{t('oneColumn')}</option>
                <option value="2">{t('twoColumns')}</option>
              </SelectField>
            </div>
            <div className="grid content-start gap-2">
              {info.rows.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: baris diedit langsung, posisinya adalah identitasnya.
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <Input
                    className="w-40"
                    aria-label={t('rowLabelN', { n: i + 1 })}
                    placeholder={t('rowLabel')}
                    disabled={disabled}
                    maxLength={60}
                    value={r.label}
                    onChange={(e) =>
                      set({
                        info: {
                          ...info,
                          rows: info.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        },
                      })
                    }
                  />
                  <Input
                    className="min-w-40 flex-1"
                    aria-label={t('rowValueN', { n: i + 1 })}
                    placeholder={t('rowValue')}
                    disabled={disabled}
                    maxLength={200}
                    value={r.value}
                    onChange={(e) =>
                      set({
                        info: {
                          ...info,
                          rows: info.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                        },
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || i === 0}
                    aria-label={t('moveUp')}
                    onClick={() => set({ info: { ...info, rows: move(info.rows, i, -1) } })}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || i === info.rows.length - 1}
                    aria-label={t('moveDown')}
                    onClick={() => set({ info: { ...info, rows: move(info.rows, i, 1) } })}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={t('remove')}
                    onClick={() => set({ info: { ...info, rows: info.rows.filter((_, j) => j !== i) } })}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || info.rows.length >= 10}
                  onClick={() => set({ info: { ...info, rows: [...info.rows, { label: '', value: '' }] } })}
                >
                  <Plus /> {t('addRow')}
                </Button>
              </div>
            </div>
          </>
        )}
      </Section>

      <Section title={t('secInstructions')}>
        <Toggle
          id="pp-ins"
          label={t('instructionsEnabled')}
          checked={ins.enabled}
          disabled={disabled}
          onChange={(v) => set({ instructions: { ...ins, enabled: v } })}
        />
        {ins.enabled && (
          <>
            <div className="grid content-start gap-2">
              <Label htmlFor="pp-ins-title">{t('instructionsTitle')}</Label>
              <Input
                id="pp-ins-title"
                disabled={disabled}
                maxLength={60}
                value={ins.title}
                onChange={(e) => set({ instructions: { ...ins, title: e.target.value } })}
              />
            </div>
            <TextList
              idPrefix="pp-ins-item"
              items={ins.items}
              max={15}
              disabled={disabled}
              addLabel={t('addItem')}
              itemLabel={(n) => t('itemN', { n })}
              onChange={(items) => set({ instructions: { ...ins, items } })}
            />
          </>
        )}
      </Section>

      <Section title={t('secStudent')} hint={t('secStudentHint')}>
        <Toggle
          id="pp-student"
          label={t('studentEnabled')}
          checked={value.studentBlock.enabled}
          disabled={disabled}
          onChange={(v) => set({ studentBlock: { ...value.studentBlock, enabled: v } })}
        />
        {value.studentBlock.enabled && (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {STUDENT_FIELDS.map((f) => (
              <Toggle
                key={f}
                id={`pp-sf-${f}`}
                label={t(`studentField.${f}`)}
                checked={value.studentBlock.fields.includes(f)}
                disabled={disabled}
                onChange={(on) =>
                  set({
                    studentBlock: {
                      ...value.studentBlock,
                      // Urutan tetap Nama, No. Peserta, Kelas.
                      fields: STUDENT_FIELDS.filter((x) =>
                        x === f ? on : value.studentBlock.fields.includes(x),
                      ),
                    },
                  })
                }
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={t('secFooter')}>
        <div className="grid content-start gap-2">
          <Label htmlFor="pp-footer">{t('footer')}</Label>
          <Input
            id="pp-footer"
            disabled={disabled}
            maxLength={200}
            value={value.footer}
            onChange={(e) => set({ footer: e.target.value })}
          />
        </div>
      </Section>
    </div>
  );
}
