import { PlatformShell } from './platform-shell';

export default function PlatformLayout({ children }: LayoutProps<'/'>) {
  return <PlatformShell>{children}</PlatformShell>;
}
