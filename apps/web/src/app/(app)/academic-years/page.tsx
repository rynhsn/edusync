import type { Metadata } from 'next';
import { AcademicYearsView } from './academic-years-view';

export const metadata: Metadata = { title: 'Tahun ajaran' };

export default function AcademicYearsPage() {
  return <AcademicYearsView />;
}
