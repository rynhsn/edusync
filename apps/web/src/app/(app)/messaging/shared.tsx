'use client';

import { useSchool } from '@/components/app-shell';
import { schoolHeader } from '@/lib/api';

/** Peristiwa yang bisa memicu pesan (urutan tampil). Sama dengan EVENT_KEYS di kontrak. */
export const EVENT_KEYS = [
  'arrival',
  'departure',
  'absent',
  'skipped_class',
  'payment',
  'overdue',
  'report_card',
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

export const STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped'] as const;
export type MessageStatus = (typeof STATUSES)[number];

/** Konteks sekolah aktif + hak ubah (message:manage). message:read hanya boleh melihat. */
export function useMessagingCtx() {
  const { school, can } = useSchool();
  return { school, header: { header: schoolHeader(school.schoolId) }, canManage: can('message:manage') };
}

/** Warna lencana status yang tidak ada di varian bawaan Badge. */
export const OK_BADGE = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
export const WARN_BADGE = 'bg-amber/20 text-foreground';

/** Samarkan nomor untuk tampilan riwayat: sisakan awal dan akhir saja. */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 5)}${'*'.repeat(phone.length - 8)}${phone.slice(-3)}`;
}
