import { HomePage, homeMetadata } from './pages';

export const generateMetadata = () => homeMetadata('host');

/** Beranda situs yang dibuka dari host sekolah sendiri (<slug>.domain/site). */
export default function Page() {
  return <HomePage mode="host" />;
}
