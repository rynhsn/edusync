'use client';

import { useQuery } from '@tanstack/react-query';
import { api, schoolHeader, unwrap } from '@/lib/api';
import type { paths } from '@/lib/api-types';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/lib/support';

type Json<T> = T extends { content: { 'application/json': infer J } } ? J : never;
export type TicketSummary = Json<paths['/v1/support/tickets']['get']['responses'][200]>['tickets'][number];
export type TicketDetail = Json<paths['/v1/support/tickets/{id}']['get']['responses'][200]>;

export interface CreateValues {
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  body: string;
  page: string;
  /** Hanya portal pemilik: unit yang berkaitan (opsional). */
  unitId?: string;
}

/**
 * Penghubung ke API laporan. Panel sekolah (`x-school-id`) dan portal pemilik punya endpoint berbeda dengan bentuk
 * yang sama, jadi komponen laporan bekerja lewat antarmuka ini dan tidak tahu sisi mana yang dipakainya.
 */
export interface SupportApi {
  side: 'school' | 'owner';
  /** Awalan kunci query; semua query laporan sisi ini diawali ini. */
  key: readonly unknown[];
  /** Alamat dasar halaman laporan di sisi ini, mis. `/support`. */
  basePath: string;
  list: (status?: TicketStatus) => Promise<TicketSummary[]>;
  get: (id: string) => Promise<TicketDetail>;
  create: (v: CreateValues) => Promise<TicketDetail>;
  reply: (id: string, body: string) => Promise<TicketDetail>;
  close: (id: string) => Promise<unknown>;
}

export function schoolSupportApi(schoolId: string): SupportApi {
  const headers = schoolHeader(schoolId);
  return {
    side: 'school',
    key: ['support', 'school', schoolId],
    basePath: '/support',
    list: async (status) =>
      unwrap(await api.GET('/v1/support/tickets', { headers, params: { query: { status } } })).tickets,
    get: async (id) =>
      unwrap(await api.GET('/v1/support/tickets/{id}', { headers, params: { path: { id } } })),
    create: async (v) =>
      unwrap(
        await api.POST('/v1/support/tickets', {
          headers,
          body: {
            subject: v.subject,
            category: v.category,
            priority: v.priority,
            body: v.body,
            page: v.page,
          },
        }),
      ),
    reply: async (id, body) =>
      unwrap(
        await api.POST('/v1/support/tickets/{id}/messages', {
          headers,
          params: { path: { id } },
          body: { body },
        }),
      ),
    close: async (id) =>
      unwrap(await api.POST('/v1/support/tickets/{id}/close', { headers, params: { path: { id } } })),
  };
}

export function ownerSupportApi(foundationId: string): SupportApi {
  return {
    side: 'owner',
    key: ['support', 'owner'],
    basePath: '/account/support',
    list: async (status) =>
      unwrap(await api.GET('/v1/account/support/tickets', { params: { query: { status } } })).tickets,
    get: async (id) =>
      unwrap(await api.GET('/v1/account/support/tickets/{id}', { params: { path: { id } } })),
    create: async (v) =>
      unwrap(
        await api.POST('/v1/account/support/tickets', {
          body: {
            foundationId,
            schoolId: v.unitId || undefined,
            subject: v.subject,
            category: v.category,
            priority: v.priority,
            body: v.body,
            page: v.page,
          },
        }),
      ),
    reply: async (id, body) =>
      unwrap(
        await api.POST('/v1/account/support/tickets/{id}/messages', {
          params: { path: { id } },
          body: { body },
        }),
      ),
    close: async (id) =>
      unwrap(await api.POST('/v1/account/support/tickets/{id}/close', { params: { path: { id } } })),
  };
}

/** Jeda polling lencana menu dan daftar laporan. */
export const POLL_MS = 60_000;

/**
 * Jumlah laporan dengan balasan platform yang belum dibuka. Diperbarui tiap ~60 detik dan saat jendela kembali
 * difokuskan; kegagalan jaringan tidak mengganggu menu (lencana hilang sampai berhasil lagi).
 */
function useUnread(key: readonly unknown[], fetcher: () => Promise<number>, enabled: boolean) {
  const q = useQuery({
    queryKey: [...key, 'unread'],
    queryFn: fetcher,
    enabled,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: 'always',
    staleTime: 15_000,
  });
  return enabled ? (q.data ?? 0) : 0;
}

export function useSchoolSupportUnread(schoolId: string, enabled: boolean) {
  return useUnread(
    ['support', 'school', schoolId],
    async () => unwrap(await api.GET('/v1/support/unread-count', { headers: schoolHeader(schoolId) })).count,
    enabled,
  );
}

export function useOwnerSupportUnread(enabled = true) {
  return useUnread(
    ['support', 'owner'],
    async () => unwrap(await api.GET('/v1/account/support/unread-count')).count,
    enabled,
  );
}

export function usePlatformSupportUnread(enabled: boolean) {
  return useUnread(
    ['platform-support'],
    async () => unwrap(await api.GET('/v1/platform/support/unread-count')).count,
    enabled,
  );
}
