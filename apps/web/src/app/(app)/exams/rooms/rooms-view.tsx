'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/access-kit';
import { useSchool } from '@/components/app-shell';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { FieldError, TOUCH_INPUT, useFormValidation } from '@/components/form-field-error';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPanel, TONES } from '@/components/ui-kit';
import { api, schoolHeader, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { semesterLabel } from '@/lib/semester-label';
import { cn } from '@/lib/utils';
import { EXAM_ROOM_ORDER, type ExamRoomField, validateExamRoom } from '../exam-validation';
import { roomFill } from './room-fill';

interface Room {
  id: string;
  name: string;
  capacity: number | null;
  sort: number;
  active: boolean;
}
interface Draft {
  id: string | null;
  name: string;
  capacity: string;
  sort: string;
  active: boolean;
}
const EMPTY: Draft = { id: null, name: '', capacity: '', sort: '', active: true };

interface Seat {
  studentId: string;
  name: string;
  nis: string;
  classId: string;
  className: string;
}
interface Layout {
  rooms: { id: string; name: string; capacity: number | null; students: Seat[] }[];
  unassigned: Seat[];
}

/** Penanda "keluarkan dari ruang" pada pilihan pindah (bukan id ruang mana pun). */
const OUT = '__out__';

/** Ruang ujian (opsional) dan penempatan siswa per semester dan jenis ujian; nama ruang tercetak di kartu ujian. */
export function RoomsView() {
  const t = useTranslations('exams');
  const te = useTranslations();
  const { school, can } = useSchool();
  const queryClient = useQueryClient();
  const header = { header: schoolHeader(school.schoolId) };
  const manage = can('exam:manage');
  const roomsKey = ['exam-rooms', school.schoolId];
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState('');
  const [examTypeId, setExamTypeId] = useState('');
  const [autoOpen, setAutoOpen] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const validation = useFormValidation<ExamRoomField>({
    errors: validateExamRoom(draft),
    order: EXAM_ROOM_ORDER,
    idPrefix: 'er',
  });

  const rooms = useQuery({
    queryKey: roomsKey,
    queryFn: async () => unwrap(await api.GET('/v1/exam/rooms', { params: header })),
  });
  const semesters = useQuery({
    queryKey: ['semesters', school.schoolId, 'all'],
    queryFn: async () => unwrap(await api.GET('/v1/semesters', { params: { ...header, query: {} } })),
  });
  const types = useQuery({
    queryKey: ['exam-types', school.schoolId],
    queryFn: async () => unwrap(await api.GET('/v1/exam/types', { params: header })),
  });

  const semesterList = semesters.data ?? [];
  const typeList = (types.data ?? []).filter((x) => x.active);
  // Pilihan awal: semester aktif dan jenis ujian pertama; pilihan pengguna menggantikannya.
  const semId = semesterId || (semesterList.find((s) => s.isActive) ?? semesterList[0])?.id || '';
  const typeId = examTypeId || typeList[0]?.id || '';
  const layoutKey = ['exam-room-layout', school.schoolId, semId, typeId];
  const scope = { semesterId: semId, examTypeId: typeId };

  const layout = useQuery({
    queryKey: layoutKey,
    enabled: !!semId && !!typeId,
    queryFn: async () =>
      unwrap(await api.GET('/v1/exam/room-assignments', { params: { ...header, query: scope } })),
  });

  const refreshRooms = () => {
    queryClient.invalidateQueries({ queryKey: roomsKey });
    queryClient.invalidateQueries({ queryKey: ['exam-room-layout', school.schoolId] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        name: d.name.trim(),
        capacity: d.capacity.trim() === '' ? null : Number(d.capacity),
        ...(d.sort.trim() === '' ? {} : { sort: Number(d.sort) }),
        active: d.active,
      };
      if (d.id) {
        return unwrap(
          await api.PUT('/v1/exam/rooms/{id}', { params: { ...header, path: { id: d.id } }, body }),
        );
      }
      return unwrap(await api.POST('/v1/exam/rooms', { params: header, body }));
    },
    onSuccess: (_r, d) => {
      toast.success(d.id ? t('roomSaved') : t('roomCreated'));
      refreshRooms();
    },
    onError: (e) => setError(te(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/v1/exam/rooms/{id}', { params: { ...header, path: { id } } })),
    onSuccess: () => {
      toast.success(t('roomDeleted'));
      refreshRooms();
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const move = useMutation({
    mutationFn: async (m: { studentId: string; roomId: string | null }) =>
      unwrap(
        await api.PUT('/v1/exam/room-assignments', {
          params: header,
          body: { ...scope, moves: [m] },
        }),
      ),
    onSuccess: (r) => {
      queryClient.setQueryData(layoutKey, r);
      toast.success(t('placementMoved'));
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });
  const auto = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/v1/exam/room-assignments/auto', {
          params: header,
          body: { ...scope, overwrite },
        }),
      ),
    onSuccess: (r) => {
      const { placed, ...next } = r;
      queryClient.setQueryData(layoutKey, next);
      toast.success(t('autoDone', { n: placed }));
    },
    onError: (e) => setAutoError(te(errorKey(e))),
  });
  const clear = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/v1/exam/room-assignments', { params: { ...header, query: scope } })),
    onSuccess: (r) => {
      toast.success(t('clearDone', { n: r.removed }));
      queryClient.invalidateQueries({ queryKey: layoutKey });
    },
    onError: (e) => toast.error(te(errorKey(e))),
  });

  function openNew() {
    setDraft(EMPTY);
    setError(null);
    setOpen(true);
  }
  const list = rooms.data ?? [];
  const data = layout.data;

  return (
    <PageBody>
      <PageHeader
        title={t('roomsTitle')}
        description={t('roomsSubtitle')}
        actions={
          manage && (
            <Button onClick={openNew}>
              <Plus className="size-4" aria-hidden /> {t('addRoom')}
            </Button>
          )
        }
      />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? t('editRoom') : t('addRoom')}
        submitLabel={t('save')}
        error={error}
        validation={validation}
        onSubmit={() => save.mutateAsync(draft)}
      >
        <div className="grid gap-4">
          <div className="grid content-start gap-2">
            <Label htmlFor={validation.idOf('name')}>{t('roomName')}</Label>
            <Input
              {...validation.fieldProps('name')}
              className={TOUCH_INPUT}
              aria-required="true"
              autoComplete="off"
              maxLength={40}
              placeholder="Ruang 1"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <FieldError id={validation.idOf('name')} issue={validation.issue('name')} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={validation.idOf('capacity')}>{t('roomCapacity')}</Label>
            <Input
              {...validation.fieldProps('capacity')}
              className={TOUCH_INPUT}
              inputMode="numeric"
              autoComplete="off"
              placeholder="30"
              value={draft.capacity}
              onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
            />
            <FieldError id={validation.idOf('capacity')} issue={validation.issue('capacity')} />
            <p className="text-muted-foreground text-xs">{t('roomCapacityHint')}</p>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={validation.idOf('sort')}>{t('roomSort')}</Label>
            <Input
              {...validation.fieldProps('sort')}
              className={TOUCH_INPUT}
              inputMode="numeric"
              autoComplete="off"
              value={draft.sort}
              onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
            />
            <FieldError id={validation.idOf('sort')} issue={validation.issue('sort')} />
            <p className="text-muted-foreground text-xs">{t('roomSortHint')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="er-active"
              checked={draft.active}
              onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
            />
            <Label htmlFor="er-active">{t('roomActive')}</Label>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('deleteRoomTitle', { name: deleting?.name ?? '' })}
        description={t('deleteRoomBody')}
        confirmLabel={t('delete')}
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />

      <FormDialog
        open={autoOpen}
        onOpenChange={setAutoOpen}
        title={t('autoTitle')}
        description={t('autoBody')}
        submitLabel={t('autoPlace')}
        error={autoError}
        onSubmit={() => auto.mutateAsync()}
      >
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('autoNeedCapacity')}</p>
          <div className="flex items-start gap-2">
            <Checkbox
              id="er-overwrite"
              className="mt-0.5"
              checked={overwrite}
              onCheckedChange={(v) => setOverwrite(v === true)}
            />
            <div className="grid gap-1">
              <Label htmlFor="er-overwrite">{t('autoOverwrite')}</Label>
              <p className="text-muted-foreground text-xs">{t('autoOverwriteHint')}</p>
            </div>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title={t('clearTitle')}
        description={t('clearBody')}
        confirmLabel={t('clearAll')}
        destructive
        pending={clear.isPending}
        onConfirm={async () => {
          await clear.mutateAsync();
        }}
      />

      <section className="grid content-start gap-3" aria-labelledby="er-list-title">
        <h2 id="er-list-title" className="text-base font-semibold">
          {t('roomListTitle')}
        </h2>
        {rooms.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('loadError')}</AlertDescription>
          </Alert>
        )}
        {rooms.isPending ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : list.length === 0 ? (
          <EmptyPanel
            icon={DoorOpen}
            tone="violet"
            title={t('roomsEmptyTitle')}
            body={t('roomsEmptyBody')}
            action={
              manage && (
                <Button onClick={openNew}>
                  <Plus className="size-4" aria-hidden /> {t('addRoom')}
                </Button>
              )
            }
          />
        ) : (
          <ul className="grid content-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((x) => (
              <li
                key={x.id}
                className={cn(
                  'bg-card flex items-center gap-3 rounded-xl border p-3',
                  !x.active && 'opacity-60',
                )}
              >
                <span
                  className={cn('grid shrink-0 place-items-center rounded-lg p-2', TONES.violet.soft)}
                  aria-hidden
                >
                  <DoorOpen className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{x.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {x.capacity === null ? t('noLimit') : t('capacityOf', { n: x.capacity })}
                    {!x.active && ` · ${t('inactive')}`}
                  </p>
                </div>
                {manage && (
                  <ActionMenu
                    label={t('typeActionsFor', { name: x.name })}
                    items={[
                      {
                        label: t('edit'),
                        icon: Pencil,
                        onSelect: () => {
                          setError(null);
                          setDraft({
                            id: x.id,
                            name: x.name,
                            capacity: x.capacity === null ? '' : String(x.capacity),
                            sort: String(x.sort),
                            active: x.active,
                          });
                          setOpen(true);
                        },
                      },
                      { label: t('delete'), icon: Trash2, destructive: true, onSelect: () => setDeleting(x) },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid content-start gap-3" aria-labelledby="er-assign-title">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="er-assign-title" className="text-base font-semibold">
              {t('assignTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('assignSubtitle')}</p>
          </div>
          {manage && !!data && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAutoError(null);
                  setOverwrite(false);
                  setAutoOpen(true);
                }}
              >
                <Sparkles className="size-4" aria-hidden /> {t('autoPlace')}
              </Button>
              <Button variant="outline" onClick={() => setClearing(true)}>
                <Trash2 className="size-4" aria-hidden /> {t('clearAll')}
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="er-semester">{t('pickSemester')}</Label>
            <SelectField id="er-semester" value={semId} onChange={(e) => setSemesterId(e.target.value)}>
              {semesterList.map((s) => (
                <option key={s.id} value={s.id}>
                  {semesterLabel(s)}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="er-type">{t('pickExamType')}</Label>
            <SelectField id="er-type" value={typeId} onChange={(e) => setExamTypeId(e.target.value)}>
              {typeList.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        {layout.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('loadError')}</AlertDescription>
          </Alert>
        )}
        {!semId || !typeId ? (
          <p className="text-muted-foreground text-sm">
            {types.isSuccess && typeList.length === 0 ? t('noExamTypes') : t('pickScopeHint')}
          </p>
        ) : layout.isPending ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : data ? (
          <PlacementBoard data={data} manage={manage} busy={move.isPending} onMove={(m) => move.mutate(m)} />
        ) : null}
      </section>
    </PageBody>
  );
}

function PlacementBoard({
  data,
  manage,
  busy,
  onMove,
}: {
  data: Layout;
  manage: boolean;
  busy: boolean;
  onMove: (m: { studentId: string; roomId: string | null }) => void;
}) {
  const t = useTranslations('exams');
  const { rooms, unassigned } = data;
  return (
    <div className="grid content-start gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rooms.map((r) => {
        const fill = roomFill(r.students.length, r.capacity);
        return (
          <section key={r.id} className="bg-card grid content-start gap-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="min-w-0 truncate text-sm font-semibold">{r.name}</h3>
              <span
                className={cn(
                  'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium',
                  fill === 'over'
                    ? 'bg-destructive/10 text-destructive'
                    : fill === 'full'
                      ? TONES.amber.soft
                      : TONES.violet.soft,
                )}
              >
                {r.capacity === null
                  ? t('filledNoLimit', { n: r.students.length })
                  : t('filledOf', { n: r.students.length, capacity: r.capacity })}
              </span>
            </div>
            {r.students.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t('roomNoStudents')}</p>
            ) : (
              <ul className="grid gap-2">
                {r.students.map((s) => (
                  <StudentRow
                    key={s.studentId}
                    seat={s}
                    current={r.id}
                    rooms={rooms}
                    manage={manage}
                    busy={busy}
                    onMove={onMove}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <section className="bg-card grid content-start gap-2 rounded-xl border border-dashed p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('unassignedTitle')}</h3>
          <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', TONES.amber.soft)}>
            {t('studentsCount', { n: unassigned.length })}
          </span>
        </div>
        {unassigned.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('unassignedEmpty')}</p>
        ) : (
          <ul className="grid gap-2">
            {unassigned.map((s) => (
              <StudentRow
                key={s.studentId}
                seat={s}
                current={null}
                rooms={rooms}
                manage={manage}
                busy={busy}
                onMove={onMove}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StudentRow({
  seat,
  current,
  rooms,
  manage,
  busy,
  onMove,
}: {
  seat: Seat;
  current: string | null;
  rooms: Layout['rooms'];
  manage: boolean;
  busy: boolean;
  onMove: (m: { studentId: string; roomId: string | null }) => void;
}) {
  const t = useTranslations('exams');
  return (
    <li className="flex flex-col gap-1.5 border-t pt-2 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{seat.name}</p>
        <p className="text-muted-foreground truncate text-xs">{seat.className}</p>
      </div>
      {manage && (
        <SelectField
          aria-label={t('moveStudent', { name: seat.name })}
          placeholder={t('moveTo')}
          value={current ?? ''}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || v === current) return;
            onMove({ studentId: seat.studentId, roomId: v === OUT ? null : v });
          }}
        >
          {rooms
            .filter((r) => r.id !== current)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {t('moveToRoom', { name: r.name })}
              </option>
            ))}
          {current && <option value={OUT}>{t('moveOut')}</option>}
          {current && <option value={current}>{rooms.find((r) => r.id === current)?.name}</option>}
        </SelectField>
      )}
    </li>
  );
}
