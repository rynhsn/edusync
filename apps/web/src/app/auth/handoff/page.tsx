import type { Metadata } from 'next';
import { HandoffView } from './handoff-view';

// Alamat halaman ini membawa token sekali pakai di query; jangan bocor lewat header Referer.
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false } };

export default function HandoffPage() {
  return <HandoffView />;
}
