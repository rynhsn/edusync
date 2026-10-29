import { MainHostOnly } from '@/components/main-host-only';
import { PlatformShell } from './platform-shell';

export default function PlatformLayout({ children }: LayoutProps<'/'>) {
  return (
    <MainHostOnly>
      <PlatformShell>{children}</PlatformShell>
    </MainHostOnly>
  );
}
