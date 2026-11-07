import {
  and,
  auditLog,
  type Db,
  desc,
  eq,
  foundation,
  foundationOwner,
  inArray,
  member,
  memberRole,
  platformStaff,
  rolePermission,
  school,
  sql,
  subscription,
  supportMessage,
  supportTicket,
  type Tx,
  user,
} from '@edusync/db';
import { enqueue, QUEUES } from '@edusync/jobs';
import type { Env } from './env';
import { HttpError } from './http-error';
import { schoolOrigin } from './origins';

export type Side = 'school' | 'platform';
export type Origin = 'school' | 'owner';
export const CATEGORIES = ['account', 'billing', 'bug', 'feature', 'data', 'other'] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const STATUSES = ['open', 'in_progress', 'waiting_reporter', 'resolved', 'closed'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

/** Izin sekolah yang dipakai laporan: admin sekolah (`school:manage`) membuat dan membaca laporan. */
export const SUPPORT_PERMISSION = 'school:manage';
/** Satu email per laporan, penerima, dan jenis dalam jendela ini. */
export const EMAIL_WINDOW_MINUTES = 2;
export const MAX_RECIPIENTS = 5;
export const EXCERPT_LENGTH = 300;
/** Batas pembuatan laporan baru per pelapor per jam (pencegah banjir). */
export const TICKETS_PER_HOUR = 10;

export interface Person {
  email: string;
  name: string;
}

/* ---------- Fungsi murni ---------- */

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** Cuplikan teks polos: spasi dan baris baru dirapatkan, dipotong di `max` karakter. Belum di-escape. */
export function excerpt(body: string, max = EXCERPT_LENGTH) {
  // Karakter kontrol (selain spasi) dibuang agar tidak menyusup ke header/isi email.
  const flat = Array.from(body)
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return c < 32 || c === 127 ? ' ' : ch;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(flat);
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : flat;
}

/**
 * Pilih penerima email: pihak utama dulu (mis. pembuat laporan), lalu yang lain; alamat kembar
 * (tanpa membedakan huruf besar/kecil) dibuang; hasil dibatasi `max`.
 */
export function selectRecipients(primary: Person[], others: Person[], max = MAX_RECIPIENTS) {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of [...primary, ...others]) {
    const key = p.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ email: key, name: p.name });
    if (out.length >= max) break;
  }
  return out;
}

export type MailKind = 'new' | 'reply' | 'status';

export interface MailInput {
  kind: MailKind;
  recipientName: string;
  ticketNo: string;
  subject: string;
  /** Pelaku: nama yang membalas/mengubah. */
  who: string;
  /** Hanya untuk `status`. */
  status?: 'resolved' | 'closed';
  body?: string;
  link: string;
}

/** Isi email laporan (teks dan HTML). Tidak memuat rahasia; cuplikan di-escape pada HTML. */
export function supportEmail(input: MailInput) {
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
  const subj = clean(input.subject);
  const who = clean(input.who);
  const intro =
    input.kind === 'new'
      ? `${who} membuat laporan baru.`
      : input.kind === 'reply'
        ? `${who} membalas laporan.`
        : input.status === 'resolved'
          ? 'Laporan Anda ditandai selesai oleh tim Edusync.'
          : 'Laporan Anda ditutup.';
  const subjectLine = `[${input.ticketNo}] ${
    input.kind === 'new'
      ? 'Laporan baru'
      : input.kind === 'reply'
        ? 'Balasan'
        : input.status === 'resolved'
          ? 'Selesai'
          : 'Ditutup'
  }: ${subj}`.slice(0, 200);
  const snippet = input.body ? excerpt(input.body) : '';
  const footer = 'Balas lewat tautan di atas. Membalas email ini tidak diproses.';

  const text =
    `Halo ${clean(input.recipientName)},\n\n${intro}\n\n` +
    `Nomor: ${input.ticketNo}\nJudul: ${subj}\n` +
    (snippet ? `\nCuplikan:\n"${snippet}"\n` : '') +
    `\nBuka laporan:\n${input.link}\n\n${footer}`;
  const html =
    `<p>Halo ${escapeHtml(clean(input.recipientName))},</p><p>${escapeHtml(intro)}</p>` +
    `<p><strong>${escapeHtml(input.ticketNo)}</strong><br>${escapeHtml(subj)}</p>` +
    (snippet
      ? `<blockquote style="margin:0;padding-left:12px;border-left:3px solid #ccc;color:#444">${escapeHtml(snippet)}</blockquote>`
      : '') +
    `<p><a href="${escapeHtml(input.link)}">Buka laporan</a></p>` +
    `<p style="color:#555">${escapeHtml(footer)}</p>`;
  return { subject: subjectLine, text, html };
}

/* ---------- Tautan dalam email ---------- */

export function makeLinks(env: Env) {
  const scheme = new URL(env.AUTH_URL).protocol as 'http:' | 'https:';
  const web = env.WEB_URL.replace(/\/$/, '');
  return {
    school: (slug: string, id: string) => `${schoolOrigin(scheme, env.APP_DOMAIN, slug)}/support/${id}`,
    owner: (id: string) => `${web}/account/support/${id}`,
    platform: (id: string) => `${web}/platform/support/${id}`,
  };
}
export type Links = ReturnType<typeof makeLinks>;

/* ---------- Penerima dari database ---------- */

export async function platformAdmins(tx: Tx): Promise<(Person & { userId: string })[]> {
  return tx
    .select({ userId: platformStaff.userId, name: user.name, email: user.email })
    .from(platformStaff)
    .innerJoin(user, eq(user.id, platformStaff.userId))
    .where(eq(platformStaff.role, 'admin'));
}

async function staffPerson(tx: Tx, userId: string): Promise<Person | null> {
  const [row] = await tx
    .select({ name: user.name, email: user.email })
    .from(platformStaff)
    .innerJoin(user, eq(user.id, platformStaff.userId))
    .where(eq(platformStaff.userId, userId));
  return row ?? null;
}

type Ticket = typeof supportTicket.$inferSelect;

/** Anggota aktif sekolah yang punya izin laporan. */
async function schoolSupportMembers(tx: Tx, schoolId: string): Promise<Person[]> {
  return tx
    .selectDistinct({ name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(memberRole, eq(memberRole.memberId, member.id))
    .innerJoin(rolePermission, eq(rolePermission.roleId, memberRole.roleId))
    .where(
      and(
        eq(member.schoolId, schoolId),
        eq(member.status, 'active'),
        eq(rolePermission.permission, SUPPORT_PERMISSION),
      ),
    );
}

async function foundationOwners(tx: Tx, foundationId: string): Promise<Person[]> {
  return tx
    .select({ name: user.name, email: user.email })
    .from(foundationOwner)
    .innerJoin(user, eq(user.id, foundationOwner.userId))
    .where(eq(foundationOwner.foundationId, foundationId));
}

/** Penerima di sisi pelapor: pembuat laporan lebih dulu, lalu anggota lain yang berhak (maks. 5, tanpa kembar). */
export async function reporterRecipients(tx: Tx, t: Ticket, opts: { onlyCreator?: boolean } = {}) {
  const creator: Person = { email: t.creatorEmail, name: t.creatorName };
  if (opts.onlyCreator) return selectRecipients([creator], []);
  const others =
    t.origin === 'school' && t.schoolId
      ? await schoolSupportMembers(tx, t.schoolId)
      : t.foundationId
        ? await foundationOwners(tx, t.foundationId)
        : [];
  return selectRecipients([creator], others);
}

/** Penerima di sisi platform: staf yang ditugaskan, atau semua admin bila belum ada. */
export async function platformRecipients(tx: Tx, t: Ticket) {
  if (t.assignedStaffId) {
    const p = await staffPerson(tx, t.assignedStaffId);
    if (p) return selectRecipients([p], []);
  }
  return selectRecipients(await platformAdmins(tx), []);
}

/* ---------- Pembatas dan antrean email ---------- */

/** True bila email ini boleh dikirim sekarang (dan jendela 2 menit dicatat); atomik di basis data. */
export async function claimEmailSlot(
  tx: Tx,
  ticketId: string,
  recipient: string,
  kind: 'message' | 'status',
) {
  const res = await tx.execute(sql`
    insert into support_email_throttle (ticket_id, recipient, kind, sent_at)
    values (${ticketId}, ${recipient.toLowerCase()}, ${kind}, now())
    on conflict (ticket_id, recipient, kind) do update set sent_at = now()
    where support_email_throttle.sent_at < now() - make_interval(mins => ${EMAIL_WINDOW_MINUTES})
    returning 1`);
  return res.rows.length > 0;
}

async function sendMails(
  tx: Tx,
  t: Ticket,
  recipients: Person[],
  build: (r: Person) => ReturnType<typeof supportEmail>,
  kind: 'message' | 'status',
) {
  let sent = 0;
  for (const r of recipients) {
    if (!(await claimEmailSlot(tx, t.id, r.email, kind))) continue;
    await enqueue(tx, QUEUES.emailSend, { to: r.email, ...build(r) });
    sent++;
  }
  return sent;
}

async function schoolSlug(tx: Tx, t: Ticket) {
  if (!t.schoolId) return null;
  const [s] = await tx.select({ slug: school.slug }).from(school).where(eq(school.id, t.schoolId));
  return s?.slug ?? null;
}

async function reporterLink(tx: Tx, links: Links, t: Ticket) {
  if (t.origin === 'owner') return links.owner(t.id);
  return links.school((await schoolSlug(tx, t)) ?? '', t.id);
}

/** Email ke staf platform (laporan baru atau balasan pelapor). Catatan internal tidak pernah lewat sini. */
export async function notifyPlatform(
  tx: Tx,
  links: Links,
  t: Ticket,
  kind: 'new' | 'reply',
  who: string,
  body: string,
) {
  const recipients = await platformRecipients(tx, t);
  return sendMails(
    tx,
    t,
    recipients,
    (r) =>
      supportEmail({
        kind,
        recipientName: r.name,
        ticketNo: t.ticketNo,
        subject: t.subject,
        who,
        body,
        link: links.platform(t.id),
      }),
    'message',
  );
}

/** Email ke pelapor dan anggota sekolah yang berhak: balasan publik staf, atau status selesai/ditutup. */
export async function notifyReporter(
  tx: Tx,
  links: Links,
  t: Ticket,
  input: { kind: 'reply'; who: string; body: string } | { kind: 'status'; status: 'resolved' | 'closed' },
) {
  const link = await reporterLink(tx, links, t);
  if (input.kind === 'reply') {
    const recipients = await reporterRecipients(tx, t);
    return sendMails(
      tx,
      t,
      recipients,
      (r) =>
        supportEmail({
          kind: 'reply',
          recipientName: r.name,
          ticketNo: t.ticketNo,
          subject: t.subject,
          who: input.who,
          body: input.body,
          link,
        }),
      'message',
    );
  }
  const recipients = await reporterRecipients(tx, t, { onlyCreator: true });
  return sendMails(
    tx,
    t,
    recipients,
    (r) =>
      supportEmail({
        kind: 'status',
        recipientName: r.name,
        ticketNo: t.ticketNo,
        subject: t.subject,
        who: 'Tim Edusync',
        status: input.status,
        link,
      }),
    'status',
  );
}

/* ---------- Cakupan pelapor (sekolah atau pemilik) ---------- */

export type Scope = { origin: 'school'; schoolId: string } | { origin: 'owner'; foundationIds: string[] };

export function scopeWhere(scope: Scope) {
  if (scope.origin === 'school') {
    return and(eq(supportTicket.origin, 'school'), eq(supportTicket.schoolId, scope.schoolId));
  }
  // Daftar kosong: tidak ada yang cocok.
  return and(
    eq(supportTicket.origin, 'owner'),
    scope.foundationIds.length > 0 ? inArray(supportTicket.foundationId, scope.foundationIds) : sql`false`,
  );
}

const notFound = () => new HttpError(404, 'not_found', 'Laporan tidak ditemukan.');

export interface Actor {
  id: string;
  name: string;
  email: string;
}

export interface CreateInput {
  scope: Scope;
  /** Untuk laporan pemilik: yayasan tujuan. Untuk sekolah diturunkan dari sekolah. */
  foundationId?: string | null;
  schoolId?: string | null;
  actor: Actor;
  subject: string;
  category: Category;
  priority: Priority;
  body: string;
  page?: string | null;
  userAgent?: string | null;
  roles?: string[];
}

/** Konteks otomatis: tanpa data sensitif (tidak ada token, kata sandi, atau isi formulir). */
async function captureContext(tx: Tx, input: CreateInput) {
  let schoolRow: { name: string; slug: string; tier: string; foundationId: string } | undefined;
  if (input.schoolId) {
    [schoolRow] = await tx
      .select({
        name: school.name,
        slug: school.slug,
        tier: school.studentTier,
        foundationId: school.foundationId,
      })
      .from(school)
      .where(eq(school.id, input.schoolId));
  }
  const fid = input.foundationId ?? schoolRow?.foundationId ?? null;
  const [found] = fid
    ? await tx
        .select({ name: foundation.name, slug: foundation.slug })
        .from(foundation)
        .where(eq(foundation.id, fid))
    : [];
  const [sub] = fid
    ? await tx
        .select({ status: subscription.status, period: subscription.period })
        .from(subscription)
        .where(eq(subscription.foundationId, fid))
    : [];
  return {
    schoolName: schoolRow?.name ?? null,
    schoolSlug: schoolRow?.slug ?? null,
    tier: schoolRow?.tier ?? null,
    foundationName: found?.name ?? null,
    foundationSlug: found?.slug ?? null,
    subscriptionStatus: sub?.status ?? null,
    subscriptionPeriod: sub?.period ?? null,
    roles: input.roles ?? [],
    page: input.page ? input.page.slice(0, 300) : null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
  };
}

export async function createTicket(tx: Tx, links: Links, input: CreateInput) {
  const [recent] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(supportTicket)
    .where(
      and(
        eq(supportTicket.createdBy, input.actor.id),
        sql`${supportTicket.createdAt} > now() - interval '1 hour'`,
      ),
    );
  if ((recent?.n ?? 0) >= TICKETS_PER_HOUR) {
    throw new HttpError(429, 'rate_limited', 'Terlalu banyak laporan dalam satu jam. Coba lagi nanti.');
  }
  const context = await captureContext(tx, input);
  const [ticket] = await tx
    .insert(supportTicket)
    .values({
      origin: input.scope.origin,
      schoolId: input.schoolId ?? null,
      foundationId: input.scope.origin === 'owner' ? (input.foundationId ?? null) : null,
      createdBy: input.actor.id,
      creatorName: input.actor.name,
      creatorEmail: input.actor.email,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      context,
      lastMessageBySide: 'school',
      schoolUnread: false,
      platformUnread: true,
    })
    .returning();
  await tx.insert(supportMessage).values({
    ticketId: ticket!.id,
    authorUserId: input.actor.id,
    authorName: input.actor.name,
    authorSide: 'school',
    body: input.body,
  });
  await notifyPlatform(tx, links, ticket!, 'new', input.actor.name, input.body);
  return ticket!;
}

async function lockScoped(tx: Tx, scope: Scope, id: string) {
  const [t] = await tx
    .select()
    .from(supportTicket)
    .where(and(eq(supportTicket.id, id), scopeWhere(scope)))
    .for('update');
  if (!t) throw notFound();
  return t;
}

/** Balasan pelapor. Laporan ditutup tidak bisa dibalas; laporan selesai dibuka kembali oleh balasan. */
export async function replyAsReporter(
  tx: Tx,
  links: Links,
  scope: Scope,
  id: string,
  actor: Actor,
  body: string,
) {
  const t = await lockScoped(tx, scope, id);
  if (t.status === 'closed') {
    throw new HttpError(409, 'ticket_closed', 'Laporan ini sudah ditutup. Buat laporan baru.');
  }
  const [msg] = await tx
    .insert(supportMessage)
    .values({ ticketId: t.id, authorUserId: actor.id, authorName: actor.name, authorSide: 'school', body })
    .returning();
  const reopened = t.status === 'resolved';
  const nextStatus: Status = reopened ? 'open' : t.status === 'waiting_reporter' ? 'in_progress' : t.status;
  const [updated] = await tx
    .update(supportTicket)
    .set({
      status: nextStatus,
      resolvedAt: reopened ? null : t.resolvedAt,
      lastMessageAt: new Date(),
      lastMessageBySide: 'school',
      platformUnread: true,
      schoolUnread: false,
    })
    .where(eq(supportTicket.id, t.id))
    .returning();
  await notifyPlatform(tx, links, updated!, 'reply', actor.name, body);
  return { message: msg!, ticket: updated!, reopened };
}

/** Pelapor menutup atau mengonfirmasi laporan selesai. Hanya tanda di sisi platform, tanpa email. */
export async function closeAsReporter(tx: Tx, scope: Scope, id: string) {
  const t = await lockScoped(tx, scope, id);
  if (t.status === 'closed') return t;
  const [updated] = await tx
    .update(supportTicket)
    .set({ status: 'closed', closedAt: new Date(), platformUnread: true, schoolUnread: false })
    .where(eq(supportTicket.id, t.id))
    .returning();
  return updated!;
}

export async function unreadCountFor(tx: Tx, scope: Scope) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(supportTicket)
    .where(and(scopeWhere(scope), eq(supportTicket.schoolUnread, true)));
  return row?.n ?? 0;
}

export async function platformUnreadCount(tx: Db | Tx) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(supportTicket)
    .where(eq(supportTicket.platformUnread, true));
  return row?.n ?? 0;
}

export async function listScoped(
  tx: Tx,
  scope: Scope,
  opts: { status?: Status | undefined; limit: number; offset: number },
) {
  const where = and(scopeWhere(scope), opts.status ? eq(supportTicket.status, opts.status) : undefined);
  const rows = await tx
    .select()
    .from(supportTicket)
    .where(where)
    .orderBy(desc(supportTicket.lastMessageAt))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows;
}

/** Detail untuk pelapor: tanpa catatan internal; membuka laporan menandainya terbaca di sisi pelapor. */
export async function readScoped(tx: Tx, scope: Scope, id: string) {
  const [t] = await tx
    .select()
    .from(supportTicket)
    .where(and(eq(supportTicket.id, id), scopeWhere(scope)));
  if (!t) throw notFound();
  if (t.schoolUnread) {
    await tx.update(supportTicket).set({ schoolUnread: false }).where(eq(supportTicket.id, t.id));
  }
  const messages = await tx
    .select()
    .from(supportMessage)
    .where(and(eq(supportMessage.ticketId, t.id), eq(supportMessage.internal, false)))
    .orderBy(supportMessage.createdAt, supportMessage.id);
  return { ticket: { ...t, schoolUnread: false }, messages };
}

/* ---------- Sisi platform ---------- */

export interface StaffActor {
  id: string;
  name: string;
}

const audit = (tx: Tx, actorId: string, action: string, t: Ticket, details: Record<string, unknown>) =>
  tx.insert(auditLog).values({
    actorId,
    action,
    entityType: 'support_ticket',
    entityId: t.id,
    details: { ticketNo: t.ticketNo, ...details },
  });

async function lockById(tx: Tx, id: string) {
  const [t] = await tx.select().from(supportTicket).where(eq(supportTicket.id, id)).for('update');
  if (!t) throw notFound();
  return t;
}

/** Balasan publik staf (internal=false) atau catatan internal (internal=true: tanpa email, tanpa tanda baru). */
export async function replyAsStaff(
  tx: Tx,
  links: Links,
  id: string,
  actor: StaffActor,
  body: string,
  internal: boolean,
) {
  const t = await lockById(tx, id);
  if (!internal && t.status === 'closed') {
    throw new HttpError(
      409,
      'ticket_closed',
      'Laporan ini sudah ditutup. Buka kembali lewat status bila perlu.',
    );
  }
  const [msg] = await tx
    .insert(supportMessage)
    .values({
      ticketId: t.id,
      authorUserId: actor.id,
      authorName: actor.name,
      authorSide: 'platform',
      body,
      internal,
    })
    .returning();
  if (internal) {
    await audit(tx, actor.id, 'support.note', t, {});
    return { message: msg!, ticket: t };
  }
  const [updated] = await tx
    .update(supportTicket)
    .set({
      status: t.status === 'open' ? 'in_progress' : t.status,
      lastMessageAt: new Date(),
      lastMessageBySide: 'platform',
      schoolUnread: true,
      platformUnread: false,
    })
    .where(eq(supportTicket.id, t.id))
    .returning();
  await audit(tx, actor.id, 'support.reply', t, {});
  await notifyReporter(tx, links, updated!, { kind: 'reply', who: actor.name, body });
  return { message: msg!, ticket: updated! };
}

export interface StaffPatch {
  status?: Status;
  priority?: Priority;
  category?: Category;
  /** null = lepas penugasan. */
  assignedStaffId?: string | null;
}

export async function patchAsStaff(tx: Tx, links: Links, id: string, actor: StaffActor, patch: StaffPatch) {
  const t = await lockById(tx, id);
  const set: Partial<typeof supportTicket.$inferInsert> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (patch.priority && patch.priority !== t.priority) {
    set.priority = patch.priority;
    changes.priority = { from: t.priority, to: patch.priority };
  }
  if (patch.category && patch.category !== t.category) {
    set.category = patch.category;
    changes.category = { from: t.category, to: patch.category };
  }
  if (patch.assignedStaffId !== undefined && patch.assignedStaffId !== t.assignedStaffId) {
    if (patch.assignedStaffId !== null) {
      const [s] = await tx
        .select({ id: platformStaff.userId })
        .from(platformStaff)
        .where(eq(platformStaff.userId, patch.assignedStaffId));
      if (!s) throw new HttpError(400, 'invalid_assignee', 'Petugas tidak ditemukan.');
    }
    set.assignedStaffId = patch.assignedStaffId;
    changes.assignedStaffId = { from: t.assignedStaffId, to: patch.assignedStaffId };
  }
  let statusChanged = false;
  if (patch.status && patch.status !== t.status) {
    statusChanged = true;
    set.status = patch.status;
    set.resolvedAt = patch.status === 'resolved' ? new Date() : null;
    set.closedAt = patch.status === 'closed' ? new Date() : null;
    changes.status = { from: t.status, to: patch.status };
  }
  if (Object.keys(changes).length === 0) return { ticket: t, changed: false };
  const [updated] = await tx.update(supportTicket).set(set).where(eq(supportTicket.id, t.id)).returning();
  await audit(tx, actor.id, 'support.update', t, { changes });
  if (statusChanged && (patch.status === 'resolved' || patch.status === 'closed')) {
    // Status berubah oleh staf: pelapor perlu melihatnya di menu.
    await tx.update(supportTicket).set({ schoolUnread: true }).where(eq(supportTicket.id, t.id));
    updated!.schoolUnread = true;
    await notifyReporter(tx, links, updated!, { kind: 'status', status: patch.status });
  }
  return { ticket: updated!, changed: true };
}
