'use client';

import type { CardKind } from '@edusync/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Pencil, Plus, Printer, Star, Trash2, WandSparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RowMenu } from '@/components/row-menu';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, api, schoolHeader, unwrap } from '@/lib/api';
import { sampleCardData } from '@/lib/cards/elements';
import { errorKey } from '@/lib/errors';
import { CardPreview } from './element-preview';
import type { PrintTemplate } from './print-panel';
import { useFieldLabel } from './use-field-label';

type SavedTemplate = PrintTemplate & { isDefault: boolean };

interface Props {
  kind: CardKind;
  templates: SavedTemplate[];
  /** Templat bawaan sistem (tidak tersimpan) untuk "Tambah dari bawaan". */
  system: PrintTemplate | null;
  selectedId: string;
  onPrint: (id: string) => void;
}

/** Daftar templat satu jenis kartu: pratinjau mini, penanda bawaan, dan aksi gandakan/hapus/jadikan bawaan. */
export function TemplatesPanel({ kind, templates, system, selectedId, onPrint }: Props) {
  const t = useTranslations('cards');
  const te = useTranslations();
  const { school, can } = useSchool();
  const router = useRouter();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const fieldLabel = useFieldLabel();
  const manage = can('school:manage');
  const [deleting, setDeleting] = useState<SavedTemplate | null>(null);
  const data = sampleCardData(kind);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['card-templates', school.schoolId] });
  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : te(errorKey(e)));

  const duplicate = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST('/v1/cards/templates/{id}/duplicate', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('duplicated'));
      refresh();
    },
    onError,
  });
  const makeDefault = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.PUT('/v1/cards/templates/{id}/default', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('defaultSet'));
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/cards/templates/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('deleted'));
      refresh();
    },
    onError,
  });
  const fromDefault = useMutation({
    mutationFn: async () => {
      if (!system) throw new Error('internal');
      for (let n = 1; n <= 6; n++) {
        const name = n === 1 ? system.name : `${system.name} ${n}`;
        try {
          return unwrap(
            await api.POST('/v1/cards/templates', {
              params: header,
              body: { kind, name, layout: system.layout },
            }),
          );
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
        }
      }
      throw new Error('conflict');
    },
    onSuccess: (created) => {
      refresh();
      router.push(`/cards/${created.id}`);
    },
    onError,
  });

  const shown: SavedTemplate[] = templates;

  return (
    <section className="grid gap-4" aria-label={t('templates')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold">{t('templates')}</h2>
          <p className="text-muted-foreground text-sm">
            {shown.length === 0 ? t('noTemplatesHint') : t('templatesHint')}
          </p>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={fromDefault.isPending || !system}
              onClick={() => fromDefault.mutate()}
            >
              <WandSparkles className="size-4" /> {t('addFromDefault')}
            </Button>
            <Link href={`/cards/new?kind=${kind}`} className={buttonVariants()}>
              <Plus className="size-4" /> {t('newTemplate')}
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.length === 0 && system && (
          <Card className="gap-3 px-4">
            <CardPreview
              layout={system.layout}
              backgroundUrl={null}
              data={data}
              width={260}
              fieldLabel={fieldLabel}
              className="mx-auto rounded-md shadow ring-1 ring-black/15"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{system.name}</p>
                <p className="text-muted-foreground text-xs">
                  {system.layout.widthMm} × {system.layout.heightMm} mm
                </p>
              </div>
              <Badge variant="secondary">{t('systemDefault')}</Badge>
            </div>
          </Card>
        )}
        {shown.map((tpl) => (
          <Card key={tpl.id} className="gap-3 px-4">
            <CardPreview
              layout={tpl.layout}
              backgroundUrl={tpl.backgroundPath}
              data={data}
              width={260}
              fieldLabel={fieldLabel}
              className="mx-auto rounded-md shadow ring-1 ring-black/15"
            />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{tpl.name}</p>
                <p className="text-muted-foreground text-xs">
                  {tpl.layout.widthMm} × {tpl.layout.heightMm} mm
                </p>
              </div>
              {tpl.isDefault && (
                <Badge>
                  <Star className="size-3" aria-hidden /> {t('default')}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={selectedId === tpl.id ? 'secondary' : 'outline'}
                onClick={() => onPrint(tpl.id)}
              >
                <Printer className="size-4" /> {t('usePrint')}
              </Button>
              {manage && (
                <>
                  <Link
                    href={`/cards/${tpl.id}`}
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                  >
                    <Pencil className="size-4" /> {t('edit')}
                  </Link>
                  <RowMenu
                    label={t('actionsFor', { name: tpl.name })}
                    items={[
                      {
                        key: 'dup',
                        label: t('duplicate'),
                        icon: Copy,
                        onSelect: () => duplicate.mutate(tpl.id),
                      },
                      ...(tpl.isDefault
                        ? []
                        : [
                            {
                              key: 'def',
                              label: t('makeDefault'),
                              icon: Star,
                              onSelect: () => makeDefault.mutate(tpl.id),
                            },
                          ]),
                      {
                        key: 'del',
                        label: t('delete'),
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => setDeleting(tpl),
                      },
                    ]}
                  />
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('deleteTitle', { name: deleting?.name ?? '' })}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </section>
  );
}
