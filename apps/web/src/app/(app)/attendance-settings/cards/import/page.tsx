import { redirect } from 'next/navigation';

/** Rute lama; impor kartu kini di /attendance/cards/import. */
export default function LegacyCardImportRedirect() {
  redirect('/attendance/cards/import');
}
