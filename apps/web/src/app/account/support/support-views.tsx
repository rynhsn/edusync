'use client';

import { useMemo } from 'react';
import { ownerSupportApi } from '@/components/support/support-api';
import { TicketList } from '@/components/support/ticket-list';
import { TicketThread } from '@/components/support/ticket-thread';
import { useAccount } from '../account-context';

export function OwnerSupportList() {
  const { foundation } = useAccount();
  const api = useMemo(() => ownerSupportApi(foundation.id), [foundation.id]);
  const units = foundation.schools.map((s) => ({ id: s.id, name: s.name }));
  return <TicketList api={api} units={units} />;
}

export function OwnerSupportThread({ id }: { id: string }) {
  const { foundation } = useAccount();
  const api = useMemo(() => ownerSupportApi(foundation.id), [foundation.id]);
  return <TicketThread api={api} id={id} />;
}
