import { describe, expect, it } from 'vitest';
import {
  buildMeetingBody,
  EMPTY_MEETING,
  formFromDetail,
  linkableStudents,
  linkChanged,
  linkedTo,
  type MeetingDetail,
  type MeetingForm,
  type MinutesLabels,
  minutesFileName,
  minutesPrintHtml,
  newAttendee,
  newMeetingForm,
  suggestRetained,
  validateMeeting,
} from './council-meeting';

const form = (over: Partial<MeetingForm> = {}): MeetingForm => ({
  ...EMPTY_MEETING,
  title: 'Rapat kenaikan',
  heldOn: '2027-06-20',
  ...over,
});

describe('validateMeeting', () => {
  it('judul dan tanggal wajib, tanggal harus nyata', () => {
    expect(validateMeeting(form())).toEqual({});
    expect(validateMeeting(form({ title: '  ' })).title).toEqual({ code: 'required' });
    expect(validateMeeting(form({ heldOn: '' })).heldOn).toEqual({ code: 'required' });
    expect(validateMeeting(form({ heldOn: '2027-02-31' })).heldOn).toEqual({ code: 'dateInvalid' });
  });

  it('batas panjang mengikuti server', () => {
    expect(validateMeeting(form({ title: 'x'.repeat(161) })).title).toMatchObject({
      code: 'tooLong',
      max: 160,
    });
    expect(validateMeeting(form({ agenda: 'x'.repeat(4001) })).agenda).toMatchObject({ code: 'tooLong' });
    expect(validateMeeting(form({ summary: 'x'.repeat(8001) })).summary).toMatchObject({ code: 'tooLong' });
    expect(validateMeeting(form({ location: 'x'.repeat(201) })).location).toMatchObject({ code: 'tooLong' });
  });

  it('peserta tanpa nama dan tanpa guru ditolak; peserta dari guru tanpa nama sah', () => {
    expect(validateMeeting(form({ attendees: [newAttendee()] })).attendees).toMatchObject({ code: 'custom' });
    expect(
      validateMeeting(form({ attendees: [{ ...newAttendee(), teacherId: 'guru-1' }] })).attendees,
    ).toBeUndefined();
    expect(
      validateMeeting(
        form({ attendees: [{ ...newAttendee(), name: 'Budi', positionTitle: 'x'.repeat(121) }] }),
      ).attendees,
    ).toMatchObject({ code: 'tooLong' });
  });
});

describe('buildMeetingBody', () => {
  it('kosong menjadi null, teks dipangkas, nama peserta dari guru dihilangkan', () => {
    const body = buildMeetingBody(
      form({
        title: '  Judul  ',
        location: '  ',
        classId: '',
        attendees: [
          { ...newAttendee('chair'), teacherId: 'g1', positionTitle: ' Kepala ' },
          { ...newAttendee(), name: ' Tamu ' },
        ],
      }),
    );
    expect(body).toMatchObject({
      title: 'Judul',
      location: null,
      classId: null,
      semesterId: null,
      agenda: null,
    });
    expect(body.attendees).toEqual([
      { teacherId: 'g1', positionTitle: 'Kepala', role: 'chair' },
      { teacherId: null, name: 'Tamu', positionTitle: null, role: 'member' },
    ]);
  });

  it('formulir baru memakai tanggal dan judul yang diberikan, dan formFromDetail membalik bentuk detail', () => {
    expect(newMeetingForm('2027-06-20', 'graduation', 'Judul')).toMatchObject({
      kind: 'graduation',
      heldOn: '2027-06-20',
      title: 'Judul',
      attendees: [],
    });
    const detail = {
      kind: 'promotion',
      title: 'T',
      heldOn: '2027-06-20',
      semesterId: null,
      classId: 'c1',
      location: null,
      chairName: 'K',
      secretaryName: null,
      agenda: null,
      summary: 'S',
      attendees: [{ teacherId: null, name: 'A', positionTitle: null, role: 'member' }],
    } as unknown as MeetingDetail;
    const f = formFromDetail(detail);
    expect(f).toMatchObject({ classId: 'c1', location: '', chairName: 'K', summary: 'S' });
    expect(f.attendees[0]).toMatchObject({ name: 'A', teacherId: '', positionTitle: '' });
  });
});

describe('murid yang dapat ditautkan', () => {
  const data = {
    classes: [
      {
        name: '9A',
        students: [
          { studentId: 'a', name: 'Ani', decision: 'retain' as const, meetingId: 'm1' },
          { studentId: 'b', name: 'Budi', decision: 'retain' as const, meetingId: 'm2' },
          { studentId: 'c', name: 'Cici', decision: 'graduate' as const },
          { studentId: 'd', name: 'Dedi', decision: null },
          { studentId: 'e', name: 'Eka', decision: 'retain' as const, meetingId: null },
        ],
      },
    ],
  };
  const list = linkableStudents(data);

  it('hanya yang sudah punya keputusan; meetingId kosong menjadi null', () => {
    expect(list.map((s) => s.studentId)).toEqual(['a', 'b', 'c', 'e']);
    expect(list.find((s) => s.studentId === 'c')?.meetingId).toBeNull();
  });

  it('himpunan tertaut, saran (tinggal kelas yang bebas atau milik berita acara ini), dan deteksi perubahan', () => {
    expect([...linkedTo(list, 'm1')]).toEqual(['a']);
    expect([...suggestRetained(list, 'm1')].sort()).toEqual(['a', 'e']);
    expect(linkChanged(list, 'm1', new Set(['a']))).toBe(false);
    expect(linkChanged(list, 'm1', new Set(['a', 'e']))).toBe(true);
    expect(linkChanged(list, 'm1', new Set(['e']))).toBe(true);
    expect(linkChanged(list, 'm1', new Set())).toBe(true);
  });
});

describe('minutesPrintHtml', () => {
  const labels = new Proxy(
    { roles: { chair: 'Ketua', secretary: 'Sekretaris', member: 'Anggota' } } as object,
    {
      get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : `L:${String(k)}`),
    },
  ) as unknown as MinutesLabels;
  const detail = {
    id: 'm',
    title: 'Rapat <b>kenaikan</b>',
    kind: 'promotion',
    heldOn: '2027-06-20',
    className: null,
    location: 'Aula & ruang',
    agenda: 'Baris 1\nBaris 2',
    summary: null,
    chairName: 'Kepala',
    secretaryName: null,
    status: 'draft',
    attendees: [{ teacherId: null, name: 'Budi "B"', positionTitle: null, role: 'member' }],
    digest: {
      totals: { total: 3, promote: 1, retain: 1, graduate: 1 },
      classes: [{ classId: 'c', name: '9A', level: '9', promote: 1, retain: 1, graduate: 1 }],
      retained: [
        {
          studentId: 's',
          name: 'Siti <x>',
          classId: 'c',
          className: '9A',
          reason: 'Nilai',
          followUp: null,
          meetingDate: null,
          applied: false,
        },
      ],
    },
  } as unknown as MeetingDetail;
  const meta = {
    schoolName: 'SMP & Co',
    yearName: '2026/2027',
    kindName: 'Kenaikan',
    heldOnText: '20 Juni 2027',
    printedOn: '1 Jan',
  };

  it('meng-escape semua teks, memuat rekap, daftar tinggal kelas, dan catatan draf', () => {
    const html = minutesPrintHtml(detail, labels, meta);
    expect(html).not.toContain('<b>kenaikan</b>');
    expect(html).toContain('Rapat &lt;b&gt;kenaikan&lt;/b&gt;');
    expect(html).toContain('Aula &amp; ruang');
    expect(html).toContain('Baris 1<br>Baris 2');
    expect(html).toContain('Siti &lt;x&gt;');
    expect(html).toContain('Budi &quot;B&quot;');
    expect(html).toContain('L:draftNote');
    expect(html).toContain('L:allClasses');
    expect(html).toContain(
      '<td class="num">1</td><td class="num">1</td><td class="num">1</td><td class="num">3</td>',
    );
  });

  it('berita acara final tanpa catatan draf; tanpa tinggal kelas memakai teks kosong', () => {
    const html = minutesPrintHtml(
      { ...detail, status: 'final', digest: { ...detail.digest, retained: [] } } as MeetingDetail,
      labels,
      meta,
    );
    expect(html).not.toContain('L:draftNote');
    expect(html).toContain('L:noRetained');
  });

  it('nama berkas aman', () => {
    expect(minutesFileName('Rapat Kenaikan Ke 1!', '2027-06-20')).toBe(
      'berita-acara-rapat-kenaikan-ke-1-2027-06-20',
    );
    expect(minutesFileName('???', '2027-06-20')).toBe('berita-acara-rapat-2027-06-20');
  });
});
