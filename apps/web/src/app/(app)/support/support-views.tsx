'use client';

import { useMemo } from 'react';
import { useSchool } from '@/components/app-shell';
import { schoolSupportApi } from '@/components/support/support-api';
import { TicketList } from '@/components/support/ticket-list';
import { TicketThread } from '@/components/support/ticket-thread';

export function SchoolSupportList() {
  const { school } = useSchool();
  const api = useMemo(() => schoolSupportApi(school.schoolId), [school.schoolId]);
  return <TicketList api={api} />;
}

export function SchoolSupportThread({ id }: { id: string }) {
  const { school } = useSchool();
  const api = useMemo(() => schoolSupportApi(school.schoolId), [school.schoolId]);
  return <TicketThread api={api} id={id} />;
}
