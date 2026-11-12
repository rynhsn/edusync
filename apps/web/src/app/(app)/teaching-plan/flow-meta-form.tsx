'use client';

import { PHASES, phaseForLevelCode } from '@edusync/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { TOUCH_SELECT } from '@/components/form-field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { useSchoolLevels } from '@/lib/school-settings';

type Phase = (typeof PHASES)[number];

export interface FlowMeta {
  id: string;
  name: string;
  levelCode: string | null;
  phase: Phase | null;
}

/** Fase yang dikirim: pilihan pengguna, atau diturunkan dari tingkat bila dibiarkan otomatis. */
function resolvePhase(phase: string, levelCode: string): Phase | null {
  if (phase !== '') return phase as Phase;
  return levelCode === '' ? null : phaseForLevelCode(levelCode);
}

/** Dialog buat ATP baru (flow null) atau ubah nama, tingkat, dan fase ATP draf. */
export function FlowMetaForm({
  subjectId,
  yearId,
  flow,
  onClose,
  onCreated,
}: {
  subjectId: string;
  yearId: string;
  flow: FlowMeta | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations('teachingPlan');
  const te = useTranslations();
  const { school } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const levels = useSchoolLevels();
  const levelList = levels.data ?? [];

  const [name, setName] = useState(flow?.name ?? '');
  const [levelCode, setLevelCode] = useState(flow?.levelCode ?? '');
  const [phase, setPhase] = useState<string>(flow?.phase ?? '');
  const [error, setError] = useState<string | null>(null);

  const auto = levelCode === '' ? null : phaseForLevelCode(levelCode);
  // Tingkat yang sudah tersimpan tetapi tidak lagi ada di daftar tingkat tetap ditampilkan.
  const levelOptions =
    levelCode !== '' && !levelList.some((l) => l.code === levelCode)
      ? [...levelList, { code: levelCode, label: levelCode }]
      : levelList;

  const save = useMutation({
    mutationFn: async () => {
      const common = {
        name: name.trim(),
        levelCode: levelCode.trim() === '' ? null : levelCode.trim(),
        phase: resolvePhase(phase, levelCode.trim()),
      };
      if (flow) {
        return unwrap(
          await api.PUT('/v1/learning-flows/{id}', {
            params: { ...header, path: { id: flow.id } },
            body: common,
          }),
        );
      }
      return unwrap(
        await api.POST('/v1/learning-flows', {
          params: header,
          body: { ...common, subjectId, academicYearId: yearId },
        }),
      );
    },
    onSuccess: (res) => {
      toast.success(flow ? t('flowSaved') : t('flowCreated'));
      queryClient.invalidateQueries({ queryKey: ['teaching-plan'] });
      if (!flow) onCreated?.(res.id);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={flow ? t('editFlow') : t('newFlow')}
      description={flow ? undefined : t('newFlowHelp')}
      submitLabel={save.isPending ? t('saving') : flow ? t('save') : t('create')}
      error={error}
      onSubmit={async () => {
        setError(null);
        await save.mutateAsync();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="tp-fl-name">{t('flowName')}</Label>
        <Input
          id="tp-fl-name"
          required
          maxLength={200}
          value={name}
          placeholder={t('flowNameHint')}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 content-start gap-2">
          <Label htmlFor="tp-fl-level">{t('level')}</Label>
          {levelList.length > 0 || levels.isPending ? (
            <SelectField
              id="tp-fl-level"
              className={TOUCH_SELECT}
              value={levelCode}
              onChange={(e) => setLevelCode(e.target.value)}
            >
              <option value="">{t('levelNone')}</option>
              {levelOptions.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </SelectField>
          ) : (
            <Input
              id="tp-fl-level"
              maxLength={20}
              value={levelCode}
              onChange={(e) => setLevelCode(e.target.value)}
            />
          )}
        </div>
        <div className="grid min-w-0 content-start gap-2">
          <Label htmlFor="tp-fl-phase">{t('phase')}</Label>
          <SelectField
            id="tp-fl-phase"
            className={TOUCH_SELECT}
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
          >
            <option value="">{auto ? t('phaseAutoFor', { phase: auto }) : t('phaseAuto')}</option>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {t('phaseLabel', { phase: p })}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
    </FormDialog>
  );
}
