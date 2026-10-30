'use client';

import { LETTER_PLACEHOLDERS, type LetterPlaceholder, renderLetter } from '@edusync/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Search, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSchool } from '@/components/app-shell';
import { PageBody, PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { errorKey } from '@/lib/errors';
import { formatIdDate, insertAtCursor, placeholderToken } from './format';
import { LetterPaper, PaperSheet } from './letter-paper';
import { PlaceholderChips, TextArea } from './placeholder-chips';
import {
  useHeader,
  useLetterhead,
  useMySigner,
  useSigners,
  useTemplates,
  useZoom,
  ZoomControl,
} from './shared';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface ComposerInitial {
  id: string;
  number: string;
  subject: string;
  party: string;
  letterDate: string;
  body: string | null;
  templateId: string | null;
  studentId: string | null;
  studentName: string | null;
}

/**
 * Penyusun surat keluar: formulir di kiri, pratinjau kertas A4 hidup di kanan. Isi disimpan dengan pengganti
 * {{...}} apa adanya; nomor, tanda tangan, dan data siswa diisi saat dirender.
 */
export function Composer({ initial }: { initial?: ComposerInitial }) {
  const t = useTranslations('letters');
  const te = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { school, can } = useSchool();
  const { header } = useHeader();
  const letterhead = useLetterhead();
  const templates = useTemplates();
  const signers = useSigners();
  const me = useMySigner();

  const [templateId, setTemplateId] = useState(initial?.templateId ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [party, setParty] = useState(initial?.party ?? '');
  const [letterDate, setLetterDate] = useState(initial?.letterDate ?? today());
  const [body, setBody] = useState(initial?.body ?? '');
  const [student, setStudent] = useState<{
    id: string;
    name: string;
    nis: string | null;
    className: string | null;
  } | null>(
    initial?.studentId
      ? { id: initial.studentId, name: initial.studentName ?? '', nis: null, className: null }
      : null,
  );
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useZoom(90);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const studentSearch = useQuery({
    queryKey: ['letters', school.schoolId, 'student-search', debounced],
    enabled: can('student:read') && debounced.length >= 2 && !student,
    queryFn: async () =>
      unwrap(await api.GET('/v1/students', { params: { header, query: { q: debounced, limit: 6 } } })),
  });

  // Siswa terpilih dari draf lama hanya membawa nama; lengkapi NIS dan kelas agar pratinjau akurat.
  const studentDetail = useQuery({
    queryKey: ['letters', school.schoolId, 'student-detail', initial?.studentName],
    enabled: can('student:read') && !!initial?.studentId && !!initial.studentName,
    queryFn: async () =>
      unwrap(
        await api.GET('/v1/students', {
          params: { header, query: { q: initial?.studentName ?? '', limit: 20 } },
        }),
      ),
  });
  useEffect(() => {
    const found = studentDetail.data?.items.find((s) => s.id === initial?.studentId);
    if (found) setStudent({ id: found.id, name: found.name, nis: found.nis, className: found.className });
  }, [studentDetail.data, initial?.studentId]);

  const templateList = (templates.data ?? []).filter((x) => x.active || x.id === templateId);
  const selectedTemplate = templateList.find((x) => x.id === templateId);

  function pickTemplate(id: string) {
    setTemplateId(id);
    const tpl = (templates.data ?? []).find((x) => x.id === id);
    if (tpl) {
      setBody(tpl.body);
      if (!subject) setSubject(tpl.name);
    }
  }

  function insertPlaceholder(name: string) {
    const el = bodyRef.current;
    const { value, cursor } = insertAtCursor(
      body,
      el?.selectionStart ?? body.length,
      el?.selectionEnd ?? body.length,
      placeholderToken(name),
    );
    setBody(value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  }

  // Penandatangan untuk pratinjau: penandatangan sendiri bila ada, jika tidak yang pertama aktif.
  const previewSigner = me.data?.signer ?? (signers.data ?? []).find((s) => s.active) ?? null;

  const marker = (k: string) => `«${k}»`;
  const vars: Partial<Record<LetterPlaceholder, string>> = {
    nama: student?.name || marker('nama'),
    nis: student?.nis || marker('nis'),
    kelas: student?.className || marker('kelas'),
    tanggal: formatIdDate(letterDate),
    sekolah: school.schoolName,
    nomor: initial?.number ?? marker('nomor otomatis'),
    penandatangan: previewSigner?.name ?? marker('penandatangan'),
    jabatan: previewSigner?.title ?? marker('jabatan'),
  };
  const previewText = renderLetter(body, vars);

  const save = useMutation({
    mutationFn: async () => {
      // Templat hanya dirujuk bila isinya tidak diubah; render memakai isi templat bila templateId ada.
      const keepTemplate = selectedTemplate && body.trim() === selectedTemplate.body.trim();
      const common = {
        subject: subject.trim(),
        party: party.trim(),
        letterDate,
        body: body.trim() || null,
        templateId: keepTemplate ? templateId : null,
        studentId: student?.id ?? null,
      };
      if (initial) {
        return unwrap(
          await api.PUT('/v1/letters/{id}', { params: { header, path: { id: initial.id } }, body: common }),
        );
      }
      return unwrap(
        await api.POST('/v1/letters', { params: { header }, body: { direction: 'outgoing', ...common } }),
      );
    },
    onSuccess: (saved) => {
      toast.success(t('draftSaved'));
      queryClient.invalidateQueries({ queryKey: ['letters', school.schoolId] });
      router.push(`/letters/${saved.id}`);
    },
    onError: (e) => setError(te(errorKey(e))),
  });

  const canSave = subject.trim() !== '' && party.trim() !== '' && body.trim() !== '';

  return (
    <PageBody className="lt-scope">
      <PageHeader
        title={initial ? t('editTitle') : t('composeTitle')}
        description={t('composeDescription')}
        actions={
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={initial ? `/letters/${initial.id}` : '/letters'} />}
          >
            <ArrowLeft className="size-4" /> {t('back')}
          </Button>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card className="gap-4 px-4">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              save.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="tpl">{t('template')}</Label>
              {templates.isPending ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <SelectField
                  id="tpl"
                  value={templateId}
                  onChange={(e) => pickTemplate(e.target.value)}
                  placeholder={t('templateNone')}
                >
                  <option value="">{t('templateNone')}</option>
                  {templateList.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </SelectField>
              )}
              {templates.data?.length === 0 && (
                <p className="text-muted-foreground text-xs">{t('templateEmptyHint')}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="student">{t('student')}</Label>
              {student ? (
                <div className="bg-secondary/50 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                  <UserRound className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {student.name}
                    {student.className && (
                      <span className="text-muted-foreground"> · {student.className}</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t('studentClear')}
                    onClick={() => setStudent(null)}
                  >
                    <X />
                  </Button>
                </div>
              ) : can('student:read') ? (
                <div className="relative">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    id="student"
                    className="pl-8"
                    placeholder={t('studentSearch')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    autoComplete="off"
                  />
                  {debounced.length >= 2 && studentSearch.data && (
                    <ul className="bg-popover absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border p-1 shadow-md">
                      {studentSearch.data.items.length === 0 && (
                        <li className="text-muted-foreground px-2 py-1.5 text-sm">{t('studentNone')}</li>
                      )}
                      {studentSearch.data.items.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm"
                            onClick={() => {
                              setStudent({ id: s.id, name: s.name, nis: s.nis, className: s.className });
                              setQ('');
                            }}
                          >
                            {s.name}
                            <span className="text-muted-foreground"> · {s.className ?? t('noClass')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">{t('studentNoAccess')}</p>
              )}
              <p className="text-muted-foreground text-xs">{t('studentHint')}</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="subject">{t('subject')}</Label>
              <Input
                id="subject"
                required
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="party">{t('recipient')}</Label>
              <Input
                id="party"
                required
                maxLength={200}
                value={party}
                onChange={(e) => setParty(e.target.value)}
                placeholder={t('recipientHint')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="date">{t('letterDate')}</Label>
              <DatePicker id="date" value={letterDate} onChange={setLetterDate} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="body">{t('body')}</Label>
              <PlaceholderChips names={LETTER_PLACEHOLDERS} onPick={insertPlaceholder} />
              <TextArea
                id="body"
                ref={bodyRef}
                required
                rows={14}
                maxLength={20000}
                className="font-serif text-[0.95rem] leading-relaxed"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                nativeButton={false}
                render={<Link href={initial ? `/letters/${initial.id}` : '/letters'} />}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={!canSave || save.isPending}>
                <Save className="size-4" /> {t('saveDraft')}
              </Button>
            </div>
          </form>
        </Card>

        <div className="grid gap-2 xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-medium">{t('preview')}</h2>
            <ZoomControl zoom={zoom} onChange={setZoom} />
          </div>
          <PaperSheet zoom={zoom}>
            <LetterPaper
              schoolName={letterhead.schoolName}
              address={letterhead.address}
              number={initial?.number ?? null}
              text={previewText}
              dateText={formatIdDate(letterDate)}
              status="draft"
              signer={
                previewSigner
                  ? { name: previewSigner.name, title: previewSigner.title, nip: previewSigner.nip }
                  : null
              }
            />
          </PaperSheet>
          <p className="text-muted-foreground text-xs">{t('previewNote')}</p>
        </div>
      </div>
    </PageBody>
  );
}
